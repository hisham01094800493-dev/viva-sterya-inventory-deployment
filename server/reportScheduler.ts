import { desc, eq, gte, or } from "drizzle-orm";
import {
  auditLogs,
  buildings,
  disbursements,
  items,
  notifications,
  reportSchedulerRuns,
  settings,
  users,
} from "../drizzle/schema";
import { getInventoryRows, getSettingValue, upsertSetting } from "./db";
import { requireDb, getPool } from "./db/connection";
import { getItemsAtOrBelowMinimum, getLowStockItems, summarizeDailyDisbursements, type DailyDisbursementRow } from "./inventoryReports";
import { buildDailyReportEmail } from "./reportEmailTemplate";
import { sendConfiguredEmail } from "./email";
import { sendWhatsAppNotification } from "./whatsapp";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";

const TIME_ZONE = "Africa/Cairo";
const LOCK_NAME = "smart-inventory:daily-report:cairo";
const DEFAULT_TIME = "17:00";
const REPORT_HEARTBEAT_NAME = "smart-inventory-daily-report-heartbeat";
const REPORT_HEARTBEAT_PATH = "/api/scheduled/daily-report-heartbeat";
const REPORT_HEARTBEAT_CRON = "0 */5 * * * *";
const REPORT_HEARTBEAT_TASK_SETTING = "report_heartbeat_task_uid";

