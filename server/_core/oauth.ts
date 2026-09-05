import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request } from "express";
import session from "express-session";
import MySQLStoreFactory from "express-mysql-session";
import passport from "passport";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import { randomUUID } from "node:crypto";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

export function detectDeviceType(userAgent: string) {
  if (/mobile|android|iphone|ipad|ipod/i.test(userAgent)) return "mobile";
  if (/tablet/i.test(userAgent)) return "tablet";
  return "desktop";
}

function getClientIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim().slice(0, 128);
  return typeof req.ip === "string" && req.ip ? req.ip.slice(0, 128) : null;
}

function googleConfigured() {
  return Boolean(ENV.googleClientId && ENV.googleClientSecret && ENV.appUrl);
}

export function buildMySqlSessionOptions(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, "");
  if (!database) throw new Error("DATABASE_URL must include a database name");
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: ENV.databaseSsl,
    database,
    createDatabaseTable: true,
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 10 * 60 * 1000,
    schema: { tableName: "oauth_sessions", columnNames: { session_id: "session_id", expires: "expires", data: "data" } },
  };
}

function createSessionStore() {
  if (!ENV.databaseUrl) {
    if (ENV.isProduction) throw new Error("DATABASE_URL is required for the production OAuth session store");
    return undefined;
  }
  const MySQLStore = MySQLStoreFactory(session);
  const store = new MySQLStore(buildMySqlSessionOptions(ENV.databaseUrl));
  void store.onReady().then(() => console.log("[OAuth] MySQL session store ready")).catch(error => console.error("[OAuth] MySQL session store failed", error));
  return store;
}

export function registerOAuthRoutes(app: Express) {
  app.set("trust proxy", 1);
  app.use(session({ secret: ENV.cookieSecret || "development-session-secret", store: createSessionStore(), resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: "lax", secure: ENV.isProduction, maxAge: 10 * 60 * 1000 } }));
  app.use(passport.initialize());

  if (googleConfigured()) {
    passport.use(new GoogleStrategy({
      clientID: ENV.googleClientId,
      clientSecret: ENV.googleClientSecret,
      callbackURL: `${ENV.appUrl.replace(/\/$/, "")}/api/oauth/google/callback`,
    }, async (_accessToken, _refreshToken, profile: Profile, done) => {
      try {
        const user = await db.upsertGoogleUser({ googleId: profile.id, name: profile.displayName || profile.emails?.[0]?.value || "مستخدم Google", email: profile.emails?.[0]?.value ?? null });
        done(null, user);
      } catch (error) {
        done(error as Error);
      }
    }));
  }

  app.get("/api/oauth/google", (req, res, next) => {
    if (!googleConfigured()) return res.status(503).json({ error: "Google OAuth is not configured" });
    return passport.authenticate("google", { scope: ["profile", "email"], state: true as unknown as string })(req, res, next);
  });

  app.get("/api/oauth/google/callback", (req, res, next) => {
    if (!googleConfigured()) return res.status(503).json({ error: "Google OAuth is not configured" });
    passport.authenticate("google", { session: false }, async (error: Error | null, user: Awaited<ReturnType<typeof db.upsertGoogleUser>> | false) => {
      if (error || !user) return res.redirect("/?login=failed");
      try {
        const sessionId = randomUUID();
        const userAgent = String(req.headers["user-agent"] ?? "").slice(0, 4000);
        const deviceType = detectDeviceType(userAgent);
        const ipAddress = getClientIp(req);
        const knownFingerprint = await db.hasLoginFingerprint({ userId: user.id, userAgent, deviceType });
        const loginLogId = await db.createLoginAuditLog({ userId: user.id, sessionId, userName: user.name, email: user.email, loginMethod: "google", userAgent, deviceType, ipAddress });
        if (!knownFingerprint) {
          const deviceLabel = deviceType === "mobile" ? "هاتف" : deviceType === "tablet" ? "جهاز لوحي" : "كمبيوتر";
          await db.createSecurityNotification({ notificationType: "new_login_device", title: "تسجيل دخول من جهاز جديد", message: `سجّل ${user.name || user.email || "مستخدم"} الدخول من ${deviceLabel} أو متصفح جديد في ${new Date().toLocaleString("ar-EG")}. المتصفح: ${userAgent || "غير معروف"}${ipAddress ? `، عنوان الشبكة: ${ipAddress}` : ""}`, loginLogId });
          await db.createAuditLog({ userId: user.id, userName: user.name, action: "new_login_device", entity: "security", entityId: loginLogId, details: { deviceType, ipAddress } });
        }
        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || user.email || "Google User", expiresInMs: ONE_YEAR_MS, sessionId });
        res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), sameSite: "lax", maxAge: ONE_YEAR_MS });
        res.redirect("/");
      } catch (callbackError) {
        console.error("[OAuth] Google callback failed", callbackError);
        res.redirect("/?login=failed");
      }
    })(req, res, next);
  });
}
