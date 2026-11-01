import ExcelJS from "exceljs";
import type { jsPDF } from "jspdf";

type PdfTools = { jsPDF: typeof import("jspdf").jsPDF; autoTable: typeof import("jspdf-autotable").default };
let pdfToolsPromise: Promise<PdfTools> | null = null;
export const loadPdfTools = () => { void fetchArabicFontData(); return pdfToolsPromise ??= Promise.all([import("jspdf"), import("jspdf-autotable")]).then(([jspdf, table]) => ({ jsPDF: jspdf.jsPDF, autoTable: table.default })); };
import type { InventoryExportItem } from "./inventoryExport";
import { buildInventoryPdfRows } from "./inventoryExport";
import { downloadBlobFile, getExportImageExtension, savePdfFile } from "./inventoryExportRuntime";
import { formatInventoryDate, inventoryDateKey } from "./inventoryDate";
import { formatDisbursementPurpose, splitMixedArabicLatinForPdf } from "./movementPurpose";
import type { StockVarianceRow } from "./stockVariance";
import type { AccountItemSummary } from "./accountStatementGrouping";

export type MovementExportItem = { id?: number; currentStock?: number; unit?: string | null; type: string; date: string; eznNum: string; itemCode: string; name?: string; quantity: number; detail: string; purpose?: string | null; additionPurpose?: string | null; disbursementPurpose?: string | null; returnPurpose?: string | null; unitPrice: number; totalValue: number; imageUrl?: string | null; documentImageUrl?: string | null; isNegativeCorrection?: boolean };
export const inventoryExportColumns = ["code", "name", "category", "unit", "currentStock", "reorderLevel", "unitPrice", "totalValue", "image"] as const;
export const movementExportColumns = ["name", "type", "date", "eznNum", "itemCode", "quantity", "additionPurpose", "disbursementPurpose", "returnPurpose", "unitPrice", "totalValue", "image", "documentImage", "detail"] as const;
export type ExportColumnKey = typeof inventoryExportColumns[number] | typeof movementExportColumns[number];
export const movementPdfExportColumns = ["name", "type", "date", "eznNum", "itemCode", "quantity", "additionPurpose", "disbursementPurpose", "returnPurpose", "unitPrice", "totalValue", "documentImage", "detail"] as const;
export const movementPdfExportColumnsWithoutDetail = movementPdfExportColumns.filter(column => column !== "detail") as readonly Exclude<typeof movementPdfExportColumns[number], "detail">[];
export const movementExportColumnsWithoutDetail = movementExportColumns.filter(column => column !== "detail") as readonly Exclude<typeof movementExportColumns[number], "detail">[];
const labels: Record<ExportColumnKey, string> = { code: "كود الصنف", name: "اسم الصنف", category: "التصنيف", unit: "الوحدة", currentStock: "الرصيد الحالي", reorderLevel: "حد الطلب", unitPrice: "سعر الوحدة", totalValue: "قيمة المخزون/الحركة", image: "صورة الصنف", documentImage: "صورة الإذن", type: "الحركة", date: "التاريخ", eznNum: "رقم الإذن", itemCode: "كود الصنف", quantity: "الكمية", additionPurpose: "لِزوم الإضافة", disbursementPurpose: "لِزوم الصرف", returnPurpose: "لِزوم الارتجاع", detail: "التفاصيل" };
const movementDetail = (row: MovementExportItem) => `${row.isNegativeCorrection ? "تصحيح سالب — " : ""}${row.detail}`;

export async function blobToDataUrl(blob: Blob) { return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); }); }
export async function convertWebpToPng(blob: Blob) { const bitmap = await createImageBitmap(blob); const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext("2d")?.drawImage(bitmap, 0, 0); bitmap.close(); return await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error("تعذر تحويل الصورة")), "image/png")); }
export async function fetchImageAsset(url?: string | null) { if (!url) return null; try { const response = await fetch(url); if (!response.ok) return null; const source = await response.blob(); const isWebp = source.type === "image/webp" || url.toLowerCase().includes(".webp"); const blob = isWebp ? await convertWebpToPng(source) : source; const extension = isWebp ? "png" as const : getExportImageExtension(source.type, url) === "png" ? "png" as const : "jpeg" as const; return { buffer: await blob.arrayBuffer(), dataUrl: await blobToDataUrl(blob), extension }; } catch { return null; } }

// Bundle the font with the app so PDF generation does not depend on a CDN
// response or a browser-specific fallback font. DejaVu also contains common
// measurement symbols such as ×, *, +, °, and ±.
export const ARABIC_PDF_FONT_URL = "/fonts/DejaVuSans.ttf";
let arabicFontDataPromise: Promise<string | null> | null = null;
const arabicPdfDocs = new WeakSet<object>();
const PDF_FONT_NAME = "DejaVuSans";

async function fetchArabicFontData() {
  if (!arabicFontDataPromise) arabicFontDataPromise = fetch(ARABIC_PDF_FONT_URL).then(async response => { if (!response.ok) return null; const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""; if (contentType.includes("image/") || contentType.includes("text/html")) return null; return response.arrayBuffer(); }).then(buffer => buffer ? Array.from(new Uint8Array(buffer), byte => String.fromCharCode(byte)).join("") : null).then(binary => binary ? btoa(binary) : null).catch(() => null);
  return arabicFontDataPromise;
}

export async function configureArabicPdf(doc: jsPDF) {
  const rtlDoc = doc as jsPDF & { setR2L?: (value: boolean) => void; setLanguage?: (value: string) => void };
  // processArabic يعيد النص العربي مشكلاً بالترتيب المنطقي؛ jsPDF يسبب عكساً إضافياً عند R2L=true.
  // نستخدم المحاذاة إلى اليمين يدوياً بدلاً من عكس النص مرة ثانية.
  rtlDoc.setR2L?.(false);
  rtlDoc.setLanguage?.("ar");
  const fontData = await fetchArabicFontData();
  if (fontData) {
    try {
      doc.addFileToVFS("DejaVuSans.ttf", fontData);
      doc.addFont("DejaVuSans.ttf", PDF_FONT_NAME, "normal");
      doc.addFont("DejaVuSans.ttf", PDF_FONT_NAME, "bold");
      doc.setFont(PDF_FONT_NAME, "normal");
      arabicPdfDocs.add(doc);
    } catch {
      doc.setFont("helvetica", "normal");
    }
  }
  return doc;
}

export function normalizePdfMixedArabicText(value: string) {
  return String(value);
}

