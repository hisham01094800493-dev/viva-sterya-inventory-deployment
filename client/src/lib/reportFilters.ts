import type { MovementExportItem, ExportColumnKey } from "./inventoryExportFiles";
import { simplifyArabicForSearch } from "./globalVoiceSearch";

export type MovementFilter = "all" | "إضافة" | "صرف" | "مرتجع";
export type ReportType = "overview" | "inventory" | "movements" | "returns" | "variance" | "accounts" | "unlinked";
export type ExportFormat = "excel" | "pdf";

export function createReportExportRequest(reportType: ReportType, format: ExportFormat, columns: ExportColumnKey[], logo: string | null) {
  return { reportType, format, options: { columns: [...columns], logo } };
}

export function movementCategory(type: string) {
  return type.startsWith("توريد") || type === "إضافة" ? "إضافة" : type.startsWith("صرف") || type === "صرف" ? "صرف" : type.includes("مرتجع") ? "مرتجع" : "تحويل";
}

export function filterMovementRows(rows: MovementExportItem[], filter: MovementFilter) {
  return filter === "all" ? rows : rows.filter(row => movementCategory(row.type) === filter);
}

export function filterMovementRowsByPurpose(rows: MovementExportItem[], additionPurpose: string, disbursementPurpose: string, returnPurpose = "") {
  const additionQuery = additionPurpose.trim().toLocaleLowerCase("ar-EG");
  const disbursementQuery = disbursementPurpose.trim().toLocaleLowerCase("ar-EG");
  const returnQuery = returnPurpose.trim().toLocaleLowerCase("ar-EG");
  return rows.filter(row => {
    const category = movementCategory(row.type);
    const additionMatch = !additionQuery || (category === "إضافة" && String(row.additionPurpose ?? "").toLocaleLowerCase("ar-EG").includes(additionQuery));
    const disbursementMatch = !disbursementQuery || (category === "صرف" && String(row.disbursementPurpose ?? "").toLocaleLowerCase("ar-EG").includes(disbursementQuery));
    const returnMatch = !returnQuery || (category === "مرتجع" && String(row.returnPurpose ?? "").toLocaleLowerCase("ar-EG").includes(returnQuery));
    return additionMatch && disbursementMatch && returnMatch;
  });
}

export function countMovementRows(rows: MovementExportItem[]) {
  return rows.reduce<Record<"all" | "إضافة" | "صرف" | "مرتجع", number>>((counts, row) => {
    counts.all += 1;
    const category = movementCategory(row.type);
    if (category === "إضافة" || category === "صرف" || category === "مرتجع") counts[category] += 1;
    return counts;
  }, { all: 0, إضافة: 0, صرف: 0, مرتجع: 0 });
}

export function estimatePdfRemainingSeconds(elapsedSeconds: number, progress: number) {
  if (!Number.isFinite(elapsedSeconds) || !Number.isFinite(progress) || elapsedSeconds <= 0 || progress <= 0 || progress >= 100) return progress >= 100 ? 0 : null;
  return Math.max(1, Math.ceil(elapsedSeconds * (100 - progress) / progress));
}

export function formatReportPartySummary(incomingFrom: string, outgoingTo: string) {
  const lines: string[] = [];
  if (incomingFrom.trim()) lines.push(`وارد من: ${incomingFrom.trim()}`);
  if (outgoingTo.trim()) lines.push(`منصرف إلى: ${outgoingTo.trim()}`);
  return lines;
}

const arabicDigits: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
export function normalizeReportSearch(value: unknown) {
  return simplifyArabicForSearch(String(value ?? "")).replace(/[٠-٩]/g, digit => arabicDigits[digit] ?? digit).trim();
}

export function filterMovementRowsBySearch(rows: MovementExportItem[], permitNumber: string, incomingFrom: string, outgoingTo: string) {
  const permit = normalizeReportSearch(permitNumber);
  const from = normalizeReportSearch(incomingFrom);
  const to = normalizeReportSearch(outgoingTo);
  return rows.filter(row => {
    const permitMatch = !permit || normalizeReportSearch(row.eznNum).includes(permit);
    const partyQueryActive = Boolean(from || to);
    const searchableParty = normalizeReportSearch(`${String(row.type ?? "")} ${String(row.detail ?? "")} ${String(row.additionPurpose ?? "")} ${String(row.disbursementPurpose ?? "")}`);
    const incomingMatch = Boolean(from) && movementCategory(row.type) === "إضافة" && searchableParty.includes(from);
    const outgoingMatch = Boolean(to) && (movementCategory(row.type) === "صرف" || movementCategory(row.type) === "مرتجع") && searchableParty.includes(to);
    return permitMatch && (!partyQueryActive || incomingMatch || outgoingMatch);
  });
}
