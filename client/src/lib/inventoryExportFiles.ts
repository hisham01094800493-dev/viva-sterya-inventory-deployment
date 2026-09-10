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

export type MovementExportItem = { id?: number; type: string; date: string; eznNum: string; itemCode: string; name?: string; quantity: number; detail: string; purpose?: string | null; additionPurpose?: string | null; disbursementPurpose?: string | null; returnPurpose?: string | null; unitPrice: number; totalValue: number; imageUrl?: string | null; documentImageUrl?: string | null; isNegativeCorrection?: boolean };
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

// يجب أن يكون الخط متاحًا خارج بيئة Manus لأن ملفات PDF تُنشأ في نسخة Railway أيضًا.
export const ARABIC_PDF_FONT_URL = "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37/ttf/DejaVuSans.ttf";
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
export function formatPdfMovementDate(value: unknown) { const key = inventoryDateKey(value); const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/); const raw = match ? `${match[3]} / ${match[2]} / ${match[1]}` : (() => { const display = formatInventoryDate(value); const parts = display.split(/[\/.,،؛\-\s]+/).filter(Boolean); return parts.length >= 3 ? `${parts[0].padStart(2, "0")} / ${parts[1].padStart(2, "0")} / ${parts[2]}` : display; })(); return raw; }
export function getReportHeaderLines(summary?: string | string[]) { return !summary ? [] : Array.isArray(summary) ? summary.filter(Boolean) : summary.split("\n").filter(Boolean); }
export function getReportHeaderHeight(summary?: string | string[]) { return getReportHeaderLines(summary).length ? 88 + Math.max(0, getReportHeaderLines(summary).length - 1) * 14 : 72; }
export function drawReportHeader(doc: jsPDF, title: string, _logo?: string | null, date = new Date(), summary?: string | string[]) { (doc as jsPDF & { setR2L?: (value: boolean) => void }).setR2L?.(false); if (arabicPdfDocs.has(doc)) doc.setFont(PDF_FONT_NAME, "bold"); (doc as jsPDF & { setTextColor?: (red: number, green: number, blue: number) => void }).setTextColor?.(0, 0, 0); const lines = getReportHeaderLines(summary); const pageWidth = doc.internal?.pageSize?.getWidth?.() ?? 210; const headerRight = pageWidth - 14; doc.setFontSize(16); doc.text(shapeArabic(doc, title), headerRight, 32, { align: "right", baseline: "middle" }); if (lines.length) { doc.setFontSize(10); lines.forEach((line, index) => doc.text(shapeArabic(doc, line), headerRight, 52 + index * 15, { align: "right", baseline: "middle" })); } doc.setFontSize(9); doc.text(getReportHeaderDate(date), headerRight, lines.length ? 52 + lines.length * 15 : 52, { align: "right", baseline: "middle" }); }
function logoAndDate(doc: jsPDF, title: string, logo?: string | null, date = new Date(), summary?: string | string[]) { drawReportHeader(doc, title, logo, date, summary); }
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
  const columns = ["date", "detail", ...(options.includePermitColumn ? ["permitNumber"] : []), "movement", "openingStock", "addition", "returned", "disbursement", "runningStock", ...(options.includeUnitPrice !== false ? ["unitPrice"] : []), ...(options.includeTotalValue !== false ? ["totalValue"] : [])] as const;
  const labels: Record<typeof columns[number], string> = { date: "التاريخ", detail: "البيان", permitNumber: "رقم الإذن", movement: "الحركة", openingStock: "الرصيد الأول", addition: "الإضافة", returned: "المرتجع", disbursement: "الصرف", runningStock: "الرصيد الإجمالي", unitPrice: "السعر", totalValue: "إجمالي السعر" };
  const values: Record<typeof columns[number], (row: ItemCardMovementPdfRow) => string | number> = { date: row => row.date, detail: row => row.detail, permitNumber: row => row.permitNumber, movement: row => row.movement, openingStock: row => row.openingStock === null ? "—" : row.openingStock, addition: row => row.addition || "—", returned: row => row.returned || "—", disbursement: row => row.disbursement || "—", runningStock: row => row.runningStock === null ? "—" : row.runningStock, unitPrice: row => row.unitPrice, totalValue: row => row.totalValue };
  const headerRow = sheet.addRow(columns.map(key => labels[key]));
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D4F62" } };
  sheet.columns = columns.map(key => ({ header: labels[key], key, width: key === "date" ? 14 : key === "detail" ? 34 : key === "permitNumber" ? 16 : key === "movement" ? 14 : 16 }));
  rows.forEach(row => { const excelRow = sheet.addRow(columns.map(key => values[key](row))); excelRow.alignment = { vertical: "middle", horizontal: "right", wrapText: true }; excelRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row.movement === "إضافة" ? "FFE8F7EF" : row.movement === "صرف" ? "FFFFE8ED" : row.movement === "مرتجع" ? "FFFFF7E0" : "FFE8F2FA" } }; });
  const excelTotals = { addition: rows.reduce((sum, row) => sum + row.addition, 0), returned: rows.reduce((sum, row) => sum + row.returned, 0), disbursement: rows.reduce((sum, row) => sum + row.disbursement, 0), totalValue: rows.reduce((sum, row) => sum + row.totalValue, 0) };
  const excelFinalStock = Number(card.item.currentStock ?? rows.at(-1)?.runningStock ?? card.item.initialStock ?? 0); const excelTotalRow = { date: "", detail: "الإجمالي", movement: "", openingStock: null, addition: Number(excelTotals.addition.toFixed(3)), returned: Number(excelTotals.returned.toFixed(3)), disbursement: Number(excelTotals.disbursement.toFixed(3)), runningStock: Number(excelFinalStock.toFixed(3)), unitPrice: 0, totalValue: Number(excelTotals.totalValue.toFixed(2)), permitNumber: "" } as unknown as ItemCardMovementPdfRow;
  const totalExcelRow = sheet.addRow(columns.map(key => values[key](excelTotalRow))); totalExcelRow.font = { bold: true, color: { argb: "FF102A43" } }; totalExcelRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCEBF0" } }; totalExcelRow.alignment = { vertical: "middle", horizontal: "right", wrapText: true };
  sheet.getRow(1).font = { bold: true, size: 15, color: { argb: "FF0D4F62" } };
  sheet.mergeCells(1, 1, 1, columns.length);
  return workbook;
}