export function shapeArabic(doc: jsPDF, value: string) {
  const normalized = normalizePdfMixedArabicText(value);
  return arabicPdfDocs.has(doc) && typeof (doc as jsPDF & { processArabic?: (text: string) => string }).processArabic === "function" ? (doc as jsPDF & { processArabic: (text: string) => string }).processArabic(normalized) : normalized;
}
export function getArabicPdfFont(doc: jsPDF) { return arabicPdfDocs.has(doc) ? PDF_FONT_NAME : "helvetica"; }
export function getPdfImageFormat(dataUrl?: string | null): "PNG" | "JPEG" { return dataUrl?.toLowerCase().startsWith("data:image/png") ? "PNG" : "JPEG"; }
export function getReportHeaderDate(date: unknown = new Date()) { return formatInventoryDate(date); }
/** Keep the currency token Latin inside PDF mixed-direction text; `ج.م` can reorder or render incorrectly in jsPDF RTL shaping. */
export function formatPdfCurrency(value: unknown) { const amount = Number(value ?? 0); return `${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`; }
export function formatPdfMovementDate(value: unknown) { const key = inventoryDateKey(value); const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/); const raw = match ? `${match[3]} / ${match[2]} / ${match[1]}` : (() => { const display = formatInventoryDate(value); const parts = display.split(/[\/.,،؛\-\s]+/).filter(Boolean); return parts.length >= 3 ? `${parts[0].padStart(2, "0")} / ${parts[1].padStart(2, "0")} / ${parts[2]}` : display; })(); return raw; }
export function getReportHeaderLines(summary?: string | string[]) { return !summary ? [] : Array.isArray(summary) ? summary.filter(Boolean) : summary.split("\n").filter(Boolean); }
export function getReportHeaderHeight(summary?: string | string[]) { return getReportHeaderLines(summary).length ? 88 + Math.max(0, getReportHeaderLines(summary).length - 1) * 14 : 72; }
export function drawReportHeader(doc: jsPDF, title: string, _logo?: string | null, date = new Date(), summary?: string | string[], dateFirst = false) { (doc as jsPDF & { setR2L?: (value: boolean) => void }).setR2L?.(false); if (arabicPdfDocs.has(doc)) doc.setFont(PDF_FONT_NAME, "bold"); (doc as jsPDF & { setTextColor?: (red: number, green: number, blue: number) => void }).setTextColor?.(16, 42, 67); const lines = getReportHeaderLines(summary); const pageWidth = doc.internal?.pageSize?.getWidth?.() ?? 210; const headerRight = pageWidth - 14; doc.setFontSize(16); doc.text(shapeArabic(doc, title), headerRight, 32, { align: "right", baseline: "middle" }); doc.setFontSize(9); if (dateFirst) { doc.text(getReportHeaderDate(date), headerRight, 52, { align: "right", baseline: "middle" }); if (lines.length) { doc.setFontSize(10); lines.forEach((line, index) => doc.text(shapeArabic(doc, line), headerRight, 67 + index * 15, { align: "right", baseline: "middle" })); } } else { if (lines.length) { doc.setFontSize(10); lines.forEach((line, index) => doc.text(shapeArabic(doc, line), headerRight, 52 + index * 15, { align: "right", baseline: "middle" })); } doc.setFontSize(9); doc.text(getReportHeaderDate(date), headerRight, lines.length ? 52 + lines.length * 15 : 52, { align: "right", baseline: "middle" }); } const ruleY = lines.length ? (dateFirst ? 72 + lines.length * 15 : 59 + lines.length * 15) : 63; doc.setDrawColor(177, 203, 211); doc.setLineWidth(0.8); doc.line(36, ruleY, pageWidth - 36, ruleY); doc.setDrawColor(13, 79, 98); doc.setLineWidth(2.2); doc.line(pageWidth - 112, ruleY, pageWidth - 36, ruleY); }
function logoAndDate(doc: jsPDF, title: string, logo?: string | null, date = new Date(), summary?: string | string[], dateFirst = false) { drawReportHeader(doc, title, logo, date, summary, dateFirst); }
export type AccountStatementPdfCard = { label: string; value: string | number; tone?: "teal" | "red" | "amber" | "green" | "blue" | "slate" };
function drawAccountStatementHeader(doc: jsPDF, logo: string | null, date: Date, summary: string | string[] | undefined, recordCount: number, summaryCards?: AccountStatementPdfCard[]) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 36;
  const right = pageWidth - 36;
  const lines = getReportHeaderLines(summary).filter(line => line.trim() !== "كشف رسمي");
  const entityLine = lines.find(line => line.includes(":") || line.includes("：")) ?? "المورد: —";
  const separatorIndex = Math.max(entityLine.indexOf(":"), entityLine.indexOf("："));
  const entityName = separatorIndex >= 0 ? entityLine.slice(separatorIndex + 1).trim() : entityLine;
  const isCustomer = entityLine.includes("جهة") || entityLine.includes("عميل");
  const valueOf = (line: string) => line.split(/[:：]/).slice(1).join(":").trim() || "0";
  const totalLine = lines.find(line => line.includes("إجمالي الكمية")) ?? "إجمالي الكمية: 0";
  const optionalLines = lines.filter(line => line !== entityLine && !line.includes("إجمالي الكمية"));
  const metricEntries: Array<{ label: string; value: string; color: [number, number, number]; valueColor: [number, number, number] }> = [
    { label: "عدد الحركات", value: String(recordCount), color: [246, 250, 251], valueColor: [16, 42, 67] },
    { label: "إجمالي الكمية", value: valueOf(totalLine), color: [255, 248, 235], valueColor: [169, 104, 33] },
    ...optionalLines.map(line => {
      const split = Math.max(line.indexOf(":"), line.indexOf("："));
      const label = split >= 0 ? line.slice(0, split).trim() : line;
      const value = split >= 0 ? valueOf(line) : "0";
      const financial = label.includes("القيمة") || label.includes("الصرف") || label.includes("السالب") || label.includes("المرتجع");
      return { label, value, color: financial ? [255, 248, 235] as [number, number, number] : [246, 250, 251] as [number, number, number], valueColor: financial ? [169, 104, 33] as [number, number, number] : [16, 42, 67] as [number, number, number] };
    }),
  ];
  const toneColors: Record<NonNullable<AccountStatementPdfCard["tone"]>, { color: [number, number, number]; valueColor: [number, number, number] }> = {
    teal: { color: [232, 247, 246], valueColor: [13, 79, 98] },
    red: { color: [251, 236, 235], valueColor: [189, 81, 71] },
    amber: { color: [255, 244, 223], valueColor: [169, 104, 33] },
    green: { color: [232, 247, 239], valueColor: [13, 128, 108] },
    blue: { color: [232, 242, 250], valueColor: [13, 113, 128] },
    slate: { color: [246, 250, 251], valueColor: [16, 42, 67] },
  };
  const explicitMetrics = summaryCards?.filter(card => String(card.label).trim()).map(card => ({ label: String(card.label), value: String(card.value), ...(toneColors[card.tone ?? "slate"] ?? toneColors.slate) }));
  const metrics = explicitMetrics?.length ? explicitMetrics : metricEntries;
  doc.setFillColor(13, 79, 98);
  doc.rect(0, 0, pageWidth, 8, "F");
  if (logo) {
    try { doc.addImage(logo, getPdfImageFormat(logo), left, 22, 38, 38); } catch { /* Keep report usable if logo is invalid. */ }
  }
  doc.setTextColor(16, 42, 67);
  doc.setFont(getArabicPdfFont(doc), "bold");
  doc.setFontSize(20);
  doc.text(shapeArabic(doc, isCustomer ? "كشف حساب عميل / جهة" : "كشف حساب مورد"), pageWidth / 2, 31, { align: "center" });
  doc.setFontSize(9);
  doc.setTextColor(106, 126, 139);
  doc.text(shapeArabic(doc, "تقرير تفصيلي للحركات والكميات"), pageWidth / 2, 47, { align: "center" });
  doc.setDrawColor(177, 203, 211);
  doc.setLineWidth(0.8);
  doc.line(left, 59, right, 59);
  doc.setDrawColor(13, 79, 98);
  doc.setLineWidth(2.2);
  doc.line(pageWidth / 2 - 38, 59, pageWidth / 2 + 38, 59);
  doc.setTextColor(16, 42, 67);
  doc.setFont(getArabicPdfFont(doc), "bold");
  doc.setFontSize(9);
  doc.text(shapeArabic(doc, "تاريخ التقرير"), right, 27, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(getReportHeaderDate(date), right, 42, { align: "right" });
  doc.setFont(getArabicPdfFont(doc), "bold");
  doc.setFillColor(232, 247, 246);
  doc.setDrawColor(158, 217, 225);
  doc.roundedRect(left, 68, right - left, 48, 8, 8, "FD");
  doc.setTextColor(13, 113, 128);
  doc.setFontSize(9);
  doc.text(shapeArabic(doc, isCustomer ? "العميل / الجهة" : "المورد"), right - 14, 87, { align: "right" });
  doc.setTextColor(16, 42, 67);
  doc.setFontSize(entityName.length > 42 ? 12 : 15);
  doc.text(shapeArabic(doc, entityName || "—"), right - 14, 105, { align: "right", maxWidth: right - left - 145 });
  const metricY = 128;
  const gap = 10;
  const columnsPerRow = metrics.length > 4 ? 4 : metrics.length > 2 ? 3 : 2;
  const metricWidth = (right - left - gap * (columnsPerRow - 1)) / columnsPerRow;
  const metricHeight = 30;
  const rowGap = 8;
  metrics.forEach((metric, index) => {
    const column = index % columnsPerRow;
    const row = Math.floor(index / columnsPerRow);
    const x = left + column * (metricWidth + gap);
    const y = metricY + row * (metricHeight + rowGap);
    doc.setFillColor(...metric.color);
    doc.setDrawColor(224, 234, 237);
    doc.roundedRect(x, y, metricWidth, metricHeight, 6, 6, "FD");
    doc.setTextColor(120, 144, 156);
    doc.setFontSize(8);
    doc.text(shapeArabic(doc, metric.label), x + metricWidth - 10, y + 11, { align: "right" });
    doc.setTextColor(...metric.valueColor);
    doc.setFontSize(11);
    doc.text(shapeArabic(doc, metric.value), x + metricWidth - 10, y + 24, { align: "right" });
  });
  return metricY + Math.ceil(metrics.length / columnsPerRow) * metricHeight + (Math.ceil(metrics.length / columnsPerRow) - 1) * rowGap;
}

export function selectExportColumns(keys: readonly ExportColumnKey[], requested?: ExportColumnKey[]) { return requested?.length ? requested.filter(key => keys.some(allowed => allowed === key)) : [...keys]; }
function selected(keys: readonly ExportColumnKey[], requested?: ExportColumnKey[]) { return selectExportColumns(keys, requested); }

export async function buildInventoryExcel(rows: InventoryExportItem[], options: { columns?: ExportColumnKey[] } = {}) { const keys = selected(inventoryExportColumns, options.columns); const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("المخزون الحالي", { views: [{ rightToLeft: true }] }); const defs: Record<string, { header: string; key: string; width: number }> = { code: { header: labels.code, key: "code", width: 16 }, name: { header: labels.name, key: "name", width: 28 }, category: { header: labels.category, key: "category", width: 18 }, unit: { header: labels.unit, key: "unit", width: 12 }, currentStock: { header: labels.currentStock, key: "currentStock", width: 16 }, reorderLevel: { header: labels.reorderLevel, key: "reorderLevel", width: 14 }, unitPrice: { header: labels.unitPrice, key: "unitPrice", width: 14 }, totalValue: { header: labels.totalValue, key: "totalValue", width: 18 }, image: { header: labels.image, key: "image", width: 15 } }; sheet.columns = keys.map(key => defs[key]); sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D4F62" } }; for (const row of rows) { const excelRow = sheet.addRow(Object.fromEntries(keys.map(key => [key, key === "totalValue" ? Number((row.currentStock * row.unitPrice).toFixed(2)) : key === "image" ? (row.imageUrl ? "مضمنة" : "—") : row[key as keyof InventoryExportItem]]))); for (const imageKey of ["image", "documentImage"] as const) { const url = imageKey === "image" ? row.imageUrl : row.documentImageUrl; if (keys.includes(imageKey) && url) { const asset = await fetchImageAsset(url); if (asset) { const imageId = workbook.addImage({ buffer: asset.buffer, extension: asset.extension }); sheet.addImage(imageId, { tl: { col: keys.indexOf(imageKey), row: excelRow.number - 1 }, ext: { width: 58, height: 58 } }); excelRow.height = 48; } } } } return workbook; }
export async function downloadInventoryExcel(rows: InventoryExportItem[], options: { columns?: ExportColumnKey[] } = {}) { const workbook = await buildInventoryExcel(rows, options); const output = await workbook.xlsx.writeBuffer(); downloadBlobFile(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "smart-inventory-stock.xlsx"); }

export async function buildItemCardExcel(card: ItemCardPdfData, options: { movementFilter?: "all" | "إضافة" | "صرف" | "مرتجع" | "تحويل"; includePermitColumn?: boolean; includeUnitPrice?: boolean; includeTotalValue?: boolean } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("كارت الصنف", { views: [{ rightToLeft: true }] });
  sheet.addRow([`كارت صنف تفصيلي - ${card.item.name ?? "—"}`]);
  sheet.addRow(["الكود", card.item.code ?? "—", "الوحدة", card.item.unit ?? "—", "الرصيد الحالي", Number(card.item.currentStock ?? 0)]);
  sheet.addRow(["الرصيد الأولي", Number(card.item.initialStock ?? 0), "سعر الوحدة", Number(card.item.unitPrice ?? 0)]);
  const allRows = buildItemCardMovementRows(card);
  const rows = options.movementFilter && options.movementFilter !== "all" ? allRows.filter(row => row.movement === options.movementFilter) : allRows;
  const columns = ["date", "detail", "purpose", ...(options.includePermitColumn ? ["permitNumber"] : []), "movement", "openingStock", "addition", "returned", "disbursement", "runningStock", ...(options.includeUnitPrice !== false ? ["unitPrice"] : []), ...(options.includeTotalValue !== false ? ["totalValue"] : [])] as const;
  const labels: Record<typeof columns[number], string> = { date: "التاريخ", detail: "البيان", purpose: "اللُّزوم", permitNumber: "رقم الإذن", movement: "الحركة", openingStock: "الرصيد الأول", addition: "الإضافة", returned: "المرتجع", disbursement: "الصرف", runningStock: "الرصيد الإجمالي", unitPrice: "السعر", totalValue: "إجمالي السعر" };
  const values: Record<typeof columns[number], (row: ItemCardMovementPdfRow) => string | number> = { date: row => row.date, detail: row => row.detail, purpose: row => row.purpose || "—", permitNumber: row => row.permitNumber, movement: row => row.movement, openingStock: row => row.openingStock === null ? "—" : row.openingStock, addition: row => row.addition || "—", returned: row => row.returned || "—", disbursement: row => row.disbursement || "—", runningStock: row => row.runningStock === null ? "—" : row.runningStock, unitPrice: row => row.unitPrice, totalValue: row => row.totalValue };
  const headerRow = sheet.addRow(columns.map(key => labels[key]));
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D4F62" } };
  sheet.columns = columns.map(key => ({ header: labels[key], key, width: key === "date" ? 14 : key === "detail" ? 34 : key === "permitNumber" ? 16 : key === "movement" ? 14 : 16 }));
  rows.forEach(row => { const excelRow = sheet.addRow(columns.map(key => values[key](row))); excelRow.alignment = { vertical: "middle", horizontal: "right", wrapText: true }; excelRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row.movement === "إضافة" ? "FFE8F7EF" : row.movement === "صرف" ? "FFFFE8ED" : row.movement === "مرتجع" ? "FFFFF7E0" : "FFE8F2FA" } }; });
  const excelTotals = { addition: rows.reduce((sum, row) => sum + row.addition, 0), returned: rows.reduce((sum, row) => sum + row.returned, 0), disbursement: rows.reduce((sum, row) => sum + row.disbursement, 0), totalValue: rows.reduce((sum, row) => sum + row.totalValue, 0) };
  const excelFinalStock = Number(card.item.currentStock ?? rows.at(-1)?.runningStock ?? card.item.initialStock ?? 0); const excelTotalRow = { date: "", detail: "الإجمالي", purpose: "", movement: "", openingStock: null, addition: Number(excelTotals.addition.toFixed(3)), returned: Number(excelTotals.returned.toFixed(3)), disbursement: Number(excelTotals.disbursement.toFixed(3)), runningStock: Number(excelFinalStock.toFixed(3)), unitPrice: 0, totalValue: Number(excelTotals.totalValue.toFixed(2)), permitNumber: "" } as unknown as ItemCardMovementPdfRow;
  const totalExcelRow = sheet.addRow(columns.map(key => values[key](excelTotalRow))); totalExcelRow.font = { bold: true, color: { argb: "FF102A43" } }; totalExcelRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCEBF0" } }; totalExcelRow.alignment = { vertical: "middle", horizontal: "right", wrapText: true };
  sheet.getRow(1).font = { bold: true, size: 15, color: { argb: "FF0D4F62" } };
  sheet.mergeCells(1, 1, 1, columns.length);
  return workbook;
}

