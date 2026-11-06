import { and, desc, eq, gte, isNull, or } from "drizzle-orm";
import {
  auditLogs,
  buildings,
  disbursements,
  items,
  notifications,
  projects,
  reportSchedulerRuns,
  userPermissions,
  users,
} from "../drizzle/schema";
import { getInventoryRows, getSettingValue, upsertSetting } from "./db";
import { requireDb, getPool } from "./db/connection";
import { getItemsAtOrBelowMinimum, getLowStockItems, summarizeDailyDisbursements, type DailyDisbursementRow } from "./inventoryReports";
import { buildDailyReportEmail } from "./reportEmailTemplate";
import { sendConfiguredEmail } from "./email";
import { sendWhatsAppNotification } from "./whatsapp";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import { parseAllowedProjectIds } from "./projectAccess";
import { buildDailyReportNotificationLink } from "../shared/dailyReportRoute";

const TIME_ZONE = "Africa/Cairo";
const LOCK_PREFIX = "smart-inventory:daily-report:cairo";
const DEFAULT_TIME = "17:00";
const REPORT_HEARTBEAT_NAME = "smart-inventory-daily-report-heartbeat";
const REPORT_HEARTBEAT_PATH = "/api/scheduled/daily-report-heartbeat";
const REPORT_HEARTBEAT_CRON = "0 */5 * * * *";
const REPORT_HEARTBEAT_TASK_SETTING = "report_heartbeat_task_uid";

/**
 * عزل المشاريع: لكل مشروع مفتاح إعدادات مستقل، مع رجوع تلقائي إلى الإعداد العام
 * حتى لا تتأثر المشاريع التي لم تُضبط بعد ولا تختلط تقاريرها.
 */
export function scheduleSettingKeys(projectId?: number | null) {
  const suffix = projectId == null ? "" : `:${projectId}`;
  return {
    enabled: `report_schedule_enabled${suffix}`,
    time: `report_schedule_time${suffix}`,
    recipients: `report_recipients${suffix}`,
  };
}

/** اسم القفل يجب أن يكون لكل مشروع حتى لا يمنع مشروعٌ تشغيل مشروع آخر. */
export function reportLockName(projectId?: number | null) {
  return projectId == null ? LOCK_PREFIX : `${LOCK_PREFIX}:project-${projectId}`;
}

async function ensureReportSchedulerTable() {
  const pool = await getPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS report_scheduler_runs (
    id int AUTO_INCREMENT NOT NULL,
    project_id int NULL,
    report_date varchar(10) NOT NULL,
    status enum('running','success','failed') NOT NULL,
    started_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp NULL,
    result_summary text NULL,
    error_message text NULL,
    PRIMARY KEY (id),
    UNIQUE KEY report_scheduler_runs_project_date_uq (project_id, report_date),
    KEY report_scheduler_runs_status_idx (status),
    KEY report_scheduler_runs_completed_at_idx (completed_at),
    KEY report_scheduler_runs_project_idx (project_id)
  )`);
  // ترقية آمنة للجداول القديمة: إضافة عمود المشروع ثم استبدال القيد الفريد العالمي بقيد مركّب.
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_scheduler_runs' AND COLUMN_NAME = 'project_id'`
  );
  if (!(columns as Array<unknown>).length) {
    await pool.query(`ALTER TABLE report_scheduler_runs ADD COLUMN project_id int NULL`);
  }
  const [compositeIndex] = await pool.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_scheduler_runs' AND INDEX_NAME = 'report_scheduler_runs_project_date_uq'`
  );
  if (!(compositeIndex as Array<unknown>).length) {
    const [legacyIndex] = await pool.query(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_scheduler_runs' AND INDEX_NAME = 'report_scheduler_runs_report_date_unique'`
    );
    if ((legacyIndex as Array<unknown>).length) {
      await pool.query(`ALTER TABLE report_scheduler_runs DROP INDEX report_scheduler_runs_report_date_unique`);
    }
    await pool.query(`ALTER TABLE report_scheduler_runs ADD CONSTRAINT report_scheduler_runs_project_date_uq UNIQUE (project_id, report_date)`);
  }
}

type CairoParts = { date: string; time: string; minutes: number };

