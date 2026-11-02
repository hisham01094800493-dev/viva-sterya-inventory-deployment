import { getDb } from "./db/connection";
import { asc, inArray } from "drizzle-orm";
import { disbursements, items } from "../drizzle/schema";

type ItemRow = { id: number; code: string; name: string; currentStock: unknown; unit?: string | null; unitPrice?: unknown; warehouseId?: number | null; createdAt?: Date | null };
type DisbursementRow = { itemCode: string; quantity: unknown; unitPrice?: unknown; totalValue?: unknown; date: string; warehouseId?: number | null };
export type ForecastSeverity = "critical" | "warning" | "watch" | "ok";
export type ForecastRow = { code: string; name: string; unit: string | null; currentStock: number; dailyRate: number; dailyRate30: number; dailyRate90: number; daysOfCover: number | null; severity: ForecastSeverity; suggestedOrderQty: number; abcClass: "A" | "B" | "C"; lastDisbursementDate: string | null; lowConfidence: boolean; stagnant: boolean; warehouseId: number | null; consumptionValue90: number; outlierQuantity90: number };
export type ForecastSettings = { leadTimeDays: number; safetyStockDays: number };

const DAY = 86_400_000;
const asNumber = (value: unknown) => Number(value ?? 0) || 0;
function parseDate(value: unknown): Date | null {
  const text = String(value ?? "").trim();
  if (!/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(text)) return null;
  const [year, month, day] = text.split(/[-/.]/).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}
function dateKey(date: Date) { return date.toISOString().slice(0, 10); }
function mean(values: number[]) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function stddev(values: number[]) { const avg = mean(values); return Math.sqrt(mean(values.map(value => (value - avg) ** 2))); }
export function classifySeverity(days: number | null, currentStock: number): ForecastSeverity {
  if (currentStock <= 0 || (days !== null && days <= 3)) return "critical";
  if (days !== null && days <= 7) return "warning";
  if (days !== null && days <= 14) return "watch";
  return "ok";
}
export function classifyAbc(rows: Array<{ code: string; value: number }>) {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((sum, row) => sum + row.value, 0);
  let cumulative = 0;
  const result = new Map<string, "A" | "B" | "C">();
  for (const row of sorted) { cumulative += row.value; const ratio = total ? cumulative / total : 1; result.set(row.code, ratio <= 0.8 ? "A" : ratio <= 0.95 ? "B" : "C"); }
  return result;
}
export function buildForecast(itemsRows: ItemRow[], movementRows: DisbursementRow[], now = new Date(), settings: ForecastSettings = { leadTimeDays: 7, safetyStockDays: 3 }) {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start30 = end - 30 * DAY, start90 = end - 90 * DAY;
  const grouped = new Map<string, Array<{ date: Date; quantity: number; value: number }>>();
  for (const row of movementRows) {
    const date = parseDate(row.date); const quantity = asNumber(row.quantity);
    if (!date || date.getTime() < start90 || date.getTime() > end || quantity <= 0) continue;
    const list = grouped.get(row.itemCode) ?? [];
    const unitPrice = row.unitPrice != null ? asNumber(row.unitPrice) : quantity ? asNumber(row.totalValue) / quantity : 0;
    list.push({ date, quantity, value: quantity * unitPrice }); grouped.set(row.itemCode, list);
  }
  const abc = classifyAbc(Array.from(grouped, ([code, rows]) => ({ code, value: rows.reduce((sum, row) => sum + row.value, 0) })));
  return itemsRows.map(item => {
    const movements = grouped.get(item.code) ?? [];
    const quantities = movements.map(row => row.quantity);
    const deviation = stddev(quantities); const average = mean(quantities);
    const filtered = deviation > 0 ? movements.filter(row => row.quantity <= average + 3 * deviation) : movements;
    const lastDate = movements.length ? movements.reduce((latest, row) => row.date > latest ? row.date : latest, movements[0].date) : null;
    const sumBetween = (from: number) => filtered.filter(row => row.date.getTime() >= from).reduce((sum, row) => sum + row.quantity, 0);
    const recent30 = sumBetween(start30) / 30, recent90 = sumBetween(start90) / 90;
    const lowConfidence = !item.createdAt || (end - new Date(item.createdAt).getTime()) < 30 * DAY;
    const dailyRate = lowConfidence && recent90 === 0 ? recent30 : (recent30 * 0.6 + recent90 * 0.4);
    const currentStock = asNumber(item.currentStock); const daysOfCover = dailyRate > 0 ? currentStock / dailyRate : null;
    const severity = classifySeverity(daysOfCover, currentStock);
    const suggestedOrderQty = Math.max(0, Math.ceil(dailyRate * (settings.leadTimeDays + settings.safetyStockDays) - currentStock));
    const stagnant = currentStock > 0 && (!lastDate || lastDate.getTime() < start90);
    return { code: item.code, name: item.name, unit: item.unit ?? null, currentStock, dailyRate, dailyRate30: recent30, dailyRate90: recent90, daysOfCover, severity, suggestedOrderQty, abcClass: abc.get(item.code) ?? "C", lastDisbursementDate: lastDate ? dateKey(lastDate) : null, lowConfidence, stagnant, warehouseId: item.warehouseId ?? null, consumptionValue90: movements.reduce((sum, row) => sum + row.value, 0), outlierQuantity90: quantities.filter(quantity => deviation > 0 && quantity > average + 3 * deviation).reduce((sum, quantity) => sum + quantity, 0) } satisfies ForecastRow;
  }).sort((a, b) => ({ critical: 0, warning: 1, watch: 2, ok: 3 }[a.severity] - ({ critical: 0, warning: 1, watch: 2, ok: 3 }[b.severity]) || Number(a.daysOfCover ?? -1) - Number(b.daysOfCover ?? -1) || a.name.localeCompare(b.name, "ar")));
}
let cached: { at: number; key: string; rows: ForecastRow[] } | null = null;
export function invalidateForecastCache() { cached = null; }
export async function getForecastRows(allowedWarehouseIds: number[] = [], settings: ForecastSettings = { leadTimeDays: 7, safetyStockDays: 3 }) {
  const cacheKey = `${settings.leadTimeDays}:${settings.safetyStockDays}:${allowedWarehouseIds.join(",")}`;
  if (!allowedWarehouseIds.length && cached && cached.key === cacheKey && Date.now() - cached.at < 5 * 60_000) return cached.rows;
  const db = await getDb();
  if (!db) return [];
  const itemWhere = allowedWarehouseIds.length ? inArray(items.warehouseId, allowedWarehouseIds) : undefined;
  const movementWhere = allowedWarehouseIds.length ? inArray(disbursements.warehouseId, allowedWarehouseIds) : undefined;
  const [itemRows, movementRows] = await Promise.all([db.select().from(items).where(itemWhere), db.select({ itemCode: disbursements.itemCode, quantity: disbursements.quantity, unitPrice: disbursements.unitPrice, totalValue: disbursements.totalValue, date: disbursements.date, warehouseId: disbursements.warehouseId }).from(disbursements).where(movementWhere)]);
  const rows = buildForecast(itemRows, movementRows, new Date(), settings);
  if (!allowedWarehouseIds.length) cached = { at: Date.now(), key: cacheKey, rows };
  return rows;
}