export async function downloadItemCardExcel(card: ItemCardPdfData, options: { movementFilter?: "all" | "إضافة" | "صرف" | "مرتجع" | "تحويل"; includePermitColumn?: boolean; includeUnitPrice?: boolean; includeTotalValue?: boolean; fileName?: string } = {}) { const workbook = await buildItemCardExcel(card, options); const output = await workbook.xlsx.writeBuffer(); downloadBlobFile(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), options.fileName ?? `smart-inventory-item-card-${card.item.code ?? "report"}.xlsx`); }

async function downloadMovementExcelLegacy(rows: MovementExportItem[], options: { columns?: ExportColumnKey[] } = {}) { const keys = selected(movementExportColumns, options.columns); const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("حركات المخزون", { views: [{ rightToLeft: true }] }); const defs: Record<string, { header: string; key: string; width: number }> = { type: { header: labels.type, key: "type", width: 14 }, date: { header: labels.date, key: "date", width: 14 }, eznNum: { header: labels.eznNum, key: "eznNum", width: 16 }, itemCode: { header: labels.itemCode, key: "itemCode", width: 16 }, name: { header: labels.name, key: "name", width: 28 }, quantity: { header: labels.quantity, key: "quantity", width: 14 }, additionPurpose: { header: labels.additionPurpose, key: "additionPurpose", width: 28 }, disbursementPurpose: { header: labels.disbursementPurpose, key: "disbursementPurpose", width: 28 }, returnPurpose: { header: labels.returnPurpose, key: "returnPurpose", width: 28 }, detail: { header: labels.detail, key: "detail", width: 24 }, unitPrice: { header: labels.unitPrice, key: "unitPrice", width: 14 }, totalValue: { header: labels.totalValue, key: "totalValue", width: 18 }, image: { header: labels.image, key: "image", width: 15 }, documentImage: { header: labels.documentImage, key: "documentImage", width: 15 } }; sheet.columns = keys.map(key => defs[key]); sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D4F62" } }; for (const row of rows) { const excelRow = sheet.addRow(Object.fromEntries(keys.map(key => [key, key === "totalValue" ? row.totalValue : key === "image" ? (row.imageUrl ? "مضمنة" : "—") : key === "documentImage" ? (row.documentImageUrl ? "مضمنة" : "—") : key === "detail" ? movementDetail(row) : key === "additionPurpose" ? (row.additionPurpose || "—") : key === "disbursementPurpose" ? (formatDisbursementPurpose(row.disbursementPurpose) || "—") : key === "returnPurpose" ? (row.returnPurpose || "—") : row[key as keyof MovementExportItem]]))); for (const imageKey of ["image", "documentImage"] as const) { const url = imageKey === "image" ? row.imageUrl : row.documentImageUrl; if (keys.includes(imageKey) && url) { const asset = await fetchImageAsset(url); if (asset) { const imageId = workbook.addImage({ buffer: asset.buffer, extension: asset.extension }); sheet.addImage(imageId, { tl: { col: keys.indexOf(imageKey), row: excelRow.number - 1 }, ext: { width: 58, height: 58 } }); excelRow.height = 48; } } } } const output = await workbook.xlsx.writeBuffer(); downloadBlobFile(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "smart-inventory-disbursements-returns.xlsx"); }

async function pdfTable(rows: Array<Record<string, unknown>>, keys: readonly ExportColumnKey[], filename: string, title: string, logo?: string | null) { const { jsPDF, autoTable } = await loadPdfTools(); const visualKeys = [...keys].reverse(); const doc = await configureArabicPdf(new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" })); drawPdfWatermark(doc, logo); logoAndDate(doc, title, logo); autoTable(doc, { startY: 72, head: [visualKeys.map(key => shapeArabic(doc, labels[key]))], body: rows.map(row => visualKeys.map(key => key === "image" ? (row.imageUrl ? "" : "—") : key === "documentImage" ? (row.documentImageUrl ? "" : "—") : shapeArabic(doc, key === "date" ? formatPdfMovementDate(row.date) : String(key === "detail" ? movementDetail(row as MovementExportItem) : row[key] ?? "—")))), styles: { font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 8.5, cellPadding: 6, halign: "right" , lineColor: [137, 162, 172], lineWidth: 0.55}, headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.6, font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 9, halign: "center" }, willDrawPage: data => { if (data.pageNumber > 1) drawPdfWatermark(doc, logo); }, didDrawCell: data => { if (data.section === "body" && ["image", "documentImage"].includes(visualKeys[data.column.index])) { const image = data.column.index >= 0 ? (visualKeys[data.column.index] === "image" ? rows[data.row.index].imageDataUrl : rows[data.row.index].documentImageDataUrl) : null; if (image) doc.addImage(String(image), getPdfImageFormat(String(image)), data.cell.x + 3, data.cell.y + 3, 34, 34); } } }); savePdfFile(doc, filename); }

async function resolveLogo(logo?: string | null) { if (!logo) return null; if (logo.startsWith("data:")) return logo; return (await fetchImageAsset(logo))?.dataUrl ?? null; }

function drawPdfWatermark(doc: jsPDF, logo?: string | null, opacity = 0.08, scale = 0.42, position: "center" | "top" | "bottom" = "center", repeat = false) {
  if (!logo) return;
  const pdf = doc as jsPDF & { GState?: new (options: { opacity: number }) => unknown; setGState?: (state: unknown) => void; saveGraphicsState?: () => void; restoreGraphicsState?: () => void };
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const safeOpacity = Math.max(0.02, Math.min(0.25, opacity));
  const safeScale = Math.max(0.2, Math.min(0.8, scale));
  const size = Math.min(width, height) * safeScale;
  const x = (width - size) / 2;
  const y = position === "top" ? Math.max(36, height * 0.12) : position === "bottom" ? Math.max(36, height - size - height * 0.12) : (height - size) / 2;
  pdf.saveGraphicsState?.();
  if (pdf.GState && pdf.setGState) pdf.setGState(new pdf.GState({ opacity: safeOpacity }));
  doc.addImage(logo, getPdfImageFormat(logo), x, y, size, size);
  pdf.restoreGraphicsState?.();
  if (repeat) {
    const offsets = position === "center" ? [[width * 0.18, height * 0.2], [width * 0.58, height * 0.62]] : position === "top" ? [[width * 0.18, height * 0.56], [width * 0.58, height * 0.56]] : [[width * 0.18, height * 0.12], [width * 0.58, height * 0.12]];
    for (const [repeatX, repeatY] of offsets) {
      pdf.saveGraphicsState?.();
      if (pdf.GState && pdf.setGState) pdf.setGState(new pdf.GState({ opacity: safeOpacity }));
      doc.addImage(logo, "PNG", repeatX, repeatY, size * 0.52, size * 0.52);
      pdf.restoreGraphicsState?.();
    }
  }
}
export type ExecutiveForecastPdfRow = {
  code: string;
  name: string;
  daysOfCover?: number | null;
  suggestedOrderQty?: number | null;
  abcClass?: string | null;
  severity?: string | null;
};

async function cropPdfImageToSquare(dataUrl: string, size = 96) {
  try {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context || !image.naturalWidth || !image.naturalHeight) return dataUrl;
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.fillStyle = "#f1f6f7";
    context.fillRect(0, 0, size, size);
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch { return dataUrl; }
}

export async function buildInventoryPdf(rows: InventoryExportItem[] | null | undefined, options: { columns?: ExportColumnKey[]; logo?: string | null; date?: Date; title?: string; summary?: string | string[]; includeCategoryValueChart?: boolean; executiveForecasts?: ExecutiveForecastPdfRow[]; watermarkOpacity?: number; watermarkScale?: number; watermarkPosition?: "center" | "top" | "bottom"; watermarkRepeat?: boolean; watermarkEnabled?: boolean } = {}) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const rawRows = Array.isArray(rows) ? rows : [];
  const safeRows = rawRows.filter((row): row is InventoryExportItem => Boolean(row && typeof row === "object" && Object.values(row).some(value => value !== null && value !== undefined && String(value).trim() !== "")));
  const isExecutive = Boolean(options.executiveForecasts);
  const forecastByCode = new Map((options.executiveForecasts ?? []).map(row => [String(row.code), row]));
  const keys = selected(inventoryExportColumns, options.columns);
  const executiveKeys = ["code", "name", "category", "currentStock", "coverageDays", "suggestedOrderQty", "abcClass", "image"];
  const tableKeys = (isExecutive ? executiveKeys : keys) as string[];
  const pdfLabels: Record<string, string> = { ...labels, coverageDays: "أيام التغطية", suggestedOrderQty: "الكمية المقترحة", abcClass: "ABC" };
  const includeImages = tableKeys.includes("image");
  const enriched = await Promise.all(safeRows.map(async row => {
    let imageDataUrl: string | undefined;
    if (includeImages && row.imageUrl) { try { const asset = await fetchImageAsset(row.imageUrl); imageDataUrl = asset?.dataUrl ? await cropPdfImageToSquare(asset.dataUrl) : undefined; } catch { imageDataUrl = undefined; } }
    const currentStock = Number.isFinite(Number(row.currentStock)) ? Number(row.currentStock) : 0;
    const unitPrice = Number.isFinite(Number(row.unitPrice)) ? Number(row.unitPrice) : 0;
    const forecast = forecastByCode.get(String(row.code));
    return { ...row, currentStock, unitPrice, totalValue: Number((currentStock * unitPrice).toFixed(2)), imageDataUrl, coverageDays: forecast?.daysOfCover ?? null, suggestedOrderQty: forecast?.suggestedOrderQty ?? null, abcClass: forecast?.abcClass ?? "—", severity: forecast?.severity ?? null };
  }));
  const severityRank: Record<string, number> = { critical: 0, warning: 1, watch: 2, ok: 3 };
  if (isExecutive) enriched.sort((left, right) => (severityRank[left.severity ?? "ok"] ?? 4) - (severityRank[right.severity ?? "ok"] ?? 4) || (Number(left.coverageDays ?? 999999) - Number(right.coverageDays ?? 999999)) || String(left.name).localeCompare(String(right.name), "ar"));
  const doc = await configureArabicPdf(new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" }));
  const resolvedLogo = await resolveLogo(options.logo);
  const watermarkLogo = options.watermarkEnabled === false ? null : resolvedLogo;
  drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat);
  logoAndDate(doc, options.title ?? "تقرير المخزون - Smart Inventory", resolvedLogo, options.date, options.summary);
  let contentY = getReportHeaderHeight(options.summary);
  if (isExecutive && options.executiveForecasts?.length) {
    const forecastRows = options.executiveForecasts.slice(0, 8);
    doc.setFont(getArabicPdfFont(doc), "bold"); doc.setFontSize(11); doc.setTextColor(16, 42, 67);
    doc.text(shapeArabic(doc, "الأصناف الحرجة المتوقعة — أعلى 8"), doc.internal.pageSize.getWidth() - 36, contentY + 8, { align: "right" });
    autoTable(doc, { startY: contentY + 16, margin: { left: 36, right: 36 }, tableWidth: doc.internal.pageSize.getWidth() - 72, head: [["ABC", "الكمية المقترحة", "أيام التغطية", "الصنف", "الكود"].map(value => shapeArabic(doc, value))], body: forecastRows.map(row => [row.abcClass || "—", row.suggestedOrderQty == null ? "—" : Number(row.suggestedOrderQty).toFixed(2), row.daysOfCover == null ? "غير محدد" : Number(row.daysOfCover).toFixed(1), shapeArabic(doc, row.name), String(row.code)]), styles: { font: getArabicPdfFont(doc), fontSize: 8.2, fontStyle: "bold", cellPadding: 4, halign: "right", overflow: "linebreak", lineColor: [197, 216, 222], lineWidth: 0.45 }, headStyles: { fillColor: [13, 79, 98], textColor: [255, 255, 255], font: getArabicPdfFont(doc), fontStyle: "bold", halign: "center" }, columnStyles: { 0: { cellWidth: 48, halign: "center" }, 1: { cellWidth: 86, halign: "center" }, 2: { cellWidth: 76, halign: "center" }, 3: { cellWidth: 230, halign: "right" }, 4: { cellWidth: 70, halign: "center" } }, alternateRowStyles: { fillColor: [246, 250, 251] }, didParseCell: data => { if (data.section === "body" && data.column.index === 0) data.cell.styles.textColor = [13, 113, 128]; }, willDrawPage: data => { if (data.pageNumber > 1) drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat); } });
    contentY = ((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? contentY + 80) + 12;
  }
  if (options.includeCategoryValueChart && enriched.length) {
    const totals = new Map<string, number>();
    enriched.forEach(row => { const category = String(row.category || "بدون تصنيف"); totals.set(category, (totals.get(category) ?? 0) + Number(row.totalValue)); });
    const sorted = Array.from(totals.entries()).sort((left, right) => right[1] - left[1]);
    const chartRows = sorted.length > 7 ? [...sorted.slice(0, 6), ["أخرى", sorted.slice(6).reduce((sum, [, value]) => sum + value, 0)] as [string, number]] : sorted;
    const chartMax = Math.max(...chartRows.map(([, value]) => Math.abs(value)), 1);
    const chartLeft = 36; const chartRight = doc.internal.pageSize.getWidth() - 36; const chartTop = contentY + 4; const chartHeight = 32 + chartRows.length * 15;
    doc.setFillColor(248, 252, 253); doc.setDrawColor(220, 231, 238); doc.roundedRect(chartLeft, chartTop, chartRight - chartLeft, chartHeight, 7, 7, "FD");
    doc.setTextColor(16, 42, 67); doc.setFont(getArabicPdfFont(doc), "bold"); doc.setFontSize(10); doc.text(shapeArabic(doc, "توزيع القيمة المالية حسب التصنيف"), chartRight - 12, chartTop + 15, { align: "right" });
    const labelRight = chartRight - 12; const valueX = chartLeft + 12; const barLeft = chartLeft + 116; const barRight = chartRight - 150; const barMaxWidth = Math.max(70, barRight - barLeft);
    chartRows.forEach(([category, value], index) => { const y = chartTop + 25 + index * 15; const width = Math.max(2, (Math.abs(value) / chartMax) * barMaxWidth); doc.setFillColor(13, 113, 128); doc.roundedRect(barRight - width, y, width, 8, 3, 3, "F"); doc.setTextColor(71, 91, 105); doc.setFontSize(7.2); doc.text(shapeArabic(doc, category), labelRight, y + 6, { align: "right" }); doc.setTextColor(16, 42, 67); doc.setFont("helvetica", "bold"); doc.text(formatPdfCurrency(value), valueX, y + 6, { align: "left" }); doc.setFont(getArabicPdfFont(doc), "bold"); });
    contentY = chartTop + chartHeight + 10;
  }
  const valueFor = (row: typeof enriched[number], key: string) => key === "totalValue" ? row.totalValue : key === "image" ? (row.imageDataUrl ? "" : "—") : key === "coverageDays" ? (row.coverageDays == null ? "—" : Number(row.coverageDays).toFixed(1)) : key === "suggestedOrderQty" ? (row.suggestedOrderQty == null ? "—" : Number(row.suggestedOrderQty).toFixed(2)) : key === "abcClass" ? row.abcClass : row[key as keyof typeof row] ?? "—";
  const body = enriched.map(row => tableKeys.map(key => key === "image" ? (row.imageDataUrl ? "" : "—") : shapeArabic(doc, String(valueFor(row, key)))));
  const pageWidth = doc.internal.pageSize.getWidth(); const tableWidth = pageWidth - 72;
  const widths: Record<string, number> = isExecutive ? { code: 62, name: 178, category: 92, currentStock: 72, coverageDays: 72, suggestedOrderQty: 82, abcClass: 42, image: 38 } : {};
  const defaultWidth = (key: string) => widths[key] ?? Math.max(46, Math.min(key === "name" ? 190 : 92, 48 + Math.max(0, String(pdfLabels[key] ?? key).length - 5) * 4));
  const baseTotal = tableKeys.reduce((sum, key) => sum + defaultWidth(key), 0); const scale = baseTotal > tableWidth ? tableWidth / baseTotal : 1;
  const columnStyles = Object.fromEntries(tableKeys.map((key, index) => [index, { cellWidth: defaultWidth(key) * scale, halign: key === "name" ? ("right" as const) : ("center" as const), overflow: "linebreak" as const }]));
  autoTable(doc, { startY: contentY, margin: { left: 36, right: 36 }, tableWidth, head: [tableKeys.map(key => shapeArabic(doc, pdfLabels[key] ?? key))], body, columnStyles, styles: { font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: isExecutive ? 7.7 : 8.5, cellPadding: isExecutive ? 3.5 : 5, halign: "right", overflow: "linebreak", minCellHeight: includeImages ? 31 : 21, lineColor: [137, 162, 172], lineWidth: 0.45 }, headStyles: { fillColor: [13, 79, 98], textColor: [255, 255, 255], font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 8, halign: "center", cellPadding: 4 }, alternateRowStyles: { fillColor: [246, 250, 251] }, didParseCell: data => { if (data.section === "body" && tableKeys[data.column.index] === "image") { data.cell.styles.minCellHeight = 31; data.cell.styles.cellPadding = 2; } }, willDrawPage: data => { if (data.pageNumber > 1) drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat); }, didDrawCell: data => { if (data.section !== "body" || tableKeys[data.column.index] !== "image") return; const image = enriched[data.row.index]?.imageDataUrl; const size = Math.min(26, Math.max(18, data.cell.height - 5), Math.max(18, data.cell.width - 5)); const x = data.cell.x + (data.cell.width - size) / 2; const y = data.cell.y + (data.cell.height - size) / 2; if (image) { try { doc.addImage(image, getPdfImageFormat(image), x, y, size, size); return; } catch {} } doc.setFillColor(232, 241, 242); doc.roundedRect(x, y, size, size, 3, 3, "F"); doc.setTextColor(13, 79, 98); doc.setFont(getArabicPdfFont(doc), "bold"); doc.setFontSize(7); doc.text("صورة", x + size / 2, y + size / 2 + 2, { align: "center" }); } });
  return doc;
}
export async function downloadInventoryPdf(rows: InventoryExportItem[], options: { columns?: ExportColumnKey[]; logo?: string | null; date?: Date; title?: string; summary?: string | string[]; watermarkEnabled?: boolean } = {}) { const doc = await buildInventoryPdf(rows, options); savePdfFile(doc, "smart-inventory-stock.pdf"); }
async function downloadMovementPdfLegacy(rows: MovementExportItem[], options: { columns?: ExportColumnKey[]; logo?: string | null } = {}) { const keys = selected(movementPdfExportColumns, options.columns); const enriched = await Promise.all(rows.map(async row => ({ ...row, imageDataUrl: (await fetchImageAsset(row.imageUrl))?.dataUrl, documentImageDataUrl: (await fetchImageAsset(row.documentImageUrl))?.dataUrl }))); await pdfTable(enriched, keys, "smart-inventory-disbursements-returns.pdf", "تقرير حركات المخزون - Smart Inventory", await resolveLogo(options.logo)); }

export { buildInventoryPdfRows };

export async function buildMovementExcel(rows: MovementExportItem[], options: { columns?: ExportColumnKey[]; includeDetail?: boolean } = {}) {
  const columnSource = options.includeDetail === false ? movementExportColumnsWithoutDetail : movementExportColumns;
  const keys = selected(columnSource, options.columns);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("حركات المخزون", { views: [{ rightToLeft: true }] });
  const defs: Record<string, { header: string; key: string; width: number }> = { type: { header: labels.type, key: "type", width: 14 }, date: { header: labels.date, key: "date", width: 14 }, eznNum: { header: labels.eznNum, key: "eznNum", width: 16 }, itemCode: { header: labels.itemCode, key: "itemCode", width: 16 }, name: { header: labels.name, key: "name", width: 28 }, quantity: { header: labels.quantity, key: "quantity", width: 14 }, additionPurpose: { header: labels.additionPurpose, key: "additionPurpose", width: 28 }, disbursementPurpose: { header: labels.disbursementPurpose, key: "disbursementPurpose", width: 28 }, returnPurpose: { header: labels.returnPurpose, key: "returnPurpose", width: 28 }, detail: { header: labels.detail, key: "detail", width: 24 }, unitPrice: { header: labels.unitPrice, key: "unitPrice", width: 14 }, totalValue: { header: labels.totalValue, key: "totalValue", width: 18 }, image: { header: labels.image, key: "image", width: 15 }, documentImage: { header: labels.documentImage, key: "documentImage", width: 15 } };
  sheet.columns = keys.map(key => defs[key]);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D4F62" } };
  for (const row of rows) {
    const excelRow = sheet.addRow(Object.fromEntries(keys.map(key => [key, key === "totalValue" ? row.totalValue : key === "image" ? (row.imageUrl ? "مضمنة" : "—") : key === "documentImage" ? (row.documentImageUrl ? "مضمنة" : "—") : key === "detail" ? movementDetail(row) : key === "additionPurpose" ? (row.additionPurpose || "—") : key === "disbursementPurpose" ? (formatDisbursementPurpose(row.disbursementPurpose) || "—") : key === "returnPurpose" ? (row.returnPurpose || "—") : row[key as keyof MovementExportItem]])));
    for (const imageKey of ["image", "documentImage"] as const) { const url = imageKey === "image" ? row.imageUrl : row.documentImageUrl; if (keys.includes(imageKey) && url) { const asset = await fetchImageAsset(url); if (asset) { const imageId = workbook.addImage({ buffer: asset.buffer, extension: asset.extension }); sheet.addImage(imageId, { tl: { col: keys.indexOf(imageKey), row: excelRow.number - 1 }, ext: { width: 58, height: 58 } }); excelRow.height = 48; } } }
  }
  return workbook;
}

export async function buildExcelFileBlob(rows: InventoryExportItem[] | MovementExportItem[], reportType: "inventory" | "movements" | "returns", options: { columns?: ExportColumnKey[]; includeDetail?: boolean } = {}) { const workbook = reportType === "inventory" ? await buildInventoryExcel(rows as InventoryExportItem[], options) : await buildMovementExcel(rows as MovementExportItem[], options); const output = await workbook.xlsx.writeBuffer(); return new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }); }
export async function downloadMovementExcel(rows: MovementExportItem[], options: { columns?: ExportColumnKey[] } = {}) { const blob = await buildExcelFileBlob(rows, "movements", options); downloadBlobFile(blob, "smart-inventory-disbursements-returns.xlsx"); }

