import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { runInventoryReport } from "./inventoryReports";
import { getSettingValue, isBackupVerificationScheduleTask, runScheduledBackupVerification } from "./db";
import { getReportSchedulerConfig, isReportHeartbeatTask, runDailyExecutiveReportIfDue } from "./reportScheduler";

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
  const expected = Buffer.from(configured);
  const matches = (value: string) => {
    const supplied = Buffer.from(value);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  };
  return matches(bearer) || matches(headerSecret);
}

/**
 * cron-job.org يرسل GET افتراضيًا، وبعض مزوّدي الكرون يرسلون POST.
 * لذلك نقبل GET وPOST وHEAD لكل نقاط scheduled.
 */
function isScheduledMethodAllowed(req: Request) {
  return req.method === "GET" || req.method === "POST" || req.method === "HEAD";
}

export function createCronJobDailyReportHandler() {
  return async (req: Request, res: Response) => {
    if (!isScheduledMethodAllowed(req)) return res.status(405).json({ error: "method-not-allowed" });
    if (!hasCronSecret(req)) return res.status(401).json({ error: "invalid-cron-secret" });
    try {
      // نستخدم فحص الاستحقاق بدل التشغيل الأعمى حتى يحترم وقت القاهرة وزر التفعيل،
      // ولا يرسل التقرير مرتين في نفس اليوم.
      const result = await runDailyExecutiveReportIfDue();
      return res.status(200).json({ ok: true, source: "vercel-cron", ...result });
    } catch (error: any) {
      console.error("[CronJob:daily_inventory_report] failed", error);
      return res.status(500).json({ ok: false, error: "daily-report-failed", timestamp: new Date().toISOString() });
    }
  };
}

export function createInventoryReportHandler(kind: "low_stock" | "daily" | "weekly") {
  return async (req: Request, res: Response) => {
    const context = { url: req.originalUrl, kind };
    if (!isScheduledMethodAllowed(req)) return res.status(405).json({ error: "method-not-allowed" });
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
    if (!isScheduledMethodAllowed(req)) return res.status(405).json({ error: "method-not-allowed" });
    try {
      const externalCron = hasValidCronSecret(req);
      // فشل المصادقة (جلسة منتهية أو طلب بلا هوية) يجب أن يرد 403 لا 500،
      // حتى لا يبدو عطل المصادقة كعطل في التقرير نفسه.
      let user: any = null;
      if (!externalCron) {
        try { user = await sdk.authenticateRequest(req); } catch { user = null; }
      }
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

export function createDailyReportStatusHandler() {
  return async (req: Request, res: Response) => {
    if (!isScheduledMethodAllowed(req)) return res.status(405).json({ error: "method-not-allowed" });
    if (!hasCronSecret(req)) return res.status(401).json({ error: "invalid-cron-secret" });
    try {
      const config = await getReportSchedulerConfig();
      const recipientsRaw = await getSettingValue("report_recipients", process.env.INVENTORY_REPORT_EMAILS ?? process.env.ADMIN_EMAIL ?? "");
      const recipients = recipientsRaw.split(/[;,\n]/).map(value => value.trim()).filter(Boolean);
      const emailConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && (process.env.SMTP_FROM || process.env.SMTP_USER));
      const whatsappConfigured = Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_RECIPIENT_PHONE);
      return res.status(200).json({
        ok: true,
        enabled: config.enabled,
        time: config.time,
        timeZone: config.timeZone,
        nextRunAt: config.nextRunAt,
        lastRun: config.lastRun,
        channels: { email: emailConfigured, whatsapp: whatsappConfigured, inApp: true, recipients: recipients.length },
        cronSecretConfigured: Boolean(process.env.CRON_SECRET?.trim()),
        serverTime: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("[Scheduled:daily_report_status] failed", error);
      return res.status(500).json({ error: process.env.NODE_ENV === "development" ? (error?.message || "status failed") : "تعذر قراءة حالة جدولة التقرير", timestamp: new Date().toISOString() });
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