type ForecastRow = {
  code: string;
  name: string;
  unit: string;
  currentStock: number;
  velocity: number;
  daysToExhaust: number;
};

export type SchedulingProject = { id: number; name: string; code: string };

export function getCairoParts(date: Date): CairoParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? "00";
  const dateValue = `${value("year")}-${value("month")}-${value("day")}`;
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  return { date: dateValue, time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, minutes: hour * 60 + minute };
}

export function isScheduleDue(now: Date, scheduleTime: string, lastSuccessfulDate?: string | null): boolean {
  const cairo = getCairoParts(now);
  const [hour, minute] = /^([01]\d|2[0-3]):([0-5]\d)$/.test(scheduleTime) ? scheduleTime.split(":").map(Number) : [17, 0];
  return cairo.minutes >= hour * 60 + minute && lastSuccessfulDate !== cairo.date;
}

/**
 * يحسب الموعد القادم لتشغيل التقرير بتوقيت القاهرة ويعيده بصيغة ISO (UTC).
 * يُستخدم لعرض "التشغيل القادم" في الإعدادات وللتشخيص عبر نقطة الحالة.
 */
export function computeNextRunAt(now: Date, scheduleTime: string): string {
  const [hour, minute] = /^([01]\d|2[0-3]):([0-5]\d)$/.test(scheduleTime) ? scheduleTime.split(":").map(Number) : [17, 0];
  const targetMinutes = hour * 60 + minute;
  const cairo = getCairoParts(now);
  const dayOffset = cairo.minutes < targetMinutes ? 0 : 1;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  // فرق الساعة بين ساعة الحائط في القاهرة وUTC (يشمل التوقيت الصيفي)
  let offsetMinutes = cairo.minutes - utcMinutes;
  offsetMinutes = (((offsetMinutes + 720) % 1440) + 1440) % 1440 - 720;
  // مهم: نستخدم تاريخ القاهرة (مش تاريخ UTC) لأن الاثنين ممكن يختلفوا حول منتصف الليل.
  const [cairoYear, cairoMonth, cairoDay] = cairo.date.split("-").map(Number);
  const cairoMidnightUtc = Date.UTC(cairoYear, cairoMonth - 1, cairoDay) - offsetMinutes * 60_000;
  return new Date(cairoMidnightUtc + dayOffset * 86_400_000 + targetMinutes * 60_000).toISOString();
}

function shiftDate(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function number(value: unknown) {
  return Number(value ?? 0) || 0;
}

async function acquireLock(projectId?: number | null) {
  const pool = await getPool();
  if (!pool) return null;
  const lockName = reportLockName(projectId);
  const connection = await pool.getConnection();
  const [rows] = await connection.query("SELECT GET_LOCK(?, 0) AS acquired", [lockName]);
  const acquired = Number((rows as Array<{ acquired: number }>)[0]?.acquired) === 1;
  if (!acquired) {
    connection.release();
    return null;
  }
  return { release: async () => { try { await connection.query("SELECT RELEASE_LOCK(?)", [lockName]); } finally { connection.release(); } } };
}

/** المشاريع النشطة التي يجب تشغيل تقرير يومي مستقل لها. */
export async function listSchedulingProjects(): Promise<SchedulingProject[]> {
  const db = await requireDb();
  return db
    .select({ id: projects.id, name: projects.name, code: projects.code })
    .from(projects)
    .where(eq(projects.status, "active"))
    .orderBy(projects.id);
}

async function resolveProjectName(projectId?: number | null) {
  if (projectId == null) return "";
  const db = await requireDb();
  const row = (await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId)).limit(1))[0];
  return row?.name ?? "";
}