export function getMovementPdfColumnWidth(key: ExportColumnKey) { return key === "additionPurpose" || key === "disbursementPurpose" || key === "returnPurpose" ? 84 : key === "detail" ? 92 : key === "name" ? 156 : key === "date" ? 72 : key === "eznNum" ? 54 : key === "itemCode" ? 58 : key === "type" ? 52 : key === "quantity" ? 52 : key === "unitPrice" || key === "totalValue" ? 58 : key === "documentImage" ? 54 : 56; }

export function getMovementPdfCellValue(row: MovementExportItem | null | undefined, key: ExportColumnKey): string {
  if (!row) return "—";
  if (key === "detail") return movementDetail(row);
  if (key === "additionPurpose") return row.additionPurpose || "—";
  if (key === "disbursementPurpose") return formatDisbursementPurpose(row.disbursementPurpose) || "—";
  if (key === "returnPurpose") return row.returnPurpose || "—";
  if (key === "date") return formatPdfMovementDate(row.date);
  if (key === "documentImage") return "مضمنة";
  return String(row[key as keyof MovementExportItem] ?? "—");
}

export async function buildMovementPdf(rows: MovementExportItem[], options: { columns?: ExportColumnKey[]; includeDetail?: boolean; itemSummary?: AccountItemSummary[]; logo?: string | null; date?: Date; title?: string; summary?: string | string[]; summaryCards?: AccountStatementPdfCard[]; headerDateFirst?: boolean; accountLayout?: boolean; recordCount?: number; watermarkOpacity?: number; watermarkScale?: number; watermarkPosition?: "center" | "top" | "bottom"; watermarkRepeat?: boolean; watermarkEnabled?: boolean; monochrome?: boolean; includeHeaderLogo?: boolean } = {}) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const columnSource = options.includeDetail === false ? movementPdfExportColumnsWithoutDetail : movementPdfExportColumns;
  const keys = selected(columnSource, options.columns);
  const visualKeys = [...keys].reverse();
  const safeRows = (Array.isArray(rows) ? rows : []).filter((row): row is MovementExportItem => Boolean(row && typeof row === "object"));
  const includeDocumentImages = keys.includes("documentImage");
  const enriched = await Promise.all(safeRows.map(async row => ({ ...row, documentImageDataUrl: includeDocumentImages ? (await fetchImageAsset(row.documentImageUrl))?.dataUrl : undefined })));
  const doc = await configureArabicPdf(new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" }));
  const resolvedLogo = await resolveLogo(options.logo);
  const watermarkLogo = options.watermarkEnabled === false ? null : resolvedLogo;
  drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat);
  let detailsStartY: number;
  if (options.accountLayout) {
    detailsStartY = drawAccountStatementHeader(doc, options.includeHeaderLogo === false ? null : resolvedLogo, options.date ?? new Date(), options.summary, options.recordCount ?? safeRows.length, options.summaryCards) + 14;
  } else {
    logoAndDate(doc, options.title ?? "تقرير حركات المخزون - Smart Inventory", resolvedLogo, options.date, options.summary, options.headerDateFirst);
    detailsStartY = getReportHeaderHeight(options.summary);
  }
  if (options.itemSummary?.length) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const accountSummary = Boolean(options.accountLayout);
    const hasCurrentStock = accountSummary && options.itemSummary.some(item => item.currentStock !== undefined);
    const hasUnit = accountSummary && options.itemSummary.some(item => item.unit);
    const summaryColumnCount = 2 + (hasUnit ? 1 : 0) + (hasCurrentStock ? 1 : 0);
    const quantityColumnWidth = accountSummary ? (hasCurrentStock ? 120 : 150) : 62;
    const unitColumnWidth = hasUnit ? 72 : 0;
    const stockColumnWidth = hasCurrentStock ? 120 : 0;
    const maximumSummaryWidth = accountSummary ? pageWidth - 72 : pageWidth - 72 - 150;
    doc.setFont(getArabicPdfFont(doc), "bold");
    doc.setFontSize(accountSummary ? 8.5 : 8.2);
    const widestItemName = Math.max(...options.itemSummary.map(item => doc.getTextWidth(shapeArabic(doc, item.itemName))));
    const itemNameColumnWidth = accountSummary ? Math.max(maximumSummaryWidth - quantityColumnWidth - unitColumnWidth - stockColumnWidth, 180) : Math.min(maximumSummaryWidth - quantityColumnWidth, Math.max(74, widestItemName + 16));
    const summaryWidth = itemNameColumnWidth + quantityColumnWidth + unitColumnWidth + stockColumnWidth;
    const summaryLeft = accountSummary ? 36 : pageWidth - summaryWidth - 150;
    const summaryFontSize = accountSummary ? 9 : Math.min(8.2, Math.max(5.8, 8.2 * (itemNameColumnWidth - 12) / Math.max(widestItemName, 1)));
    autoTable(doc, {
      startY: detailsStartY,
      head: [[{ content: shapeArabic(doc, accountSummary ? "ملخص الكميات حسب الصنف" : "بيانات مجمعة"), colSpan: summaryColumnCount, styles: { fillColor: [13, 79, 98], textColor: [255, 255, 255], halign: "center", fontStyle: "bold", lineColor: [8, 58, 72], lineWidth: 0.8 } }], ["الصنف", "صافي الكمية", ...(hasUnit ? ["الوحدة"] : []), ...(hasCurrentStock ? ["الرصيد الحالي"] : [])].map(cell => shapeArabic(doc, cell))],
      body: options.itemSummary.map(item => [item.itemName, Number(item.netQuantity).toLocaleString("en-US"), ...(hasUnit ? [item.unit || "—"] : []), ...(hasCurrentStock ? [Number(item.currentStock ?? 0).toLocaleString("en-US")] : [])].map(cell => shapeArabic(doc, cell))),
      theme: "grid",
      tableWidth: summaryWidth,
      columnStyles: { 0: { cellWidth: itemNameColumnWidth }, 1: { cellWidth: quantityColumnWidth, halign: "center" }, ...(hasUnit ? { 2: { cellWidth: unitColumnWidth, halign: "center" } } : {}), ...(hasCurrentStock ? { [hasUnit ? 3 : 2]: { cellWidth: stockColumnWidth, halign: "center" } } : {}) },
      styles: { font: getArabicPdfFont(doc), fontSize: summaryFontSize, cellPadding: accountSummary ? 5 : 3.5, halign: "right", valign: "middle", overflow: "linebreak", textColor: [16, 42, 67], lineColor: [118, 172, 180], lineWidth: 0.6 },
      headStyles: { fillColor: [225, 243, 243], textColor: [13, 79, 98], lineColor: [48, 126, 137], lineWidth: 0.7, font: getArabicPdfFont(doc), fontStyle: "bold", halign: "right" },
      alternateRowStyles: { fillColor: [241, 249, 249] },
      margin: { left: summaryLeft, right: accountSummary ? 36 : 150 },
    });
    detailsStartY = Math.max(detailsStartY, ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? detailsStartY) + 18);
    if (accountSummary) {
      doc.setFont(getArabicPdfFont(doc), "bold");
      doc.setFontSize(11);
      doc.setTextColor(13, 79, 98);
      doc.text(shapeArabic(doc, "تفاصيل حركة الصنف"), pageWidth / 2, detailsStartY, { align: "center", baseline: "middle" });
      detailsStartY += 16;
    }
  }
  const body = enriched.map(row => visualKeys.map(key => {
    if (key === "documentImage") return row.documentImageDataUrl ? "" : "—";
    const value = getMovementPdfCellValue(row, key);
    return key === "date" ? String(value) : shapeArabic(doc, String(value));
  }));
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxTableWidth = pageWidth - 72;
  const cellValue = (row: typeof enriched[number] | undefined, key: ExportColumnKey) => getMovementPdfCellValue(row, key);
  const measuredWidth = (key: ExportColumnKey, value: string) => { const mixed = ["additionPurpose", "disbursementPurpose", "returnPurpose", "detail"].includes(key) ? splitMixedArabicLatinForPdf(value) : null; doc.setFont(getArabicPdfFont(doc), "bold"); doc.setFontSize(8); const arabicWidth = doc.getTextWidth(shapeArabic(doc, mixed?.arabic ?? value)); if (!mixed) return arabicWidth; doc.setFont("helvetica", "bold"); const latinWidth = doc.getTextWidth(mixed.latin); doc.setFont(getArabicPdfFont(doc), "bold"); return arabicWidth + latinWidth + 8; };
  const baseWidths = visualKeys.map(key => { const values = [labels[key], ...enriched.map(row => cellValue(row, key))]; const measured = Math.max(...values.map(value => measuredWidth(key, value))) + 16; const maximum = key === "detail" ? 250 : key === "additionPurpose" || key === "returnPurpose" ? 230 : key === "disbursementPurpose" ? 190 : key === "name" ? 260 : 118; return Math.max(getMovementPdfColumnWidth(key), Math.min(maximum, measured)); });
  const baseTotal = baseWidths.reduce((sum, width) => sum + width, 0);
  const tableWidth = Math.min(maxTableWidth, baseTotal);
  const nameColumnIndex = visualKeys.indexOf("name");
  const reservedNameWidth = nameColumnIndex < 0 ? 0 : Math.min(baseWidths[nameColumnIndex], Math.max(156, Math.min(260, maxTableWidth * 0.42)));
  const otherBaseTotal = baseTotal - (nameColumnIndex < 0 ? 0 : baseWidths[nameColumnIndex]);
  const otherAvailableWidth = Math.max(0, maxTableWidth - reservedNameWidth);
  const widthScale = baseTotal > maxTableWidth ? Math.min(1, otherAvailableWidth / Math.max(1, otherBaseTotal)) : 1;
  const columnWidths: Partial<Record<number, number>> = {};
  visualKeys.forEach((key, index) => { columnWidths[index] = Number(((index === nameColumnIndex && baseTotal > maxTableWidth ? reservedNameWidth : baseWidths[index] * widthScale)).toFixed(2)); });
  autoTable(doc, { startY: detailsStartY, head: [visualKeys.map(key => shapeArabic(doc, labels[key]))], body,
    tableWidth, margin: { left: Math.max(36, pageWidth - tableWidth - 36), right: 36 },
    columnStyles: Object.fromEntries(Object.entries(columnWidths).map(([index, width]) => [index, { cellWidth: width }])),
    styles: { font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 8.6, textColor: [16, 42, 67], cellPadding: 4.5, halign: options.accountLayout ? "center" : "right", valign: "middle", overflow: "linebreak", lineColor: options.monochrome ? [90, 90, 90] : [197, 216, 222], lineWidth: options.monochrome ? 0.55 : 0.45, minCellHeight: visualKeys.includes("documentImage") ? 48 : 25 },
    alternateRowStyles: { fillColor: options.monochrome ? [255, 255, 255] : [246, 250, 251] },
    headStyles: { fillColor: options.monochrome ? [255, 255, 255] : [13, 79, 98], textColor: options.monochrome ? [0, 0, 0] : [255, 255, 255], lineColor: options.monochrome ? [0, 0, 0] : [13, 79, 98], lineWidth: options.monochrome ? 0.6 : 0.55, font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 8, halign: "center", valign: "middle", overflow: "linebreak" },
    didParseCell: data => { const column = String(visualKeys[data.column.index]); if (data.section === "body") { data.cell.styles.textColor = [0, 0, 0]; if (options.accountLayout) data.cell.styles.halign = column === "name" ? "right" : "center"; } if (data.section === "body" && ["quantity", "openingStock", "addition", "returned", "disbursement", "runningStock"].includes(column)) { data.cell.styles.fontStyle = "bold"; data.cell.styles.fontSize = 9; } if (data.section === "body" && ["additionPurpose", "disbursementPurpose", "returnPurpose", "detail"].includes(column)) { data.cell.styles.fontSize = 8.1; data.cell.styles.cellPadding = 3.5; data.cell.styles.overflow = "linebreak"; } const mixedValue = data.section === "body" && ["additionPurpose", "disbursementPurpose", "returnPurpose", "detail"].includes(column) ? cellValue(enriched[data.row.index], column as ExportColumnKey) : null; if (data.section === "body" && mixedValue && splitMixedArabicLatinForPdf(mixedValue)) data.cell.text = []; if (data.section === "body" && column === "date") { const fullDate = formatPdfMovementDate(enriched[data.row.index]?.date).replaceAll(" / ", "-"); data.cell.text = [fullDate]; data.cell.styles.halign = "center"; data.cell.styles.font = "helvetica"; data.cell.styles.fontStyle = "bold"; data.cell.styles.fontSize = 9; data.cell.styles.cellWidth = columnWidths[data.column.index] ?? 72; } },
    willDrawPage: data => { if (data.pageNumber > 1) drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat); },
    bodyStyles: { minCellHeight: visualKeys.includes("documentImage") ? 48 : 24 },
    rowPageBreak: "auto",
    didDrawCell: data => { const column = visualKeys[data.column.index]; const rawValue = data.section === "body" && ["additionPurpose", "disbursementPurpose", "returnPurpose", "detail"].includes(column) ? cellValue(enriched[data.row.index], column) : null; const mixed = splitMixedArabicLatinForPdf(rawValue); if (data.section === "body" && mixed) { const y = data.cell.y + data.cell.height / 2 + 3; doc.setTextColor(0, 0, 0); doc.setFont(getArabicPdfFont(doc), "bold"); doc.setFontSize(8.1); doc.text(shapeArabic(doc, mixed.arabic), data.cell.x + data.cell.width - 4, y, { align: "right" }); const arabicWidth = doc.getTextWidth(shapeArabic(doc, mixed.arabic)); doc.setFont("helvetica", "bold"); doc.setFontSize(8.8); doc.text(mixed.latin, data.cell.x + data.cell.width - arabicWidth - 9, y, { align: "right" }); doc.setFont(getArabicPdfFont(doc), "bold"); } if (data.section === "body" && column === "documentImage") { const image = enriched[data.row.index]?.documentImageDataUrl; if (image) { try { doc.addImage(image, getPdfImageFormat(image), data.cell.x + 3, data.cell.y + 3, Math.min(40, data.cell.width - 6), Math.min(40, data.cell.height - 6)); } catch { /* Ignore one invalid image; keep the PDF usable. */ } } } }
  });
  return doc;
}

