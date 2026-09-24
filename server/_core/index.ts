import "dotenv/config";
import express, { type Express } from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { createBackupRestoreVerificationHandler, createInventoryReportHandler } from "../scheduled";
import { checkDatabaseReadiness, closeDatabasePool, runDueLocalBackupVerification } from "../db";
import { registerMigrationImportRoutes } from "../migrationImport";
import { serveStatic, setupVite } from "./vite";

export async function createApp(options: { withStaticFiles?: boolean } = {}) {
  const app = express();
  const server = createServer(app);
  const withStaticFiles = options.withStaticFiles ?? process.env.NODE_ENV !== "development";
  app.set("trust proxy", 1);
  const requestBuckets = new Map<string, { windowStartedAt: number; count: number }>();
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/") && !req.path.startsWith("/trpc")) return next();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const bucket = requestBuckets.get(key);
    if (!bucket || now - bucket.windowStartedAt >= 60_000) requestBuckets.set(key, { windowStartedAt: now, count: 1 });
    else if (++bucket.count > 180) return res.status(429).json({ error: "عدد الطلبات كبير، حاول مرة أخرى لاحقًا" });
    next();
  });
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
    if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  });
  app.use(express.json({ limit: "12mb" }));
  app.use(express.urlencoded({ limit: "12mb", extended: true }));
  app.get(["/health", "/api/health"], (_req, res) => res.status(200).json({ status: "ok" }));
  app.get(["/ready", "/api/ready"], async (_req, res) => {
    try {
      await checkDatabaseReadiness();
      return res.status(200).json({ status: "ready", database: "ok" });
    } catch (error: any) {
      return res.status(503).json({ status: "not_ready", database: "unavailable", message: process.env.NODE_ENV === "development" ? error?.message : undefined });
    }
  });
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerMigrationImportRoutes(app);
  app.post("/api/scheduled/low-stock", createInventoryReportHandler("low_stock"));
  app.post("/api/scheduled/daily-report", createInventoryReportHandler("daily"));
  app.post("/api/scheduled/weekly-report", createInventoryReportHandler("weekly"));
  app.post("/api/scheduled/backup-restore-verification", createBackupRestoreVerificationHandler());
  const trpcMiddleware = createExpressMiddleware({ router: appRouter, createContext });
  app.use("/api/trpc", trpcMiddleware);
  app.use("/trpc", trpcMiddleware);
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else if (withStaticFiles) {
    serveStatic(app);
  }
  return { app, server, requestBuckets };
}

async function startServer() {
  const { app, server, requestBuckets } = await createApp();
  const rateLimitTimer = setInterval(() => {
    const cutoff = Date.now() - 60_000;
    requestBuckets.forEach((bucket, key) => { if (bucket.windowStartedAt < cutoff) requestBuckets.delete(key); });
  }, 60_000);
  let scheduleTimer: NodeJS.Timeout | undefined;
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Shutdown] received ${signal}`);
    if (scheduleTimer) clearInterval(scheduleTimer);
    clearInterval(rateLimitTimer);
    await new Promise<void>(resolve => server.close(() => resolve()));
    await closeDatabasePool();
  };
  process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
  process.once("SIGINT", () => { void shutdown("SIGINT"); });
  const port = Number(process.env.PORT || 3000);
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
    let checkingLocalBackupSchedule = false;
    const checkLocalBackupSchedule = async () => {
      if (checkingLocalBackupSchedule) return;
      checkingLocalBackupSchedule = true;
      try { await runDueLocalBackupVerification(); } catch (error) { console.error("[LocalBackupSchedule] failed", error); } finally { checkingLocalBackupSchedule = false; }
    };
    void checkLocalBackupSchedule();
    scheduleTimer = setInterval(() => { void checkLocalBackupSchedule(); }, 60_000);
  });
}

if (process.env.VERCEL !== "1") {
  startServer().catch(console.error);
}
