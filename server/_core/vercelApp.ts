import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { checkDatabaseReadiness } from "../db";
import { registerMigrationImportRoutes } from "../migrationImport";

export async function createVercelApp() {
  const app = express();
  app.set("trust proxy", 1);
  const allowedOrigins = new Set(
    [
      "https://viva-sterya-inventory.vercel.app",
      "https://viva-sterya-inventory-hisham20.vercel.app",
      "https://viva-sterya-inventory-git-main-hisham20.vercel.app",
      process.env.APP_URL?.replace(/\/$/, ""),
      ...(process.env.ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim().replace(/\/$/, ""))
        .filter(Boolean),
    ].filter((origin): origin is string => Boolean(origin)),
  );
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });
  app.use(express.json({ limit: "12mb" }));
  app.use(express.urlencoded({ limit: "12mb", extended: true }));
  app.get(["/health", "/api/health"], (_req, res) => res.status(200).json({ status: "ok" }));
  app.get(["/ready", "/api/ready"], async (_req, res) => {
    try {
      await checkDatabaseReadiness();
      return res.status(200).json({ status: "ready", database: "ok" });
    } catch {
      return res.status(503).json({ status: "not_ready", database: "unavailable" });
    }
  });
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerMigrationImportRoutes(app);
  const trpcMiddleware = createExpressMiddleware({ router: appRouter, createContext });
  app.use("/api/trpc", trpcMiddleware);
  app.use("/trpc", trpcMiddleware);
  return app;
}