export async function downloadMovementPdf(rows: MovementExportItem[], options: { columns?: ExportColumnKey[]; logo?: string | null; date?: Date; title?: string; summary?: string | string[]; watermarkEnabled?: boolean; watermarkOpacity?: number; watermarkScale?: number; watermarkPosition?: "center" | "top" | "bottom"; watermarkRepeat?: boolean } = {}) { const doc = await buildMovementPdf(rows, options); savePdfFile(doc, "smart-inventory-disbursements-returns.pdf"); }

const varianceLabels = { code: "كود الصنف", name: "اسم الصنف", initialStock: "الرصيد الأولي", additions: "الإضافات", disbursements: "الصرف", returns: "المرتجعات", net: "الصافي", recordedStock: "الرصيد المسجل", expectedStock: "الرصيد المتوقع", variance: "الفرق", status: "الحالة" } as const;

export async function buildStockVarianceExcel(rows: StockVarianceRow[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("فروق المخزون", { views: [{ rightToLeft: true }] });
  const keys = Object.keys(varianceLabels) as (keyof typeof varianceLabels)[];
  sheet.columns = keys.map(key => ({ header: varianceLabels[key], key, width: key === "name" ? 28 : key === "status" ? 16 : 16 }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D4F62" } };
  rows.forEach(row => sheet.addRow(Object.fromEntries(keys.map(key => [key, typeof row[key] === "number" ? Number(Number(row[key]).toFixed(3)) : row[key]]))));
  return workbook;
}

export async function downloadStockVarianceExcel(rows: StockVarianceRow[]) {
  const workbook = await buildStockVarianceExcel(rows);
  const output = await workbook.xlsx.writeBuffer();
  downloadBlobFile(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "smart-inventory-stock-variance.xlsx");
}

export async function buildStockVariancePdf(rows: StockVarianceRow[], options: { logo?: string | null; date?: Date; title?: string; watermarkOpacity?: number; watermarkScale?: number; watermarkPosition?: "center" | "top" | "bottom"; watermarkRepeat?: boolean; watermarkEnabled?: boolean } = {}) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = await configureArabicPdf(new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" }));
  const resolvedLogo = await resolveLogo(options.logo);
  const watermarkLogo = options.watermarkEnabled === false ? null : resolvedLogo;
  drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat);
  logoAndDate(doc, options.title ?? "تقرير فروق المخزون - Smart Inventory", resolvedLogo, options.date);
  const keys = Object.keys(varianceLabels) as (keyof typeof varianceLabels)[];
  autoTable(doc, { startY: 80, head: [keys.map(key => shapeArabic(doc, varianceLabels[key]))], body: rows.map(row => keys.map(key => shapeArabic(doc, String(typeof row[key] === "number" ? Number(Number(row[key]).toFixed(3)) : row[key] ?? "—")))), columnStyles: { [keys.indexOf("name")]: { cellWidth: 176, halign: "right" as const, overflow: "linebreak" as const } }, styles: { font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 8.5, textColor: [16, 42, 67], cellPadding: 6, halign: "right", overflow: "linebreak", lineColor: [197, 216, 222], lineWidth: 0.45 }, headStyles: { fillColor: [13, 79, 98], textColor: [255, 255, 255], lineColor: [13, 79, 98], lineWidth: 0.7, font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 9, halign: "center" }, alternateRowStyles: { fillColor: [246, 250, 251] }, didParseCell: data => { if (data.section === "body" && ["initialStock", "additions", "disbursements", "returns", "net", "recordedStock", "expectedStock", "variance"].includes(String(keys[data.column.index]))) { data.cell.styles.fontStyle = "bold"; data.cell.styles.fontSize = 9; data.cell.styles.textColor = [16, 42, 67]; } }, willDrawPage: data => { if (data.pageNumber > 1) drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat); } });
  return doc;
}

export async function downloadStockVariancePdf(rows: StockVarianceRow[], options: { logo?: string | null; date?: Date; title?: string; watermarkOpacity?: number; watermarkScale?: number; watermarkPosition?: "center" | "top" | "bottom"; watermarkRepeat?: boolean; watermarkEnabled?: boolean } = {}) {
  const doc = await buildStockVariancePdf(rows, options);
  savePdfFile(doc, "smart-inventory-stock-variance.pdf");
}

export async function buildAccountStatementExcel(rows: MovementExportItem[], options: { columns?: ExportColumnKey[] } = {}) {
  const workbook = await buildMovementExcel(rows, { ...options, includeDetail: false, columns: options.columns?.filter(column => column !== "detail") });
  workbook.worksheets[0].name = "كشف الحساب";
  return workbook;
}

export async function downloadAccountStatementExcel(rows: MovementExportItem[], options: { columns?: ExportColumnKey[]; fileName?: string } = {}) {
  const workbook = await buildAccountStatementExcel(rows, options);
  const output = await workbook.xlsx.writeBuffer();
  downloadBlobFile(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), options.fileName ?? "smart-inventory-account-statement.xlsx");
}