export async function downloadItemCardExcel(card: ItemCardPdfData, options: { movementFilter?: "all" | "إضافة" | "صرف" | "مرتجع" | "تحويل"; includePermitColumn?: boolean; includeUnitPrice?: boolean; includeTotalValue?: boolean; fileName?: string } = {}) { const workbook = await buildItemCardExcel(card, options); const output = await workbook.xlsx.writeBuffer(); downloadBlobFile(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), options.fileName ?? `smart-inventory-item-card-${card.item.code ?? "report"}.xlsx`); }

async function downloadMovementExcelLegacy(rows: MovementExportItem[], options: { columns?: ExportColumnKey[] } = {}) { const keys = selected(movementExportColumns, options.columns); const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("حركات المخزون", { views: [{ rightToLeft: true }] }); const defs: Record<string, { header: string; key: string; width: number }> = { type: { header: labels.type, key: "type", width: 14 }, date: { header: labels.date, key: "date", width: 14 }, eznNum: { header: labels.eznNum, key: "eznNum", width: 16 }, itemCode: { header: labels.itemCode, key: "itemCode", width: 16 }, name: { header: labels.name, key: "name", width: 28 }, quantity: { header: labels.quantity, key: "quantity", width: 14 }, additionPurpose: { header: labels.additionPurpose, key: "additionPurpose", width: 28 }, disbursementPurpose: { header: labels.disbursementPurpose, key: "disbursementPurpose", width: 28 }, returnPurpose: { header: labels.returnPurpose, key: "returnPurpose", width: 28 }, detail: { header: labels.detail, key: "detail", width: 24 }, unitPrice: { header: labels.unitPrice, key: "unitPrice", width: 14 }, totalValue: { header: labels.totalValue, key: "totalValue", width: 18 }, image: { header: labels.image, key: "image", width: 15 }, documentImage: { header: labels.documentImage, key: "documentImage", width: 15 } }; sheet.columns = keys.map(key => defs[key]); sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D4F62" } }; for (const row of rows) { const excelRow = sheet.addRow(Object.fromEntries(keys.map(key => [key, key === "totalValue" ? row.totalValue : key === "image" ? (row.imageUrl ? "مضمنة" : "—") : key === "documentImage" ? (row.documentImageUrl ? "مضمنة" : "—") : key === "detail" ? movementDetail(row) : key === "additionPurpose" ? (row.additionPurpose || "—") : key === "disbursementPurpose" ? (formatDisbursementPurpose(row.disbursementPurpose) || "—") : key === "returnPurpose" ? (row.returnPurpose || "—") : row[key as keyof MovementExportItem]]))); for (const imageKey of ["image", "documentImage"] as const) { const url = imageKey === "image" ? row.imageUrl : row.documentImageUrl; if (keys.includes(imageKey) && url) { const asset = await fetchImageAsset(url); if (asset) { const imageId = workbook.addImage({ buffer: asset.buffer, extension: asset.extension }); sheet.addImage(imageId, { tl: { col: keys.indexOf(imageKey), row: excelRow.number - 1 }, ext: { width: 58, height: 58 } }); excelRow.height = 48; } } } } const output = await workbook.xlsx.writeBuffer(); downloadBlobFile(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "smart-inventory-disbursements-returns.xlsx"); }

async function pdfTable(rows: Array<Record<string, unknown>>, keys: readonly ExportColumnKey[], filename: string, title: string, logo?: string | null) { const { jsPDF, autoTable } = await loadPdfTools(); const visualKeys = [...keys].reverse(); const doc = await configureArabicPdf(new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" })); drawPdfWatermark(doc, logo); logoAndDate(doc, title, logo); autoTable(doc, { startY: 72, head: [visualKeys.map(key => shapeArabic(doc, labels[key]))], body: rows.map(row => visualKeys.map(key => key === "image" ? (row.imageUrl ? "" : "—") : key === "documentImage" ? (row.documentImageUrl ? "" : "—") : shapeArabic(doc, key === "date" ? formatPdfMovementDate(row.date) : String(key === "detail" ? movementDetail(row as MovementExportItem) : row[key] ?? "—")))), styles: { font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 8.5, cellPadding: 6, halign: "right" }, headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.6, font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 9, halign: "center" }, willDrawPage: data => { if (data.pageNumber > 1) drawPdfWatermark(doc, logo); }, didDrawCell: data => { if (data.section === "body" && ["image", "documentImage"].includes(visualKeys[data.column.index])) { const image = data.column.index >= 0 ? (visualKeys[data.column.index] === "image" ? rows[data.row.index].imageDataUrl : rows[data.row.index].documentImageDataUrl) : null; if (image) doc.addImage(String(image), getPdfImageFormat(String(image)), data.cell.x + 3, data.cell.y + 3, 34, 34); } } }); savePdfFile(doc, filename); }

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
export async function buildInventoryPdf(rows: InventoryExportItem[] | null | undefined, options: { columns?: ExportColumnKey[]; logo?: string | null; date?: Date; title?: string; summary?: string | string[]; watermarkOpacity?: number; watermarkScale?: number; watermarkPosition?: "center" | "top" | "bottom"; watermarkRepeat?: boolean; watermarkEnabled?: boolean } = {}) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const safeRows = Array.isArray(rows) ? rows.filter((row): row is InventoryExportItem => Boolean(row && typeof row === 'object')) : [];
  const keys = selected(inventoryExportColumns, options.columns);
  const includeImages = keys.includes('image');
  const enriched = await Promise.all(safeRows.map(async row => {
    let imageDataUrl: string | undefined;
    if (includeImages && row.imageUrl) { try { imageDataUrl = (await fetchImageAsset(row.imageUrl))?.dataUrl ?? undefined; } catch { imageDataUrl = undefined; } }
    const currentStock = Number.isFinite(Number(row.currentStock)) ? Number(row.currentStock) : 0;
    const unitPrice = Number.isFinite(Number(row.unitPrice)) ? Number(row.unitPrice) : 0;
    return { ...row, currentStock, unitPrice, totalValue: Number((currentStock * unitPrice).toFixed(2)), imageDataUrl };
  }));
  const doc = await configureArabicPdf(new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' }));
  const resolvedLogo = await resolveLogo(options.logo);
  const watermarkLogo = null;
  drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat);
  logoAndDate(doc, options.title ?? 'تقرير المخزون - Smart Inventory', resolvedLogo, options.date, options.summary);
  const inventoryColumnStyles = Object.fromEntries(keys.map(key => { const longest = Math.max(labels[key].length, ...enriched.map(row => { const value = key === 'totalValue' ? row.totalValue : key === 'image' ? 'مضمنة' : row[key as keyof InventoryExportItem] ?? '—'; return String(value).length; }), 1); const cap = key === 'name' ? 210 : key === 'category' ? 105 : 86; const cellWidth = key === 'name' ? Math.max(156, Math.min(cap, longest * 5.2 + 18)) : Math.max(42, Math.min(cap, longest * 5.2 + 18)); return [keys.indexOf(key), { cellWidth, halign: 'right' as const, overflow: key === 'name' ? 'linebreak' as const : undefined }]; }));
  autoTable(doc, { startY: getReportHeaderHeight(options.summary), head: [keys.map(key => shapeArabic(doc, labels[key]))], body: enriched.map(row => keys.map(key => key === 'image' ? (row.imageDataUrl ? '' : '—') : shapeArabic(doc, String(key === 'totalValue' ? row.totalValue : row[key as keyof InventoryExportItem] ?? '—')))), columnStyles: inventoryColumnStyles, styles: { font: getArabicPdfFont(doc), fontStyle: 'bold', fontSize: 8.5, cellPadding: 6, halign: 'right', overflow: 'linebreak' }, headStyles: { fillColor: [255,255,255], textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.6, font: getArabicPdfFont(doc), fontStyle: 'bold', fontSize: 9, halign: 'center' }, didParseCell: data => { if (data.section === 'body' && keys[data.column.index] === 'image') { data.cell.styles.minCellHeight = 64; data.cell.styles.cellPadding = 4; } }, willDrawPage: data => { if (data.pageNumber > 1) drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat); }, didDrawCell: data => { if (data.section !== 'body' || keys[data.column.index] !== 'image') return; const image = enriched[data.row.index]?.imageDataUrl; if (!image) return; try { const p = doc.getImageProperties(image); const sw = Number(p.width), sh = Number(p.height); if (!Number.isFinite(sw)||!Number.isFinite(sh)||sw<=0||sh<=0) return; const mw = Math.max(1,data.cell.width-8), mh = Math.max(1,data.cell.height-8), scale = Math.min(mw/sw,mh/sh); if (!Number.isFinite(scale)||scale<=0) return; const w=sw*scale,h=sh*scale; doc.addImage(image,getPdfImageFormat(image),data.cell.x+(data.cell.width-w)/2,data.cell.y+(data.cell.height-h)/2,w,h); } catch {} } });
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

export async function buildMovementPdf(rows: MovementExportItem[], options: { columns?: ExportColumnKey[]; includeDetail?: boolean; logo?: string | null; date?: Date; title?: string; summary?: string | string[]; watermarkOpacity?: number; watermarkScale?: number; watermarkPosition?: "center" | "top" | "bottom"; watermarkRepeat?: boolean; watermarkEnabled?: boolean; monochrome?: boolean } = {}) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const columnSource = options.includeDetail === false ? movementPdfExportColumnsWithoutDetail : movementPdfExportColumns;
  const keys = selected(columnSource, options.columns);
  const visualKeys = [...keys].reverse();
  const safeRows = (Array.isArray(rows) ? rows : []).filter((row): row is MovementExportItem => Boolean(row && typeof row === "object"));
  const includeDocumentImages = keys.includes("documentImage");
  const enriched = await Promise.all(safeRows.map(async row => ({ ...row, documentImageDataUrl: includeDocumentImages ? (await fetchImageAsset(row.documentImageUrl))?.dataUrl : undefined })));
  const doc = await configureArabicPdf(new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" }));
  const resolvedLogo = await resolveLogo(options.logo);
  const watermarkLogo = null;
  drawPdfWatermark(doc, options.monochrome ? null : watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat);
  logoAndDate(doc, options.title ?? "تقرير حركات المخزون - Smart Inventory", resolvedLogo, options.date, options.summary);
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
  autoTable(doc, { startY: getReportHeaderHeight(options.summary), head: [visualKeys.map(key => shapeArabic(doc, labels[key]))], body,
    tableWidth, margin: { left: Math.max(36, pageWidth - tableWidth - 36), right: 36 },
    columnStyles: Object.fromEntries(Object.entries(columnWidths).map(([index, width]) => [index, { cellWidth: width }])),
    styles: { font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 8.6, textColor: [0, 0, 0], cellPadding: 4, halign: "right", valign: "middle", overflow: "linebreak", lineColor: options.monochrome ? [90, 90, 90] : [220, 231, 238], lineWidth: options.monochrome ? 0.45 : 0.25, minCellHeight: visualKeys.includes("documentImage") ? 48 : 24 },
    headStyles: { fillColor: options.monochrome ? [255, 255, 255] : [13, 79, 98], textColor: options.monochrome ? [0, 0, 0] : [255, 255, 255], lineColor: options.monochrome ? [0, 0, 0] : [13, 79, 98], lineWidth: options.monochrome ? 0.6 : 0, font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 8, halign: "right", valign: "middle", overflow: "linebreak" },
    didParseCell: data => { const column = String(visualKeys[data.column.index]); if (data.section === "body") data.cell.styles.textColor = [0, 0, 0]; if (data.section === "body" && ["quantity", "openingStock", "addition", "returned", "disbursement", "runningStock"].includes(column)) { data.cell.styles.fontStyle = "bold"; data.cell.styles.fontSize = 9; } if (data.section === "body" && ["additionPurpose", "disbursementPurpose", "returnPurpose", "detail"].includes(column)) { data.cell.styles.fontSize = 8.1; data.cell.styles.cellPadding = 3.5; data.cell.styles.overflow = "linebreak"; } const mixedValue = data.section === "body" && ["additionPurpose", "disbursementPurpose", "returnPurpose", "detail"].includes(column) ? cellValue(enriched[data.row.index], column as ExportColumnKey) : null; if (data.section === "body" && mixedValue && splitMixedArabicLatinForPdf(mixedValue)) data.cell.text = []; if (data.section === "body" && column === "date") { const fullDate = formatPdfMovementDate(enriched[data.row.index]?.date).replaceAll(" / ", "-"); data.cell.text = [fullDate]; data.cell.styles.halign = "center"; data.cell.styles.font = "helvetica"; data.cell.styles.fontStyle = "bold"; data.cell.styles.fontSize = 9; data.cell.styles.cellWidth = columnWidths[data.column.index] ?? 72; } },
    willDrawPage: data => { if (data.pageNumber > 1) drawPdfWatermark(doc, options.monochrome ? null : watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat); },
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
  const watermarkLogo = null;
  drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat);
  logoAndDate(doc, options.title ?? "تقرير فروق المخزون - Smart Inventory", resolvedLogo, options.date);
  const keys = Object.keys(varianceLabels) as (keyof typeof varianceLabels)[];
  autoTable(doc, { startY: 72, head: [keys.map(key => shapeArabic(doc, varianceLabels[key]))], body: rows.map(row => keys.map(key => shapeArabic(doc, String(typeof row[key] === "number" ? Number(Number(row[key]).toFixed(3)) : row[key] ?? "—")))), columnStyles: { [keys.indexOf("name")]: { cellWidth: 176, halign: "right" as const, overflow: "linebreak" as const } }, styles: { font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 8.5, cellPadding: 6, halign: "right", overflow: "linebreak" }, headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.6, font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 9, halign: "center" }, didParseCell: data => { if (data.section === "body" && ["initialStock", "additions", "disbursements", "returns", "net", "recordedStock", "expectedStock", "variance"].includes(String(keys[data.column.index]))) { data.cell.styles.fontStyle = "bold"; data.cell.styles.fontSize = 9; data.cell.styles.textColor = [0, 0, 0]; } }, willDrawPage: data => { if (data.pageNumber > 1) drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat); } });
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

export async function buildAccountStatementPdf(rows: MovementExportItem[], options: { columns?: ExportColumnKey[]; logo?: string | null; date?: Date; title?: string; summary?: string | string[]; watermarkOpacity?: number; watermarkScale?: number; watermarkPosition?: "center" | "top" | "bottom"; watermarkRepeat?: boolean; watermarkEnabled?: boolean } = {}) {
  return buildMovementPdf(rows, { ...options, includeDetail: false, columns: options.columns?.filter(column => column !== "detail"), title: options.title ?? "كشف حساب - Smart Inventory", summary: options.summary, monochrome: true });
}

export async function downloadAccountStatementPdf(rows: MovementExportItem[], options: { columns?: ExportColumnKey[]; logo?: string | null; date?: Date; title?: string; summary?: string | string[]; watermarkOpacity?: number; watermarkScale?: number; watermarkPosition?: "center" | "top" | "bottom"; watermarkRepeat?: boolean; watermarkEnabled?: boolean; fileName?: string } = {}) {
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
};

export function formatItemCardMovementDetail(movement: ItemCardMovementKind, row: Record<string, any>) {
  const permit = row.eznNum ? ` — رقم الإذن: ${row.eznNum}` : "";
  if (movement === "إضافة") return `وارد من: ${row.supplier || row.store || "—"}${permit}`;
  if (movement === "صرف") return `صادر إلى: ${row.destination || row.customer || row.store || "—"}${permit}`;
  if (movement === "مرتجع") {
    const from = row.fromStore || row.sourceStore || row.supplier || row.customer;
    const to = row.toStore || row.destination || row.store;
    const description = from && to ? `مرتجع من: ${from} إلى: ${to}` : from ? `مرتجع من: ${from}` : to ? `مرتجع إلى: ${to}` : "مرتجع";
    return `${description}${permit}`;
  }
  const from = row.fromStore || row.sourceStore || row.supplier || "—";
  const to = row.toStore || row.destination || row.customer || "—";
  return `تحويل من: ${from} إلى: ${to}${permit}`;
}

export function buildItemCardMovementRows(card: ItemCardPdfData): ItemCardMovementPdfRow[] {
  const initialStock = Number(card.item.initialStock ?? 0);
  const movements = [
    ...card.additions.map(row => ({ movement: "إضافة" as const, date: row.date, eznNum: row.eznNum, quantity: Number(row.quantity ?? 0), unitPrice: Number(row.unitPrice ?? card.item.unitPrice ?? 0), detail: formatItemCardMovementDetail("إضافة", row) })),
    ...card.returns.map(row => { const movement: ItemCardMovementKind = String(row.transferType ?? "").includes("تحويل") ? "تحويل" : "مرتجع"; return { movement, date: row.date, eznNum: row.eznNum, quantity: Number(row.quantity ?? 0), unitPrice: Number(row.unitPrice ?? card.item.unitPrice ?? 0), detail: formatItemCardMovementDetail(movement, row) }; }),
    ...card.disbursements.map(row => ({ movement: "صرف" as const, date: row.date, eznNum: row.eznNum, quantity: Number(row.quantity ?? 0), unitPrice: Number(row.unitPrice ?? card.item.unitPrice ?? 0), detail: formatItemCardMovementDetail("صرف", row) })),
  ].sort((a, b) => inventoryDateKey(a.date ?? "").localeCompare(inventoryDateKey(b.date ?? "")));
  let runningStock = initialStock;
  return movements.map((row, index) => {
    const addition = row.movement === "إضافة" ? row.quantity : 0;
    const returned = row.movement === "مرتجع" || row.movement === "تحويل" ? row.quantity : 0;
    const disbursement = row.movement === "صرف" ? row.quantity : 0;
    runningStock = Number((runningStock + addition + returned - disbursement).toFixed(3));
    return { date: formatItemCardPdfDate(row.date ?? ""), rawDate: row.date, detail: String(row.detail ?? "—"), movement: row.movement, openingStock: index === 0 ? initialStock : null, addition, returned, disbursement, runningStock, unitPrice: row.unitPrice, totalValue: Number((row.quantity * row.unitPrice).toFixed(2)), permitNumber: String(row.eznNum ?? "—") };
  });
}

export async function buildItemCardPdf(card: ItemCardPdfData, options: { logo?: string | null; date?: Date; watermarkOpacity?: number; watermarkScale?: number; watermarkPosition?: "center" | "top" | "bottom"; watermarkRepeat?: boolean; watermarkEnabled?: boolean; movementFilter?: "all" | "إضافة" | "صرف" | "مرتجع" | "تحويل"; includePermitColumn?: boolean; includeUnitPrice?: boolean; includeTotalValue?: boolean } = {}) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = await configureArabicPdf(new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" }));
  const itemImageAsset = await fetchImageAsset(card.item.imageUrl);
  const resolvedLogo = await resolveLogo(options.logo);
  const watermarkLogo = null;
  drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat);
  logoAndDate(doc, `كارت صنف تفصيلي - ${card.item.name}`, resolvedLogo, options.date);
  if (itemImageAsset) doc.addImage(itemImageAsset.dataUrl, itemImageAsset.extension === "png" ? "PNG" : "JPEG", 650, 82, 105, 105);
  autoTable(doc, { startY: 82, margin: { left: 42, right: 205 }, head: [[shapeArabic(doc, "البيان"), shapeArabic(doc, "القيمة")]], body: [[shapeArabic(doc, "اسم الصنف"), shapeArabic(doc, String(card.item.name ?? "—"))], [shapeArabic(doc, "الكود"), String(card.item.code ?? "—")], [shapeArabic(doc, "التصنيف"), shapeArabic(doc, String(card.item.category ?? "—"))], [shapeArabic(doc, "الوحدة"), shapeArabic(doc, String(card.item.unit ?? "—"))], [shapeArabic(doc, "الرصيد الأولي"), String(card.item.initialStock ?? "0")], [shapeArabic(doc, "الرصيد الحالي"), String(card.item.currentStock ?? "0")], [shapeArabic(doc, "سعر الوحدة"), String(card.item.unitPrice ?? "0")]], columnStyles: { 1: { cellWidth: 260, overflow: "linebreak" } }, styles: { font: getArabicPdfFont(doc), fontSize: 10, halign: "right", cellPadding: 5, overflow: "linebreak" }, headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.6, font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 9, halign: "center" }, willDrawPage: data => { if (data.pageNumber > 1) drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat); } });
  const allRows = buildItemCardMovementRows(card);
  const rows = options.movementFilter && options.movementFilter !== "all" ? allRows.filter(row => row.movement === options.movementFilter) : allRows;
  const columns = ["date", "detail", ...(options.includePermitColumn ? ["permitNumber"] : []), "movement", "openingStock", "addition", "returned", "disbursement", "runningStock", ...(options.includeUnitPrice !== false ? ["unitPrice"] : []), ...(options.includeTotalValue !== false ? ["totalValue"] : [])] as const;
  const totals = { addition: rows.reduce((sum, row) => sum + row.addition, 0), returned: rows.reduce((sum, row) => sum + row.returned, 0), disbursement: rows.reduce((sum, row) => sum + row.disbursement, 0), totalValue: rows.reduce((sum, row) => sum + row.totalValue, 0) };
  const finalStock = Number(card.item.currentStock ?? rows.at(-1)?.runningStock ?? card.item.initialStock ?? 0); const totalRow = { date: "", rawDate: "", detail: "الإجمالي", movement: "", openingStock: null, addition: Number(totals.addition.toFixed(3)), returned: Number(totals.returned.toFixed(3)), disbursement: Number(totals.disbursement.toFixed(3)), runningStock: Number(finalStock.toFixed(3)), unitPrice: 0, totalValue: Number(totals.totalValue.toFixed(2)), permitNumber: "" } as unknown as ItemCardMovementPdfRow;
  const columnLabels: Record<typeof columns[number], string> = { date: "التاريخ", detail: "البيان", permitNumber: "رقم الإذن", movement: "الحركة", openingStock: "الرصيد الأول", addition: "الإضافة", returned: "المرتجع", disbursement: "الصرف", runningStock: "الرصيد الإجمالي", unitPrice: "السعر", totalValue: "إجمالي السعر" };
  const visualColumns = [...columns].reverse();
  const values: Record<typeof columns[number], (row: ItemCardMovementPdfRow) => string> = { date: row => row.date, detail: row => row.detail, permitNumber: row => row.permitNumber, movement: row => row.movement, openingStock: row => row.openingStock === null ? "—" : row.openingStock.toFixed(3), addition: row => row.addition ? row.addition.toFixed(3) : "—", returned: row => row.returned ? row.returned.toFixed(3) : "—", disbursement: row => row.disbursement ? row.disbursement.toFixed(3) : "—", runningStock: row => row.runningStock === null ? "—" : row.runningStock.toFixed(3), unitPrice: row => row.unitPrice ? row.unitPrice.toFixed(2) : "—", totalValue: row => row.totalValue ? row.totalValue.toFixed(2) : "—" };
  const startY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 48 : 274;
  const movementColors: Record<ItemCardMovementKind, [number, number, number]> = { "إضافة": [255, 255, 255], "صرف": [255, 255, 255], "مرتجع": [255, 255, 255], "تحويل": [255, 255, 255] };
  const legend = [{ label: "وارد", kind: "إضافة" as const }, { label: "صادر", kind: "صرف" as const }, { label: "مرتجع", kind: "مرتجع" as const }, { label: "تحويل", kind: "تحويل" as const }];
  legend.forEach((entry, index) => { const x = 748 - index * 120; doc.setFillColor(...movementColors[entry.kind]); doc.roundedRect(x - 72, startY - 25, 12, 12, 2, 2, "F"); doc.setFontSize(8); doc.text(shapeArabic(doc, entry.label), x - 54, startY - 15, { align: "right" }); });
  const dateColumnIndex = visualColumns.indexOf("date");
  const detailColumnIndex = visualColumns.indexOf("detail");
  const quantityColumnIndices = visualColumns.map((key, index) => [key, index] as const).filter(([key]) => ["openingStock", "addition", "returned", "disbursement", "runningStock"].includes(key)).map(([, index]) => index);
  const rawColumnWidths: Record<typeof columns[number], number> = { date: 100, detail: 200, permitNumber: 60, movement: 55, openingStock: 55, addition: 55, returned: 55, disbursement: 55, runningStock: 75, unitPrice: 50, totalValue: 65 };
  const contentWidth = doc.internal.pageSize.getWidth() - 48;
  const rawTableWidth = visualColumns.reduce((sum, key) => sum + rawColumnWidths[key], 0);
  const widthScale = contentWidth / rawTableWidth;
  const columnWidths: Record<typeof columns[number], number> = Object.fromEntries(visualColumns.map(key => [key, rawColumnWidths[key] * widthScale])) as Record<typeof columns[number], number>;
  const tableRows = [...rows, totalRow];
  autoTable(doc, { startY, margin: { left: 24, right: 24 }, tableWidth: contentWidth, head: [visualColumns.map(key => shapeArabic(doc, columnLabels[key]))], body: tableRows.map(row => visualColumns.map(key => key === "date" ? values[key](row) : shapeArabic(doc, values[key](row)))), styles: { font: getArabicPdfFont(doc), fontSize: 8, cellPadding: 5, halign: "right", minCellHeight: 26, overflow: "visible" }, columnStyles: Object.fromEntries(visualColumns.map((key, index) => [index, { cellWidth: columnWidths[key], minCellWidth: columnWidths[key], halign: key === "date" ? "center" : "right", overflow: key === "detail" ? "linebreak" : "visible", ...(key === "date" ? { fontSize: 7, cellPadding: { left: 1, right: 1, top: 5, bottom: 5 } } : {}) }])), headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.6, font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 8.5, halign: "center" }, didDrawCell: data => { if (data.section === "body" && data.column.index === dateColumnIndex && data.row.index < rows.length) { const movementRow = tableRows[data.row.index]; if (!movementRow) return; doc.setFont("helvetica", "bold"); doc.setFontSize(8); const fullDate = formatItemCardPdfDate(movementRow.rawDate ?? movementRow.date).replaceAll(" / ", "-").replaceAll("/", "-"); doc.text(fullDate || "—", data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 2, { align: "center", baseline: "middle" }); } }, didParseCell: data => { if (data.section === "body") { data.cell.styles.fillColor = data.row.index === tableRows.length - 1 ? [240, 240, 240] : movementColors[tableRows[data.row.index]?.movement] ?? [255, 255, 255]; if (data.row.index === tableRows.length - 1) data.cell.styles.fontStyle = "bold"; if (quantityColumnIndices.includes(data.column.index)) { data.cell.styles.fontStyle = "bold"; data.cell.styles.fontSize = 8.5; data.cell.styles.textColor = [0, 0, 0]; } if (data.column.index === dateColumnIndex && data.row.index < rows.length) data.cell.text = []; } }, willDrawPage: data => { if (data.pageNumber > 1) drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat); } });
  return doc;
}