async function ensureReportSchedulerTable() {
  const pool = await getPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS report_scheduler_runs (
    id int AUTO_INCREMENT NOT NULL,
    report_date varchar(10) NOT NULL,
    status enum('running','success','failed') NOT NULL,
    started_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp NULL,
    result_summary text NULL,
    error_message text NULL,
    PRIMARY KEY (id),
    UNIQUE KEY report_scheduler_runs_report_date_unique (report_date),
    KEY report_scheduler_runs_status_idx (status),
    KEY report_scheduler_runs_completed_at_idx (completed_at)
  )`);
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
  // مهم: نستخدم تاريخ القاهرة (مش تاريخ UTC) لأن الاتنين ممكن يختلفوا حول منتصف الليل.
  const [cairoYear, cairoMonth, cairoDay] = cairo.date.split("-").map(Number);
  const cairoMidnightUtc = Date.UTC(cairoYear, cairoMonth - 1, cairoDay) - offsetMinutes * 60_000;
  return new Date(cairoMidnightUtc + dayOffset * 86_400_000 + targetMinutes * 60_000).toISOString();
}

function shiftDate(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function number(value: unknown) {
  return Number(value ?? 0) || 0;
}

async function acquireLock() {
  const pool = await getPool();
  if (!pool) return null;
  const connection = await pool.getConnection();
  const [rows] = await connection.query("SELECT GET_LOCK(?, 0) AS acquired", [LOCK_NAME]);
  const acquired = Number((rows as Array<{ acquired: number }>)[0]?.acquired) === 1;
  if (!acquired) {
    connection.release();
    return null;
  }
  return { release: async () => { try { await connection.query("SELECT RELEASE_LOCK(?)", [LOCK_NAME]); } finally { connection.release(); } } };
}

async function collectForecastAndBuildings(today: string, now: Date) {
  const db = await requireDb();
  const fromDate = getCairoParts(shiftDate(now, -13)).date;
  const [inventory, movements, buildingsRows] = await Promise.all([
    db.select({ code: items.code, name: items.name, currentStock: items.currentStock, reorderLevel: items.reorderLevel, unit: items.unit }).from(items),
    db.select({ eznNum: disbursements.eznNum, itemCode: disbursements.itemCode, itemName: disbursements.itemName, quantity: disbursements.quantity, date: disbursements.date, buildingId: disbursements.buildingId, totalValue: disbursements.totalValue, unit: items.unit }).from(disbursements).leftJoin(items, eq(disbursements.itemCode, items.code)).where(gte(disbursements.date, fromDate)),
    db.select({ id: buildings.id, name: buildings.name, budget: buildings.budget }).from(buildings).where(eq(buildings.status, "active")),
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

async function notifyManagers(title: string, content: string) {
  const db = await requireDb();
  const managers = await db.select({ id: users.id }).from(users).where(or(eq(users.role, "admin"), eq(users.role, "manager")));
  if (!managers.length) return 0;
  await Promise.all(managers.map(manager => db.insert(notifications).values({ recipientUserId: manager.id, createdBy: null, notificationType: "daily_report", title, message: content, priority: "normal", link: "/settings" })));
  return managers.length;
}

export async function getReportSchedulerConfig() {
  await ensureReportSchedulerTable();
  const [enabledRaw, timeRaw] = await Promise.all([getSettingValue("report_schedule_enabled", "true"), getSettingValue("report_schedule_time", DEFAULT_TIME)]);
  const db = await requireDb();
  const lastRun = (await db.select().from(reportSchedulerRuns).orderBy(desc(reportSchedulerRuns.startedAt)).limit(1))[0] ?? null;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(timeRaw) ? timeRaw : DEFAULT_TIME;
  const lastSuccessfulDate = lastRun?.status === "success" ? lastRun.reportDate : null;
  return {
    enabled: enabledRaw !== "false",
    time,
    lastRun,
    lastSuccessfulDate,
    nextRunAt: computeNextRunAt(new Date(), time),
    timeZone: TIME_ZONE,
  };
}

export async function saveReportSchedulerConfig(input: { enabled: boolean; time: string }) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error("وقت التقرير يجب أن يكون بصيغة HH:mm");
  await upsertSetting({ key: "report_schedule_enabled", value: String(input.enabled), description: "تفعيل جدولة التقرير اليومي عبر Heartbeat الخارجي" });
  await upsertSetting({ key: "report_schedule_time", value: input.time, description: "وقت التقرير اليومي بتوقيت Africa/Cairo" });
  return getReportSchedulerConfig();
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

export async function runDailyExecutiveReportIfDue() {
  const config = await getReportSchedulerConfig();
  const lastSuccessfulDate = config.lastRun?.status === "success" ? config.lastRun.reportDate : null;
  if (!config.enabled) return { status: "skipped" as const, reason: "disabled", reportDate: getCairoParts(new Date()).date };
  if (!isScheduleDue(new Date(), config.time, lastSuccessfulDate)) return { status: "skipped" as const, reason: "not-due", reportDate: getCairoParts(new Date()).date };
  return runDailyExecutiveReport();
}

export async function runDailyExecutiveReport(options: { force?: boolean } = {}) {
  const now = new Date();
  const today = getCairoParts(now).date;
  const lock = await acquireLock();
  if (!lock) return { status: "skipped" as const, reason: "another-run-in-progress", reportDate: today };
  const db = await requireDb();
  let run: typeof reportSchedulerRuns.$inferSelect | undefined;
  try {
    await ensureReportSchedulerTable();
    run = (await db.select().from(reportSchedulerRuns).where(eq(reportSchedulerRuns.reportDate, today)).limit(1))[0];
    if (run?.status === "success" && !options.force) return { status: "skipped" as const, reason: "already-succeeded", reportDate: today, runId: run.id };
    const startedAt = new Date();
    if (run) await db.update(reportSchedulerRuns).set({ status: "running", startedAt, completedAt: null, errorMessage: null }).where(eq(reportSchedulerRuns.id, run.id));
    else { const result = await db.insert(reportSchedulerRuns).values({ reportDate: today, status: "running", startedAt }); run = (await db.select().from(reportSchedulerRuns).where(eq(reportSchedulerRuns.reportDate, today)).limit(1))[0]; if (!run && result) throw new Error("تعذر إنشاء سجل تشغيل التقرير"); }
    const [rows, thresholdRaw, recipientsRaw, analysis] = await Promise.all([getInventoryRows(), getSettingValue("threshold_percentage", "20"), getSettingValue("report_recipients", process.env.INVENTORY_REPORT_EMAILS ?? process.env.ADMIN_EMAIL ?? ""), collectForecastAndBuildings(today, now)]);
    const threshold = Math.min(100, Math.max(0, Number(thresholdRaw) || 20));
    const lowStockCount = getLowStockItems(rows, threshold).length;
    const minimumStockItems = getItemsAtOrBelowMinimum(rows as any);
    const severeCodes = new Set(getLowStockItems(rows as any, threshold).map(row => row.code));
    const disbursementSummary = summarizeDailyDisbursements(analysis.todayDisbursementRows);
    const html = buildDailyReportEmail({
      reportDate: today,
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
    let sentEmail = false;
    let emailError: string | null = null;
    try {
      sentEmail = recipients.length ? await sendConfiguredEmail({ subject: `Smart Inventory — التقرير التنفيذي اليومي ${today}`, html, recipients }) : false;
      if (!sentEmail && recipients.length) emailError = "SMTP غير مفعّل أو فشل الإرسال";
      if (!recipients.length) emailError = "لا يوجد مستلمون مضبوطون للتقرير";
    } catch (error: any) {
      emailError = error?.message || "فشل إرسال البريد";
      console.error("[ReportScheduler] email failed", error);
    }
    const message = `التقرير التنفيذي ${today}: صرف اليوم ${analysis.totalTodayMovements} حركة، أصناف حرجة ${analysis.forecasts.length}، بدون مبنى ${analysis.unassigned}، منخفض المخزون ${lowStockCount}.`;
    let notifiedManagers = 0;
    let managersError: string | null = null;
    try { notifiedManagers = await notifyManagers("التقرير التنفيذي اليومي", message); } catch (error: any) { managersError = error?.message || "فشل حفظ الإشعار الداخلي"; console.error("[ReportScheduler] in-app notification failed", error); }
    let sentWhatsApp = false;
    let whatsappError: string | null = null;
    try {
      const result = await sendWhatsAppNotification(message);
      sentWhatsApp = result.success;
      if (!result.success) whatsappError = result.error || "فشل إرسال واتساب";
    } catch (error: any) { whatsappError = error?.message || "فشل إرسال واتساب"; console.warn("[ReportScheduler] WhatsApp failed", error); }
    const summary = { lowStockCount, criticalCount: analysis.forecasts.length, omittedCriticalCount: Math.max(0, analysis.forecasts.length - 8), buildingAlerts: analysis.buildingAlerts.length, unassigned: analysis.unassigned, email: sentEmail, emailError, managers: notifiedManagers, managersError, whatsapp: sentWhatsApp, whatsappError };
    await db.update(reportSchedulerRuns).set({ status: "success", completedAt: new Date(), resultSummary: JSON.stringify(summary), errorMessage: null }).where(eq(reportSchedulerRuns.id, run!.id));
    return { status: "success" as const, reportDate: today, runId: run!.id, ...summary };
  } catch (error: any) {
    const message = error?.message || "تعذر تنفيذ التقرير التنفيذي اليومي";
    if (run) await db.update(reportSchedulerRuns).set({ status: "failed", completedAt: new Date(), errorMessage: message }).where(eq(reportSchedulerRuns.id, run.id));
    await db.insert(auditLogs).values({ userId: null, userName: "report-scheduler", action: "daily_report_failed", entity: "report_scheduler", entityId: today, details: message });
    try { await notifyManagers("فشل التقرير التنفيذي اليومي", `فشل تشغيل تقرير ${today}: ${message}`); } catch (notifyError) { console.error("[ReportScheduler] failure notification failed", notifyError); }
    throw error;
  } finally { await lock.release(); }
}