async function collectForecastAndBuildings(today: string, now: Date, projectId?: number | null) {
  const db = await requireDb();
  const fromDate = getCairoParts(shiftDate(now, -13)).date;
  const itemCondition = projectId != null ? eq(items.projectId, projectId) : undefined;
  const movementCondition = projectId != null ? eq(disbursements.projectId, projectId) : undefined;
  const buildingCondition = projectId != null ? eq(buildings.projectId, projectId) : undefined;
  const [inventory, movements, buildingsRows] = await Promise.all([
    db.select({ code: items.code, name: items.name, currentStock: items.currentStock, reorderLevel: items.reorderLevel, unit: items.unit }).from(items).where(itemCondition),
    db.select({ eznNum: disbursements.eznNum, itemCode: disbursements.itemCode, itemName: disbursements.itemName, quantity: disbursements.quantity, date: disbursements.date, buildingId: disbursements.buildingId, totalValue: disbursements.totalValue, unit: items.unit })
      .from(disbursements)
      // ربط الصنف يجب أن يكون داخل نفس المشروع لأن نفس الكود قد يتكرر بين المشاريع.
      .leftJoin(items, and(eq(disbursements.itemCode, items.code), itemCondition))
      .where(and(gte(disbursements.date, fromDate), movementCondition)),
    db.select({ id: buildings.id, name: buildings.name, budget: buildings.budget }).from(buildings).where(and(eq(buildings.status, "active"), buildingCondition)),
  ]);
  const quantities = new Map<string, number>();
  for (const movement of movements) quantities.set(movement.itemCode, (quantities.get(movement.itemCode) ?? 0) + number(movement.quantity));
  const forecasts: ForecastRow[] = inventory.map(item => {
    const velocity = (quantities.get(item.code) ?? 0) / 14;
    const currentStock = number(item.currentStock);
    return { code: item.code, name: item.name, unit: item.unit ?? "", currentStock, velocity, daysToExhaust: velocity > 0 ? currentStock / velocity : Number.POSITIVE_INFINITY };
  }).filter(row => row.velocity > 0 && (row.daysToExhaust <= 30 || row.currentStock <= 0))
    .sort((a, b) => a.daysToExhaust - b.daysToExhaust);
  const todayRows = movements.filter(row => row.date.startsWith(today));
  const buildingTotals = new Map<number, { quantity: number; value: number }>();
  let unassigned = 0;
  for (const row of todayRows) {
    if (!row.buildingId) { unassigned += 1; continue; }
    const current = buildingTotals.get(row.buildingId) ?? { quantity: 0, value: 0 };
    current.quantity += number(row.quantity);
    current.value += number(row.totalValue);
    buildingTotals.set(row.buildingId, current);
  }
  const buildingAlerts = buildingsRows.map(building => ({ name: building.name, quantity: buildingTotals.get(building.id)?.quantity ?? 0, value: buildingTotals.get(building.id)?.value ?? 0 }))
    .filter(row => row.quantity > 0).sort((a, b) => b.value - a.value);
  const todayDisbursementRows: DailyDisbursementRow[] = todayRows.map(row => ({
    date: row.date,
    eznNum: row.eznNum ?? "",
    itemCode: row.itemCode,
    itemName: row.itemName,
    quantity: row.quantity,
    totalValue: row.totalValue,
    unit: row.unit ?? null,
  }));
  return { forecasts, buildingAlerts, unassigned, totalTodayMovements: todayRows.length, todayDisbursementRows };
}

/**
 * إشعار المدراء داخل التطبيق.
 * عند تمرير مشروع، لا يُشعَر إلا المدراء المسموح لهم بهذا المشروع (والمدير العام admin)
 * حتى لا تتسرّب أرقام مشروع إلى مسؤول مشروع آخر.
 */
async function notifyManagers(title: string, content: string, projectId: number | null | undefined, reportDate: string) {
  const db = await requireDb();
const managers = await db
    .select({ id: users.id, role: users.role, allowedProjects: userPermissions.allowedProjects })
    .from(users)
    .leftJoin(userPermissions, eq(userPermissions.userId, users.id))
    .where(or(eq(users.role, "admin"), eq(users.role, "manager")));
  const recipients = managers.filter(manager =>
    projectId == null || manager.role === "admin" || parseAllowedProjectIds(manager.allowedProjects).includes(projectId)
  );
  if (!recipients.length) return 0;
  const link = buildDailyReportNotificationLink(reportDate, projectId);
  await Promise.all(recipients.map(manager => db.insert(notifications).values({ recipientUserId: manager.id, createdBy: null, notificationType: "daily_report", title, message: content, priority: "normal", link })));
  return recipients.length;
}

async function scopedSetting(scopedKey: string, globalKey: string, fallback: string, projectId?: number | null) {
  if (projectId == null) return getSettingValue(globalKey, fallback);
  const scoped = await getSettingValue(scopedKey, "");
  if (scoped !== "") return scoped;
  return getSettingValue(globalKey, fallback);
}

