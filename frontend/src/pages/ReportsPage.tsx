import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { BarChart3, Download, FileText, Loader2, PackageCheck, Printer, RefreshCcw, TrendingDown } from "lucide-react";
import { useMemo, useState } from "react";

type ReportType = "overview" | "inventory" | "movements";

type MovementRow = {
  id: number;
  type: "إضافة" | "صرف" | "تحويل";
  date: string;
  eznNum: string;
  itemCode: string;
  quantity: number;
  detail: string;
};

const numberFormat = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 3 });
const formatQuantity = (value: unknown) => numberFormat.format(Number(value ?? 0));
const today = () => new Date().toISOString().slice(0, 10);
const dateOnly = (value: unknown) => String(value ?? "").slice(0, 10);

function inDateRange(value: unknown, from: string, to: string) {
  const date = dateOnly(value);
  return (!from || date >= from) && (!to || date <= to);
}

function escapeCsv(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
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

function printReport(title: string, subtitle: string, headers: string[], rows: unknown[][]) {
  const popup = window.open("", "_blank", "width=1100,height=800");
  if (!popup) return;
  const table = `<table><thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${String(cell ?? "—")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
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
  const [reportType, setReportType] = useState<ReportType>("overview");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today());
  const items = trpc.items.list.useQuery(undefined);
  const additions = trpc.additions.list.useQuery({ limit: 500 });
  const disbursements = trpc.disbursements.list.useQuery({ limit: 500 });
  const transfers = trpc.transfers.list.useQuery({ limit: 500 });
  const summary = trpc.dashboard.summary.useQuery();
  const utils = trpc.useUtils();
  const refreshing = items.isFetching || additions.isFetching || disbursements.isFetching || transfers.isFetching || summary.isFetching;

  const inventoryRows = useMemo(() => (items.data ?? []).filter(item => inDateRange(item.createdAt, from, to)), [items.data, from, to]);
  const filteredAdditions = useMemo(() => (additions.data ?? []).filter(row => inDateRange(row.date, from, to)), [additions.data, from, to]);
  const filteredDisbursements = useMemo(() => (disbursements.data ?? []).filter(row => inDateRange(row.date, from, to)), [disbursements.data, from, to]);
  const filteredTransfers = useMemo(() => (transfers.data ?? []).filter(row => inDateRange(row.date, from, to)), [transfers.data, from, to]);
  const movementRows = useMemo<MovementRow[]>(() => [
    ...filteredAdditions.map(row => ({ id: row.id, type: "إضافة" as const, date: dateOnly(row.date), eznNum: row.eznNum, itemCode: row.itemCode, quantity: Number(row.quantity), detail: row.supplier || row.store || "—" })),
    ...filteredDisbursements.map(row => ({ id: row.id, type: "صرف" as const, date: dateOnly(row.date), eznNum: row.eznNum, itemCode: row.itemCode, quantity: Number(row.quantity), detail: row.destination || row.store || "—" })),
    ...filteredTransfers.map(row => ({ id: row.id, type: "تحويل" as const, date: dateOnly(row.date), eznNum: row.eznNum, itemCode: row.itemCode, quantity: Number(row.quantity), detail: `${row.fromStore || "—"} ← ${row.toStore || "—"}` })),
  ].sort((a, b) => b.date.localeCompare(a.date)), [filteredAdditions, filteredDisbursements, filteredTransfers]);

  const lowStockCount = useMemo(() => inventoryRows.filter(item => {
    const current = Number(item.currentStock ?? 0);
    const reorder = Number(item.reorderLevel ?? 0);
    const threshold = Number(summary.data?.thresholdPercentage ?? 20) / 100;
    return reorder > 0 ? current <= reorder * threshold : current <= 0;
  }).length, [inventoryRows, summary.data?.thresholdPercentage]);
  const totalCurrent = inventoryRows.reduce((sum, item) => sum + Number(item.currentStock ?? 0), 0);
  const totalIncoming = filteredAdditions.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
  const totalOutgoing = filteredDisbursements.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);

  const inventoryExportRows = inventoryRows.map(item => [item.code, item.name, item.category || "بدون تصنيف", item.unit || "—", formatQuantity(item.currentStock), formatQuantity(item.reorderLevel)]);
  const movementExportRows = movementRows.map(row => [row.type, row.date, row.eznNum, row.itemCode, formatQuantity(row.quantity), row.detail]);
  const activeRows = reportType === "inventory" ? inventoryExportRows : movementExportRows;
  const exportReport = () => reportType === "inventory"
    ? downloadCsv("smart-inventory-report.csv", ["كود الصنف", "اسم الصنف", "التصنيف", "الوحدة", "الرصيد الحالي", "حد الطلب"], inventoryExportRows)
    : downloadCsv("smart-inventory-movements-report.csv", ["نوع الحركة", "التاريخ", "رقم الإذن", "كود الصنف", "الكمية", "البيان"], movementExportRows);
  const printActiveReport = () => reportType === "inventory"
    ? printReport("تقرير أرصدة المخزون - Smart Inventory", `الفترة: ${from || "البداية"} إلى ${to || "اليوم"}`, ["كود الصنف", "اسم الصنف", "التصنيف", "الوحدة", "الرصيد الحالي", "حد الطلب"], inventoryExportRows)
    : printReport("تقرير حركات المخزون - Smart Inventory", `الفترة: ${from || "البداية"} إلى ${to || "اليوم"}`, ["نوع الحركة", "التاريخ", "رقم الإذن", "كود الصنف", "الكمية", "البيان"], movementExportRows);
  const statCards = [
    { label: "الرصيد الحالي", value: formatQuantity(totalCurrent), hint: "إجمالي الكميات الظاهرة", Icon: PackageCheck, tone: "text-[#0d806c] bg-[#e7f5ef]" },
    { label: "أصناف تحت التنبيه", value: String(lowStockCount), hint: `عند نسبة ${formatQuantity(summary.data?.thresholdPercentage ?? 20)}%`, Icon: TrendingDown, tone: "text-[#bd5147] bg-[#fbeceb]" },
    { label: "إجمالي الوارد", value: formatQuantity(totalIncoming), hint: `${filteredAdditions.length} إذن إضافة`, Icon: BarChart3, tone: "text-[#0d4f62] bg-[#e8f1f2]" },
    { label: "إجمالي المنصرف", value: formatQuantity(totalOutgoing), hint: `${filteredDisbursements.length} إذن صرف`, Icon: FileText, tone: "text-[#a66a16] bg-[#fff4dd]" },
  ] as const;

  return <DashboardLayout><div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-7">
    <PageHeader from={from} to={to} onRefresh={() => { void Promise.all([utils.items.list.invalidate(), utils.additions.list.invalidate(), utils.disbursements.list.invalidate(), utils.transfers.list.invalidate(), utils.dashboard.summary.invalidate()]); }} refreshing={refreshing} />
    <Card className="rounded-[1.75rem] border-[#dce7ee] bg-white shadow-[0_18px_50px_rgba(18,44,84,0.06)]"><CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-sm font-black text-[#102a43]">نطاق التقرير</p><p className="mt-1 text-xs text-slate-400">اختر فترة محددة لتصفية الحركات والأرصدة المعروضة.</p></div>
      <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-md"><label className="space-y-2 text-xs font-bold text-slate-500">من تاريخ<Input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 rounded-xl" /></label><label className="space-y-2 text-xs font-bold text-slate-500">إلى تاريخ<Input type="date" value={to} onChange={event => setTo(event.target.value)} className="mt-1 rounded-xl" /></label></div>
    </CardContent></Card>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {statCards.map(({ label, value, hint, Icon, tone }) => <Card key={label} className="rounded-[1.5rem] border-[#e4edf1] bg-white shadow-[0_16px_40px_rgba(18,44,84,0.05)]"><CardContent className="flex items-center justify-between p-5"><div><p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-[#102a43]">{value}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{hint}</p></div><div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}><Icon className="h-5 w-5" /></div></CardContent></Card>)}
    </div>

    <Card className="overflow-hidden rounded-[1.75rem] border-[#dce7ee] bg-white shadow-[0_18px_50px_rgba(18,44,84,0.06)]"><div className="flex flex-col gap-4 border-b border-[#e7eef3] p-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-lg font-black text-[#102a43]">مخرجات التقرير</p><p className="mt-1 text-xs text-slate-400">{reportType === "inventory" ? `${inventoryRows.length} صنفاً في النطاق المحدد` : `${movementRows.length} حركة في النطاق المحدد`}</p></div><div className="flex flex-wrap gap-2"><Button variant={reportType === "overview" ? "default" : "outline"} onClick={() => setReportType("overview")} className={`rounded-xl font-bold ${reportType === "overview" ? "bg-[#0d4f62] text-white hover:bg-[#0a4150]" : "border-[#dce7ee] text-[#0d4f62]"}`}>نظرة تشغيلية</Button><Button variant={reportType === "inventory" ? "default" : "outline"} onClick={() => setReportType("inventory")} className={`rounded-xl font-bold ${reportType === "inventory" ? "bg-[#0d4f62] text-white hover:bg-[#0a4150]" : "border-[#dce7ee] text-[#0d4f62]"}`}>أرصدة الأصناف</Button><Button variant={reportType === "movements" ? "default" : "outline"} onClick={() => setReportType("movements")} className={`rounded-xl font-bold ${reportType === "movements" ? "bg-[#0d4f62] text-white hover:bg-[#0a4150]" : "border-[#dce7ee] text-[#0d4f62]"}`}>حركات المخزون</Button><Button variant="outline" onClick={exportReport} disabled={!activeRows.length} className="rounded-xl border-[#b9d4d9] font-bold text-[#0d4f62]"><Download className="ml-2 h-4 w-4" />تصدير CSV</Button><Button variant="outline" onClick={printActiveReport} disabled={!activeRows.length} className="rounded-xl border-[#b9d4d9] font-bold text-[#0d4f62]"><Printer className="ml-2 h-4 w-4" />طباعة</Button></div></div>
      {reportType === "overview" ? <CardContent className="grid gap-5 p-5 lg:grid-cols-[1.1fr_0.9fr]"><div className="rounded-2xl bg-[#f7fbfc] p-5"><div className="mb-5 flex items-center justify-between"><div><p className="text-sm font-black text-[#102a43]">قراءة سريعة للحالة</p><p className="mt-1 text-xs text-slate-400">مقارنة الوارد والمنصرف في الفترة المحددة.</p></div><BarChart3 className="h-5 w-5 text-[#0d4f62]" /></div><div className="space-y-4"><div><div className="mb-2 flex justify-between text-xs font-bold"><span className="text-slate-500">الوارد</span><span className="text-[#0d806c]">{formatQuantity(totalIncoming)}</span></div><div className="h-3 overflow-hidden rounded-full bg-[#dfecef]"><div className="h-full rounded-full bg-[#0d806c]" style={{ width: `${Math.min(100, totalIncoming ? 100 : 0)}%` }} /></div></div><div><div className="mb-2 flex justify-between text-xs font-bold"><span className="text-slate-500">المنصرف</span><span className="text-[#bd5147]">{formatQuantity(totalOutgoing)}</span></div><div className="h-3 overflow-hidden rounded-full bg-[#f1dfdd]"><div className="h-full rounded-full bg-[#bd5147]" style={{ width: `${totalIncoming ? Math.min(100, totalOutgoing / totalIncoming * 100) : totalOutgoing ? 100 : 0}%` }} /></div></div></div></div><div className="rounded-2xl bg-[#102a43] p-5 text-white"><p className="text-sm font-black">قرار تشغيلي مقترح</p><p className="mt-3 text-sm leading-7 text-slate-300">{lowStockCount ? `يوجد ${lowStockCount} صنف تحت نسبة التنبيه الحالية. راجع شاشة التنبيهات قبل إنشاء طلبات شراء جديدة.` : "لا توجد أصناف تحت نسبة التنبيه الحالية ضمن الفترة المحددة."}</p><div className="mt-5 flex items-center gap-2 text-xs font-bold text-[#c9e8df]"><span className="h-2 w-2 rounded-full bg-[#0d806c]" />نسبة التنبيه الحالية: {formatQuantity(summary.data?.thresholdPercentage ?? 20)}%</div></div></CardContent> : reportType === "inventory" ? <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-right text-sm"><thead className="bg-[#f7fbfc] text-xs font-black text-slate-400"><tr><th className="px-5 py-4">الكود</th><th className="px-5 py-4">اسم الصنف</th><th className="px-5 py-4">التصنيف</th><th className="px-5 py-4">الوحدة</th><th className="px-5 py-4">الرصيد الحالي</th><th className="px-5 py-4">حد الطلب</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{inventoryRows.slice(0, 250).map(item => { const low = Number(item.reorderLevel) > 0 ? Number(item.currentStock) <= Number(item.reorderLevel) * Number(summary.data?.thresholdPercentage ?? 20) / 100 : Number(item.currentStock) <= 0; return <tr key={item.id} className="hover:bg-[#fbfdff]"><td className="px-5 py-4 font-mono text-xs text-slate-500">{item.code}</td><td className="px-5 py-4 font-black text-[#102a43]">{item.name}</td><td className="px-5 py-4 text-slate-500">{item.category || "بدون تصنيف"}</td><td className="px-5 py-4 text-slate-500">{item.unit || "—"}</td><td className={`px-5 py-4 font-black ${low ? "text-[#bd5147]" : "text-[#0d806c]"}`}>{formatQuantity(item.currentStock)}</td><td className="px-5 py-4 text-slate-500">{formatQuantity(item.reorderLevel)}</td></tr>; })}</tbody></table>{inventoryRows.length > 250 ? <p className="border-t border-[#eef3f5] px-5 py-3 text-xs text-slate-400">تظهر أول 250 صفاً في الشاشة، بينما يشمل التصدير جميع الصفوف.</p> : null}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-right text-sm"><thead className="bg-[#f7fbfc] text-xs font-black text-slate-400"><tr><th className="px-5 py-4">النوع</th><th className="px-5 py-4">التاريخ</th><th className="px-5 py-4">رقم الإذن</th><th className="px-5 py-4">كود الصنف</th><th className="px-5 py-4">الكمية</th><th className="px-5 py-4">البيان</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{movementRows.slice(0, 250).map(row => <tr key={`${row.type}-${row.id}`} className="hover:bg-[#fbfdff]"><td className="px-5 py-4"><Badge className={`rounded-full ${row.type === "صرف" ? "bg-[#fbeceb] text-[#bd5147]" : row.type === "إضافة" ? "bg-[#e7f5ef] text-[#0d806c]" : "bg-[#e8f1f2] text-[#0d4f62]"}`}>{row.type}</Badge></td><td className="px-5 py-4 text-slate-500">{row.date}</td><td className="px-5 py-4 font-mono text-xs text-slate-500">{row.eznNum}</td><td className="px-5 py-4 font-mono text-xs text-slate-500">{row.itemCode}</td><td className="px-5 py-4 font-black text-[#102a43]">{formatQuantity(row.quantity)}</td><td className="px-5 py-4 text-slate-500">{row.detail}</td></tr>)}</tbody></table>{movementRows.length > 250 ? <p className="border-t border-[#eef3f5] px-5 py-3 text-xs text-slate-400">تظهر أول 250 حركة في الشاشة، بينما يشمل التصدير جميع الحركات المحمّلة.</p> : null}</div>}
    </Card>
  </div></DashboardLayout>;
}
