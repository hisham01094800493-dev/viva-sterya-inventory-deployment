import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { runInventoryReport } from "./inventoryReports";
import { isBackupVerificationScheduleTask, runScheduledBackupVerification } from "./db";
import { isReportHeartbeatTask, runDailyExecutiveReportIfDue } from "./reportScheduler";

export function createInventoryReportHandler(kind: "low_stock" | "daily" | "weekly") {
  return async (req: Request, res: Response) => {
    const context = { url: req.originalUrl, kind };
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }
      const result = await runInventoryReport(kind);
      return res.json({ ok: true, taskUid: user.taskUid, ...result });
    } catch (error: any) {
      console.error(`[Scheduled:${kind}] failed`, error);
      return res.status(500).json({
        error: process.env.NODE_ENV === "development" ? (error?.message || "scheduled report failed") : "تعذر تنفيذ المهمة المجدولة",
        stack: process.env.NODE_ENV === "development" ? error?.stack : undefined,
        context,
        timestamp: new Date().toISOString(),
      });
    }
  };
}


export function createDailyReportHeartbeatHandler() {
  return async (req: Request, res: Response) => {
    try {
      const vercelCron = req.headers["x-vercel-cron-schedule"] === "*/5 * * * *";
      const user = vercelCron ? null : await sdk.authenticateRequest(req);
      if (!vercelCron && (!user?.isCron || !user.taskUid)) return res.status(403).json({ error: "cron-only" });
      if (!vercelCron && !(await isReportHeartbeatTask(user!.taskUid!))) return res.json({ ok: true, skipped: "orphan_or_disabled" });
      try {
        const result = await runDailyExecutiveReportIfDue();
        return res.status(200).json({ ok: true, ...(user?.taskUid ? { taskUid: user.taskUid } : { source: "vercel-cron" }), ...result });
      } catch (error: any) {
        // The heartbeat itself succeeded; the run is recorded as failed and can be retried on the next tick.
        console.error("[Scheduled:daily_report_heartbeat] report run failed", error);
        return res.status(200).json({ ok: true, ...(user?.taskUid ? { taskUid: user.taskUid } : { source: "vercel-cron" }), status: "failed", error: "تعذر تنفيذ التقرير؛ تم تسجيل الفشل وسيُعاد الفحص في النبضة التالية", timestamp: new Date().toISOString() });
      }
    } catch (error: any) {
      console.error("[Scheduled:daily_report_heartbeat] heartbeat failed", error);
      return res.status(500).json({ error: process.env.NODE_ENV === "development" ? (error?.message || "heartbeat failed") : "تعذر فحص جدولة التقرير", timestamp: new Date().toISOString() });
    }
  };
}

export function createBackupRestoreVerificationHandler() {
  return async (req: Request, res: Response) => {
    const context = { url: req.originalUrl, kind: "backup_restore_verification" };
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      if (!(await isBackupVerificationScheduleTask(user.taskUid))) return res.json({ ok: true, skipped: "orphan_or_disabled" });
      const result = await runScheduledBackupVerification();
      return res.json({ ok: result.status === "passed" || result.status === "skipped", taskUid: user.taskUid, ...result });
    } catch (error: any) {
      console.error("[Scheduled:backup_restore_verification] failed", error);
      return res.status(500).json({
        error: process.env.NODE_ENV === "development" ? (error?.message || "scheduled backup restore verification failed") : "تعذر تنفيذ اختبار النسخ والاستعادة",
        stack: process.env.NODE_ENV === "development" ? error?.stack : undefined,
        context,
        timestamp: new Date().toISOString(),
      });
    }
  };
}