export async function getReportSchedulerConfig(projectId?: number | null) {
  await ensureReportSchedulerTable();
  const keys = scheduleSettingKeys(projectId);
  const [enabledRaw, timeRaw] = await Promise.all([
    scopedSetting(keys.enabled, "report_schedule_enabled", "true", projectId),
    scopedSetting(keys.time, "report_schedule_time", DEFAULT_TIME, projectId),
  ]);
  const db = await requireDb();
  const scopeCondition = projectId == null ? isNull(reportSchedulerRuns.projectId) : eq(reportSchedulerRuns.projectId, projectId);
  const lastRun = (await db.select().from(reportSchedulerRuns).where(scopeCondition).orderBy(desc(reportSchedulerRuns.startedAt)).limit(1))[0] ?? null;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(timeRaw) ? timeRaw : DEFAULT_TIME;
  const lastSuccessfulDate = lastRun?.status === "success" ? lastRun.reportDate : null;
  return {
    projectId: projectId ?? null,
    projectName: await resolveProjectName(projectId),
    enabled: enabledRaw !== "false",
    time,
    lastRun,
    lastSuccessfulDate,
    nextRunAt: computeNextRunAt(new Date(), time),
    timeZone: TIME_ZONE,
  };
}

export async function saveReportSchedulerConfig(input: { enabled: boolean; time: string; projectId?: number | null }) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error("وقت التقرير يجب أن يكون بصيغة HH:mm");
  const projectId = input.projectId ?? null;
  const keys = scheduleSettingKeys(projectId);
  const scopeLabel = projectId == null ? "العام" : `المشروع #${projectId}`;
  await upsertSetting({ key: keys.enabled, value: String(input.enabled), description: `تفعيل جدولة التقرير اليومي (${scopeLabel}) عبر Heartbeat الخارجي` });
  await upsertSetting({ key: keys.time, value: input.time, description: `وقت التقرير اليومي (${scopeLabel}) بتوقيت Africa/Cairo` });
  return getReportSchedulerConfig(projectId);
}

export async function configureReportHeartbeat(input: { enabled: boolean; userSession: string }) {
  if (!process.env.BUILT_IN_FORGE_API_URL || !process.env.BUILT_IN_FORGE_API_KEY) {
    return { taskUid: null, nextExecutionAt: null, enabled: input.enabled, mode: "project-heartbeat" as const };
  }
  const existingTaskUid = await getSettingValue(REPORT_HEARTBEAT_TASK_SETTING, "");
  if (!existingTaskUid && !input.enabled) return { taskUid: null, nextExecutionAt: null, enabled: false };
  const job = existingTaskUid
    ? await updateHeartbeatJob(existingTaskUid, { cron: REPORT_HEARTBEAT_CRON, path: REPORT_HEARTBEAT_PATH, method: "POST", description: "فحص التقرير التنفيذي اليومي كل 5 دقائق بتوقيت القاهرة", enable: input.enabled }, input.userSession)
    : await createHeartbeatJob({ name: REPORT_HEARTBEAT_NAME, cron: REPORT_HEARTBEAT_CRON, path: REPORT_HEARTBEAT_PATH, method: "POST", description: "فحص التقرير التنفيذي اليومي كل 5 دقائق بتوقيت القاهرة" }, input.userSession);
  const taskUid = existingTaskUid || (job as { taskUid?: string }).taskUid;
  if (!taskUid) throw new Error("تعذر الحصول على معرّف Heartbeat للتقرير");
  await upsertSetting({ key: REPORT_HEARTBEAT_TASK_SETTING, value: taskUid, description: "معرّف Heartbeat الخارجي لجدولة التقرير اليومي" });
  return { taskUid, nextExecutionAt: job.nextExecutionAt ?? null, enabled: input.enabled };
}

export async function isReportHeartbeatTask(taskUid: string) {
  return Boolean(taskUid) && (await getSettingValue(REPORT_HEARTBEAT_TASK_SETTING, "")) === taskUid;
}

/**
 * تشغيل التقرير لكل مشروع نشط بشكل مستقل.
 * فشل مشروع لا يوقف المشاريع الأخرى، وكل مشروع له سجل تشغيل وقفل ووقت مستقل.
 */
