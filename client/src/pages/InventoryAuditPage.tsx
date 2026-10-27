import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildCompanyInventoryAuditPdf } from "@/lib/inventoryExportFiles";
import { resolveCompanyLogoUrl } from "@/lib/brandAssets";
import { trpc } from "@/lib/trpc";
import { ArrowRight, ChevronDown, Download, FileText, Loader2, PackageCheck, Printer, RefreshCcw, Warehouse, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const formatQuantity = (value: unknown) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(Number(value ?? 0));
const pdfColumnOptions = [
  { key: "code", label: "الكود" },
  { key: "name", label: "اسم الصنف" },
  { key: "unit", label: "الوحدة" },
  { key: "warehouses", label: "أرصدة المخازن" },
  { key: "total", label: "الإجمالي" },
] as const;
type PdfColumnKey = (typeof pdfColumnOptions)[number]["key"];
const warehouseToneClasses = [
  { card: "border-[#b9d4d9] bg-[#f7fbfc]", header: "border-[#b9d4d9] bg-[#e8f1f2]", badge: "border-[#9bcbd2] bg-[#e8f7f6] text-[#0d4f62]", chip: "bg-[#d9f0ed] text-[#0d4f62]", icon: "text-[#0d7180]", bar: "bg-[#0d7180]" },
  { card: "border-[#d6c5ee] bg-[#fbf8ff]", header: "border-[#d6c5ee] bg-[#f1e9ff]", badge: "border-[#c8a9e8] bg-[#f1e9ff] text-[#6d3f91]", chip: "bg-[#eadcff] text-[#6d3f91]", icon: "text-[#7b4aa0]", bar: "bg-[#7b4aa0]" },
  { card: "border-[#f1d1a7] bg-[#fffaf5]", header: "border-[#f1d1a7] bg-[#fff1df]", badge: "border-[#e7b978] bg-[#fff1df] text-[#a96821]", chip: "bg-[#ffe6c2] text-[#9a5b19]", icon: "text-[#b56f22]", bar: "bg-[#b56f22]" },
  { card: "border-[#c5d9ef] bg-[#f7faff]", header: "border-[#c5d9ef] bg-[#e8f1fb]", badge: "border-[#9cbde1] bg-[#e8f1fb] text-[#35669a]", chip: "bg-[#dceaff] text-[#35669a]", icon: "text-[#3975ae]", bar: "bg-[#3975ae]" },
  { card: "border-[#efc6cf] bg-[#fff8fa]", header: "border-[#efc6cf] bg-[#ffecef]", badge: "border-[#e2a2b0] bg-[#ffecef] text-[#a43f58]", chip: "bg-[#ffdce4] text-[#a43f58]", icon: "text-[#b94b68]", bar: "bg-[#b94b68]" },
] as const;

export default function InventoryAuditPage() {
  const [, setLocation] = useLocation();
  const audit = trpc.reports.inventoryAudit.useQuery();
  const settings = trpc.settings.list.useQuery();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [pdfColumns, setPdfColumns] = useState<PdfColumnKey[]>(pdfColumnOptions.map(column => column.key));
  const [expandedWarehouses, setExpandedWarehouses] = useState<Set<number>>(() => new Set());
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const companyLogo = resolveCompanyLogoUrl(settings.data?.find(item => item.key === "company_logo_url")?.value);
  const watermarkEnabled = settings.data?.find(item => item.key === "report_watermark_enabled")?.value !== "false";
  const watermarkOpacity = Number(settings.data?.find(item => item.key === "report_watermark_opacity")?.value ?? "0.08");
  const watermarkScale = Number(settings.data?.find(item => item.key === "report_watermark_scale")?.value ?? "0.42");
  const watermarkPosition = (settings.data?.find(item => item.key === "report_watermark_position")?.value ?? "center") as "center" | "top" | "bottom";
  const watermarkRepeat = settings.data?.find(item => item.key === "report_watermark_repeat")?.value === "true";
  const summary = audit.data?.summary;
  const warehouseTotalById = useMemo(() => new Map((audit.data?.warehouses ?? []).map(warehouse => [warehouse.id, (audit.data?.rows ?? []).reduce((total, row) => total + (row.warehouseBalances.find(balance => balance.warehouseId === warehouse.id)?.currentStock ?? 0), 0)])), [audit.data]);
  const warehouseDetails = useMemo(() => (audit.data?.warehouses ?? []).map(warehouse => {
    const items = (audit.data?.rows ?? []).map(row => ({
      id: row.id,
      code: row.code,
      name: row.name,
      unit: row.unit || "بدون وحدة",
      quantity: row.warehouseBalances.find(balance => balance.warehouseId === warehouse.id)?.currentStock ?? 0,
    })).filter(item => item.quantity !== 0);
    const unitTotals = Array.from(items.reduce((totals, item) => totals.set(item.unit, (totals.get(item.unit) ?? 0) + item.quantity), new Map<string, number>()), ([unit, quantity]) => ({ unit, quantity }));
    return { ...warehouse, items, unitTotals };
  }), [audit.data]);
  const selectedWarehouse = audit.data?.warehouses.find(warehouse => warehouse.id === selectedWarehouseId) ?? null;
  const visibleWarehouses = selectedWarehouse ? [selectedWarehouse] : (audit.data?.warehouses ?? []);
  const visibleRows = useMemo(() => {
    if (!selectedWarehouseId) return audit.data?.rows ?? [];
    return (audit.data?.rows ?? []).filter(row => (row.warehouseBalances.find(balance => balance.warehouseId === selectedWarehouseId)?.currentStock ?? 0) !== 0);
  }, [audit.data, selectedWarehouseId]);
  const pdfReport = useMemo(() => {
    if (!audit.data || !selectedWarehouseId || !selectedWarehouse) return audit.data;
    return {
      ...audit.data,
      warehouses: [selectedWarehouse],
      rows: visibleRows.map(row => ({
        ...row,
        totalCurrentStock: row.warehouseBalances.find(balance => balance.warehouseId === selectedWarehouseId)?.currentStock ?? 0,
      })),
      summary: {
        totalItems: visibleRows.length,
        totalCompanyBalance: warehouseTotalById.get(selectedWarehouseId) ?? 0,
      },
    };
  }, [audit.data, selectedWarehouse, selectedWarehouseId, visibleRows, warehouseTotalById]);
  const toggleWarehouse = (warehouseId: number) => {
    setSelectedWarehouseId(current => current === warehouseId ? null : warehouseId);
    setExpandedWarehouses(current => { const next = new Set(current); if (next.has(warehouseId)) next.delete(warehouseId); else next.add(warehouseId); return next; });
  };
  const togglePdfColumn = (column: PdfColumnKey) => setPdfColumns(current => current.includes(column) ? current.filter(item => item !== column) : [...current, column]);

  useEffect(() => {
    let active = true;
    if (!previewOpen || !pdfReport) { setReportUrl(null); setBuilding(false); return; }
    setBuilding(true);
    void buildCompanyInventoryAuditPdf(pdfReport, { logo: companyLogo, columns: pdfColumns, watermarkEnabled, watermarkOpacity, watermarkScale, watermarkPosition, watermarkRepeat }).then(doc => {
      if (!active) return;
      setReportUrl(URL.createObjectURL(doc.output("blob")));
      setBuilding(false);
    }).catch(error => { if (active) { setBuilding(false); toast.error(error?.message || "تعذر إنشاء تقرير الجرد الشامل"); } });
    return () => { active = false; setReportUrl(current => { if (current) URL.revokeObjectURL(current); return null; }); };
  }, [previewOpen, pdfReport, pdfColumns, companyLogo, watermarkEnabled, watermarkOpacity, watermarkScale, watermarkPosition, watermarkRepeat]);

  const downloadReport = () => { if (!reportUrl) return; const link = document.createElement("a"); link.href = reportUrl; link.download = selectedWarehouse ? `smart-inventory-${selectedWarehouse.name}-audit.pdf` : "smart-inventory-company-inventory-audit.pdf"; link.click(); };
  const printReport = () => { iframeRef.current?.contentWindow?.focus(); iframeRef.current?.contentWindow?.print(); };

  return <DashboardLayout><div className="inventory-audit-page mx-auto w-full min-w-0 max-w-[1500px] space-y-6">
    <section className="flex flex-col justify-between gap-4 rounded-[1.5rem] border border-[#dce7ee] bg-white p-5 shadow-[0_18px_50px_rgba(18,44,84,0.06)] md:flex-row md:items-end"><div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-[#d08a3b]">COMPANY INVENTORY AUDIT</p><h2 className="text-3xl font-black tracking-tight text-[#102a43]">تقرير الجرد الشامل</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">يعرض الرصيد الفعلي لكل صنف موزعًا على المخزن الرئيسي والفروع ومخزن الهالك، مع إجمالي الشركة.</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setLocation("/warehouses")} className="rounded-xl"><ArrowRight className="ml-2 h-4 w-4" />المخازن</Button><Button type="button" variant="outline" onClick={() => void audit.refetch()} disabled={audit.isFetching} className="rounded-xl"><RefreshCcw className={`ml-2 h-4 w-4 ${audit.isFetching ? "animate-spin" : ""}`} />تحديث</Button><Button type="button" onClick={() => setPreviewOpen(true)} disabled={!audit.data || audit.isFetching} className="rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]"><FileText className="ml-2 h-4 w-4" />معاينة وتصدير PDF</Button></div></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Card className="border-[#dce7ee] bg-white"><CardContent className="flex items-center justify-between p-4"><span className="text-sm font-black text-slate-500">إجمالي الأصناف</span><strong className="text-2xl font-black text-[#0d4f62]">{formatQuantity(summary?.totalItems)}</strong></CardContent></Card><Card className="border-[#b9d4d9] bg-[#f7fbfc]"><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-black text-[#0d4f62]">إجمالي رصيد الشركة</span><strong className="text-2xl font-black text-[#0d806c]">{formatQuantity(summary?.totalCompanyBalance)}</strong></div><p className="mt-1 text-[10px] font-bold text-slate-400">إجمالي تجميعي للعرض فقط — التفاصيل حسب المخزن والوحدة بالأسفل</p></CardContent></Card><Card className="border-[#f1d1a7] bg-[#fffaf5]"><CardContent className="flex items-center gap-2 p-4 text-sm font-black text-[#a96821]"><PackageCheck className="h-5 w-5" />الأرصدة موزعة حسب كل مخزن وصنف</CardContent></Card></section>
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{warehouseDetails.map((warehouse, index) => { const expanded = expandedWarehouses.has(warehouse.id); const selected = selectedWarehouseId === warehouse.id; const tone = warehouseToneClasses[index % warehouseToneClasses.length]; const totalUnitCount = warehouse.unitTotals.reduce((sum, total) => sum + Number(total.quantity), 0); const maxUnitQuantity = Math.max(1, ...warehouse.unitTotals.map(total => Number(total.quantity))); return <Card key={warehouse.id} className={`overflow-hidden border shadow-sm transition ${tone.card} ${selected ? "border-[#0d806c] ring-2 ring-[#0d806c]/15" : ""}`}><CardHeader className={`border-b px-4 py-3 ${tone.header}`}><button type="button" onClick={() => toggleWarehouse(warehouse.id)} className="w-full text-right" aria-expanded={expanded} aria-label={`فتح أو إغلاق تفاصيل ${warehouse.name}`}><div className="flex items-center justify-between gap-3"><CardTitle className="flex items-center gap-2 text-base font-black text-[#102a43]"><Warehouse className={`h-4 w-4 ${tone.icon}`} />{warehouse.name}<ChevronDown className={`h-4 w-4 text-[#0d4f62] transition-transform ${expanded ? "rotate-180" : ""}`} /></CardTitle><Badge variant="outline" className={`rounded-full text-[10px] font-black ${tone.badge}`}>{warehouse.items.length} صنف برصيد</Badge></div><div className="mt-2 flex flex-wrap gap-1.5">{warehouse.unitTotals.length ? warehouse.unitTotals.map(total => <span key={total.unit} className={`rounded-full px-2 py-1 text-[10px] font-black ${tone.chip}`}>{formatQuantity(total.quantity)} {total.unit}</span>) : <span className="text-[10px] font-bold text-slate-400">لا يوجد رصيد في هذا المخزن</span>}</div><div className="mt-3 grid grid-cols-3 gap-1.5 text-center"><div className="rounded-lg bg-white/55 px-1.5 py-1.5"><strong className={`block text-xs font-black ${tone.icon}`}>{formatQuantity(totalUnitCount)}</strong><span className="text-[9px] font-bold text-slate-400">إجمالي الرصيد</span></div><div className="rounded-lg bg-white/55 px-1.5 py-1.5"><strong className="block text-xs font-black text-[#102a43]">{warehouse.unitTotals.length}</strong><span className="text-[9px] font-bold text-slate-400">نوع وحدة</span></div><div className="rounded-lg bg-white/55 px-1.5 py-1.5"><strong className="block text-xs font-black text-[#102a43]">{warehouse.items.length}</strong><span className="text-[9px] font-bold text-slate-400">صنف برصيد</span></div></div><div className="mt-3 space-y-1.5" role="img" aria-label={`رسم مصغر لتوزيع رصيد ${warehouse.name} حسب الوحدة`}>{warehouse.unitTotals.length ? warehouse.unitTotals.map(total => <div key={`bar-${total.unit}`} className="flex items-center gap-2"><span className="w-14 truncate text-[9px] font-bold text-slate-500">{total.unit}</span><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/60"><span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(6, (Number(total.quantity) / maxUnitQuantity) * 100)}%` }} /></span><span className="w-14 text-left text-[9px] font-black text-slate-500">{formatQuantity(total.quantity)}</span></div>) : <span className="text-[9px] font-bold text-slate-400">لا يوجد توزيع لعرضه</span>}</div><p className="mt-2 text-[10px] font-bold text-[#0d4f62]">{selected ? "الجدول مفلتر على هذا المخزن" : "اضغط لعرض التفاصيل وتصفية الجدول"}</p></button></CardHeader>{expanded ? <CardContent className="max-h-72 overflow-y-auto p-3">{warehouse.items.length ? <div className="space-y-1.5">{warehouse.items.map(item => <div key={`${warehouse.id}-${item.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-[#eef3f5] px-2.5 py-2"><div className="min-w-0"><p className="truncate text-xs font-black text-[#102a43]">{item.name}</p><p className="mt-0.5 font-mono text-[10px] text-slate-400">{item.code}</p></div><strong className={`shrink-0 text-xs font-black ${tone.icon}`}>{formatQuantity(item.quantity)} <span className="font-bold text-slate-400">{item.unit}</span></strong></div>)}</div> : <p className="py-5 text-center text-xs font-bold text-slate-400">لا توجد أصناف ذات رصيد مسجل</p>}</CardContent> : null}</Card>; })}</section>
    <Card className="overflow-hidden border-[#dce7ee] bg-white shadow-sm"><CardHeader className="border-b border-[#edf2f5]"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="flex items-center gap-2 text-lg font-black text-[#102a43]"><Warehouse className="h-5 w-5 text-[#0d806c]" />{selectedWarehouse ? `أصناف ${selectedWarehouse.name}` : "توزيع الأصناف حسب المخازن"}</CardTitle>{selectedWarehouse ? <Button type="button" variant="outline" onClick={() => setSelectedWarehouseId(null)} className="h-8 rounded-lg px-3 text-xs font-black"><X className="ml-1 h-3.5 w-3.5" />عرض كل المخازن</Button> : null}</div><p className="mt-1 text-xs font-bold text-slate-400">{selectedWarehouse ? `يظهر ${visibleRows.length} صنفًا له رصيد في ${selectedWarehouse.name}` : "اضغط على بطاقة أي مخزن لتصفية الجدول حسب أصنافه"}</p></CardHeader><CardContent className="p-0">{audit.isLoading ? <div className="flex items-center justify-center gap-2 p-12 text-sm font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />جارٍ تحميل جرد المخازن...</div> : visibleRows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-right text-sm"><thead className="bg-[#f7fbfc] text-xs font-black text-[#536b78]"><tr><th className="px-4 py-4">الكود</th><th className="px-4 py-4">اسم الصنف</th><th className="px-4 py-4">الوحدة</th>{visibleWarehouses.map(warehouse => <th key={warehouse.id} className="px-4 py-4 text-center">{warehouse.name}</th>)}<th className="bg-[#e8f1f2] px-4 py-4 text-center text-[#0d4f62]">إجمالي الشركة</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{visibleRows.map(row => <tr key={row.id} className="hover:bg-[#fbfdff]"><td className="px-4 py-3 font-mono text-xs text-slate-500">{row.code}</td><td className="px-4 py-3 font-black text-[#102a43]">{row.name}</td><td className="px-4 py-3 text-slate-500">{row.unit || "—"}</td>{visibleWarehouses.map(warehouse => <td key={warehouse.id} className={`px-4 py-3 text-center font-black ${selectedWarehouseId === warehouse.id ? "bg-[#e8f7f6] text-[#0d4f62]" : "text-[#0d806c]"}`}>{formatQuantity(row.warehouseBalances.find(balance => balance.warehouseId === warehouse.id)?.currentStock)}</td>)}<td className="bg-[#f7fbfc] px-4 py-3 text-center text-base font-black text-[#0d4f62]">{formatQuantity(row.totalCurrentStock)}</td></tr>)}<tr className="bg-[#e8f1f2] font-black text-[#0d4f62]"><td colSpan={3} className="px-4 py-4">إجمالي أرصدة المخازن</td>{visibleWarehouses.map(warehouse => <td key={warehouse.id} className="px-4 py-4 text-center">{formatQuantity(warehouseTotalById.get(warehouse.id))}</td>)}<td className="px-4 py-4 text-center">{selectedWarehouseId ? formatQuantity(visibleRows.reduce((total, row) => total + row.totalCurrentStock, 0)) : formatQuantity(summary?.totalCompanyBalance)}</td></tr></tbody></table></div> : <div className="p-12 text-center text-sm text-slate-400">لا توجد أصناف ذات رصيد في المخزن المحدد.</div>}</CardContent></Card>
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}><DialogContent className="max-w-6xl rounded-2xl p-3" dir="rtl"><DialogHeader className="px-3 pt-3"><DialogTitle className="flex items-center gap-2 text-xl font-black text-[#102a43]"><FileText className="h-5 w-5 text-[#0d4f62]" />{selectedWarehouse ? `معاينة PDF — ${selectedWarehouse.name}` : "معاينة PDF الموحد للجرد"}</DialogTitle><DialogDescription>{selectedWarehouse ? `تقرير موحد لأصناف ${selectedWarehouse.name} ذات الرصيد، مع الكمية والوحدة قبل التنزيل أو الطباعة.` : "تقرير موحد لأرصدة جميع الأصناف موزعة حسب المخازن وإجمالي الشركة قبل التنزيل أو الطباعة."}</DialogDescription></DialogHeader><div className="mb-3 rounded-xl border border-[#dce7ee] bg-[#f7fbfc] px-3 py-2"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-black text-[#102a43]">اختيار أعمدة PDF</span><button type="button" onClick={() => setPdfColumns(pdfColumnOptions.map(column => column.key))} className="text-[11px] font-black text-[#0d7180]">تحديد الكل</button></div><div className="flex flex-wrap gap-2">{pdfColumnOptions.map(column => { const checked = pdfColumns.includes(column.key); return <label key={column.key} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${checked ? "border-[#0d806c] bg-[#e8f7f6] text-[#0d4f62]" : "border-[#dce7ee] bg-white text-slate-400"}`}><input type="checkbox" checked={checked} onChange={() => togglePdfColumn(column.key)} className="accent-[#0d806c]" />{column.label}</label>; })}</div>{pdfColumns.length === 0 ? <p className="mt-2 text-[10px] font-bold text-[#bd5147]">اختر عمودًا واحدًا على الأقل لإنشاء المعاينة.</p> : null}</div><div className="min-h-[60vh] overflow-hidden rounded-xl border border-[#dce7ee] bg-slate-100">{building ? <div className="flex h-[60vh] items-center justify-center gap-2 text-sm font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />جارٍ تجهيز ملف PDF العربي...</div> : reportUrl ? <iframe ref={iframeRef} src={reportUrl} title="معاينة تقرير الجرد الشامل PDF" className="h-[60vh] w-full bg-white" /> : <div className="flex h-[60vh] items-center justify-center text-sm text-slate-500">لا توجد بيانات متاحة للتقرير.</div>}</div><DialogFooter className="pdf-action-toolbar flex flex-col gap-2 px-3 pb-2"><Button type="button" variant="outline" onClick={() => setPreviewOpen(false)} className="rounded-xl">إغلاق</Button><Button type="button" variant="outline" onClick={printReport} disabled={!reportUrl} className="rounded-xl"><Printer className="ml-2 h-4 w-4" />طباعة</Button><Button type="button" onClick={downloadReport} disabled={!reportUrl} className="rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]"><Download className="ml-2 h-4 w-4" />تنزيل PDF</Button></DialogFooter></DialogContent></Dialog>
  </div></DashboardLayout>;
}