export async function buildAccountStatementPdf(rows: MovementExportItem[], options: { columns?: ExportColumnKey[]; itemSummary?: AccountItemSummary[]; logo?: string | null; date?: Date; title?: string; summary?: string | string[]; summaryCards?: AccountStatementPdfCard[]; watermarkOpacity?: number; watermarkScale?: number; watermarkPosition?: "center" | "top" | "bottom"; watermarkRepeat?: boolean; watermarkEnabled?: boolean; includeHeaderLogo?: boolean; fileName?: string } = {}) {
  return buildMovementPdf(rows, { ...options, includeDetail: false, columns: options.columns?.filter(column => column !== "detail"), title: "كشف الحساب", summary: options.summary, summaryCards: options.summaryCards, monochrome: false, accountLayout: true, recordCount: rows.length, headerDateFirst: true });
}
export async function downloadAccountStatementPdf(rows: MovementExportItem[], options: { columns?: ExportColumnKey[]; itemSummary?: AccountItemSummary[]; logo?: string | null; date?: Date; title?: string; summary?: string | string[]; summaryCards?: AccountStatementPdfCard[]; watermarkOpacity?: number; watermarkScale?: number; watermarkPosition?: "center" | "top" | "bottom"; watermarkRepeat?: boolean; watermarkEnabled?: boolean; includeHeaderLogo?: boolean; fileName?: string } = {}) {
  const doc = await buildAccountStatementPdf(rows, options);
  savePdfFile(doc, options.fileName ?? "smart-inventory-account-statement.pdf");
}

export type ItemCardPdfData = {
  item: InventoryExportItem & { id: number; initialStock?: number | string | null; imageUrl?: string | null; category?: string | null; unit?: string | null; currentStock?: number | string | null };
  additions: Array<Record<string, any>>;
  disbursements: Array<Record<string, any>>;
  returns: Array<Record<string, any>>;
};

export type ItemCardMovementKind = "إضافة" | "مرتجع" | "صرف" | "تحويل";

