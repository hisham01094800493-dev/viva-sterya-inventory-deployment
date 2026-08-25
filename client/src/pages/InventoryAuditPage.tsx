import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildCompanyInventoryAuditPdf } from "@/lib/inventoryExportFiles";
import { resolveCompanyLogoUrl } from "@/lib/brandAssets";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Download, FileText, Loader2, PackageCheck, Printer, RefreshCcw, Warehouse } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const formatQuantity = (value: unknown) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(Number(value ?? 0));

export default function InventoryAuditPage() {
  const [, setLocation] = useLocation();
  const audit = trpc.reports.inventoryAudit.useQuery();
  const settings = trpc.settings.list.useQuery();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const companyLogo = resolveCompanyLogoUrl(settings.data?.find(item => item.key === "company_logo_url")?.value);
  const watermarkEnabled = settings.data?.find(item => item.key === "report_watermark_enabled")?.value !== "false";
  const watermarkOpacity = Number(settings.data?.find(item => item.key === "report_watermark_opacity")?.value ?? "0.08");
  const watermarkScale = Number(settings.data?.find(item => item.key === "report_watermark_scale")?.value ?? "0.42");
  const watermarkPosition = (settings.data?.find(item => item.key === "report_watermark_position")?.value ?? "center") as "center" | "top" | "bottom";
  const watermarkRepeat = settings.data?.find(item => item.key === "report_watermark_repeat")?.value === "true";
  const summary = audit.data?.summary;
  const warehouseTotalById = useMemo(() => new Map((audit.data?.warehouses ?? []).map(warehouse => [warehouse.id, (audit.data?.rows ?? []).reduce((total, row) => total + (row.warehouseBalances.find(balance => balance.warehouseId === warehouse.id)?.currentStock ?? 0), 0)])), [audit.data]);

  useEffect(() => {
    let active = true;
    if (!previewOpen || !audit.data) { setReportUrl(null); setBuilding(false); return; }
    setBuilding(true);
    void buildCompanyInventoryAuditPdf(audit.data, { logo: companyLogo, watermarkEnabled, watermarkOpacity, watermarkScale, watermarkPosition, watermarkRepeat }).then(doc => {
      if (!active) return;
      setReportUrl(URL.createObjectURL(doc.output("blob")));
      setBuilding(false);
    }).catch(error => { if (active) { setBuilding(false); toast.error(error?.message || "تعذر إنشاء تقرير الجرد الشامل"); } });
    return () => { active = false; setReportUrl(current => { if (current) URL.revokeObjectURL(current); return null; }); };
  }, [previewOpen, audit.data, companyLogo, watermarkEnabled, watermarkOpacity, watermarkScale, watermarkPosition, watermarkRepeat]);

  const downloadReport = () => { if (!reportUrl) return; const link = document.createElement("a"); link.href = reportUrl; link.download = "smart-inventory-company-inventory-audit.pdf"; link.click(); };
  const printReport = () => { iframeRef.current?.contentWindow?.focus(); iframeRef.current?.contentWindow?.print(); };

  return <DashboardLayout><div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-6">
    <section className="flex flex-col justify-between gap-4 rounded-[1.5rem] border border-[#dce7ee] bg-white p-5 shadow-[0_18px_50px_rgba(18,44,84,0.06)] md:flex-row md:items-end"><div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-[#d08a3b]">COMPANY INVENTORY AUDIT</p><h2 className="text-3xl font-black tracking-tight text-[#102a43]">تقرير الجرد الشامل</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">يعرض الرصيد الفعلي لكل صنف موزعًا على المخزن الرئيسي والفروع ومخزن الهالك، مع إجمالي الشركة.</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setLocation("/warehouses")} className="rounded-xl"><ArrowRight className="ml-2 h-4 w-4" />المخازن</Button><Button type="button" variant="outline" onClick={() => void audit.refetch()} disabled={audit.isFetching} className="rounded-xl"><RefreshCcw className={`ml-2 h-4 w-4 ${audit.isFetching ? "animate-spin" : ""}`} />تحديث</Button><Button type="button" onClick={() => setPreviewOpen(true)} disabled={!audit.data || audit.isFetching} className="rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]"><FileText className="ml-2 h-4 w-4" />معاينة وتصدير PDF</Button></div></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Card className="border-[#dce7ee] bg-white"><CardContent className="flex items-center justify-between p-4"><span className="text-sm font-black text-slate-500">إجمالي الأصناف</span><strong className="text-2xl font-black text-[#0d4f62]">{formatQuantity(summary?.totalItems)}</strong></CardContent></Card><Card className="border-[#b9d4d9] bg-[#f7fbfc]"><CardContent className="flex items-center justify-between p-4"><span className="text-sm font-black text-[#0d4f62]">إجمالي رصيد الشركة</span><strong className="text-2xl font-black text-[#0d806c]">{formatQuantity(summary?.totalCompanyBalance)}</strong></CardContent></Card><Card className="border-[#f1d1a7] bg-[#fffaf5]"><CardContent className="flex items-center gap-2 p-4 text-sm font-black text-[#a96821]"><PackageCheck className="h-5 w-5" />الأرصدة موزعة حسب كل مخزن</CardContent></Card></section>
    <Card className="overflow-hidden border-[#dce7ee] bg-white shadow-sm"><CardHeader className="border-b border-[#edf2f5]"><CardTitle className="flex items-center gap-2 text-lg font-black text-[#102a43]"><Warehouse className="h-5 w-5 text-[#0d806c]" />توزيع الأصناف حسب المخازن</CardTitle></CardHeader><CardContent className="p-0">{audit.isLoading ? <div className="flex items-center justify-center gap-2 p-12 text-sm font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />جارٍ تحميل جرد المخازن...</div> : audit.data?.rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-right text-sm"><thead className="bg-[#f7fbfc] text-xs font-black text-[#536b78]"><tr><th className="px-4 py-4">الكود</th><th className="px-4 py-4">اسم الصنف</th><th className="px-4 py-4">الوحدة</th>{audit.data.warehouses.map(warehouse => <th key={warehouse.id} className="px-4 py-4 text-center">{warehouse.name}</th>)}<th className="bg-[#e8f1f2] px-4 py-4 text-center text-[#0d4f62]">إجمالي الشركة</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{audit.data.rows.map(row => <tr key={row.id} className="hover:bg-[#fbfdff]"><td className="px-4 py-3 font-mono text-xs text-slate-500">{row.code}</td><td className="px-4 py-3 font-black text-[#102a43]">{row.name}</td><td className="px-4 py-3 text-slate-500">{row.unit || "—"}</td>{audit.data.warehouses.map(warehouse => <td key={warehouse.id} className="px-4 py-3 text-center font-black text-[#0d806c]">{formatQuantity(row.warehouseBalances.find(balance => balance.warehouseId === warehouse.id)?.currentStock)}</td>)}<td className="bg-[#f7fbfc] px-4 py-3 text-center text-base font-black text-[#0d4f62]">{formatQuantity(row.totalCurrentStock)}</td></tr>)}<tr className="bg-[#e8f1f2] font-black text-[#0d4f62]"><td colSpan={3} className="px-4 py-4">إجمالي أرصدة المخازن</td>{audit.data.warehouses.map(warehouse => <td key={warehouse.id} className="px-4 py-4 text-center">{formatQuantity(warehouseTotalById.get(warehouse.id))}</td>)}<td className="px-4 py-4 text-center">{formatQuantity(summary?.totalCompanyBalance)}</td></tr></tbody></table></div> : <div className="p-12 text-center text-sm text-slate-400">لا توجد أصناف مسجلة لإنشاء تقرير الجرد الشامل.</div>}</CardContent></Card>
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}><DialogContent className="max-w-6xl rounded-2xl p-3" dir="rtl"><DialogHeader className="px-3 pt-3"><DialogTitle className="flex items-center gap-2 text-xl font-black text-[#102a43]"><FileText className="h-5 w-5 text-[#0d4f62]" />معاينة تقرير الجرد الشامل</DialogTitle><DialogDescription>يتضمن أرصدة جميع الأصناف موزعة حسب المخازن وإجمالي الشركة قبل التنزيل أو الطباعة.</DialogDescription></DialogHeader><div className="min-h-[60vh] overflow-hidden rounded-xl border border-[#dce7ee] bg-slate-100">{building ? <div className="flex h-[60vh] items-center justify-center gap-2 text-sm font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />جارٍ تجهيز ملف PDF العربي...</div> : reportUrl ? <iframe ref={iframeRef} src={reportUrl} title="معاينة تقرير الجرد الشامل PDF" className="h-[60vh] w-full bg-white" /> : <div className="flex h-[60vh] items-center justify-center text-sm text-slate-500">لا توجد بيانات متاحة للتقرير.</div>}</div><DialogFooter className="pdf-action-toolbar flex flex-col gap-2 px-3 pb-2"><Button type="button" variant="outline" onClick={() => setPreviewOpen(false)} className="rounded-xl">إغلاق</Button><Button type="button" variant="outline" onClick={printReport} disabled={!reportUrl} className="rounded-xl"><Printer className="ml-2 h-4 w-4" />طباعة</Button><Button type="button" onClick={downloadReport} disabled={!reportUrl} className="rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]"><Download className="ml-2 h-4 w-4" />تنزيل PDF</Button></DialogFooter></DialogContent></Dialog>
  </div></DashboardLayout>;
}