export async function runDailyExecutiveReportIfDue() {
  const projectsToRun = await listSchedulingProjects();
  const targets: Array<SchedulingProject | null> = projectsToRun.length ? projectsToRun : [null];
  const results: Array<Record<string, unknown>> = [];
  for (const target of targets) {
    const projectId = target?.id ?? null;
    try {
      const config = await getReportSchedulerConfig(projectId);
      const lastSuccessfulDate = config.lastRun?.status === "success" ? config.lastRun.reportDate : null;
      if (!config.enabled) {
        results.push({ projectId, projectName: target?.name ?? "", status: "skipped", reason: "disabled", reportDate: getCairoParts(new Date()).date });
        continue;
      }
      if (!isScheduleDue(new Date(), config.time, lastSuccessfulDate)) {
        results.push({ projectId, projectName: target?.name ?? "", status: "skipped", reason: "not-due", reportDate: getCairoParts(new Date()).date });
        continue;
      }
      const result = await runDailyExecutiveReport({ projectId });
      results.push({ ...result, projectId, projectName: target?.name ?? "" });
    } catch (error: any) {
      // عزل الأعطال: نُسجّل فشل المشروع ونكمل باقي المشاريع.
      console.error(`[ReportScheduler] project ${projectId ?? "global"} failed`, error);
      results.push({ projectId, projectName: target?.name ?? "", status: "failed", error: error?.message || "فشل تشغيل التقرير" });
    }
  }
  const executed = results.filter(result => result.status === "success").length;
  const failed = results.filter(result => result.status === "failed").length;
  const status = failed === 0 ? (executed > 0 ? "success" : "skipped") : executed > 0 ? "partial" : "failed";
  return {
    status: status as "success" | "skipped" | "partial" | "failed",
    reportDate: getCairoParts(new Date()).date,
    projects: results.length,
    executed,
    failed,
    results,
  };
}

