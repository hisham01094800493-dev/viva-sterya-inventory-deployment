import "dotenv/config";
import cors from "cors";
import express from "express";
import session from "express-session";
import passport from "passport";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { configureGoogleAuth, registerGoogleAuthRoutes } from "./auth.js";
import { createContext } from "./context.js";
import { appRouter } from "./routers.js";
import { COOKIE_NAME } from "./constants.js";

const allowedOrigin = process.env.CLIENT_URL || process.env.APP_URL || "https://viva-sterya-inventory-production.up.railway.app";

export function createApp() {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required");
  }
  const app = express();
  app.set("trust proxy", 1);
  app.use(cors({ origin: allowedOrigin, credentials: true, methods: ["GET", "POST", "OPTIONS"] }));
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));
  app.use(session({ name: COOKIE_NAME, secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { secure: true, sameSite: "none", httpOnly: true } }));
  configureGoogleAuth();
  app.use(passport.initialize());
  app.use(passport.session());
  registerGoogleAuthRoutes(app);
  app.get("/health", (_req, res) => res.json({ status: "ok", service: "smart-inventory-api" }));
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  return app;
}

export async function startServer(port: number) {
  const app = createApp();
  await new Promise<void>(resolve => app.listen(port, "0.0.0.0", resolve));
  console.log(`Smart Inventory API listening on port ${port}`);
}
