import DashboardLayout from "@/components/DashboardLayout";
import ExcelJS from "exceljs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { InventoryExportItem } from "@/lib/inventoryExport";
import { buildInventoryPdf, buildMovementPdf, configureArabicPdf, drawReportHeader, getArabicPdfFont, shapeArabic, downloadInventoryExcel as downloadInventoryExcelFile, downloadInventoryPdf as downloadInventoryPdfFile, downloadMovementExcel, downloadMovementPdf, loadPdfTools, inventoryExportColumns, movementExportColumns, movementPdfExportColumns, type ExportColumnKey, type MovementExportItem } from "@/lib/inventoryExportFiles";
import { downloadBlobFile, getExportImageExtension, savePdfFile } from "@/lib/inventoryExportRuntime";
import { trpc } from "@/lib/trpc";
import { resolveCompanyLogoUrl } from "@/lib/brandAssets";
import { VoiceInputButton, normalizeVoiceSearchText } from "@/components/VoiceInputButton";
import OfflineDataNotice from "@/components/OfflineDataNotice";
import { inventoryQueryOptions, dashboardQueryOptions } from "@/lib/queryOptions";
import { BarChart3, ChevronLeft, ChevronRight, Download, Eye, FileText, GripVertical, Image as ImageIcon, Loader2, Minus, PackageCheck, Plus, Printer, RefreshCcw, Search, TrendingDown, Upload, ZoomIn, ZoomOut } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { buildOutboundReturnRows } from "@/lib/reportMovements";
import { formatInventoryDate, inventoryDateKey } from "@/lib/inventoryDate";
import { createReportMailtoUrl, createReportWhatsAppUrl, shareExcelFile, sharePdfFile } from "@/lib/reportSharing";
import { buildUnlinkedCustomerParties, type UnlinkedPartySummary } from "@/lib/unlinkedCustomerParties";
import { buildStockVarianceRows, summarizeStockVariance, type StockVarianceRow } from "@/lib/stockVariance";
import { buildExcelFileBlob, buildStockVariancePdf, downloadStockVarianceExcel, downloadStockVariancePdf } from "@/lib/inventoryExportFiles";
import { formatDisbursementPurpose } from "@/lib/movementPurpose";

type ReportType = "overview" | "inventory" | "movements" | "returns" | "variance" | "accounts" | "unlinked";
type ExportFormat = "excel" | "pdf";
type MovementFilter = "all" | "إضافة" | "صرف" | "مرتجع";
type VarianceFilter = "all" | "متطابق" | "فرق موجب" | "فرق سالب";
  const PdfPageCanvas = lazy(() => import("@/components/PdfPageCanvas").then(module => ({ default: module.PdfPageCanvas })));
export function createReportExportRequest(reportType: ReportType, format: ExportFormat, columns: ExportColumnKey[], logo: string | null) { return { reportType, format, options: { columns: [...columns], logo } }; }
export function movementCategory(type: string) { return type.startsWith("توريد") || type === "إضافة" ? "إضافة" : type.startsWith("صرف") || type === "صرف" ? "صرف" : type.includes("مرتجع") ? "مرتجع" : "تحويل"; }
export function filterMovementRows(rows: MovementExportItem[], filter: MovementFilter) { return filter === "all" ? rows : rows.filter(row => movementCategory(row.type) === filter); }
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
export function countMovementRows(rows: MovementExportItem[]) { return rows.reduce<Record<"all" | "إضافة" | "صرف" | "مرتجع", number>>((counts, row) => { counts.all += 1; const category = movementCategory(row.type); if (category === "إضافة" || category === "صرف" || category === "مرتجع") counts[category] += 1; return counts; }, { all: 0, إضافة: 0, صرف: 0, مرتجع: 0 }); }
export function estimatePdfRemainingSeconds(elapsedSeconds: number, progress: number) { if (!Number.isFinite(elapsedSeconds) || !Number.isFinite(progress) || elapsedSeconds <= 0 || progress <= 0 || progress >= 100) return progress >= 100 ? 0 : null; return Math.max(1, Math.ceil(elapsedSeconds * (100 - progress) / progress)); }

export function formatReportPartySummary(incomingFrom: string, outgoingTo: string) {
  const from = incomingFrom.trim();
  const to = outgoingTo.trim();
  const lines: string[] = [];
  if (from) lines.push(`وارد من: ${from}`);
  if (to) lines.push(`منصرف إلى: ${to}`);
  return lines;
}
export function filterMovementRowsBySearch(rows: MovementExportItem[], permitNumber: string, incomingFrom: string, outgoingTo: string) {
  const permit = permitNumber.trim().toLocaleLowerCase("en-US");
  const from = incomingFrom.trim().toLocaleLowerCase("ar-EG");
  const to = outgoingTo.trim().toLocaleLowerCase("ar-EG");
  return rows.filter(row => {
    const permitMatch = !permit || String(row.eznNum ?? "").toLocaleLowerCase("en-US").includes(permit);
    const partyQueryActive = Boolean(from || to);
    const searchableParty = `${String(row.type ?? "")} ${String(row.detail ?? "")} ${String(row.additionPurpose ?? "")} ${String(row.disbursementPurpose ?? "")}`.toLocaleLowerCase("ar-EG");
    const incomingMatch = Boolean(from) && movementCategory(row.type) === "إضافة" && searchableParty.includes(from);
    const outgoingMatch = Boolean(to) && (movementCategory(row.type) === "صرف" || movementCategory(row.type) === "مرتجع") && searchableParty.includes(to);
    return permitMatch && (!partyQueryActive || incomingMatch || outgoingMatch);
  });
}
const exportColumnLabels: Record<string, string> = { code: "كود الصنف", name: "اسم الصنف", category: "التصنيف", unit: "الوحدة", currentStock: "الرصيد الحالي", reorderLevel: "حد الطلب", unitPrice: "سعر الوحدة", totalValue: "قيمة المخزون/الحركة", image: "صورة الصنف", type: "نوع الحركة", date: "التاريخ", eznNum: "رقم الإذن", itemCode: "كود الصنف", quantity: "الكمية", additionPurpose: "لِزوم الإضافة", disbursementPurpose: "لِزوم الصرف", returnPurpose: "لِزوم الارتجاع", documentImage: "صورة الإذن", detail: "البيان" };

type MovementRow = {
  id: number;
  type: string;
  date: string;
  eznNum: string;
  itemCode: string;
  quantity: number;
  detail: string;
  purpose?: string | null;
  unitPrice: number;
  totalValue: number;
  imageUrl?: string | null;
  documentImageUrl?: string | null;
};

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
const formatQuantity = (value: unknown) => numberFormat.format(Number(value ?? 0));
const today = () => new Date().toISOString().slice(0, 10);
const dateOnly = (value: unknown) => formatInventoryDate(value);

function inDateRange(value: unknown, from: string, to: string) {
  const date = inventoryDateKey(value);
  return (!from || date >= from) && (!to || date <= to);
}

function escapeCsv(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

type AccountSummaryData = { suppliers: { name: string; quantity: number; value: number; movements: number }[]; customers: { name: string; quantity: number; value: number; movements: number }[] };

async function downloadAccountExcel(summary: AccountSummaryData, from: string, to: string) {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("إجمالي الجهات", { views: [{ rightToLeft: true }] });
  sheet.columns = [{ header: "النوع", key: "type", width: 18 }, { header: "المورد/العميل", key: "name", width: 30 }, { header: "عدد الحركات", key: "movements", width: 16 }, { header: "الكمية", key: "quantity", width: 16 }, { header: "القيمة", key: "value", width: 18 }];
  sheet.addRow(["الفترة", `${from || "البداية"} - ${to || "اليوم"}`]);
  for (const row of summary.suppliers) sheet.addRow({ type: "مورد", ...row });
  for (const row of summary.customers) sheet.addRow({ type: "عميل/جهة", ...row });
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D4F62" } };
  const output = await workbook.xlsx.writeBuffer(); downloadBlobFile(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "smart-inventory-accounts-summary.xlsx");
}

async function buildAccountPdfDoc(summary: AccountSummaryData) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = await configureArabicPdf(new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" }));
  drawReportHeader(doc, "إجمالي حركات الموردين والعملاء - Smart Inventory");
  const rows = [...summary.suppliers.map(row => ["مورد", row.name, row.movements, row.quantity, row.value.toFixed(2)]), ...summary.customers.map(row => ["عميل / جهة", row.name, row.movements, row.quantity, row.value.toFixed(2)])];
  autoTable(doc, { startY: 72, head: [["النوع", "المورد / العميل", "عدد الحركات", "الكمية", "القيمة"]].map(row => row.map(cell => shapeArabic(doc, cell))), body: rows.map(row => row.map(cell => shapeArabic(doc, String(cell)))), styles: { font: getArabicPdfFont(doc), fontSize: 9, cellPadding: 6, halign: "right" }, headStyles: { fillColor: [13, 79, 98], font: getArabicPdfFont(doc), halign: "right" } });
  return doc;
}

async function downloadAccountPdf(summary: AccountSummaryData, from: string, to: string) {
  const doc = await buildAccountPdfDoc(summary);
  savePdfFile(doc, "smart-inventory-accounts-summary.pdf");
}

async function previewAccountPdfExternally(summary: AccountSummaryData) {
  const doc = await buildAccountPdfDoc(summary);
  const opened = window.open(URL.createObjectURL(doc.output("blob")), "_blank", "noopener,noreferrer");
  if (!opened) toast.error("تعذر فتح المعاينة الخارجية؛ اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى");
}

async function downloadUnlinkedPartiesExcel(rows: UnlinkedPartySummary[], from: string, to: string) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("جهات غير مرتبطة", { views: [{ rightToLeft: true }] });
  sheet.columns = [{ header: "الجهة النصية", key: "name", width: 30 }, { header: "عدد الحركات", key: "movements", width: 16 }, { header: "الكمية", key: "quantity", width: 16 }, { header: "القيمة", key: "value", width: 16 }, { header: "أول حركة", key: "firstDate", width: 16 }, { header: "آخر حركة", key: "lastDate", width: 16 }];
  sheet.addRow(["الفترة", `${from || "البداية"} - ${to || "اليوم"}`]);
  rows.forEach(row => sheet.addRow({ ...row, firstDate: formatInventoryDate(row.firstDate), lastDate: formatInventoryDate(row.lastDate) }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D4F62" } };
  const output = await workbook.xlsx.writeBuffer(); downloadBlobFile(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "smart-inventory-unlinked-parties.xlsx");
}

async function buildUnlinkedPartiesPdfDoc(rows: UnlinkedPartySummary[]) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = await configureArabicPdf(new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" }));
  drawReportHeader(doc, "الجهات غير المرتبطة بدليل العملاء - Smart Inventory");
  const body = rows.map(row => [row.name, row.movements, row.quantity.toFixed(3), row.value.toFixed(2), formatInventoryDate(row.firstDate), formatInventoryDate(row.lastDate)]);
  autoTable(doc, { startY: 72, head: [["الجهة النصية", "عدد الحركات", "الكمية", "القيمة", "أول حركة", "آخر حركة"]].map(row => row.map(cell => shapeArabic(doc, cell))), body: body.map(row => row.map(cell => shapeArabic(doc, String(cell)))), styles: { font: getArabicPdfFont(doc), fontSize: 9, cellPadding: 6, halign: "right" }, headStyles: { fillColor: [13, 79, 98], font: getArabicPdfFont(doc), halign: "right" } });
  return doc;
}

async function downloadUnlinkedPartiesPdf(rows: UnlinkedPartySummary[], from: string, to: string) {
  const doc = await buildUnlinkedPartiesPdfDoc(rows);
  savePdfFile(doc, "smart-inventory-unlinked-parties.pdf");
}

async function previewUnlinkedPartiesPdfExternally(rows: UnlinkedPartySummary[]) {
  const doc = await buildUnlinkedPartiesPdfDoc(rows);
  const opened = window.open(URL.createObjectURL(doc.output("blob")), "_blank", "noopener,noreferrer");
  if (!opened) toast.error("تعذر فتح المعاينة الخارجية؛ اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى");
}

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function convertWebpToPng(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error("تعذر تحويل الصورة")), "image/png"));
}

