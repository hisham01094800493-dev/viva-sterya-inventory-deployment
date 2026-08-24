import type { Express } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { getUserByOpenId, upsertUser } from "./db.js";
import type { User } from "./schema.js";

const GOOGLE_CALLBACK_URL = "https://viva-sterya-inventory-production.up.railway.app/auth/google/callback";

function getClientUrl() {
  return process.env.CLIENT_URL || "https://viva-sterya-inventory.vercel.app";
}

export function configureGoogleAuth() {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientID || !clientSecret) throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required");

  passport.use(new GoogleStrategy(
    { clientID, clientSecret, callbackURL: GOOGLE_CALLBACK_URL },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const openId = `google:${profile.id}`;
        await upsertUser({ openId, name: profile.displayName || null, email: profile.emails?.[0]?.value ?? null, loginMethod: "google", lastSignedIn: new Date() });
        const user = await getUserByOpenId(openId);
        if (!user) return done(new Error("تعذر تحميل حساب المستخدم بعد تسجيل الدخول"));
        return done(null, user);
      } catch (error) {
        return done(error as Error);
      }
    },
  ));
  passport.serializeUser((user, done) => done(null, (user as User).openId));
  passport.deserializeUser<string>(async (openId, done) => {
    try { done(null, (await getUserByOpenId(openId)) ?? false); } catch (error) { done(error as Error); }
  });
}

export function registerGoogleAuthRoutes(app: Express) {
  app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"], prompt: "select_account" }));
  app.get("/auth/google/callback", passport.authenticate("google", { failureRedirect: `${getClientUrl()}/?auth=failed` }), (_req, res) => res.redirect(`${getClientUrl()}/`));
  app.post("/auth/logout", (req, res, next) => req.logout(error => {
    if (error) return next(error);
    req.session.destroy(() => { res.clearCookie("smart_inventory_session", { secure: true, sameSite: "none", httpOnly: true, path: "/" }); res.status(204).end(); });
  }));
}
