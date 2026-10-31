import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { runInventoryReport } from "./inventoryReports";
import { runDailyExecutiveReport } from "./reportScheduler";
import { isBackupVerificationScheduleTask, runScheduledBackupVerification } from "./db";
import { isReportHeartbeatTask, runDailyExecutiveReportIfDue } from "./reportScheduler";

function hasValidCronSecret(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const actual = Buffer.from(String(req.headers.authorization ?? ""));
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function matchesCronSecret(req: Request) {
  const configured = process.env.CRON_SECRET?.trim();
  if (!configured) return false;
  const authorization = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : typeof req.headers["x-cron-secret"] === "string"
      ? req.headers["x-cron-secret"].trim()
      : "";
  if (!supplied) return false;
  const expectedBytes = Buffer.from(configured);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

async function authenticateScheduledRequest(req: Request) {
  if (matchesCronSecret(req)) return { isCron: true, taskUid: req.headers["x-cron-task-uid"]?.toString() || "cron-job-org" };
  return sdk.authenticateRequest(req);
}

function hasCronSecret(req: Request) {
  const configured = process.env.CRON_SECRET?.trim();
  if (!configured) return false;
  const authorization = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const headerSecret = typeof req.headers["x-cron-secret"] === "string" ? req.headers["x-cron-secret"].trim() : "";
  return bearer === configured || headerSecret === configured;
}

export function createCronJobDailyReportHandler() {
  return async (req: Request, res: Response) => {
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });
    if (!hasCronSecret(req)) return res.status(401).json({ error: "invalid-cron-secret" });
    try {
      const result = await runDailyExecutiveReport();
      return res.status(200).json({ ok: true, ...result });
    } catch (error: any) {
      console.error("[CronJob:daily_inventory_report] failed", error);
      return res.status(500).json({ ok: false, error: "daily-report-failed", timestamp: new Date().toISOString() });
    }
  };
}

export function createInventoryReportHandler(kind: "low_stock" | "daily" | "weekly") {
  return async (req: Request, res: Response) => {
    const context = { url: req.originalUrl, kind };
    try {
      const user = await authenticateScheduledRequest(req);
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
      const externalCron = hasValidCronSecret(req);
      const user = externalCron ? null : await sdk.authenticateRequest(req);
      if (!externalCron && (!user?.isCron || !user.taskUid)) return res.status(403).json({ error: "cron-only" });
      if (!externalCron && !(await isReportHeartbeatTask(user!.taskUid!))) return res.json({ ok: true, skipped: "orphan_or_disabled" });
      try {
        const result = await runDailyExecutiveReportIfDue();
        return res.status(200).json({ ok: true, ...(user?.taskUid ? { taskUid: user.taskUid } : { source: "external-cron" }), ...result });
      } catch (error: any) {
        // The heartbeat itself succeeded; the run is recorded as failed and can be retried on the next tick.
        console.error("[Scheduled:daily_report_heartbeat] report run failed", error);
        return res.status(200).json({ ok: true, ...(user?.taskUid ? { taskUid: user.taskUid } : { source: "external-cron" }), status: "failed", error: "تعذر تنفيذ التقرير؛ تم تسجيل الفشل وسيُعاد الفحص في النبضة التالية", timestamp: new Date().toISOString() });
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
      const user = await authenticateScheduledRequest(req);
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