export function formatItemCardPdfDate(value: unknown) { return formatInventoryDate(value).replace(/\s\/\s/g, "-").replace(/\//g, "-"); }

export type ItemCardMovementPdfRow = {
  date: string;
  detail: string;
  purpose: string;
  movement: ItemCardMovementKind;
  openingStock: number | null;
  addition: number;
  returned: number;
  disbursement: number;
  runningStock: number | null;
  unitPrice: number;
  totalValue: number;
  permitNumber: string;
  rawDate?: unknown;
  stockNeutral?: boolean;
};

export function formatItemCardMovementDetail(movement: ItemCardMovementKind, row: Record<string, any>) {
  if (movement === "إضافة") return `توريد من: ${row.supplier || row.supplierName || row.store || "—"}`;
  if (movement === "صرف") {
    const building = String(row.buildingName || row.building || row.buildingCode || "").trim().replace(/^مبنى\s*/, "");
    const destination = String(row.destination || row.customer || row.store || "").trim();
    const customer = String(row.customer || "").trim();
    const client = customer || (destination && destination !== building ? destination : "—");
    // عزل الأكواد اللاتينية يمنع خوارزمية RTL من نقل B2-L2-L4 إلى بداية البيان.
    const buildingText = building ? ` — المبنى: \u200E${building}\u200E` : "";
    return `صرف إلى: ${client}${buildingText}`;
  }
  if (movement === "مرتجع") {
    const from = row.fromStore || row.sourceStore || row.supplier || row.fromCustomer || row.customer;
    const to = row.toStore || row.destination || row.toCustomer || row.store;
    const description = from && to ? `مرتجع من: ${from} إلى: ${to}` : from ? `مرتجع من: ${from}` : to ? `مرتجع إلى: ${to}` : "مرتجع";
    return description;
  }
  const from = row.fromStore || row.sourceStore || row.fromCustomer || row.supplier || "—";
  const to = row.toStore || row.destination || row.toCustomer || row.customer || "—";
  return `تحويل من: ${from} إلى: ${to}`;
}

export function buildItemCardMovementRows(card: ItemCardPdfData): ItemCardMovementPdfRow[] {
  const initialStock = Number(card.item.initialStock ?? 0);
  const movements = [
    ...card.additions.map(row => ({ movement: "إضافة" as const, date: row.date, eznNum: row.eznNum, quantity: Number(row.quantity ?? 0), unitPrice: Number(row.unitPrice ?? card.item.unitPrice ?? 0), detail: formatItemCardMovementDetail("إضافة", row), purpose: row.purpose || "" })),
    ...card.returns.map(row => { const customerToCustomer = String(row.transferType ?? "").toLowerCase() === "customer_transfer" || String(row.transferType ?? "").includes("عميل إلى عميل"); const movement: ItemCardMovementKind = customerToCustomer || String(row.transferType ?? "").includes("تحويل") ? "تحويل" : "مرتجع"; return { movement, stockNeutral: customerToCustomer, date: row.date, eznNum: row.eznNum, quantity: Number(row.quantity ?? 0), unitPrice: Number(row.unitPrice ?? card.item.unitPrice ?? 0), detail: formatItemCardMovementDetail(movement, row), purpose: row.notes || row.disburseType || "" }; }),
    ...card.disbursements.map(row => ({ movement: "صرف" as const, date: row.date, eznNum: row.eznNum, quantity: Number(row.quantity ?? 0), unitPrice: Number(row.unitPrice ?? card.item.unitPrice ?? 0), detail: formatItemCardMovementDetail("صرف", row), purpose: row.disburseType || "" })),
  ].sort((a, b) => inventoryDateKey(a.date ?? "").localeCompare(inventoryDateKey(b.date ?? "")));
  let runningStock = initialStock;
  return movements.map((row, index) => {
    const addition = row.movement === "إضافة" ? row.quantity : 0;
    const returned = (row as any).stockNeutral ? 0 : row.movement === "مرتجع" || row.movement === "تحويل" ? row.quantity : 0;
    // يحافظ كارت الصنف على الإشارة المدخلة: الصرف الموجب يخصم، والصرف السالب يعكس الخصم.
    const disbursement = row.movement === "صرف" ? row.quantity : 0;
    runningStock = Number((runningStock + addition + returned - disbursement).toFixed(3));
    return { date: formatItemCardPdfDate(row.date ?? ""), rawDate: row.date, detail: String(row.detail ?? "—"), purpose: String(row.purpose ?? ""), movement: row.movement, openingStock: index === 0 ? initialStock : null, addition, returned, disbursement, runningStock, unitPrice: row.unitPrice, totalValue: Number((Math.abs(row.quantity) * row.unitPrice).toFixed(2)), permitNumber: String(row.eznNum ?? "—") };
  });
}

export async function buildItemCardPdf(card: ItemCardPdfData, options: { logo?: string | null; date?: Date; watermarkOpacity?: number; watermarkScale?: number; watermarkPosition?: "center" | "top" | "bottom"; watermarkRepeat?: boolean; watermarkEnabled?: boolean; movementFilter?: "all" | "إضافة" | "صرف" | "مرتجع" | "تحويل"; includePermitColumn?: boolean; includeUnitPrice?: boolean; includeTotalValue?: boolean } = {}) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = await configureArabicPdf(new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" }));
  const itemImageAsset = await fetchImageAsset(card.item.imageUrl);
  const resolvedLogo = await resolveLogo(options.logo);
  const watermarkLogo = options.watermarkEnabled === false ? null : resolvedLogo;
  drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat);
  logoAndDate(doc, `كارت صنف تفصيلي - ${card.item.name}`, resolvedLogo, options.date);
  if (itemImageAsset) doc.addImage(itemImageAsset.dataUrl, itemImageAsset.extension === "png" ? "PNG" : "JPEG", 650, 82, 105, 105);
  autoTable(doc, { startY: 82, margin: { left: 42, right: 205 }, head: [[shapeArabic(doc, "البيان"), shapeArabic(doc, "القيمة")]], body: [[shapeArabic(doc, "اسم الصنف"), shapeArabic(doc, String(card.item.name ?? "—"))], [shapeArabic(doc, "الكود"), String(card.item.code ?? "—")], [shapeArabic(doc, "التصنيف"), shapeArabic(doc, String(card.item.category ?? "—"))], [shapeArabic(doc, "الوحدة"), shapeArabic(doc, String(card.item.unit ?? "—"))], [shapeArabic(doc, "الرصيد الأولي"), String(card.item.initialStock ?? "0")], [shapeArabic(doc, "الرصيد الحالي"), String(card.item.currentStock ?? "0")], [shapeArabic(doc, "سعر الوحدة"), String(card.item.unitPrice ?? "0")]], columnStyles: { 1: { cellWidth: 260, overflow: "linebreak" } }, styles: { font: getArabicPdfFont(doc), fontSize: 10, halign: "right", cellPadding: 5, overflow: "linebreak" , lineColor: [137, 162, 172], lineWidth: 0.55}, headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.6, font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 9, halign: "center" }, willDrawPage: data => { if (data.pageNumber > 1) drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat); } });
  const allRows = buildItemCardMovementRows(card);
  const rows = options.movementFilter && options.movementFilter !== "all" ? allRows.filter(row => row.movement === options.movementFilter) : allRows;
  const columns = ["date", "detail", "purpose", ...(options.includePermitColumn ? ["permitNumber"] : []), "movement", "openingStock", "addition", "returned", "disbursement", "runningStock", ...(options.includeUnitPrice !== false ? ["unitPrice"] : []), ...(options.includeTotalValue !== false ? ["totalValue"] : [])] as const;
  const totals = { addition: rows.reduce((sum, row) => sum + row.addition, 0), returned: rows.reduce((sum, row) => sum + row.returned, 0), disbursement: rows.reduce((sum, row) => sum + row.disbursement, 0), totalValue: rows.reduce((sum, row) => sum + row.totalValue, 0) };
  const finalStock = Number(card.item.currentStock ?? rows.at(-1)?.runningStock ?? card.item.initialStock ?? 0); const totalRow = { date: "", rawDate: "", detail: "الإجمالي", movement: "", openingStock: null, addition: Number(totals.addition.toFixed(3)), returned: Number(totals.returned.toFixed(3)), disbursement: Number(totals.disbursement.toFixed(3)), runningStock: Number(finalStock.toFixed(3)), unitPrice: 0, totalValue: Number(totals.totalValue.toFixed(2)), permitNumber: "" } as unknown as ItemCardMovementPdfRow;
  const columnLabels: Record<typeof columns[number], string> = { date: "التاريخ", detail: "البيان", purpose: "اللُّزوم", permitNumber: "رقم الإذن", movement: "الحركة", openingStock: "الرصيد الأول", addition: "الإضافة", returned: "المرتجع", disbursement: "الصرف", runningStock: "الرصيد الإجمالي", unitPrice: "السعر", totalValue: "إجمالي السعر" };
  const visualColumns = [...columns].reverse();
  const values: Record<typeof columns[number], (row: ItemCardMovementPdfRow) => string> = { date: row => row.date, detail: row => row.detail, purpose: row => row.purpose || "—", permitNumber: row => row.permitNumber, movement: row => row.movement, openingStock: row => row.openingStock === null ? "—" : row.openingStock.toFixed(3), addition: row => row.addition ? row.addition.toFixed(3) : "—", returned: row => row.returned ? row.returned.toFixed(3) : "—", disbursement: row => row.disbursement ? row.disbursement.toFixed(3) : "—", runningStock: row => row.runningStock === null ? "—" : row.runningStock.toFixed(3), unitPrice: row => row.unitPrice ? row.unitPrice.toFixed(2) : "—", totalValue: row => row.totalValue ? row.totalValue.toFixed(2) : "—" };
  const startY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 48 : 274;
  const movementColors: Record<ItemCardMovementKind, [number, number, number]> = { "إضافة": [255, 255, 255], "صرف": [255, 255, 255], "مرتجع": [255, 255, 255], "تحويل": [255, 255, 255] };
  const legend = [{ label: "وارد", kind: "إضافة" as const }, { label: "صادر", kind: "صرف" as const }, { label: "مرتجع", kind: "مرتجع" as const }, { label: "تحويل", kind: "تحويل" as const }];
  legend.forEach((entry, index) => { const x = 748 - index * 120; doc.setFillColor(...movementColors[entry.kind]); doc.roundedRect(x - 72, startY - 25, 12, 12, 2, 2, "F"); doc.setFontSize(8); doc.text(shapeArabic(doc, entry.label), x - 54, startY - 15, { align: "right" }); });
  const dateColumnIndex = visualColumns.indexOf("date");
  const detailColumnIndex = visualColumns.indexOf("detail");
  const quantityColumnIndices = visualColumns.map((key, index) => [key, index] as const).filter(([key]) => ["openingStock", "addition", "returned", "disbursement", "runningStock"].includes(key)).map(([, index]) => index);
  const rawColumnWidths: Record<typeof columns[number], number> = { date: 100, detail: 180, purpose: 130, permitNumber: 60, movement: 55, openingStock: 55, addition: 55, returned: 55, disbursement: 55, runningStock: 75, unitPrice: 50, totalValue: 65 };
  const contentWidth = doc.internal.pageSize.getWidth() - 48;
  const rawTableWidth = visualColumns.reduce((sum, key) => sum + rawColumnWidths[key], 0);
  const widthScale = contentWidth / rawTableWidth;
  const columnWidths: Record<typeof columns[number], number> = Object.fromEntries(visualColumns.map(key => [key, rawColumnWidths[key] * widthScale])) as Record<typeof columns[number], number>;
  const tableRows = [...rows, totalRow];
  autoTable(doc, { startY, margin: { left: 24, right: 24 }, tableWidth: contentWidth, head: [visualColumns.map(key => shapeArabic(doc, columnLabels[key]))], body: tableRows.map(row => visualColumns.map(key => key === "date" ? values[key](row) : shapeArabic(doc, values[key](row)))), styles: { font: getArabicPdfFont(doc), fontSize: 7.6, cellPadding: 3.5, halign: "right", minCellHeight: 21, overflow: "visible" , lineColor: [137, 162, 172], lineWidth: 0.55}, columnStyles: Object.fromEntries(visualColumns.map((key, index) => [index, { cellWidth: columnWidths[key], minCellWidth: columnWidths[key], halign: key === "date" ? "center" : "right", overflow: key === "detail" ? "linebreak" : "visible", ...(key === "date" ? { fontSize: 7, cellPadding: { left: 1, right: 1, top: 5, bottom: 5 } } : {}) }])), headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.6, font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 8.5, halign: "center" }, didDrawCell: data => { if (data.section === "body" && data.column.index === dateColumnIndex && data.row.index < rows.length) { const movementRow = tableRows[data.row.index]; if (!movementRow) return; doc.setFont("helvetica", "bold"); doc.setFontSize(8); const fullDate = formatItemCardPdfDate(movementRow.rawDate ?? movementRow.date).replaceAll(" / ", "-").replaceAll("/", "-"); doc.text(fullDate || "—", data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 2, { align: "center", baseline: "middle" }); } }, didParseCell: data => { if (data.section === "body") { data.cell.styles.fillColor = data.row.index === tableRows.length - 1 ? [240, 240, 240] : movementColors[tableRows[data.row.index]?.movement] ?? [255, 255, 255]; if (data.row.index === tableRows.length - 1) data.cell.styles.fontStyle = "bold"; if (quantityColumnIndices.includes(data.column.index)) { data.cell.styles.fontStyle = "bold"; data.cell.styles.fontSize = 8.5; data.cell.styles.textColor = [0, 0, 0]; } if (data.column.index === dateColumnIndex && data.row.index < rows.length) data.cell.text = []; } }, willDrawPage: data => { if (data.pageNumber > 1) drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat); } });
  return doc;
}