async function fetchImageAsset(url?: string | null) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const source = await response.blob();
    const isWebp = source.type === "image/webp" || url.toLowerCase().includes(".webp");
    const blob = isWebp ? await convertWebpToPng(source) : source;
    const extension = isWebp ? "png" as const : getExportImageExtension(source.type, url) === "png" ? "png" as const : "jpeg" as const;
    return { buffer: await blob.arrayBuffer(), dataUrl: await blobToDataUrl(blob), extension };
  } catch {
    return null;
  }
}

async function downloadInventoryExcel(rows: InventoryExportItem[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("المخزون الحالي", { views: [{ rightToLeft: true }] });
  worksheet.columns = [
    { header: "كود الصنف", key: "code", width: 16 }, { header: "اسم الصنف", key: "name", width: 28 },
    { header: "التصنيف", key: "category", width: 18 }, { header: "الوحدة", key: "unit", width: 12 },
    { header: "الرصيد الحالي", key: "currentStock", width: 16 }, { header: "حد الطلب", key: "reorderLevel", width: 14 },
    { header: "سعر الوحدة", key: "unitPrice", width: 14 }, { header: "قيمة المخزون", key: "totalValue", width: 16 }, { header: "الصورة", key: "image", width: 15 },
  ];
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D4F62" } };
  for (const row of rows) {
    const excelRow = worksheet.addRow({ code: row.code, name: row.name, category: row.category, unit: row.unit, currentStock: row.currentStock, reorderLevel: row.reorderLevel, unitPrice: row.unitPrice, totalValue: Number((row.currentStock * row.unitPrice).toFixed(2)), image: row.imageUrl ? "مضمنة" : "—" });
    if (row.imageUrl) {
      const asset = await fetchImageAsset(row.imageUrl);
      if (asset) {
        const imageId = workbook.addImage({ buffer: asset.buffer, extension: asset.extension });
        worksheet.addImage(imageId, { tl: { col: 8, row: excelRow.number - 1 }, ext: { width: 58, height: 58 } });
        excelRow.height = 48;
      }
    }
  }
  const output = await workbook.xlsx.writeBuffer();
  const blob = new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlobFile(blob, "smart-inventory-stock.xlsx");
}

async function fetchImageDataUrl(url?: string | null) {
  const asset = await fetchImageAsset(url);
  return asset?.dataUrl ?? null;
}

async function downloadInventoryPdf(rows: InventoryExportItem[]) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(18);
  doc.text("Smart Inventory - Stock Report", 40, 40);
  doc.setFontSize(9);
  doc.text("Current stock, prices and inventory values", 40, 56);
  const images = await Promise.all(rows.map(row => fetchImageDataUrl(row.imageUrl)));
  autoTable(doc, {
    startY: 72,
    head: [["Code", "Item", "Category", "Unit", "Current", "Reorder", "Unit price", "Stock value", "Image"]],
    body: rows.map(row => [row.code, row.name, row.category, row.unit, row.currentStock, row.reorderLevel, row.unitPrice.toFixed(2), (row.currentStock * row.unitPrice).toFixed(2), images[rows.indexOf(row)] ? "" : "—"]),
    styles: { fontSize: 8, cellPadding: 6, halign: "right" },
    headStyles: { fillColor: [13, 79, 98] },
    didDrawCell: data => {
      if (data.section !== "body" || data.column.index !== 8) return;
      const image = images[data.row.index];
      if (image) doc.addImage(image, "PNG", data.cell.x + 3, data.cell.y + 3, 34, 34);
    },
  });
  savePdfFile(doc, "smart-inventory-stock.pdf");
}

function printReport(title: string, subtitle: string, headers: string[], rows: unknown[][]) {
  const popup = window.open("", "_blank", "width=1100,height=800");
  if (!popup) return;
  const escapeHtml = (value: unknown) => String(value ?? "—").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const renderCell = (cell: unknown) => typeof cell === "string" && cell.startsWith("<img ") ? cell : escapeHtml(cell);
  const table = `<table><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${renderCell(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Arial,sans-serif;color:#102a43;padding:32px}h1{margin:0 0 8px;font-size:24px}p{color:#64748b;margin:0 0 24px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #dce7ee;padding:9px;text-align:right}th{background:#e8f1f2;color:#0d4f62}@media print{body{padding:0}}</style></head><body><h1>${title}</h1><p>${subtitle}</p>${table}<script>window.onload=()=>window.print();</script></body></html>`);
  popup.document.close();
}