export async function downloadItemCardPdf(card: ItemCardPdfData, options: { logo?: string | null; date?: Date; fileName?: string } = {}) { const doc = await buildItemCardPdf(card, options); savePdfFile(doc, options.fileName ?? `smart-inventory-item-card-${card.item.code}.pdf`); }

export async function buildMainWarehousePdf(cards: ItemCardPdfData[], options: { logo?: string | null; date?: Date; warehouseName?: string; watermarkOpacity?: number; watermarkScale?: number; watermarkPosition?: "center" | "top" | "bottom"; watermarkRepeat?: boolean; watermarkEnabled?: boolean } = {}) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = await configureArabicPdf(new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" }));
  const logo = await resolveLogo(options.logo);
  const watermarkLogo = null;
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index]; const additions = card.additions.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0); const returns = card.returns.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0); const disbursements = card.disbursements.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0); const available = Number(card.item.currentStock ?? 0);
    if (index > 0) doc.addPage();
    drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat);
    logoAndDate(doc, `تقرير ${options.warehouseName ?? "المخزن الرئيسي"} - ${card.item.name}`, logo, options.date);
    const imageAsset = await fetchImageAsset(card.item.imageUrl); if (imageAsset) doc.addImage(imageAsset.dataUrl, imageAsset.extension === "png" ? "PNG" : "JPEG", 420, 82, 120, 120);
    autoTable(doc, { startY: 86, margin: { left: 42, right: 180 }, head: [[shapeArabic(doc, "البيان"), shapeArabic(doc, "القيمة")]], body: [[shapeArabic(doc, "اسم الصنف"), shapeArabic(doc, String(card.item.name ?? "—"))], [shapeArabic(doc, "الكود"), String(card.item.code ?? "—")], [shapeArabic(doc, "التصنيف"), shapeArabic(doc, String(card.item.category ?? "—"))], [shapeArabic(doc, "الوحدة"), shapeArabic(doc, String(card.item.unit ?? "—"))], [shapeArabic(doc, "الرصيد الأولي"), String(card.item.initialStock ?? "0")], [shapeArabic(doc, "إجمالي الإضافات"), additions.toFixed(3)], [shapeArabic(doc, "إجمالي المرتجعات"), returns.toFixed(3)], [shapeArabic(doc, "إجمالي الصرف"), disbursements.toFixed(3)], [shapeArabic(doc, "الرصيد المتاح"), available.toFixed(3)]], columnStyles: { 1: { cellWidth: 220, overflow: "linebreak" } }, styles: { font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 10.5, halign: "right", cellPadding: 6, overflow: "linebreak" }, headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.6, font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 9.5, halign: "center" }, willDrawPage: data => { if (data.pageNumber > 1) drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat); }, didParseCell: data => { if (data.section === "body" && data.row.index === 0 && data.column.index === 1) data.cell.styles.halign = "center"; } });
  }
  return doc;
}