export async function runDailyExecutiveReport(options: { force?: boolean; projectId?: number | null } = {}) {
  const now = new Date();
  const today = getCairoParts(now).date;
  const projectId = options.projectId ?? null;
  const projectName = await resolveProjectName(projectId);
  const lock = await acquireLock(projectId);
  if (!lock) return { status: "skipped" as const, reason: "another-run-in-progress", reportDate: today, projectId, projectName };
  const db = await requireDb();
  let run: typeof reportSchedulerRuns.$inferSelect | undefined;
  try {
    await ensureReportSchedulerTable();
    const runScope = projectId == null ? isNull(reportSchedulerRuns.projectId) : eq(reportSchedulerRuns.projectId, projectId);
    run = (await db.select().from(reportSchedulerRuns).where(and(eq(reportSchedulerRuns.reportDate, today), runScope)).limit(1))[0];
    if (run?.status === "success" && !options.force) return { status: "skipped" as const, reason: "already-succeeded", reportDate: today, runId: run.id, projectId, projectName };
    const startedAt = new Date();
    if (run) await db.update(reportSchedulerRuns).set({ status: "running", startedAt, completedAt: null, errorMessage: null }).where(eq(reportSchedulerRuns.id, run.id));
    else {
      await db.insert(reportSchedulerRuns).values({ projectId, reportDate: today, status: "running", startedAt });
      run = (await db.select().from(reportSchedulerRuns).where(and(eq(reportSchedulerRuns.reportDate, today), runScope)).limit(1))[0];
      if (!run) throw new Error("تعذر إنشاء سجل تشغيل التقرير");
    }
    const recipientsKey = scheduleSettingKeys(projectId).recipients;
    const [rows, thresholdRaw, recipientsRaw, analysis] = await Promise.all([
      getInventoryRows([], projectId),
      getSettingValue("threshold_percentage", "20"),
      scopedSetting(recipientsKey, "report_recipients", process.env.INVENTORY_REPORT_EMAILS ?? process.env.ADMIN_EMAIL ?? "", projectId),
      collectForecastAndBuildings(today, now, projectId),
    ]);
    const threshold = Math.min(100, Math.max(0, Number(thresholdRaw) || 20));
    const lowStockCount = getLowStockItems(rows, threshold).length;
    const minimumStockItems = getItemsAtOrBelowMinimum(rows as any);
    const severeCodes = new Set(getLowStockItems(rows as any, threshold).map(row => row.code));
    const disbursementSummary = summarizeDailyDisbursements(analysis.todayDisbursementRows);
    const html = buildDailyReportEmail({
      reportDate: today,
      projectName: projectName || undefined,
      thresholdPercentage: threshold,
      inventoryTotal: rows.length,
      minimumStockItems: minimumStockItems as any,
      severeCodes,
      forecasts: analysis.forecasts,
      buildingAlerts: analysis.buildingAlerts,
      unassigned: analysis.unassigned,
      totalTodayMovements: analysis.totalTodayMovements,
      summary: disbursementSummary,
    });
    const recipients = recipientsRaw.split(/[;,\n]/).map(value => value.trim()).filter(Boolean);
    const projectPrefix = projectName ? `${projectName} — ` : "";
    let sentEmail = false;
    let emailError: string | null = null;
    try {
      sentEmail = recipients.length ? await sendConfiguredEmail({ subject: `Smart Inventory — ${projectPrefix}التقرير التنفيذي اليومي ${today}`, html, recipients }) : false;
      if (!sentEmail && recipients.length) emailError = "SMTP غير مفعّل أو فشل الإرسال";
      if (!recipients.length) emailError = "لا يوجد مستلمون مضبوطون للتقرير";
    } catch (error: any) {
      emailError = error?.message || "فشل إرسال البريد";
      console.error("[ReportScheduler] email failed", error);
    }
    const message = `${projectName ? `[${projectName}] ` : ""}التقرير التنفيذي ${today}: صرف اليوم ${analysis.totalTodayMovements} حركة، أصناف حرجة ${analysis.forecasts.length}، بدون مبنى ${analysis.unassigned}، منخفض المخزون ${lowStockCount}.`;
    let notifiedManagers = 0;
    let managersError: string | null = null;
    try { notifiedManagers = await notifyManagers(projectName ? `التقرير التنفيذي اليومي — ${projectName}` : "التقرير التنفيذي اليومي", message, projectId, today); } catch (error: any) { managersError = error?.message || "فشل حفظ الإشعار الداخلي"; console.error("[ReportScheduler] in-app notification failed", error); }
    let sentWhatsApp = false;
    let whatsappError: string | null = null;
    try {
      const result = await sendWhatsAppNotification(message);
      sentWhatsApp = result.success;
      if (!result.success) whatsappError = result.error || "فشل إرسال واتساب";
    } catch (error: any) { whatsappError = error?.message || "فشل إرسال واتساب"; console.warn("[ReportScheduler] WhatsApp failed", error); }
    const summary = { projectId, projectName, lowStockCount, criticalCount: analysis.forecasts.length, omittedCriticalCount: Math.max(0, analysis.forecasts.length - 8), buildingAlerts: analysis.buildingAlerts.length, unassigned: analysis.unassigned, email: sentEmail, emailError, managers: notifiedManagers, managersError, whatsapp: sentWhatsApp, whatsappError };
    await db.update(reportSchedulerRuns).set({ status: "success", completedAt: new Date(), resultSummary: JSON.stringify(summary), errorMessage: null }).where(eq(reportSchedulerRuns.id, run!.id));
    return { status: "success" as const, reportDate: today, runId: run!.id, ...summary, projectId, projectName };
  } catch (error: any) {
    const message = error?.message || "تعذر تنفيذ التقرير التنفيذي اليومي";
    if (run) await db.update(reportSchedulerRuns).set({ status: "failed", completedAt: new Date(), errorMessage: message }).where(eq(reportSchedulerRuns.id, run.id));
    await db.insert(auditLogs).values({ userId: null, userName: "report-scheduler", action: "daily_report_failed", entity: "report_scheduler", entityId: `${projectId ?? "global"}:${today}`, details: message });
    try { await notifyManagers(projectName ? `فشل التقرير التنفيذي — ${projectName}` : "فشل التقرير التنفيذي اليومي", `فشل تشغيل تقرير ${projectName ? `${projectName} ` : ""}${today}: ${message}`, projectId, today); } catch (notifyError) { console.error("[ReportScheduler] failure notification failed", notifyError); }
    throw error;
  } finally { await lock.release(); }
}