function PageHeader({ from, to, onRefresh, refreshing }: { from: string; to: string; onRefresh: () => void; refreshing: boolean }) {
  return <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-[#d08a3b]">REPORTING / ANALYTICS</p>
      <h2 className="text-3xl font-black tracking-tight text-[#102a43]">تقارير المخزون</h2>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">حوّل بيانات المخزون والحركات إلى قراءة عملية قابلة للطباعة أو التصدير، مع الحفاظ على نفس منطق حد الطلب والتنبيهات.</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className="rounded-full border-[#cfe1e5] bg-white px-3 py-2 text-xs font-bold text-[#0d4f62]">من {from || "البداية"} إلى {to || "اليوم"}</Badge>
      <Button variant="outline" onClick={onRefresh} disabled={refreshing} className="rounded-xl border-[#dce7ee] bg-white font-bold text-[#0d4f62] hover:bg-[#e8f1f2]">{refreshing ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="ml-2 h-4 w-4" />}تحديث</Button>
    </div>
  </div>;
}

export default function ReportsPage() {
  const [location] = useLocation();
  const [reportType, setReportType] = useState<ReportType>("overview");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today());
  const [unlinkedSearch, setUnlinkedSearch] = useState("");
  const [permitSearch, setPermitSearch] = useState("");
  const [incomingFromSearch, setIncomingFromSearch] = useState("");
  const [outgoingToSearch, setOutgoingToSearch] = useState("");
  const [additionPurposeSearch, setAdditionPurposeSearch] = useState("");
  const [disbursementPurposeSearch, setDisbursementPurposeSearch] = useState("");
  const [returnPurposeSearch, setReturnPurposeSearch] = useState("");
  const [movementFilter, setMovementFilter] = useState<MovementFilter>("all");
  const [varianceFilter, setVarianceFilter] = useState<VarianceFilter>("all");
  const [appliedReportFilters, setAppliedReportFilters] = useState({ from: "", to: today(), movement: "all" as MovementFilter, variance: "all" as VarianceFilter, unlinked: "", permit: "", incomingFrom: "", outgoingTo: "", additionPurpose: "", disbursementPurpose: "", returnPurpose: "" });
  const [selectedVarianceCode, setSelectedVarianceCode] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.split("?")[1] ?? "");
    const incomingFrom = params.get("incomingFrom")?.trim();
    const outgoingTo = params.get("outgoingTo")?.trim();
    const fromDate = params.get("from")?.trim();
    const toDate = params.get("to")?.trim();
    const movement = params.get("movement") as MovementFilter | null;
    if (!incomingFrom && !outgoingTo && !fromDate && !toDate) return;
    const nextFrom = fromDate || "";
    const nextTo = toDate || today();
    const nextMovement = movement === "إضافة" || movement === "صرف" || movement === "مرتجع" ? movement : "all";
    setFrom(nextFrom); setTo(nextTo); setIncomingFromSearch(incomingFrom || ""); setOutgoingToSearch(outgoingTo || ""); setMovementFilter(nextMovement);
    setAppliedReportFilters(current => ({ ...current, from: nextFrom, to: nextTo, incomingFrom: incomingFrom || "", outgoingTo: outgoingTo || "", movement: nextMovement }));
    setReportType("movements"); setSearchResultView(true);
  }, [location]);
  const reportRowsRequired = reportType === "movements" || reportType === "returns" || reportType === "unlinked" || (reportType === "variance" && Boolean(selectedVarianceCode));
  const reportDatasetInput = useMemo(() => ({ includeRows: reportRowsRequired, fromDate: appliedReportFilters.from || undefined, toDate: appliedReportFilters.to || undefined, permitSearch: appliedReportFilters.permit || undefined, incomingFromSearch: appliedReportFilters.incomingFrom || undefined, outgoingToSearch: appliedReportFilters.outgoingTo || undefined, additionPurposeSearch: appliedReportFilters.additionPurpose || undefined, disbursementPurposeSearch: appliedReportFilters.disbursementPurpose || undefined, returnPurposeSearch: appliedReportFilters.returnPurpose || undefined }), [reportRowsRequired, appliedReportFilters.from, appliedReportFilters.to, appliedReportFilters.permit, appliedReportFilters.incomingFrom, appliedReportFilters.outgoingTo, appliedReportFilters.additionPurpose, appliedReportFilters.disbursementPurpose, appliedReportFilters.returnPurpose]);
  const items = trpc.items.list.useQuery(undefined, inventoryQueryOptions);
  const reportDataset = trpc.reports.dataset.useQuery(reportDatasetInput, inventoryQueryOptions);
  const customers = trpc.customers.list.useQuery(undefined, inventoryQueryOptions);
  const suppliers = trpc.suppliers.list.useQuery(undefined, inventoryQueryOptions);
  const summary = trpc.dashboard.summary.useQuery(undefined, dashboardQueryOptions);
  const utils = trpc.useUtils();
  const refreshing = items.isFetching || reportDataset.isFetching || customers.isFetching || summary.isFetching;
  const settings = trpc.settings.list.useQuery(undefined, inventoryQueryOptions);
  const preferences = trpc.preferences.get.useQuery(undefined, inventoryQueryOptions);
  const updatePreferences = trpc.preferences.update.useMutation({ onSuccess: () => toast.success("تم حفظ ترتيب أعمدة التقارير"), onError: () => toast.error("تعذر حفظ ترتيب أعمدة التقارير") });
  const recordShare = trpc.activity.recordShare.useMutation();
  const uploadLogo = trpc.settings.uploadCompanyLogo.useMutation();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [searchResultView, setSearchResultView] = useState(false);
  const [reportTypeBeforeSearch, setReportTypeBeforeSearch] = useState<ReportType>("overview");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [pdfShareLoading, setPdfShareLoading] = useState(false);
  const [excelShareLoading, setExcelShareLoading] = useState(false);
  const [pdfTask, setPdfTask] = useState<"idle" | "preview" | "download">("idle");
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfEtaSeconds, setPdfEtaSeconds] = useState<number | null>(null);
  const pdfStartedAtRef = useRef<number | null>(null);
  const pdfBusy = pdfTask !== "idle";
  const beginPdfTask = (task: "preview" | "download") => { pdfStartedAtRef.current = performance.now(); setPdfTask(task); setPdfProgress(0); setPdfEtaSeconds(null); };
  const setPdfProgressStage = (value: number) => { setPdfProgress(value); const startedAt = pdfStartedAtRef.current; if (!startedAt || value >= 100) { setPdfEtaSeconds(value >= 100 ? 0 : null); return; } const elapsedSeconds = Math.max(0.05, (performance.now() - startedAt) / 1000); setPdfEtaSeconds(estimatePdfRemainingSeconds(elapsedSeconds, value)); };
  const finishPdfTask = () => { setPdfProgressStage(100); window.setTimeout(() => { pdfStartedAtRef.current = null; setPdfTask("idle"); setPdfProgress(0); setPdfEtaSeconds(null); }, 450); };
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfPageCount, setPdfPageCount] = useState(1);
  const [pdfZoom, setPdfZoom] = useState(1);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("excel");
  const [selectedColumns, setSelectedColumns] = useState<ExportColumnKey[]>([...inventoryExportColumns]);
  const reportColumnPreferenceKey = `reports:${reportType}:${exportFormat}`;
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const companyLogoUrl = resolveCompanyLogoUrl(settings.data?.find(item => item.key === "company_logo_url")?.value);
  const watermarkEnabled = settings.data?.find(item => item.key === "report_watermark_enabled")?.value !== "false";
  const watermarkOpacity = Number(settings.data?.find(item => item.key === "report_watermark_opacity")?.value ?? "0.08");
  const watermarkScale = Number(settings.data?.find(item => item.key === "report_watermark_scale")?.value ?? "0.42");
  const watermarkPosition = (settings.data?.find(item => item.key === "report_watermark_position")?.value ?? "center") as "center" | "top" | "bottom";
  const watermarkRepeat = settings.data?.find(item => item.key === "report_watermark_repeat")?.value === "true";
  const defaultSupplierName = settings.data?.find(item => item.key === "report_default_supplier")?.value?.trim() || "—";
  const defaultCustomerName = settings.data?.find(item => item.key === "report_default_customer")?.value?.trim() || "—";

  const inventoryRows = useMemo(() => (items.data ?? []).filter(item => inDateRange(item.createdAt, appliedReportFilters.from, appliedReportFilters.to)), [items.data, appliedReportFilters]);
  const filteredAdditions = reportDataset.data?.additions ?? [];
  const filteredDisbursements = reportDataset.data?.disbursements ?? [];
  const filteredTransfers = reportDataset.data?.transfers ?? [];
  const movementRows = useMemo<MovementRow[]>(() => {
    const itemByCode = new Map((items.data ?? []).map(item => [item.code, item]));
    const customerById = new Map((customers.data ?? []).map(customer => [customer.id, customer.name]));
    const enrich = (row: { itemCode: string; quantity: unknown; unitPrice?: unknown; documentImageUrl?: string | null }) => { const item = itemByCode.get(row.itemCode); const unitPrice = Number(row.unitPrice ?? item?.unitPrice ?? 0); return { unitPrice, totalValue: Number((Number(row.quantity) * unitPrice).toFixed(2)), imageUrl: item?.imageUrl, documentImageUrl: row.documentImageUrl ?? null }; };
    return [
      ...filteredAdditions.map(row => ({ id: row.id, type: `توريد من: ${row.supplier || row.store || defaultSupplierName}` as const, date: dateOnly(row.date), eznNum: row.eznNum, itemCode: row.itemCode, quantity: Number(row.quantity), detail: itemByCode.get(row.itemCode)?.name || row.itemCode, ...enrich(row) })),
      ...filteredDisbursements.map(row => ({ id: row.id, type: `صرف إلى: ${customerById.get(row.customerId ?? 0) || row.destination || row.store || defaultCustomerName}` as const, date: dateOnly(row.date), eznNum: row.eznNum, itemCode: row.itemCode, quantity: Number(row.quantity), detail: itemByCode.get(row.itemCode)?.name || row.itemCode, ...enrich(row) })),
      ...filteredTransfers.map(row => ({ id: row.id, type: `تحويل داخلي إلى: ${row.toStore || defaultCustomerName}` as const, date: dateOnly(row.date), eznNum: row.eznNum, itemCode: row.itemCode, quantity: Number(row.quantity), detail: itemByCode.get(row.itemCode)?.name || row.itemCode, ...enrich(row) })),
    ].sort((a, b) => b.id - a.id);
  }, [items.data, customers.data, filteredAdditions, filteredDisbursements, filteredTransfers, defaultSupplierName, defaultCustomerName]);

  const lowStockCount = useMemo(() => inventoryRows.filter(item => {
    const current = Number(item.currentStock ?? 0);
    const reorder = Number(item.reorderLevel ?? 0);
    const threshold = Number(summary.data?.thresholdPercentage ?? 20) / 100;
    return reorder > 0 ? current <= reorder * threshold : current <= 0;
  }).length, [inventoryRows, summary.data?.thresholdPercentage]);
  const totalCurrent = inventoryRows.reduce((sum, item) => sum + Number(item.currentStock ?? 0), 0);
  const totalIncoming = Number(reportDataset.data?.summary.additions.quantity ?? 0);
  const totalOutgoing = Number(reportDataset.data?.summary.disbursements.quantity ?? 0);
  const varianceRows = reportDataset.data?.varianceRows ?? [];
  const varianceSummary = reportDataset.data?.varianceSummary ?? { total: 0, matched: 0, positive: 0, negative: 0, totalVariance: 0 };
  const filteredVarianceRows = useMemo(() => appliedReportFilters.variance === "all" ? varianceRows : varianceRows.filter(row => row.status === appliedReportFilters.variance), [varianceRows, appliedReportFilters.variance]);
  const selectedVarianceRow = useMemo(() => varianceRows.find(row => row.code === selectedVarianceCode) ?? null, [varianceRows, selectedVarianceCode]);
  const selectedVarianceMovements = useMemo(() => { if (!selectedVarianceCode) return []; const itemName = items.data?.find(item => item.code === selectedVarianceCode)?.name ?? selectedVarianceCode; const customerNames = new Map((customers.data ?? []).map(customer => [customer.id, customer.name])); return [
    ...filteredAdditions.filter(row => row.itemCode === selectedVarianceCode).map(row => ({ type: "إضافة", date: dateOnly(row.date), eznNum: row.eznNum, quantity: Number(row.quantity), party: row.supplier || row.store || "—", detail: row.purpose || "—", itemName })),
    ...filteredDisbursements.filter(row => row.itemCode === selectedVarianceCode).map(row => ({ type: "صرف", date: dateOnly(row.date), eznNum: row.eznNum, quantity: Number(row.quantity), party: customerNames.get(row.customerId ?? 0) || row.destination || row.store || "—", detail: row.notes || "—", itemName })),
    ...filteredTransfers.filter(row => row.itemCode === selectedVarianceCode && String(row.transferType ?? "").trim().toLowerCase() !== "تحويل").map(row => ({ type: String(row.transferType || "مرتجع"), date: dateOnly(row.date), eznNum: row.eznNum, quantity: Number(row.quantity), party: `${row.fromStore || "—"} ← ${row.toStore || "—"}`, detail: row.notes || "—", itemName })),
  ].sort((a, b) => b.date.localeCompare(a.date)); }, [selectedVarianceCode, items.data, filteredAdditions, filteredDisbursements, filteredTransfers, customers.data]);

  const inventoryExportData = inventoryRows.map(item => ({ code: item.code, name: item.name, category: item.category || "بدون تصنيف", unit: item.unit || "—", currentStock: Number(item.currentStock ?? 0), reorderLevel: Number(item.reorderLevel ?? 0), unitPrice: Number(item.unitPrice ?? 0), imageUrl: item.imageUrl }));
  const outboundReturnRows: MovementExportItem[] = buildOutboundReturnRows(filteredDisbursements.map(row => ({ ...row, customerName: customers.data?.find(customer => customer.id === row.customerId)?.name ?? null })), filteredTransfers, items.data ?? [], filteredAdditions, { supplier: defaultSupplierName, customer: defaultCustomerName });
  const movementExportRows: MovementExportItem[] = outboundReturnRows;
  const reportPurposeOptions = useMemo(() => ({
    additions: (reportDataset.data?.purposeOptions.additions ?? []).map(option => ({ ...option, label: option.value })),
    disbursements: (reportDataset.data?.purposeOptions.disbursements ?? []).map(option => ({ ...option, label: formatDisbursementPurpose(option.value) })),
    returns: (reportDataset.data?.purposeOptions.returns ?? []).map(option => ({ ...option, label: option.value })),
  }), [reportDataset.data?.purposeOptions]);
  const returnsReportRows = useMemo(() => outboundReturnRows.filter(row => movementCategory(row.type) === "مرتجع"), [outboundReturnRows]);
  const movementSearchRows = movementExportRows;
  const movementCounts = { all: Number(reportDataset.data?.summary.all.count ?? 0), إضافة: Number(reportDataset.data?.summary.additions.count ?? 0), صرف: Number(reportDataset.data?.summary.disbursements.count ?? 0), مرتجع: Number(reportDataset.data?.summary.returns.count ?? 0) };
  const filteredMovementRows = useMemo(() => filterMovementRows(movementSearchRows, appliedReportFilters.movement), [movementSearchRows, appliedReportFilters.movement]);
  const filteredReturnsRows = useMemo(() => movementSearchRows.filter(row => movementCategory(row.type) === "مرتجع"), [movementSearchRows]);
  const accountSummary = reportDataset.data?.accounts ?? { suppliers: [], customers: [] };
  const unlinkedParties = useMemo(() => buildUnlinkedCustomerParties(filteredDisbursements), [filteredDisbursements]);
  const visibleUnlinkedParties = useMemo(() => { const query = appliedReportFilters.unlinked.trim().toLocaleLowerCase("en-US"); return query ? unlinkedParties.filter(row => row.name.toLocaleLowerCase("en-US").includes(query)) : unlinkedParties; }, [unlinkedParties, appliedReportFilters.unlinked]);
  const activeRows = reportType === "inventory" ? inventoryExportData : reportType === "movements" ? filteredMovementRows : reportType === "returns" ? filteredReturnsRows : []; const reportRowsForPdf = reportType === "inventory" ? inventoryExportData : reportType === "returns" ? filteredReturnsRows : movementSearchRows; const reportQuantityTotal = reportRowsForPdf.reduce((sum, row) => sum + Number((row as { quantity?: unknown; currentStock?: unknown }).quantity ?? (row as { currentStock?: unknown }).currentStock ?? 0), 0); const reportQuantitySummary = reportType === "inventory" ? `إجمالي الرصيد الحالي: ${formatQuantity(reportQuantityTotal)}` : `إجمالي الكمية المطابقة: ${formatQuantity(reportQuantityTotal)}`; const reportPartySummary = reportType === "inventory" ? [] : formatReportPartySummary(appliedReportFilters.incomingFrom, appliedReportFilters.outgoingTo); const reportPdfSummary = [reportQuantitySummary, ...reportPartySummary]; const accountChartData = [...accountSummary.suppliers.slice(0, 8).map(row => ({ name: `مورد: ${row.name}`, الموردون: row.value, العملاء: 0 })), ...accountSummary.customers.slice(0, 8).map(row => ({ name: `عميل: ${row.name}`, الموردون: 0, العملاء: row.value }))];
  const movementLegacyRows = movementRows.map(row => [row.type, row.date, row.eznNum, row.itemCode, formatQuantity(row.quantity), row.detail]);
  const exportReport = () => reportType === "inventory"
    ? void downloadInventoryExcelFile(inventoryExportData)
    : downloadCsv(reportType === "returns" ? "smart-inventory-returns-report.csv" : "smart-inventory-movements-report.csv", ["نوع الحركة", "التاريخ", "رقم الإذن", "كود الصنف", "الكمية", "البيان"], movementLegacyRows);
  const applyReportFilters = () => { setAppliedReportFilters({ from, to, movement: movementFilter, variance: varianceFilter, unlinked: unlinkedSearch, permit: permitSearch, incomingFrom: incomingFromSearch, outgoingTo: outgoingToSearch, additionPurpose: additionPurposeSearch, disbursementPurpose: disbursementPurposeSearch, returnPurpose: returnPurposeSearch }); setReportTypeBeforeSearch(reportType); setSearchResultView(true); setReportType("movements"); };
  const clearReportFilters = () => { setSearchResultView(false); setFrom(""); setTo(today()); setMovementFilter("all"); setVarianceFilter("all"); setUnlinkedSearch(""); setPermitSearch(""); setIncomingFromSearch(""); setOutgoingToSearch(""); setAdditionPurposeSearch(""); setDisbursementPurposeSearch(""); setReturnPurposeSearch(""); setAppliedReportFilters({ from: "", to: today(), movement: "all", variance: "all", unlinked: "", permit: "", incomingFrom: "", outgoingTo: "", additionPurpose: "", disbursementPurpose: "", returnPurpose: "" }); };
  const hasActiveFilters = Boolean(from || movementFilter !== "all" || varianceFilter !== "all" || unlinkedSearch || permitSearch || incomingFromSearch || outgoingToSearch || additionPurposeSearch || disbursementPurposeSearch || returnPurposeSearch || to !== today());
  const reportColumnOptions = reportType === "inventory" ? inventoryExportColumns : exportFormat === "pdf" ? movementPdfExportColumns : movementExportColumns;
  const saveReportColumnOrder = (order: ExportColumnKey[]) => { const currentOrders = preferences.data?.reportColumnOrder ?? {}; updatePreferences.mutate({ quickActions: preferences.data?.quickActions ?? ["/additions", "/disbursements", "/transfers"], hapticEnabled: preferences.data?.hapticEnabled ?? true, reportColumnOrder: { ...currentOrders, [reportColumnPreferenceKey]: order } }); };
  const moveReportColumn = (dragged: ExportColumnKey, target: ExportColumnKey) => { if (dragged === target) return; setSelectedColumns(current => { const next = [...current]; const from = next.indexOf(dragged); const to = next.indexOf(target); if (from < 0 || to < 0) return current; next.splice(from, 1); next.splice(to, 0, dragged); saveReportColumnOrder(next); return next; }); };
  const openExportDialog = (format: ExportFormat) => { setExportFormat(format); const columns = reportType === "inventory" ? inventoryExportColumns : format === "pdf" ? movementPdfExportColumns : movementExportColumns; const saved = preferences.data?.reportColumnOrder?.[`reports:${reportType}:${format}`] ?? []; const normalized = saved.filter(column => columns.includes(column as never)) as ExportColumnKey[]; setSelectedColumns(normalized.length ? normalized : [...columns]); setExportDialogOpen(true); };
  useEffect(() => { const saved = preferences.data?.reportColumnOrder?.[reportColumnPreferenceKey] ?? []; const normalized = saved.filter(column => reportColumnOptions.includes(column as never)) as ExportColumnKey[]; if (normalized.length) setSelectedColumns(normalized); }, [preferences.data, reportColumnPreferenceKey]);
  const previewColumns = selectedColumns;
  const previewRows = activeRows.slice(0, 40);
  const previewCell = (row: Record<string, unknown>, column: ExportColumnKey) => { const value = row[column]; if (column === "date") return formatInventoryDate(value); if (column === "image" || column === "documentImage") { const imageUrl = column === "image" ? row.imageUrl : row.documentImageUrl; return imageUrl ? <img src={String(imageUrl)} alt={column === "image" ? "صورة الصنف" : "صورة الإذن"} className="mx-auto h-16 w-24 rounded-lg border border-[#dce7ee] bg-[#f7fbfc] p-1 object-contain" loading="lazy" /> : "—"; } if (column === "detail") return `${row.isNegativeCorrection ? "تصحيح سالب — " : ""}${String(value ?? "—")}`; if (typeof value === "number") return formatQuantity(value); return String(value ?? "—"); };
  const isQuantityColumn = (column: ExportColumnKey) => ["quantity", "openingStock", "initialStock", "addition", "returned", "disbursement", "runningStock", "currentStock", "totalQuantity"].includes(column);
  const downloadSelectedReport = async () => {
    if (pdfBusy) return;
    saveReportColumnOrder(selectedColumns);
    beginPdfTask("download");
    setPdfProgressStage(12);
    try {
      setPdfProgressStage(35);
      if (reportType === "variance") {
        if (exportFormat === "excel") await downloadStockVarianceExcel(filteredVarianceRows);
        else await downloadStockVariancePdf(filteredVarianceRows, { logo: logoDataUrl || companyLogoUrl, title: "تقرير فروق المخزون - Smart Inventory", watermarkOpacity, watermarkScale, watermarkPosition, watermarkRepeat, watermarkEnabled });
      } else {
        const request = createReportExportRequest(reportType, exportFormat, selectedColumns, logoDataUrl || companyLogoUrl);
        const rowsForExport = reportType === "returns" ? filteredReturnsRows : movementSearchRows;
        if (request.reportType === "inventory") {
          if (request.format === "excel") await downloadInventoryExcelFile(inventoryExportData, request.options);
          else await downloadInventoryPdfFile(inventoryExportData, { ...request.options, summary: reportPdfSummary, watermarkEnabled });
        } else if (request.format === "excel") {
          await downloadMovementExcel(rowsForExport, request.options);
        } else {
          await downloadMovementPdf(rowsForExport, { ...request.options, title: reportType === "returns" ? "تقرير حركات المرتجعات - Smart Inventory" : "تقرير حركات المخزون - Smart Inventory", summary: reportPdfSummary, watermarkEnabled });
        }
      }
      setPdfProgressStage(100);
      setPreviewOpen(false);
      toast.success(`تم تنزيل ملف ${exportFormat === "excel" ? "Excel" : "PDF"} بنجاح`);
    } catch (error: any) {
      toast.error(error?.message || "تعذر إنشاء أو تنزيل التقرير");
    } finally {
      finishPdfTask();
    }
  };
  const openVariancePreview = async () => { if (pdfBusy) return; setExportFormat("pdf"); setPreviewOpen(true); setPdfPreviewLoading(true); beginPdfTask("preview"); setPdfProgressStage(12); try { setPdfProgressStage(45); const doc = await buildStockVariancePdf(filteredVarianceRows, { logo: logoDataUrl || companyLogoUrl, title: "تقرير فروق المخزون - Smart Inventory", watermarkOpacity, watermarkScale, watermarkPosition, watermarkRepeat, watermarkEnabled }); setPdfProgressStage(88); const blob = doc.output("blob"); const nextUrl = URL.createObjectURL(blob); setPdfPage(1); setPdfPageCount(doc.getNumberOfPages()); setPdfZoom(1); setPdfPreviewUrl(current => { if (current) URL.revokeObjectURL(current); return nextUrl; }); setPdfProgressStage(100); } catch { toast.error("تعذر تجهيز معاينة تقرير الفروق"); } finally { setPdfPreviewLoading(false); finishPdfTask(); } };
  const openPreview = async () => { saveReportColumnOrder(selectedColumns); setExportDialogOpen(false); setPreviewOpen(true); if (exportFormat !== "pdf" || pdfBusy) return; setPdfPreviewLoading(true); beginPdfTask("preview"); setPdfProgressStage(12); try { setPdfProgressStage(45); const options = { columns: selectedColumns, logo: logoDataUrl || companyLogoUrl, date: new Date(), title: reportType === "returns" ? "تقرير حركات المرتجعات - Smart Inventory" : "تقرير حركات المخزون - Smart Inventory", summary: reportPdfSummary, watermarkOpacity, watermarkScale, watermarkPosition, watermarkRepeat, watermarkEnabled }; const doc = reportType === "inventory" ? await buildInventoryPdf(inventoryExportData, options) : await buildMovementPdf(reportType === "returns" ? filteredReturnsRows : movementSearchRows, options); setPdfProgressStage(88); const blob = doc.output("blob"); const nextUrl = URL.createObjectURL(blob); setPdfPage(1); setPdfPageCount(doc.getNumberOfPages()); setPdfZoom(1); setPdfPreviewUrl(current => { if (current) URL.revokeObjectURL(current); return nextUrl; }); setPdfProgressStage(100); } catch { toast.error("تعذر تجهيز معاينة PDF"); } finally { setPdfPreviewLoading(false); finishPdfTask(); } };
  useEffect(() => () => { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); }, [pdfPreviewUrl]);
  const closePreview = () => { setPreviewOpen(false); setPdfPage(1); setPdfPageCount(1); setPdfZoom(1); setPdfPreviewUrl(current => { if (current) URL.revokeObjectURL(current); return null; }); };
  const openPdfPreviewExternally = () => { if (!pdfPreviewUrl) return; const opened = window.open(`${pdfPreviewUrl}#page=${pdfPage}`, "_blank", "noopener,noreferrer"); if (!opened) toast.error("تعذر فتح المعاينة الخارجية؛ اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى"); else opened.focus(); };
  const openVariancePdfExternally = async () => { if (!filteredVarianceRows.length) return; try { const doc = await buildStockVariancePdf(filteredVarianceRows, { logo: logoDataUrl || companyLogoUrl, title: "تقرير فروق المخزون - Smart Inventory", watermarkOpacity, watermarkScale, watermarkPosition, watermarkRepeat, watermarkEnabled }); const opened = window.open(URL.createObjectURL(doc.output("blob")), "_blank", "noopener,noreferrer"); if (!opened) toast.error("تعذر فتح المعاينة الخارجية؛ اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى"); } catch (error: any) { toast.error(error?.message || "تعذر تجهيز معاينة تقرير الفروق"); } };
  const printPdfPreview = () => { if (!pdfPreviewUrl) return; const popup = window.open(`${pdfPreviewUrl}#page=${pdfPage}`, "_blank", "noopener,noreferrer"); if (!popup) { toast.error("تعذر فتح نافذة الطباعة؛ اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى"); return; } popup.focus(); window.setTimeout(() => popup.print(), 700); };
  const sharePdfPreview = async () => { if (!pdfPreviewUrl || pdfShareLoading) return; const title = reportType === "returns" ? "تقرير حركات المرتجعات" : reportType === "inventory" ? "تقرير المخزون" : reportType === "variance" ? "تقرير فروق المخزون" : "تقرير حركات المخزون"; const fileName = `smart-inventory-${reportType}-report.pdf`; setPdfShareLoading(true); try { const result = await sharePdfFile(pdfPreviewUrl, title, fileName); const channel = result === "shared" ? "native" : result === "cancelled" ? "native" : (window.confirm("المتصفح لا يدعم مشاركة الملف مباشرة. اضغط موافق لفتح واتساب، أو إلغاء لفتح البريد الإلكتروني.") ? "whatsapp" : "email"); if (result === "shared") toast.success("تم فتح خيارات مشاركة ملف PDF"); else if (result === "cancelled") toast.info("تم إلغاء المشاركة"); else window.open(channel === "whatsapp" ? createReportWhatsAppUrl(title, fileName) : createReportMailtoUrl(title, fileName), "_blank", "noopener,noreferrer"); void recordShare.mutateAsync({ fileType: "pdf", reportTitle: title, fileName, channel, status: result }); } catch (error: any) { void recordShare.mutateAsync({ fileType: "pdf", reportTitle: "تقرير PDF", fileName: `smart-inventory-${reportType}-report.pdf`, channel: "native", status: "failed" }); toast.error(error?.message || "تعذر تجهيز ملف PDF للمشاركة"); } finally { setPdfShareLoading(false); } };
  const shareExcelReport = async () => { if (excelShareLoading) return; const title = reportType === "inventory" ? "تقرير المخزون" : reportType === "returns" ? "تقرير حركات المرتجعات" : "تقرير حركات المخزون"; const fileName = reportType === "inventory" ? "smart-inventory-stock.xlsx" : "smart-inventory-disbursements-returns.xlsx"; setExcelShareLoading(true); let shareUrl: string | null = null; try { const rowsForExport = reportType === "inventory" ? inventoryExportData : reportType === "returns" ? filteredReturnsRows : movementSearchRows; const blob = await buildExcelFileBlob(rowsForExport, reportType === "inventory" ? "inventory" : "movements", { columns: selectedColumns }); shareUrl = URL.createObjectURL(blob); const result = await shareExcelFile(shareUrl, title, fileName); const channel = result === "shared" || result === "cancelled" ? "native" : (window.confirm("المتصفح لا يدعم مشاركة ملف Excel مباشرة. اضغط موافق لفتح واتساب، أو إلغاء لفتح البريد الإلكتروني.") ? "whatsapp" : "email"); if (result === "shared") toast.success("تم فتح خيارات مشاركة ملف Excel"); else if (result === "cancelled") toast.info("تم إلغاء المشاركة"); else window.open(channel === "whatsapp" ? createReportWhatsAppUrl(title, fileName) : createReportMailtoUrl(title, fileName), "_blank", "noopener,noreferrer"); void recordShare.mutateAsync({ fileType: "excel", reportTitle: title, fileName, channel, status: result }); } catch (error: any) { void recordShare.mutateAsync({ fileType: "excel", reportTitle: title, fileName, channel: "native", status: "failed" }); toast.error(error?.message || "تعذر تجهيز ملف Excel للمشاركة"); } finally { if (shareUrl) URL.revokeObjectURL(shareUrl); setExcelShareLoading(false); } };
  const chooseLogo = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return toast.error("اختر صورة صالحة بحد أقصى 5 ميجابايت"); try { const dataBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }); await uploadLogo.mutateAsync({ fileName: file.name, contentType: file.type as "image/jpeg" | "image/png" | "image/webp", dataBase64 }); setLogoDataUrl(dataBase64); await settings.refetch(); toast.success("تم رفع شعار الشركة"); } catch (error: any) { toast.error(error?.message || "تعذر رفع الشعار"); } };
  const statCards = [
    { label: "الرصيد الحالي", value: formatQuantity(totalCurrent), hint: "إجمالي الكميات الظاهرة", Icon: PackageCheck, tone: "text-[#0d806c] bg-[#e7f5ef]" },
    { label: "أصناف تحت التنبيه", value: String(lowStockCount), hint: `عند نسبة ${formatQuantity(summary.data?.thresholdPercentage ?? 20)}%`, Icon: TrendingDown, tone: "text-[#bd5147] bg-[#fbeceb]" },
    { label: "إجمالي الوارد", value: formatQuantity(totalIncoming), hint: `${filteredAdditions.length} إذن إضافة`, Icon: BarChart3, tone: "text-[#0d4f62] bg-[#e8f1f2]" },
    { label: "إجمالي المنصرف", value: formatQuantity(totalOutgoing), hint: `${filteredDisbursements.length} إذن صرف`, Icon: FileText, tone: "text-[#a66a16] bg-[#fff4dd]" },
  ] as const;

  return <DashboardLayout><div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-7">
    <OfflineDataNotice resource="التقارير" hasCachedData={Boolean(reportDataset.data || items.data || summary.data)} />
    <PageHeader from={from} to={to} onRefresh={() => { void Promise.all([utils.items.list.invalidate(), utils.reports.dataset.invalidate(), utils.dashboard.summary.invalidate()]); }} refreshing={refreshing} />
    <Card className="rounded-[1.75rem] border-[#dce7ee] bg-white shadow-[0_18px_50px_rgba(18,44,84,0.06)]"><CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-sm font-black text-[#102a43]">نطاق التقرير</p><p className="mt-1 text-xs text-slate-400">اختر فترة محددة لتصفية الحركات والأرصدة المعروضة.</p></div>
      <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-xl"><label className="space-y-2 text-xs font-bold text-slate-500">من تاريخ<Input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 rounded-xl" /></label><label className="space-y-2 text-xs font-bold text-slate-500">إلى تاريخ<Input type="date" value={to} onChange={event => setTo(event.target.value)} className="mt-1 rounded-xl" /></label><label className="space-y-2 text-xs font-bold text-slate-500 sm:col-span-2"><span className="flex items-center gap-1"><Search className="h-3.5 w-3.5" />رقم الإذن</span><div className="flex items-center gap-2"><Input value={permitSearch} onChange={event => setPermitSearch(event.target.value)} placeholder="اكتب رقم الإذن للبحث" className="mt-1 rounded-xl" /><VoiceInputButton onText={text => setPermitSearch(normalizeVoiceSearchText(text))} label="البحث الصوتي برقم الإذن" /></div></label><label className="space-y-2 text-xs font-bold text-slate-500"><span>وارد من</span><div className="flex items-center gap-2"><Input value={incomingFromSearch} onChange={event => setIncomingFromSearch(event.target.value)} placeholder="اسم المورد أو الجهة" className="mt-1 rounded-xl" /><VoiceInputButton onText={text => setIncomingFromSearch(normalizeVoiceSearchText(text))} label="البحث الصوتي باسم المورد أو الجهة" /></div></label><label className="space-y-2 text-xs font-bold text-slate-500"><span>منصرف إلى</span><div className="flex items-center gap-2"><Input value={outgoingToSearch} onChange={event => setOutgoingToSearch(event.target.value)} placeholder="اسم العميل أو الجهة" className="mt-1 rounded-xl" /><VoiceInputButton onText={text => setOutgoingToSearch(normalizeVoiceSearchText(text))} label="البحث الصوتي باسم العميل أو الجهة" /></div></label><label className="space-y-2 text-xs font-bold text-slate-500"><span>لِزوم الإضافة</span><select value={additionPurposeSearch} onChange={event => setAdditionPurposeSearch(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[#dce7ee] bg-white px-3 font-bold text-[#102a43]"><option value="">كل القيم</option>{reportPurposeOptions.additions.map(option => <option key={option.value} value={option.value}>{`${option.label} (${option.count})`}</option>)}</select></label><label className="space-y-2 text-xs font-bold text-slate-500"><span>لِزوم الصرف</span><select value={disbursementPurposeSearch} onChange={event => setDisbursementPurposeSearch(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[#dce7ee] bg-white px-3 font-bold text-[#102a43]"><option value="">كل القيم</option>{reportPurposeOptions.disbursements.map(option => <option key={option.value} value={option.value}>{`${option.label} (${option.count})`}</option>)}</select></label><label className="space-y-2 text-xs font-bold text-slate-500"><span>لِزوم الارتجاع</span><select value={returnPurposeSearch} onChange={event => setReturnPurposeSearch(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[#dce7ee] bg-white px-3 font-bold text-[#102a43]"><option value="">كل القيم</option>{reportPurposeOptions.returns.map(option => <option key={option.value} value={option.value}>{`${option.label} (${option.count})`}</option>)}</select></label><label className="space-y-2 text-xs font-bold text-slate-500 sm:col-span-2">نوع الحركة<select value={movementFilter} onChange={event => setMovementFilter(event.target.value as MovementFilter)} className="mt-1 h-10 w-full rounded-xl border border-[#dce7ee] bg-white px-3 font-bold text-[#102a43]"><option value="all">كل الحركات ({movementCounts.all})</option><option value="إضافة">إضافة ({movementCounts.إضافة})</option><option value="صرف">صرف ({movementCounts.صرف})</option><option value="مرتجع">مرتجع ({movementCounts.مرتجع})</option></select></label><label className="space-y-2 text-xs font-bold text-slate-500 sm:col-span-2">حالة الفرق<select value={varianceFilter} onChange={event => setVarianceFilter(event.target.value as VarianceFilter)} className="mt-1 h-10 w-full rounded-xl border border-[#dce7ee] bg-white px-3 font-bold text-[#102a43]"><option value="all">كل الحالات ({varianceSummary.total})</option><option value="متطابق">متطابق ({varianceSummary.matched})</option><option value="فرق موجب">فرق موجب ({varianceSummary.positive})</option><option value="فرق سالب">فرق سالب ({varianceSummary.negative})</option></select></label><Button type="button" onClick={applyReportFilters} className="rounded-xl bg-[#0d806c] px-5 font-black text-white shadow-md shadow-[#0d806c]/20 hover:bg-[#096b5a]"><Search className="ml-2 h-4 w-4" />بحث</Button><Button type="button" variant="outline" onClick={clearReportFilters} disabled={!hasActiveFilters} className="h-10 rounded-xl border-2 border-[#0d4f62] bg-white font-black text-[#0d4f62] hover:bg-[#e8f1f2] disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 sm:col-span-2"><RefreshCcw className="ml-2 h-4 w-4" />مسح جميع الفلاتر</Button></div>
    </CardContent></Card>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {statCards.map(({ label, value, hint, Icon, tone }) => <Card key={label} className="rounded-[1.5rem] border-[#e4edf1] bg-white shadow-[0_16px_40px_rgba(18,44,84,0.05)]"><CardContent className="flex items-center justify-between p-5"><div><p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-[#102a43]">{value}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{hint}</p></div><div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}><Icon className="h-5 w-5" /></div></CardContent></Card>)}
    </div>

    <Card className="overflow-hidden rounded-[1.75rem] border-[#dce7ee] bg-white shadow-[0_18px_50px_rgba(18,44,84,0.06)]"><div className="flex flex-col gap-4 border-b border-[#e7eef3] p-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-lg font-black text-[#102a43]">{searchResultView ? "نتائج البحث في التقارير" : "مخرجات التقرير"}</p><p className="mt-1 text-xs text-slate-400">{searchResultView ? `${filteredMovementRows.length} نتيجة مطابقة للفلاتر المطبقة` : reportType === "inventory" ? `${inventoryRows.length} صنفاً في النطاق المحدد` : reportType === "variance" ? `${filteredVarianceRows.length} صنفاً في تقرير الفروق` : reportType === "accounts" ? `${accountSummary.suppliers.length} مورد و${accountSummary.customers.length} عميل في النطاق المحدد` : reportType === "returns" ? `${filteredReturnsRows.length} حركة مرتجع مطابقة للفلاتر` : reportType === "unlinked" ? `${visibleUnlinkedParties.length} جهة غير مرتبطة في النطاق المحدد` : `${filteredMovementRows.length} حركة مخزون في النطاق المحدد`}</p></div><div className="flex flex-wrap gap-2"><Button variant={reportType === "overview" ? "default" : "outline"} onClick={() => setReportType("overview")} className={`rounded-xl font-bold ${reportType === "overview" ? "bg-[#0d4f62] text-white hover:bg-[#0a4150]" : "border-[#dce7ee] text-[#0d4f62]"}`}>نظرة تشغيلية</Button><Button variant={reportType === "inventory" ? "default" : "outline"} onClick={() => setReportType("inventory")} className={`rounded-xl font-bold ${reportType === "inventory" ? "bg-[#0d4f62] text-white hover:bg-[#0a4150]" : "border-[#dce7ee] text-[#0d4f62]"}`}>أرصدة الأصناف</Button><Button variant={reportType === "movements" ? "default" : "outline"} onClick={() => setReportType("movements")} className={`rounded-xl font-bold ${reportType === "movements" ? "bg-[#0d4f62] text-white hover:bg-[#0a4150]" : "border-[#dce7ee] text-[#0d4f62]"}`}>حركات المخزون</Button><Button variant={reportType === "returns" ? "default" : "outline"} onClick={() => setReportType("returns")} className={`rounded-xl font-bold ${reportType === "returns" ? "bg-[#0d4f62] text-white hover:bg-[#0a4150]" : "border-[#dce7ee] text-[#0d4f62]"}`}>تقرير المرتجعات</Button><Button variant={reportType === "variance" ? "default" : "outline"} onClick={() => setReportType("variance")} className={`rounded-xl font-bold ${reportType === "variance" ? "bg-[#0d4f62] text-white hover:bg-[#0a4150]" : "border-[#dce7ee] text-[#0d4f62]"}`}>فروق المخزون</Button><Button variant={reportType === "accounts" ? "default" : "outline"} onClick={() => setReportType("accounts")} className={`rounded-xl font-bold ${reportType === "accounts" ? "bg-[#0d4f62] text-white hover:bg-[#0a4150]" : "border-[#dce7ee] text-[#0d4f62]"}`}>إجمالي الجهات</Button><Button variant={reportType === "unlinked" ? "default" : "outline"} onClick={() => setReportType("unlinked")} className={`rounded-xl font-bold ${reportType === "unlinked" ? "bg-[#0d4f62] text-white hover:bg-[#0a4150]" : "border-[#dce7ee] text-[#0d4f62]"}`}>جهات غير مرتبطة</Button>{reportType === "accounts" ? <><Button variant="outline" onClick={() => void downloadAccountExcel(accountSummary, from, to)} disabled={!accountChartData.length} className="rounded-xl border-[#b9d4d9] font-bold text-[#0d4f62]"><Download className="ml-2 h-4 w-4" />Excel الجهات</Button><Button variant="outline" onClick={() => void previewAccountPdfExternally(accountSummary)} disabled={!accountChartData.length} className="rounded-xl border-[#0d4f62] font-bold text-[#0d4f62]"><Eye className="ml-2 h-4 w-4" />معاينة خارجية</Button><Button variant="outline" onClick={() => void downloadAccountPdf(accountSummary, from, to)} disabled={!accountChartData.length} className="rounded-xl border-[#b9d4d9] font-bold text-[#0d4f62]"><Printer className="ml-2 h-4 w-4" />PDF الجهات</Button></> : reportType === "unlinked" ? <><Button variant="outline" onClick={() => void downloadUnlinkedPartiesExcel(visibleUnlinkedParties, from, to)} disabled={!visibleUnlinkedParties.length} className="rounded-xl border-[#b9d4d9] font-bold text-[#0d4f62]"><Download className="ml-2 h-4 w-4" />Excel غير المرتبط</Button><Button variant="outline" onClick={() => void previewUnlinkedPartiesPdfExternally(visibleUnlinkedParties)} disabled={!visibleUnlinkedParties.length} className="rounded-xl border-[#0d4f62] font-bold text-[#0d4f62]"><Eye className="ml-2 h-4 w-4" />معاينة خارجية</Button><Button variant="outline" onClick={() => void downloadUnlinkedPartiesPdf(visibleUnlinkedParties, from, to)} disabled={!visibleUnlinkedParties.length} className="rounded-xl border-[#b9d4d9] font-bold text-[#0d4f62]"><Printer className="ml-2 h-4 w-4" />PDF غير المرتبط</Button></> : reportType === "variance" ? <><Button variant="outline" onClick={() => void downloadStockVarianceExcel(filteredVarianceRows)} disabled={!filteredVarianceRows.length} className="rounded-xl border-[#b9d4d9] font-bold text-[#0d4f62]"><Download className="ml-2 h-4 w-4" />Excel الفروق</Button><Button variant="outline" onClick={() => void openVariancePreview()} disabled={!filteredVarianceRows.length} className="rounded-xl border-[#b9d4d9] font-bold text-[#0d4f62]"><Eye className="ml-2 h-4 w-4" />معاينة الفروق</Button><Button variant="outline" onClick={() => void openVariancePdfExternally()} disabled={!filteredVarianceRows.length} className="rounded-xl border-[#0d4f62] font-bold text-[#0d4f62]"><Eye className="ml-2 h-4 w-4" />معاينة خارجية</Button><Button variant="outline" onClick={() => void downloadStockVariancePdf(filteredVarianceRows, { logo: logoDataUrl || companyLogoUrl, title: "تقرير فروق المخزون - Smart Inventory", watermarkOpacity, watermarkScale, watermarkPosition, watermarkRepeat, watermarkEnabled })} disabled={!filteredVarianceRows.length} className="rounded-xl border-[#b9d4d9] font-bold text-[#0d4f62]"><Printer className="ml-2 h-4 w-4" />PDF الفروق</Button></> : <><Button variant="outline" onClick={() => openExportDialog("excel")} disabled={!activeRows.length} className="rounded-xl border-[#b9d4d9] font-bold text-[#0d4f62]"><Download className="ml-2 h-4 w-4" />{reportType === "inventory" ? "Excel المخزون" : "تصدير Excel"}</Button><Button variant="outline" onClick={() => openExportDialog("pdf")} disabled={!activeRows.length} className="rounded-xl border-[#b9d4d9] font-bold text-[#0d4f62]"><Printer className="ml-2 h-4 w-4" />{reportType === "inventory" ? "PDF المخزون" : "تقرير PDF"}</Button></>}{searchResultView ? <Button type="button" variant="outline" onClick={() => { setSearchResultView(false); setReportType(reportTypeBeforeSearch); }} className="rounded-xl border-2 border-[#0d4f62] bg-white font-black text-[#0d4f62] hover:bg-[#e8f1f2]"><ChevronRight className="ml-2 h-4 w-4" />رجوع إلى التقرير الأساسي</Button> : null}</div></div>

      {reportType === "overview" ? <CardContent className="grid gap-5 p-5 lg:grid-cols-[1.1fr_0.9fr]"><div className="rounded-2xl bg-[#f7fbfc] p-5"><div className="mb-5 flex items-center justify-between"><div><p className="text-sm font-black text-[#102a43]">قراءة سريعة للحالة</p><p className="mt-1 text-xs text-slate-400">مقارنة الوارد والمنصرف في الفترة المحددة.</p></div><BarChart3 className="h-5 w-5 text-[#0d4f62]" /></div><div className="space-y-4"><div><div className="mb-2 flex justify-between text-xs font-bold"><span className="text-slate-500">الوارد</span><span className="text-[#0d806c]">{formatQuantity(totalIncoming)}</span></div><div className="h-3 overflow-hidden rounded-full bg-[#dfecef]"><div className="h-full rounded-full bg-[#0d806c]" style={{ width: `${Math.min(100, totalIncoming ? 100 : 0)}%` }} /></div></div><div><div className="mb-2 flex justify-between text-xs font-bold"><span className="text-slate-500">المنصرف</span><span className="text-[#bd5147]">{formatQuantity(totalOutgoing)}</span></div><div className="h-3 overflow-hidden rounded-full bg-[#f1dfdd]"><div className="h-full rounded-full bg-[#bd5147]" style={{ width: `${totalIncoming ? Math.min(100, totalOutgoing / totalIncoming * 100) : totalOutgoing ? 100 : 0}%` }} /></div></div></div></div><div className="rounded-2xl bg-[#102a43] p-5 text-white"><p className="text-sm font-black">قرار تشغيلي مقترح</p><p className="mt-3 text-sm leading-7 text-slate-300">{lowStockCount ? `يوجد ${lowStockCount} صنف تحت نسبة التنبيه الحالية. راجع شاشة التنبيهات قبل إنشاء طلبات شراء جديدة.` : "لا توجد أصناف تحت نسبة التنبيه الحالية ضمن الفترة المحددة."}</p><div className="mt-5 flex items-center gap-2 text-xs font-bold text-[#c9e8df]"><span className="h-2 w-2 rounded-full bg-[#0d806c]" />نسبة التنبيه الحالية: {formatQuantity(summary.data?.thresholdPercentage ?? 20)}%</div></div></CardContent> : reportType === "inventory" ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-right text-sm"><thead className="bg-[#f7fbfc] text-xs font-black text-slate-400"><tr><th className="px-5 py-4">صورة الصنف</th><th className="px-5 py-4">الكود</th><th className="px-5 py-4">اسم الصنف</th><th className="px-5 py-4">التصنيف</th><th className="px-5 py-4">الوحدة</th><th className="px-5 py-4">الرصيد الحالي</th><th className="px-5 py-4">حد الطلب</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{inventoryRows.slice(0, 250).map(item => { const low = Number(item.reorderLevel) > 0 ? Number(item.currentStock) <= Number(item.reorderLevel) * Number(summary.data?.thresholdPercentage ?? 20) / 100 : Number(item.currentStock) <= 0; return <tr key={item.id} className="align-middle hover:bg-[#fbfdff]"><td className="px-5 py-3"><div className="flex min-h-20 w-24 items-center justify-center overflow-hidden rounded-lg border border-[#dce7ee] bg-[#f7fbfc] p-1">{item.imageUrl ? <img src={item.imageUrl} alt={`صورة ${item.name}`} className="max-h-20 max-w-full object-contain" loading="lazy" /> : <ImageIcon className="h-6 w-6 text-slate-300" />}</div></td><td className="px-5 py-4 font-mono text-xs text-slate-500">{item.code}</td><td className="px-5 py-4 font-black text-[#102a43]">{item.name}</td><td className="px-5 py-4 text-slate-500">{item.category || "بدون تصنيف"}</td><td className="px-5 py-4 text-slate-500">{item.unit || "—"}</td><td className={`quantity-emphasis px-5 py-4 font-black ${low ? "text-[#bd5147]" : "text-[#0d806c]"}`}>{formatQuantity(item.currentStock)}</td><td className="px-5 py-4 text-slate-500">{formatQuantity(item.reorderLevel)}</td></tr>; })}</tbody></table>{inventoryRows.length > 250 ? <p className="border-t border-[#eef3f5] px-5 py-3 text-xs text-slate-400">تظهر أول 250 صفاً في الشاشة، بينما يشمل التصدير جميع الصفوف.</p> : null}</div> : reportType === "returns" ? <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-right text-sm"><thead className="bg-[#f7fbfc] text-xs font-black text-slate-400"><tr><th className="px-5 py-4">صورة الإذن</th><th className="px-5 py-4">التاريخ</th><th className="px-5 py-4">رقم الإذن</th><th className="px-5 py-4">الصنف والكود</th><th className="px-5 py-4">الكمية</th><th className="px-5 py-4">سعر الوحدة</th><th className="px-5 py-4">الإجمالي</th><th className="px-5 py-4">البيان</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{filteredReturnsRows.slice(0, 250).map(row => <tr key={`return-${row.id}`} className="hover:bg-[#fbfdff]"><td className="px-5 py-3">{row.documentImageUrl ? <img src={row.documentImageUrl} alt={`صورة إذن ${row.eznNum}`} className="h-16 w-20 rounded-lg border border-[#dce7ee] object-cover" loading="lazy" /> : <span className="text-xs text-slate-300">غير مرفق</span>}</td><td className="px-5 py-4 whitespace-nowrap text-slate-500">{formatInventoryDate(row.date)}</td><td className="px-5 py-4 font-mono text-xs text-[#0d4f62]">{row.eznNum}</td><td className="px-5 py-4"><p className="font-black text-[#102a43]">{row.detail.split(" — ")[0]}</p><p className="mt-1 font-mono text-xs text-slate-400">{row.itemCode}</p></td><td className="quantity-emphasis px-5 py-4 font-black text-[#0d806c]">{formatQuantity(row.quantity)}</td><td className="px-5 py-4">{formatQuantity(row.unitPrice)} ج.م</td><td className="px-5 py-4 font-black text-[#0d4f62]">{formatQuantity(row.totalValue)} ج.م</td><td className="px-5 py-4 text-slate-500"><div className="flex flex-wrap items-center gap-2"><span>{row.detail}</span>{row.isNegativeCorrection ? <Badge className="rounded-full border border-amber-200 bg-amber-50 text-[10px] font-black text-amber-700">تصحيح سالب</Badge> : null}</div></td></tr>)}</tbody></table>{filteredReturnsRows.length > 250 ? <p className="border-t border-[#eef3f5] px-5 py-3 text-xs text-slate-400">تظهر أول 250 حركة، بينما يشمل التصدير جميع المرتجعات.</p> : null}</div> : reportType === "variance" ? <div className="space-y-5 p-5"><div className="grid gap-3 sm:grid-cols-4"><div className="rounded-2xl border border-[#dce7ee] bg-[#f7fbfc] p-4"><p className="text-xs font-bold text-slate-400">إجمالي الأصناف</p><p className="mt-2 text-2xl font-black text-[#102a43]">{varianceSummary.total}</p></div><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-xs font-bold text-emerald-700">متطابق</p><p className="mt-2 text-2xl font-black text-emerald-800">{varianceSummary.matched}</p></div><div className="rounded-2xl border border-amber-100 bg-amber-50 p-4"><p className="text-xs font-bold text-amber-700">فرق موجب</p><p className="mt-2 text-2xl font-black text-amber-800">{varianceSummary.positive}</p></div><div className="rounded-2xl border border-red-100 bg-red-50 p-4"><p className="text-xs font-bold text-red-700">فرق سالب</p><p className="mt-2 text-2xl font-black text-red-800">{varianceSummary.negative}</p></div></div><div className="rounded-2xl border border-[#dce7ee] bg-[#f7fbfc] p-4 text-sm leading-7 text-slate-600">الصافي = الرصيد الأولي + الإضافات + المرتجعات − الصرف. يعرض التقرير الفرق بين الصافي والرصيد المسجل لتسهيل المراجعة الدورية.</div><div className="overflow-x-auto rounded-2xl border border-[#e5eef1]"><table className="w-full min-w-[1250px] text-right text-sm"><thead className="bg-[#f7fbfc] text-xs font-black text-slate-400"><tr><th className="px-4 py-3">الكود</th><th className="px-4 py-3">الصنف</th><th className="px-4 py-3">الرصيد الأولي</th><th className="px-4 py-3">الإضافات</th><th className="px-4 py-3">الصرف</th><th className="px-4 py-3">المرتجعات</th><th className="px-4 py-3">الصافي</th><th className="px-4 py-3">الرصيد المسجل</th><th className="px-4 py-3">الرصيد المتوقع</th><th className="px-4 py-3">الفرق</th><th className="px-4 py-3">الحالة</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{filteredVarianceRows.slice(0, 250).map(row => <tr key={`variance-${row.code}`} onClick={() => setSelectedVarianceCode(row.code)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedVarianceCode(row.code); } }} tabIndex={0} role="button" aria-label={`عرض تفاصيل حركات ${row.name}`} className="cursor-pointer hover:bg-[#eef8f7] focus:bg-[#eef8f7] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#0d7180]"><td className="px-4 py-3 font-mono text-xs text-slate-500">{row.code}</td><td className="px-4 py-3 font-black text-[#102a43]">{row.name}</td><td className="px-4 py-3">{formatQuantity(row.initialStock)}</td><td className="px-4 py-3 text-[#0d806c]">{formatQuantity(row.additions)}</td><td className="px-4 py-3 text-[#bd5147]">{formatQuantity(row.disbursements)}</td><td className="px-4 py-3 text-[#a66a16]">{formatQuantity(row.returns)}</td><td className="px-4 py-3 font-black text-[#0d4f62]">{formatQuantity(row.net)}</td><td className="px-4 py-3 font-black">{formatQuantity(row.recordedStock)}</td><td className="px-4 py-3">{formatQuantity(row.expectedStock)}</td><td className={`px-4 py-3 font-black ${row.status === "متطابق" ? "text-emerald-700" : row.status === "فرق موجب" ? "text-amber-700" : "text-red-700"}`}>{formatQuantity(row.variance)}</td><td className="px-4 py-3"><Badge className={row.status === "متطابق" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : row.status === "فرق موجب" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-red-200 bg-red-50 text-red-700"}>{row.status}</Badge></td></tr>)}</tbody></table>{filteredVarianceRows.length > 250 ? <p className="border-t border-[#eef3f5] px-5 py-3 text-xs text-slate-400">تظهر أول 250 صنفاً، بينما يشمل التصدير جميع النتائج.</p> : null}</div></div> : reportType === "accounts" ? <div className="space-y-5 p-5"><div className="h-80 w-full rounded-2xl border border-[#e5eef1] bg-[#fbfdff] p-4"><h3 className="mb-3 font-black text-[#102a43]">مقارنة قيم الحركات حسب الجهة</h3><ResponsiveContainer width="100%" height="90%"><BarChart data={accountChartData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke="#e5eef1" /><XAxis type="number" tickFormatter={value => formatQuantity(value)} /><YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} /><Tooltip formatter={(value: number) => `${formatQuantity(value)} ج.م`} /><Legend /><Bar dataKey="الموردون" fill="#0d806c" radius={[0, 5, 5, 0]} /><Bar dataKey="العملاء" fill="#bd5147" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></div><div className="grid gap-5 lg:grid-cols-2"><div className="overflow-x-auto rounded-2xl border border-[#e5eef1]"><div className="border-b bg-[#f7fbfc] px-5 py-4"><h3 className="font-black text-[#102a43]">إجمالي حركات الموردين</h3><p className="mt-1 text-xs text-slate-400">إضافات المخزون خلال الفترة المحددة</p></div><table className="w-full min-w-[520px] text-right text-sm"><thead className="bg-white text-xs font-black text-slate-400"><tr><th className="px-4 py-3">المورد</th><th className="px-4 py-3">عدد الحركات</th><th className="px-4 py-3">الكمية</th><th className="px-4 py-3">القيمة</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{accountSummary.suppliers.map(row => <tr key={row.name}><td className="px-4 py-3 font-bold text-[#102a43]">{row.name}</td><td className="px-4 py-3 text-slate-500">{row.movements}</td><td className="px-4 py-3">{formatQuantity(row.quantity)}</td><td className="px-4 py-3 font-bold text-[#0d4f62]">{formatQuantity(row.value)} ج.م</td></tr>)}</tbody></table>{!accountSummary.suppliers.length && <p className="p-6 text-center text-sm text-slate-400">لا توجد إضافات ضمن الفترة.</p>}</div><div className="overflow-x-auto rounded-2xl border border-[#e5eef1]"><div className="border-b bg-[#f7fbfc] px-5 py-4"><h3 className="font-black text-[#102a43]">إجمالي حركات العملاء والجهات</h3><p className="mt-1 text-xs text-slate-400">أذونات الصرف خلال الفترة المحددة</p></div><table className="w-full min-w-[520px] text-right text-sm"><thead className="bg-white text-xs font-black text-slate-400"><tr><th className="px-4 py-3">العميل / الجهة</th><th className="px-4 py-3">عدد الحركات</th><th className="px-4 py-3">الكمية</th><th className="px-4 py-3">القيمة</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{accountSummary.customers.map(row => <tr key={row.name}><td className="px-4 py-3 font-bold text-[#102a43]">{row.name}</td><td className="px-4 py-3 text-slate-500">{row.movements}</td><td className="px-4 py-3">{formatQuantity(row.quantity)}</td><td className="px-4 py-3 font-bold text-[#0d4f62]">{formatQuantity(row.value)} ج.م</td></tr>)}</tbody></table>{!accountSummary.customers.length && <p className="p-6 text-center text-sm text-slate-400">لا توجد أذونات صرف ضمن الفترة.</p>}</div></div></div> : reportType === "unlinked" ? <div className="space-y-5 p-5"><div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm leading-7 text-amber-900">يعرض هذا التقرير أسماء الجهات النصية المستخدمة في حركات الصرف التي لا تحمل customerId مرتبطاً بدليل العملاء، لتسهيل إنشاء الجهة أو ربطها قبل اعتماد التقارير الدورية.</div><Input value={unlinkedSearch} onChange={event => setUnlinkedSearch(event.target.value)} placeholder="ابحث باسم الجهة غير المرتبطة" className="rounded-xl" />{!visibleUnlinkedParties.length ? <div className="rounded-2xl border border-[#e5eef1] bg-[#fbfdff] p-10 text-center text-sm text-slate-400">لا توجد جهات غير مرتبطة ضمن الفترة المحددة.</div> : <div className="overflow-x-auto rounded-2xl border border-[#e5eef1]"><table className="w-full min-w-[900px] text-right text-sm"><thead className="bg-[#f7fbfc] text-xs font-black text-slate-400"><tr><th className="px-5 py-4">الجهة النصية</th><th className="px-5 py-4">عدد الحركات</th><th className="px-5 py-4">إجمالي الكمية</th><th className="px-5 py-4">إجمالي القيمة</th><th className="px-5 py-4">أول حركة</th><th className="px-5 py-4">آخر حركة</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{visibleUnlinkedParties.map(row => <tr key={row.name} className="hover:bg-[#fbfdff]"><td className="px-5 py-4 font-black text-[#102a43]">{row.name}</td><td className="px-5 py-4 text-slate-500">{row.movements}</td><td className="px-5 py-4">{formatQuantity(row.quantity)}</td><td className="px-5 py-4 font-bold text-[#0d4f62]">{formatQuantity(row.value)} ج.م</td><td className="px-5 py-4 text-slate-500">{formatInventoryDate(row.firstDate)}</td><td className="px-5 py-4 text-slate-500">{formatInventoryDate(row.lastDate)}</td></tr>)}</tbody></table></div>}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-right text-sm"><thead className="bg-[#f7fbfc] text-xs font-black text-slate-400"><tr><th className="px-5 py-4">الحركة</th><th className="px-5 py-4">التاريخ</th><th className="px-5 py-4">رقم الإذن</th><th className="px-5 py-4">كود الصنف</th><th className="px-5 py-4">الكمية</th><th className="px-5 py-4">البيان</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{filteredMovementRows.slice(0, 250).map(row => <tr key={`${row.type}-${row.id}`} className="hover:bg-[#fbfdff]"><td className="px-5 py-4"><Badge className={`rounded-full ${row.type === "صرف" ? "bg-[#fbeceb] text-[#bd5147]" : "bg-[#fff4df] text-[#a96821]"}`}>{row.type}</Badge></td><td className="px-5 py-4 text-slate-500">{formatInventoryDate(row.date)}</td><td className="px-5 py-4 font-mono text-xs text-slate-500">{row.eznNum}</td><td className="px-5 py-4 font-mono text-xs text-slate-500">{row.itemCode}</td><td className="px-5 py-4 font-black text-[#102a43]">{formatQuantity(row.quantity)}</td><td className="px-5 py-4 text-slate-500"><div className="flex flex-wrap items-center gap-2"><span>{row.detail}</span>{row.isNegativeCorrection ? <Badge className="rounded-full border border-amber-200 bg-amber-50 text-[10px] font-black text-amber-700">تصحيح سالب</Badge> : null}</div></td></tr>)}</tbody></table>{filteredMovementRows.length > 250 ? <p className="border-t border-[#eef3f5] px-5 py-3 text-xs text-slate-400">تظهر أول 250 حركة في الشاشة، بينما يشمل التصدير جميع الحركات المحمّلة.</p> : null}</div>}
    </Card>
  </div><Dialog open={Boolean(selectedVarianceRow)} onOpenChange={open => { if (!open) setSelectedVarianceCode(null); }}><DialogContent dir="rtl" className="max-w-5xl rounded-2xl"><DialogHeader><DialogTitle className="font-black text-[#102a43]">تفاصيل حركات الصنف</DialogTitle><DialogDescription>{selectedVarianceRow ? `${selectedVarianceRow.name} — كود ${selectedVarianceRow.code}` : ""}</DialogDescription></DialogHeader>{selectedVarianceRow ? <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-5"><div className="rounded-xl bg-[#f7fbfc] p-3"><p className="text-[11px] text-slate-400">الإضافات</p><p className="mt-1 font-black text-[#0d806c]">{formatQuantity(selectedVarianceRow.additions)}</p></div><div className="rounded-xl bg-[#fff7e8] p-3"><p className="text-[11px] text-slate-400">الصرف</p><p className="mt-1 font-black text-[#bd5147]">{formatQuantity(selectedVarianceRow.disbursements)}</p></div><div className="rounded-xl bg-[#fff7e8] p-3"><p className="text-[11px] text-slate-400">المرتجعات</p><p className="mt-1 font-black text-[#a66a16]">{formatQuantity(selectedVarianceRow.returns)}</p></div><div className="rounded-xl bg-[#eef8f7] p-3"><p className="text-[11px] text-slate-400">الصافي</p><p className="mt-1 font-black text-[#0d4f62]">{formatQuantity(selectedVarianceRow.net)}</p></div><div className="rounded-xl bg-[#f7fbfc] p-3"><p className="text-[11px] text-slate-400">الفرق</p><p className="mt-1 font-black text-[#102a43]">{formatQuantity(selectedVarianceRow.variance)}</p></div></div><div className="max-h-[55vh] overflow-auto rounded-xl border border-[#e5eef1]"><table className="w-full min-w-[760px] text-right text-sm"><thead className="sticky top-0 bg-[#0d4f62] text-xs font-black text-white"><tr><th className="px-3 py-3">الحركة</th><th className="px-3 py-3">التاريخ</th><th className="px-3 py-3">رقم الإذن</th><th className="px-3 py-3">الكمية</th><th className="px-3 py-3">المورد / الجهة</th><th className="px-3 py-3">البيان</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{selectedVarianceMovements.map((movement, index) => <tr key={`${movement.type}-${movement.eznNum}-${index}`} className="odd:bg-[#fbfdff]"><td className="px-3 py-3 font-black text-[#0d4f62]">{movement.type}</td><td className="px-3 py-3 whitespace-nowrap text-slate-500">{movement.date}</td><td className="px-3 py-3 font-mono text-xs">{movement.eznNum}</td><td className="px-3 py-3 font-black">{formatQuantity(movement.quantity)}</td><td className="px-3 py-3 text-slate-600">{movement.party}</td><td className="px-3 py-3 text-slate-500">{movement.detail}</td></tr>)}</tbody></table>{!selectedVarianceMovements.length && <p className="p-8 text-center text-sm text-slate-500">لا توجد حركات تفصيلية متاحة لهذا الصنف ضمن البيانات الحالية.</p>}</div></div> : null}<DialogFooter><Button variant="outline" onClick={() => setSelectedVarianceCode(null)} className="rounded-xl">إغلاق</Button></DialogFooter></DialogContent></Dialog><Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}><DialogContent dir="rtl" className="max-w-xl rounded-2xl"><DialogHeader><DialogTitle className="font-black text-[#102a43]">اختيارات التصدير</DialogTitle><DialogDescription>اختر الأعمدة التي تريد تضمينها في ملف {exportFormat === "excel" ? "Excel" : "PDF"} قبل التنزيل.</DialogDescription></DialogHeader><div className="space-y-5"><div className="rounded-xl border border-dashed border-[#b9d4d9] bg-[#f7fbfc] p-3"><p className="mb-2 text-xs font-bold text-[#0d4f62]">اسحب الأعمدة لترتيبها من اليمين إلى اليسار؛ سيظهر أول عمود أقصى اليمين في PDF وExcel.</p><div className="flex flex-wrap gap-2" dir="rtl">{selectedColumns.filter(column => reportColumnOptions.includes(column as never)).map(column => <button key={`report-drag-${column}`} type="button" draggable onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", column); }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); moveReportColumn(event.dataTransfer.getData("text/plain") as ExportColumnKey, column); }} className="inline-flex cursor-grab items-center gap-1 rounded-lg border border-[#9fcbd0] bg-white px-2.5 py-1.5 text-xs font-bold text-[#0d4f62] shadow-sm active:cursor-grabbing"><GripVertical className="h-3.5 w-3.5" />{exportColumnLabels[column]}</button>)}</div></div><div className="grid gap-3 sm:grid-cols-2">{reportColumnOptions.map(column => <label key={column} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#e5eef1] bg-[#fbfdff] px-4 py-3 text-sm font-bold text-[#102a43]"><input type="checkbox" checked={selectedColumns.includes(column)} onChange={() => setSelectedColumns(current => current.includes(column) ? current.filter(item => item !== column) : [...current, column])} className="h-4 w-4 accent-[#0d4f62]" />{exportColumnLabels[column]}</label>)}</div><label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-[#b9d4d9] bg-[#f7fbfc] px-4 py-4"><input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={chooseLogo} /><span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-[#e8f1f2] text-[#0d4f62]">{logoDataUrl || companyLogoUrl ? <img src={logoDataUrl || companyLogoUrl || ""} alt="شعار الشركة" className="h-full w-full object-contain" /> : <ImageIcon className="h-5 w-5" />}</span><span><span className="block font-black text-[#102a43]">{uploadLogo.isPending ? "جارٍ رفع الشعار..." : "رفع أو تغيير شعار الشركة"}</span><span className="mt-1 block text-xs text-slate-400">سيظهر الشعار مع تاريخ التقرير في ترويسة PDF.</span></span><Upload className="mr-auto h-5 w-5 text-[#0d4f62]" /></label></div><DialogFooter><Button variant="outline" onClick={() => setExportDialogOpen(false)} className="rounded-xl">إلغاء</Button><Button onClick={openPreview} disabled={!selectedColumns.length || !activeRows.length} className="rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]"><Eye className="ml-2 h-4 w-4" />معاينة قبل التنزيل</Button></DialogFooter></DialogContent></Dialog><Dialog open={previewOpen} onOpenChange={open => open ? setPreviewOpen(true) : closePreview()}><DialogContent dir="rtl" className="max-w-6xl rounded-2xl"><DialogHeader><DialogTitle className="font-black text-[#102a43]">المعاينة النهائية لتقرير {exportFormat === "excel" ? "Excel" : "PDF"}</DialogTitle><DialogDescription>{exportFormat === "pdf" ? "هذه معاينة كاملة لملف PDF النهائي بنفس التنسيق والخط والصور التي ستظهر عند التنزيل." : `هذه معاينة لأول ${previewRows.length} صفاً من أصل ${activeRows.length}.`}</DialogDescription></DialogHeader>{pdfBusy ? <div role="status" aria-live="polite" className="space-y-2 rounded-xl border border-[#b9d4d9] bg-[#f4fafb] p-3"><div className="flex items-center justify-between gap-3 text-xs font-black text-[#0d4f62]"><span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{pdfTask === "preview" ? "جارٍ تجهيز تقرير PDF..." : "جارٍ إنشاء ملف التقرير للتنزيل..."}</span><span>{pdfProgress}% · {pdfEtaSeconds === null ? "جارٍ حساب الوقت" : pdfEtaSeconds === 0 ? "اكتمل" : `متبقٍ نحو ${pdfEtaSeconds} ث`}</span></div><div className="h-2 overflow-hidden rounded-full bg-[#dcebee]"><div className="h-full rounded-full bg-[#0d806c] transition-all duration-300" style={{ width: `${pdfProgress}%` }} /></div></div> : null}{exportFormat === "pdf" ? <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#dce7ee] bg-[#f7fbfc] p-2"><div className="flex items-center gap-1"><Button type="button" size="icon" variant="outline" onClick={() => setPdfZoom(value => Math.max(0.75, Number((value - 0.1).toFixed(2))))} disabled={pdfZoom <= 0.75} aria-label="تصغير PDF" className="h-9 w-9 rounded-lg"><ZoomOut className="h-4 w-4" /></Button><span className="min-w-14 text-center text-xs font-black text-[#0d4f62]">{Math.round(pdfZoom * 100)}%</span><Button type="button" size="icon" variant="outline" onClick={() => setPdfZoom(value => Math.min(1.75, Number((value + 0.1).toFixed(2))))} disabled={pdfZoom >= 1.75} aria-label="تكبير PDF" className="h-9 w-9 rounded-lg"><ZoomIn className="h-4 w-4" /></Button></div><div className="flex items-center gap-1"><Button type="button" size="icon" variant="outline" onClick={() => setPdfPage(value => Math.max(1, value - 1))} disabled={pdfPage <= 1} aria-label="الصفحة السابقة" className="h-9 w-9 rounded-lg"><ChevronRight className="h-4 w-4" /></Button><span className="min-w-24 text-center text-xs font-bold text-slate-500">صفحة {pdfPage} من {pdfPageCount}</span><Button type="button" size="icon" variant="outline" onClick={() => setPdfPage(value => Math.min(pdfPageCount, value + 1))} disabled={pdfPage >= pdfPageCount} aria-label="الصفحة التالية" className="h-9 w-9 rounded-lg"><ChevronLeft className="h-4 w-4" /></Button></div></div><div className="h-[60vh] overflow-auto rounded-xl border border-[#dce7ee] bg-slate-100">{pdfPreviewLoading ? <div className="flex h-full items-center justify-center gap-2 text-sm font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />جارٍ تجهيز المعاينة النهائية...</div> : pdfPreviewUrl ? <iframe key={`${pdfPreviewUrl}-${pdfPage}-${pdfZoom}`} src={`${pdfPreviewUrl}#page=${pdfPage}&zoom=${Math.round(pdfZoom * 100)}`} title="معاينة تقرير PDF" className="h-full min-h-[60vh] w-full border-0 bg-white" /> : <div className="flex h-full items-center justify-center text-sm text-slate-500">تعذر عرض المعاينة.</div>}</div></div> : <div className="max-h-[55vh] overflow-auto rounded-xl border border-[#e5eef1]"><table className="min-w-full text-right text-xs"><thead className="sticky top-0 bg-[#0d4f62] text-white"><tr>{previewColumns.map(column => <th key={column} className={`whitespace-nowrap px-3 py-3 font-black ${isQuantityColumn(column) ? "quantity-emphasis" : ""}`}>{exportColumnLabels[column]}</th>)}</tr></thead><tbody className="divide-y divide-[#eef3f5]">{previewRows.map((row, index) => <tr key={`${reportType}-${index}`} className="odd:bg-[#fbfdff]"><>{previewColumns.map(column => <td key={column} className={`whitespace-nowrap px-3 py-3 text-[#102a43] ${isQuantityColumn(column) ? "quantity-emphasis" : ""}`}>{previewCell(row as Record<string, unknown>, column)}</td>)}</></tr>)}</tbody></table></div>}<DialogFooter className="pdf-action-toolbar flex flex-col items-stretch gap-2 [&>button]:w-full"><Button variant="outline" onClick={() => { closePreview(); setExportDialogOpen(true); }} className="rounded-xl">رجوع لتعديل الأعمدة</Button>{exportFormat === "pdf" && <><Button onClick={openPdfPreviewExternally} disabled={pdfPreviewLoading || pdfShareLoading || !pdfPreviewUrl} title="فتح معاينة PDF في نافذة خارجية" variant="outline" className="rounded-xl border-[#0d4f62] text-[#0d4f62]"><Eye className="ml-2 h-4 w-4" />معاينة خارجية</Button><Button onClick={printPdfPreview} disabled={pdfPreviewLoading || pdfShareLoading || !pdfPreviewUrl} title="طباعة التقرير مباشرة" variant="outline" className="rounded-xl border-[#0d4f62] text-[#0d4f62]"><Printer className="ml-2 h-4 w-4" />طباعة مباشرة</Button><Button onClick={() => void sharePdfPreview()} disabled={pdfPreviewLoading || pdfShareLoading || !pdfPreviewUrl} title="مشاركة ملف PDF" variant="outline" className="rounded-xl border-[#0d806c] text-[#0d806c]">{pdfShareLoading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Upload className="ml-2 h-4 w-4" />}مشاركة PDF</Button></>}{exportFormat === "excel" && <Button onClick={() => void shareExcelReport()} disabled={excelShareLoading} title="مشاركة ملف Excel" variant="outline" className="rounded-xl border-[#0d806c] text-[#0d806c]">{excelShareLoading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Upload className="ml-2 h-4 w-4" />}مشاركة Excel</Button>}<Button onClick={() => void downloadSelectedReport()} disabled={pdfPreviewLoading || excelShareLoading || (exportFormat === "pdf" && !pdfPreviewUrl)} title="تنزيل التقرير بصيغة PDF أو Excel" className="rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]"><Download className="ml-2 h-4 w-4" />تأكيد وتنزيل {exportFormat === "excel" ? "Excel" : "PDF"}</Button></DialogFooter></DialogContent></Dialog></DashboardLayout>;
}