export async function downloadItemCardPdf(card: ItemCardPdfData, options: { logo?: string | null; date?: Date; fileName?: string } = {}) { const doc = await buildItemCardPdf(card, options); savePdfFile(doc, options.fileName ?? `smart-inventory-item-card-${card.item.code}.pdf`); }

export async function buildMainWarehousePdf(cards: ItemCardPdfData[], options: { logo?: string | null; date?: Date; warehouseName?: string; watermarkOpacity?: number; watermarkScale?: number; watermarkPosition?: "center" | "top" | "bottom"; watermarkRepeat?: boolean; watermarkEnabled?: boolean } = {}) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = await configureArabicPdf(new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" }));
  const logo = await resolveLogo(options.logo);
  const watermarkLogo = options.watermarkEnabled === false ? null : logo;
  const safeCards = (Array.isArray(cards) ? cards : []).filter(card => card?.item && String(card.item.name ?? card.item.code ?? "").trim());
  const enriched = await Promise.all(safeCards.map(async card => {
    const additions = card.additions.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
    const returns = card.returns.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
    const disbursements = card.disbursements.reduce((sum, row) => sum + Math.abs(Number(row.quantity ?? 0)), 0);
    const current = Number(card.item.currentStock ?? 0);
    const asset = await fetchImageAsset(card.item.imageUrl);
    return { card, additions, returns, disbursements, current, image: asset?.dataUrl ? await cropPdfImageToSquare(asset.dataUrl) : null };
  }));
  const summary = [
    `${options.warehouseName ?? "المخزن الرئيسي"}: ${enriched.length.toLocaleString("en-US")} صنف`,
    `إجمالي الرصيد: ${enriched.reduce((sum, row) => sum + row.current, 0).toLocaleString("en-US", { maximumFractionDigits: 3 })}`,
  ];
  drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat);
  logoAndDate(doc, `جرد ${options.warehouseName ?? "المخزن الرئيسي"} — الأصناف والصور`, logo, options.date, summary);
  const headers = ["الصورة", "الكود", "اسم الصنف", "التصنيف", "الوحدة", "الرصيد الحالي", "الإضافات", "المرتجعات", "المنصرف"];
  const body = enriched.map(row => [row.image ? "" : "صورة", String(row.card.item.code ?? "—"), shapeArabic(doc, String(row.card.item.name ?? "—")), shapeArabic(doc, String(row.card.item.category ?? "بدون تصنيف")), shapeArabic(doc, String(row.card.item.unit ?? "—")), row.current.toFixed(3), row.additions.toFixed(3), row.returns.toFixed(3), row.disbursements.toFixed(3)]);
  const pageWidth = doc.internal.pageSize.getWidth();
  autoTable(doc, {
    startY: getReportHeaderHeight(summary),
    margin: { left: 24, right: 24 },
    tableWidth: pageWidth - 48,
    head: [headers.map(header => shapeArabic(doc, header))],
    body,
    columnStyles: { 0: { cellWidth: 42, halign: "center" }, 1: { cellWidth: 66, halign: "center" }, 2: { cellWidth: 178, halign: "right", overflow: "linebreak" }, 3: { cellWidth: 92, halign: "right", overflow: "linebreak" }, 4: { cellWidth: 48, halign: "center" }, 5: { cellWidth: 76, halign: "center" }, 6: { cellWidth: 70, halign: "center" }, 7: { cellWidth: 70, halign: "center" }, 8: { cellWidth: 76, halign: "center" } },
    styles: { font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 7.8, cellPadding: 3.5, minCellHeight: 32, halign: "right", valign: "middle", overflow: "linebreak", lineColor: [137, 162, 172], lineWidth: 0.45 },
    headStyles: { fillColor: [13, 79, 98], textColor: [255, 255, 255], font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 8, halign: "center", cellPadding: 4 },
    alternateRowStyles: { fillColor: [246, 250, 251] },
    didParseCell: data => { if (data.section === "body" && data.column.index === 0) { data.cell.styles.minCellHeight = 32; data.cell.styles.cellPadding = 2; } },
    willDrawPage: data => { if (data.pageNumber > 1) drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat); },
    didDrawCell: data => {
      if (data.section !== "body" || data.column.index !== 0) return;
      const image = enriched[data.row.index]?.image;
      const size = Math.min(25, Math.max(18, data.cell.height - 6), Math.max(18, data.cell.width - 6));
      const x = data.cell.x + (data.cell.width - size) / 2; const y = data.cell.y + (data.cell.height - size) / 2;
      if (image) { try { doc.addImage(image, "JPEG", x, y, size, size); return; } catch { /* draw placeholder below */ } }
      doc.setFillColor(232, 241, 242); doc.roundedRect(x, y, size, size, 3, 3, "F"); doc.setTextColor(13, 79, 98); doc.setFont(getArabicPdfFont(doc), "bold"); doc.setFontSize(6.5); doc.text(shapeArabic(doc, "صورة"), x + size / 2, y + size / 2 + 2, { align: "center" });
    },
  });
  return doc;
}
export type CompanyInventoryAuditPdfData = { warehouses: Array<{ id: number; slot: number; name: string }>; rows: Array<{ id: number; code: string; name: string; unit: string | null; totalCurrentStock: number; warehouseBalances: Array<{ warehouseId: number; slot: number; name: string; currentStock: number }> }>; summary: { totalItems: number; totalCompanyBalance: number } };
export async function buildCompanyInventoryAuditPdf(report: CompanyInventoryAuditPdfData, options: { logo?: string | null; date?: Date; columns?: string[]; watermarkOpacity?: number; watermarkScale?: number; watermarkPosition?: "center" | "top" | "bottom"; watermarkRepeat?: boolean; watermarkEnabled?: boolean } = {}) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = await configureArabicPdf(new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" }));
  const logo = await resolveLogo(options.logo);
  const watermarkLogo = options.watermarkEnabled === false ? null : logo;
  const visualWarehouses = [...report.warehouses].sort((left, right) => right.slot - left.slot);
  const totalLabel = visualWarehouses.length === 1 ? "إجمالي المخزن" : "إجمالي الشركة";
  const selectedColumns = new Set(options.columns?.length ? options.columns : ["code", "name", "unit", "warehouses", "total"]);
  const columns = [
    ...(selectedColumns.has("total") ? [{ key: "total", header: totalLabel, value: (row: CompanyInventoryAuditPdfData["rows"][number]) => row.totalCurrentStock }] : []),
    ...(selectedColumns.has("warehouses") ? visualWarehouses.map(warehouse => ({ key: `warehouse-${warehouse.id}`, header: warehouse.name, value: (row: CompanyInventoryAuditPdfData["rows"][number]) => row.warehouseBalances.find(balance => balance.warehouseId === warehouse.id)?.currentStock ?? 0 })) : []),
    ...(selectedColumns.has("unit") ? [{ key: "unit", header: "الوحدة", value: (row: CompanyInventoryAuditPdfData["rows"][number]) => shapeArabic(doc, row.unit || "—") }] : []),
    ...(selectedColumns.has("name") ? [{ key: "name", header: "اسم الصنف", value: (row: CompanyInventoryAuditPdfData["rows"][number]) => shapeArabic(doc, row.name) }] : []),
    ...(selectedColumns.has("code") ? [{ key: "code", header: "الكود", value: (row: CompanyInventoryAuditPdfData["rows"][number]) => row.code }] : []),
  ];
  const visualHeaders = columns.map(column => column.header);
  const scopeLabel = visualWarehouses.length === 1 ? `مخزن ${visualWarehouses[0].name}` : "الشركة";
  const summary = [`${scopeLabel}: ${report.summary.totalItems.toLocaleString("en-US")} ${report.summary.totalItems === 1 ? "صنف" : "أصناف"}`, `إجمالي الرصيد: ${report.summary.totalCompanyBalance.toLocaleString("en-US", { maximumFractionDigits: 3 })}`];
  drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat);
  logoAndDate(doc, visualWarehouses.length === 1 ? `تقرير جرد ${visualWarehouses[0].name}` : "تقرير الجرد الشامل حسب المخازن", logo, options.date, summary);
  autoTable(doc, {
    startY: getReportHeaderHeight(summary),
    margin: { left: 24, right: 24 },
    head: [visualHeaders.map(header => shapeArabic(doc, header))],
    body: report.rows.map(row => columns.map(column => { const value = column.value(row); return typeof value === "number" ? value.toLocaleString("en-US", { maximumFractionDigits: 3 }) : value; })),
    styles: { font: getArabicPdfFont(doc), fontSize: 8.5, cellPadding: 5, halign: "right", minCellHeight: 24, overflow: "linebreak" , lineColor: [137, 162, 172], lineWidth: 0.55},
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.6, font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 8.5, halign: "center" },
    columnStyles: Object.fromEntries(visualHeaders.map((header, index) => [index, { cellWidth: header === "اسم الصنف" ? 176 : header === "الكود" ? 74 : header === "الوحدة" ? 46 : 72, halign: header === "اسم الصنف" ? "right" : "center", overflow: header === "اسم الصنف" ? "linebreak" : undefined }])),
    didParseCell: data => { if (data.section === "body" && columns[data.column.index]?.key !== "name") { data.cell.styles.fontStyle = "bold"; data.cell.styles.textColor = [0, 0, 0]; } },
    willDrawPage: data => { if (data.pageNumber > 1) drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat); },
  });
  return doc;
}

export async function downloadMainWarehousePdf(cards: ItemCardPdfData[], options: { logo?: string | null; date?: Date; fileName?: string } = {}) { const doc = await buildMainWarehousePdf(cards, options); savePdfFile(doc, options.fileName ?? "smart-inventory-main-warehouse.pdf"); }
