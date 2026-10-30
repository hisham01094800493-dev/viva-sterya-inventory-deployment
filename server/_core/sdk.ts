import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import type { User } from "../../drizzle/schema";
import type { GetUserInfoWithJwtResponse } from "./types/manusTypes";
import * as db from "../db";
import { ENV } from "./env";

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const CRON_OPEN_ID_PREFIX = "cron_";

export type SessionPayload = { openId: string; appId: string; name: string; sessionId?: string };
export type AuthenticatedUser = User & { taskUid?: string; isCron?: boolean };

class SDKServer {
  private parseCookies(cookieHeader: string | undefined) {
    return new Map(Object.entries(cookieHeader ? parseCookieHeader(cookieHeader) : {}));
  }

  private getSessionSecret() {
    if (!ENV.cookieSecret) throw new Error("SESSION_SECRET is not configured");
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  async createSessionToken(openId: string, options: { expiresInMs?: number; name?: string; sessionId?: string } = {}) {
    return this.signSession({ openId, appId: ENV.appId, name: options.name || openId, sessionId: options.sessionId ?? randomUUID() }, options);
  }

  async signSession(payload: SessionPayload, options: { expiresInMs?: number } = {}) {
    const expirationSeconds = Math.floor((Date.now() + (options.expiresInMs ?? ONE_YEAR_MS)) / 1000);
    return new SignJWT({ openId: payload.openId, appId: payload.appId, name: payload.name })
      .setJti(payload.sessionId ?? randomUUID())
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(this.getSessionSecret());
  }

  async verifySession(cookieValue: string | undefined | null): Promise<{ openId: string; appId: string; name: string; sessionId: string } | null> {
    if (!cookieValue) return null;
    try {
      const { payload } = await jwtVerify(cookieValue, this.getSessionSecret(), { algorithms: ["HS256"] });
      const { openId, appId, name, jti } = payload as Record<string, unknown>;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name) || !isNonEmptyString(jti)) return null;
      return { openId, appId, name, sessionId: jti };
    } catch {
      return null;
    }
  }

  private async getUserInfoWithJwt(jwtToken: string): Promise<GetUserInfoWithJwtResponse> {
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) throw ForbiddenError("Cron authentication service is not configured");
    const response = await fetch(`${ENV.forgeApiUrl.replace(/\/$/, "")}/webdevtoken.v1.WebDevService/GetUserInfoWithJwt`, {
      method: "POST",
      headers: { accept: "application/json", authorization: `Bearer ${ENV.forgeApiKey}`, "content-type": "application/json", "connect-protocol-version": "1" },
      body: JSON.stringify({ jwtToken, projectId: ENV.appId }),
    });
    if (!response.ok) throw ForbiddenError("Invalid cron session");
    return (await response.json()) as GetUserInfoWithJwtResponse;
  }

  private buildCronUser(userInfo: GetUserInfoWithJwtResponse): AuthenticatedUser {
    const now = new Date();
    return { id: -1, openId: userInfo.openId, name: userInfo.name || "Manus Scheduled Task", email: userInfo.email ?? null, loginMethod: userInfo.loginMethod ?? null, role: "user", createdAt: now, updatedAt: now, lastSignedIn: now, taskUid: userInfo.taskUid ?? undefined, isCron: true } as AuthenticatedUser;
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken && typeof req.headers.authorization === "string" && req.headers.authorization.startsWith("Bearer ")) sessionToken = req.headers.authorization.slice(7);
    const session = await this.verifySession(sessionToken);
    if (!session) throw ForbiddenError("Invalid session cookie");
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      if (!userInfo.taskUid) throw ForbiddenError("Cron session missing task_uid");
      return this.buildCronUser(userInfo);
    }
    if (await db.isSessionRevoked(session.sessionId)) throw ForbiddenError("Session has been revoked");
    const user = await db.getUserByOpenId(session.openId);
    if (!user) throw ForbiddenError("User not found");
    await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
    return user as AuthenticatedUser;
  }
}

export const sdk = new SDKServer();
