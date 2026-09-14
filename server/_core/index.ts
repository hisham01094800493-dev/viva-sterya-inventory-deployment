import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { createBackupRestoreVerificationHandler, createInventoryReportHandler } from "../scheduled";
import { runDueLocalBackupVerification } from "../db";
import { registerMigrationImportRoutes } from "../migrationImport";
import { serveStatic, setupVite } from "./vite";

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
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

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
    let checkingLocalBackupSchedule = false;
    const checkLocalBackupSchedule = async () => {
      if (checkingLocalBackupSchedule) return;
      checkingLocalBackupSchedule = true;
      try { await runDueLocalBackupVerification(); } catch (error) { console.error("[LocalBackupSchedule] failed", error); } finally { checkingLocalBackupSchedule = false; }
    };
    void checkLocalBackupSchedule();
    setInterval(() => { void checkLocalBackupSchedule(); }, 60_000);
  });
}

startServer().catch(console.error);