export type CompanyInventoryAuditPdfData = { warehouses: Array<{ id: number; slot: number; name: string }>; rows: Array<{ id: number; code: string; name: string; unit: string | null; totalCurrentStock: number; warehouseBalances: Array<{ warehouseId: number; slot: number; name: string; currentStock: number }> }>; summary: { totalItems: number; totalCompanyBalance: number } };
export async function buildCompanyInventoryAuditPdf(report: CompanyInventoryAuditPdfData, options: { logo?: string | null; date?: Date; watermarkOpacity?: number; watermarkScale?: number; watermarkPosition?: "center" | "top" | "bottom"; watermarkRepeat?: boolean; watermarkEnabled?: boolean } = {}) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = await configureArabicPdf(new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" }));
  const logo = await resolveLogo(options.logo);
  const watermarkLogo = null;
  const visualWarehouses = [...report.warehouses].sort((left, right) => right.slot - left.slot);
  const visualHeaders = ["إجمالي الشركة", ...visualWarehouses.map(warehouse => warehouse.name), "الوحدة", "اسم الصنف", "الكود"];
  const summary = [`عدد الأصناف: ${report.summary.totalItems.toLocaleString("en-US")}`, `إجمالي رصيد الشركة: ${report.summary.totalCompanyBalance.toLocaleString("en-US", { maximumFractionDigits: 3 })}`];
  drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat);
  logoAndDate(doc, "تقرير الجرد الشامل حسب المخازن", logo, options.date, summary);
  autoTable(doc, {
    startY: getReportHeaderHeight(summary),
    margin: { left: 24, right: 24 },
    head: [visualHeaders.map(header => shapeArabic(doc, header))],
    body: report.rows.map(row => [row.totalCurrentStock.toLocaleString("en-US", { maximumFractionDigits: 3 }), ...visualWarehouses.map(warehouse => (row.warehouseBalances.find(balance => balance.warehouseId === warehouse.id)?.currentStock ?? 0).toLocaleString("en-US", { maximumFractionDigits: 3 })), shapeArabic(doc, row.unit || "—"), shapeArabic(doc, row.name), row.code]),
    styles: { font: getArabicPdfFont(doc), fontSize: 8.5, cellPadding: 5, halign: "right", minCellHeight: 24, overflow: "linebreak" },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.6, font: getArabicPdfFont(doc), fontStyle: "bold", fontSize: 8.5, halign: "center" },
    columnStyles: Object.fromEntries(visualHeaders.map((header, index) => [index, { cellWidth: header === "اسم الصنف" ? 176 : header === "الكود" ? 74 : header === "الوحدة" ? 46 : 72, halign: header === "اسم الصنف" ? "right" : "center", overflow: header === "اسم الصنف" ? "linebreak" : undefined }])),
    didParseCell: data => { if (data.section === "body" && (data.column.index === 0 || (data.column.index > 0 && data.column.index <= visualWarehouses.length))) { data.cell.styles.fontStyle = "bold"; data.cell.styles.textColor = [0, 0, 0]; } },
    willDrawPage: data => { if (data.pageNumber > 1) drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity, options.watermarkScale, options.watermarkPosition, options.watermarkRepeat); },
  });
  return doc;
}

export async function downloadMainWarehousePdf(cards: ItemCardPdfData[], options: { logo?: string | null; date?: Date; fileName?: string } = {}) { const doc = await buildMainWarehousePdf(cards, options); savePdfFile(doc, options.fileName ?? "smart-inventory-main-warehouse.pdf"); }
