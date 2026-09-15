import "dotenv/config";
import express from "express";
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

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.set("trust proxy", 1);
  const requestBuckets = new Map<string, { windowStartedAt: number; count: number }>();
  const rateLimitTimer = setInterval(() => {
    const cutoff = Date.now() - 60_000;
    requestBuckets.forEach((bucket, key) => { if (bucket.windowStartedAt < cutoff) requestBuckets.delete(key); });
  }, 60_000);
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/")) return next();
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
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  });
  // Base64 encoding adds overhead; 12MB permits a 5MB image while limiting abuse.
  app.use(express.json({ limit: "12mb" }));
  app.use(express.urlencoded({ limit: "12mb", extended: true }));
  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
  app.get("/ready", async (_req, res) => {
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
  // Heartbeat scheduled callbacks
  app.post("/api/scheduled/low-stock", createInventoryReportHandler("low_stock"));
  app.post("/api/scheduled/daily-report", createInventoryReportHandler("daily"));
  app.post("/api/scheduled/weekly-report", createInventoryReportHandler("weekly"));
  app.post("/api/scheduled/backup-restore-verification", createBackupRestoreVerificationHandler());

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || 3000);
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

startServer().catch(console.error);
