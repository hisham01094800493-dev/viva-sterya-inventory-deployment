import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { resolveCompanyLogoUrl } from "@/lib/brandAssets";
import { createReportMailtoUrl, sharePdfFile } from "@/lib/reportSharing";
import { buildAccountStatementPdf, buildMainWarehousePdf, downloadAccountStatementExcel, downloadAccountStatementPdf, type ExportColumnKey } from "@/lib/inventoryExportFiles";
import { ArrowRight, ArrowUpDown, Building2, Check, Download, Edit3, Eye, FileText, GripVertical, Loader2, Mail, MapPin, Package, Phone, Plus, Printer, Save, Search, Share2, Truck, UserRound, Warehouse } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";

const surface = "rounded-[1.5rem] border-[#dce7ee] bg-white shadow-[0_18px_50px_rgba(18,44,84,0.06)]";

export function getInventoryStatus(currentStock: unknown, reorderLevel: unknown) {
  const stock = Number(currentStock ?? 0);
  const reorder = Number(reorderLevel ?? 0);
  if (stock <= 0) return { label: "نافد", className: "bg-[#fbeceb] text-[#bd5147]", dotClassName: "bg-[#bd5147]" };
  if (reorder > 0 && stock <= reorder) return { label: "منخفض", className: "bg-[#fff4df] text-[#a96821]", dotClassName: "bg-[#d08a3b]" };
  return { label: "متوفر", className: "bg-[#e8f7f6] text-[#0d806c]", dotClassName: "bg-[#0d806c]" };
}

export function getInventoryStatusLabel(currentStock: unknown, reorderLevel: unknown) {
  return getInventoryStatus(currentStock, reorderLevel).label;
}

export function summarizeInventoryStatuses(rows: Array<{ currentStock?: unknown; reorderLevel?: unknown }>) {
  return rows.reduce((summary, row) => {
    const label = getInventoryStatusLabel(row.currentStock, row.reorderLevel);
    if (label === "نافد") summary.outOfStock += 1;
    else if (label === "منخفض") summary.low += 1;
    else summary.available += 1;
    return summary;
  }, { available: 0, low: 0, outOfStock: 0 });
}

export function filterAndSortDirectory<T extends { name: string; phone?: string | null; email?: string | null }> (rows: T[], search: string, sortKey: "name" | "phone" | "email", direction: "asc" | "desc") {
  const normalized = search.trim().toLocaleLowerCase();
  return rows.filter(row => !normalized || [row.name, row.phone, row.email].some(value => String(value ?? "").toLocaleLowerCase().includes(normalized))).sort((a, b) => { const left = String(a[sortKey] ?? a.name); const right = String(b[sortKey] ?? b.name); return direction === "asc" ? left.localeCompare(right, "ar") : right.localeCompare(left, "ar"); });
}

export function buildAccountStatementRows(rows: Array<{ id: number; date: string; eznNum: string; itemName: string | null; quantity: unknown; unitPrice?: unknown; totalValue?: unknown; documentImageUrl?: string | null; supplierId?: number | null; customerId?: number | null }>, kind: "supplier" | "customer", entityId: number) {
  return rows.filter(row => (kind === "supplier" ? row.supplierId === entityId : row.customerId === entityId)).map(row => ({ id: row.id, date: row.date, number: row.eznNum, item: row.itemName, quantity: Number(row.quantity), unitPrice: Number(row.unitPrice ?? 0), total: Number(row.totalValue ?? 0), type: kind === "supplier" ? "إضافة" : "صرف", documentImageUrl: row.documentImageUrl ?? null }));
}

function DirectoryToolbar({ search, onSearch, sortKey, onSortKey, direction, onDirection }: { search: string; onSearch: (value: string) => void; sortKey: "name" | "phone" | "email"; onSortKey: (value: "name" | "phone" | "email") => void; direction: "asc" | "desc"; onDirection: () => void }) {
  return <div className="flex flex-col gap-3 border-b border-[#edf2f5] p-5 md:flex-row"><div className="relative flex-1"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={event => onSearch(event.target.value)} placeholder="بحث بالاسم أو الهاتف أو البريد" className="rounded-xl pr-9" /></div><select value={sortKey} onChange={event => onSortKey(event.target.value as "name" | "phone" | "email")} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="name">الترتيب بالاسم</option><option value="phone">الترتيب بالهاتف</option><option value="email">الترتيب بالبريد</option></select><Button type="button" variant="outline" onClick={onDirection} className="rounded-xl"><ArrowUpDown className="ml-2 h-4 w-4" />{direction === "asc" ? "تصاعدي" : "تنازلي"}</Button></div>;
}

function WarehouseSwitcher({ warehouses, selectedSlot, onSelect }: { warehouses: Array<{ id: number; slot: number; name: string }>; selectedSlot: number; onSelect: (slot: number) => void }) {
  const main = warehouses.find(item => item.slot === 1) ?? warehouses[0];
  const others = warehouses.filter(item => item.id !== main?.id);
  const [branchesOpen, setBranchesOpen] = useState(selectedSlot !== 1);
  if (!main) return null;
  const buttonClass = (active: boolean, damaged = false) => `min-w-[118px] rounded-xl border px-3 py-2 text-right transition ${active ? "border-[#0d7180] bg-[#0d4f62] text-white shadow-md shadow-[#0d4f62]/15" : damaged ? "border-[#f2d2bf] bg-[#fffaf5] text-[#9a4f25] hover:border-[#d08a3b]" : "border-[#dce7ee] bg-white text-[#102a43] hover:border-[#0d7180] hover:bg-[#f7fbfc]"}`;
  return <section className="overflow-hidden rounded-2xl border border-[#dce7ee] bg-white shadow-[0_10px_28px_rgba(18,44,84,0.04)]"><div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-l from-[#f7fbfc] to-white px-4 py-3"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d08a3b]">WAREHOUSE CONTROL</p><h3 className="mt-0.5 text-base font-black text-[#102a43]">المخزن الرئيسي والفروع</h3></div><button type="button" onClick={() => onSelect(main.slot)} className={buttonClass(selectedSlot === main.slot)}><span className="block text-[10px] opacity-75">المخزن الأساسي</span><strong className="block truncate text-xs">{main.name}</strong></button></div><div className="border-t border-[#edf2f5]"><button type="button" onClick={() => setBranchesOpen(value => !value)} className="flex w-full items-center justify-between px-4 py-2.5 text-right text-xs font-black text-[#536b78] hover:bg-[#f7fbfc]"><span>فروع المخازن ومخزن الهالك <span className="mr-1 rounded-full bg-[#e8f1f2] px-2 py-0.5 text-[10px] text-[#0d4f62]">{others.length}</span></span><span className="text-[#0d7180]">{branchesOpen ? "إخفاء" : "عرض"}</span></button>{branchesOpen && <div className="flex flex-wrap gap-2 border-t border-[#edf2f5] px-4 py-3">{others.map(item => { const damaged = item.name.includes("هالك"); return <button key={item.id} type="button" onClick={() => onSelect(item.slot)} className={buttonClass(selectedSlot === item.slot, damaged)}><span className="block text-[10px] opacity-70">{damaged ? "هالك" : `فرع ${item.slot - 1}`}</span><strong className="block whitespace-nowrap text-xs">{item.name}</strong></button>; })}</div>}</div></section>;
}

type WarehouseStockTableRow = { id: number; code: string; name: string; category: string | null; currentStock: number | string; reorderLevel: number | string; unitPrice?: number | string | null };

const WAREHOUSE_FINANCIAL_PERMISSION = "warehouse-financial-details";
const WAREHOUSE_FINANCIAL_PREFERENCE_KEY = "warehouse-financial-columns-v3";

export function WarehousesPage() {
  const [, params] = useRoute("/warehouses/:slot");
  const [, setLocation] = useLocation();
  const requestedSlot = params?.slot ? Number(params.slot) : 1;
  const warehouses = trpc.warehouses.list.useQuery();
  const selected = warehouses.data?.find(item => item.slot === requestedSlot) ?? warehouses.data?.[0];
  const items = trpc.items.warehouseStocks.useQuery({ warehouseId: selected?.id ?? 1 }, { enabled: Boolean(selected) }) as unknown as { data?: WarehouseStockTableRow[]; isLoading: boolean };
  const update = trpc.warehouses.update.useMutation();
  const utils = trpc.useUtils();
  const permissions = trpc.permissions.mine.useQuery();
  const preferences = trpc.preferences.get.useQuery();
  const updatePreferences = trpc.preferences.update.useMutation();
  const canViewFinancialDetails = permissions.data?.allowedReports.includes(WAREHOUSE_FINANCIAL_PERMISSION) ?? false;
  const [financialPreferenceVisible, setFinancialPreferenceVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [reportBuilding, setReportBuilding] = useState(false);
  const reportIframeRef = useRef<HTMLIFrameElement>(null);
  const reportCards = trpc.items.warehouseCards.useQuery({ warehouseId: selected?.id ?? 1 }, { enabled: reportOpen && Boolean(selected) });
  const reportSettings = trpc.settings.list.useQuery(undefined, { enabled: reportOpen });
  const reportLogo = resolveCompanyLogoUrl(reportSettings.data?.find(item => item.key === "company_logo_url")?.value);
  const reportWatermarkEnabled = reportSettings.data?.find(item => item.key === "report_watermark_enabled")?.value !== "false";
  const reportWatermarkOpacity = Number(reportSettings.data?.find(item => item.key === "report_watermark_opacity")?.value ?? "0.08");
  const reportWatermarkScale = Number(reportSettings.data?.find(item => item.key === "report_watermark_scale")?.value ?? "0.42");
  const reportWatermarkPosition = (reportSettings.data?.find(item => item.key === "report_watermark_position")?.value ?? "center") as "center" | "top" | "bottom";
  const reportWatermarkRepeat = reportSettings.data?.find(item => item.key === "report_watermark_repeat")?.value === "true";

  useEffect(() => {
    const saved = preferences.data?.reportColumnOrder?.[WAREHOUSE_FINANCIAL_PREFERENCE_KEY] ?? [];
    setFinancialPreferenceVisible(canViewFinancialDetails && saved.includes("visible"));
  }, [canViewFinancialDetails, preferences.data?.reportColumnOrder]);

  useEffect(() => {
    if (selected && editingId === null) setDraft(selected.name);
  }, [selected, editingId]);

  useEffect(() => { let active = true; const cards = (reportCards.data ?? []).filter(Boolean) as any[]; if (!reportOpen || !cards.length) { setReportUrl(null); setReportBuilding(false); return; } setReportBuilding(true); void buildMainWarehousePdf(cards, { logo: reportLogo, warehouseName: selected?.name ?? "المخزن الرئيسي", watermarkEnabled: reportWatermarkEnabled, watermarkOpacity: reportWatermarkOpacity, watermarkScale: reportWatermarkScale, watermarkPosition: reportWatermarkPosition, watermarkRepeat: reportWatermarkRepeat }).then(doc => { if (!active) return; setReportUrl(URL.createObjectURL(doc.output("blob"))); setReportBuilding(false); }).catch(error => { if (active) { setReportBuilding(false); toast.error(error?.message || `تعذر إنشاء تقرير ${selected?.name ?? "المخزن"}`); } }); return () => { active = false; setReportUrl(current => { if (current) URL.revokeObjectURL(current); return null; }); }; }, [reportOpen, reportCards.data, reportLogo, selected?.name, reportWatermarkEnabled, reportWatermarkOpacity, reportWatermarkScale, reportWatermarkPosition, reportWatermarkRepeat]);

  function printWarehouseReport() { reportIframeRef.current?.contentWindow?.focus(); reportIframeRef.current?.contentWindow?.print(); }
  function openWarehouseReportExternal() { if (!reportUrl) return; const opened = window.open(reportUrl, "_blank", "noopener,noreferrer"); if (!opened) toast.info("تعذر فتح نافذة جديدة. استخدم زر تنزيل PDF ثم افتح الملف من الهاتف أو الكمبيوتر."); }
  const reportName = selected?.name ?? "المخزن الرئيسي";
  const reportFileName = `smart-inventory-warehouse-${selected?.slot ?? 1}.pdf`;
  function shareWarehouseReportByEmail() { window.location.href = createReportMailtoUrl(`تقرير ${reportName}`, reportFileName); }
  async function shareWarehouseOnPhone() { if (!reportUrl) return; try { const result = await sharePdfFile(reportUrl, `تقرير ${reportName}`, reportFileName); if (result === "shared") toast.success("تم فتح خيارات المشاركة على الهاتف"); else if (result === "unsupported") toast.info("المشاركة المباشرة غير مدعومة هنا. استخدم مشاركة البريد أو تنزيل الملف."); } catch (error: any) { toast.error(error?.message || "تعذرت مشاركة التقرير"); } }
  function downloadWarehouseReport() { if (!reportUrl) return; const link = document.createElement("a"); link.href = reportUrl; link.download = reportFileName; link.click(); }

  async function saveWarehouse(id: number) {
    try {
      await update.mutateAsync({ id, name: draft });
      await utils.warehouses.list.invalidate();
      setEditingId(null);
      toast.success("تم تحديث اسم المخزن");
    } catch (error: any) { toast.error(error?.message || "تعذر تحديث اسم المخزن"); }
  }

  async function toggleFinancialDetails() {
    const next = !financialPreferenceVisible;
    setFinancialPreferenceVisible(next);
    try {
      await updatePreferences.mutateAsync({
        quickActions: preferences.data?.quickActions ?? ["/additions", "/disbursements", "/transfers"],
        hapticEnabled: preferences.data?.hapticEnabled ?? true,
        reportColumnOrder: {
          ...(preferences.data?.reportColumnOrder ?? {}),
          [WAREHOUSE_FINANCIAL_PREFERENCE_KEY]: next ? ["visible"] : [],
        },
      });
    } catch (error: any) {
      setFinancialPreferenceVisible(!next);
      toast.error(error?.message || "تعذر حفظ اختيار التفاصيل المالية");
    }
  }

  const showFinancialDetails = canViewFinancialDetails && financialPreferenceVisible;

  return <DashboardLayout><div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-7">
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-[#d08a3b]">WAREHOUSE CONTROL</p><h2 className="text-3xl font-black tracking-tight text-[#102a43]">المخازن</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">ابدأ بالمخزن الرئيسي، ثم انتقل بين المخازن الأخرى من المبدّل الداخلي دون ازدحام التنقل الجانبي.</p></div><div className="flex flex-wrap items-center gap-2"><Badge className="w-fit rounded-full bg-[#e8f1f2] px-4 py-2 text-[#0d4f62]">{warehouses.data?.length ?? 1} مخازن</Badge><Button type="button" variant="outline" onClick={() => setLocation("/inventory-audit")} className="rounded-xl border-[#b9d4d9] text-[#0d4f62]"><Package className="ml-2 h-4 w-4" />تقرير الجرد الشامل</Button><Button type="button" onClick={() => setReportOpen(true)} disabled={!selected || items.isLoading} className="rounded-xl bg-[#0d4f62] font-bold text-white hover:bg-[#0a4150]"><FileText className="ml-2 h-4 w-4" />معاينة PDF لـ {reportName}</Button></div></div>
    <WarehouseSwitcher warehouses={warehouses.data ?? []} selectedSlot={selected?.slot ?? requestedSlot} onSelect={slot => setLocation(slot === 1 ? "/warehouses" : `/warehouses/${slot}`)} />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[selected ?? { id: 1, slot: 1, name: "المخزن الرئيسي" }].map(item => <Card key={item.id} className={`${surface} ring-2 ring-[#0d806c]/25`}><CardContent className="p-5"><div className="mb-5 flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8f1f2] text-[#0d4f62]"><Warehouse className="h-5 w-5" /></div><Badge variant="outline" className="rounded-full border-[#dce7ee] text-xs text-slate-400">#{item.slot}</Badge></div><p className="text-xs font-bold text-slate-400">اسم المخزن المحدد</p>{editingId === item.id ? <div className="mt-2 space-y-3"><Input value={draft} onChange={event => setDraft(event.target.value)} className="rounded-xl" autoFocus /><div className="flex gap-2"><Button size="sm" onClick={() => void saveWarehouse(item.id)} disabled={update.isPending} className="rounded-xl bg-[#0d4f62] text-white"><Save className="ml-1 h-3.5 w-3.5" />حفظ</Button><Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="rounded-xl">إلغاء</Button></div></div> : <div className="mt-2 flex items-center justify-between gap-2"><h3 className="truncate text-lg font-black text-[#102a43]">{item.name}</h3><Button size="icon" variant="ghost" onClick={() => { setEditingId(item.id); setDraft(item.name); }} className="rounded-xl text-[#0d4f62]" aria-label={`تعديل ${item.name}`}><Edit3 className="h-4 w-4" /></Button></div>}</CardContent></Card>)}</div>
    <Card className={surface}><CardHeader className="border-b border-[#edf2f5] pb-4"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="flex items-center gap-2 text-lg font-black text-[#102a43]"><Package className="h-5 w-5 text-[#0d806c]" />أصناف {selected?.name ?? "المخزن"}</CardTitle>{canViewFinancialDetails ? <Button type="button" variant="outline" size="sm" onClick={() => void toggleFinancialDetails()} disabled={updatePreferences.isPending || permissions.isLoading || preferences.isLoading} aria-pressed={showFinancialDetails} className="movement-financial-toggle rounded-xl text-xs font-black"><Eye className="ml-1.5 h-4 w-4" />{showFinancialDetails ? "إخفاء التفاصيل المالية" : "إظهار التفاصيل المالية"}</Button> : null}</div></CardHeader><CardContent className="p-0">{(() => { const summary = summarizeInventoryStatuses(items.data ?? []); return <div className="grid gap-3 border-b border-[#edf2f5] bg-[#fbfdff] p-4 sm:grid-cols-3"><div className="flex items-center justify-between rounded-2xl bg-[#e8f7f6] px-4 py-3"><span className="text-xs font-black text-[#0d806c]">متوفر</span><strong className="text-xl font-black text-[#0d806c]">{summary.available.toLocaleString("en-US")}</strong></div><div className="flex items-center justify-between rounded-2xl bg-[#fff4df] px-4 py-3"><span className="text-xs font-black text-[#a96821]">منخفض</span><strong className="text-xl font-black text-[#a96821]">{summary.low.toLocaleString("en-US")}</strong></div><div className="flex items-center justify-between rounded-2xl bg-[#fbeceb] px-4 py-3"><span className="text-xs font-black text-[#bd5147]">نافد</span><strong className="text-xl font-black text-[#bd5147]">{summary.outOfStock.toLocaleString("en-US")}</strong></div></div>; })()}{items.isLoading ? <div className="flex items-center justify-center p-12 text-slate-400"><Loader2 className="ml-2 h-5 w-5 animate-spin" />جارٍ تحميل الأصناف</div> : items.data?.length ? <div className="overflow-x-auto"><table data-warehouse-stock-table="true" className="w-full min-w-[700px] text-right text-sm"><thead className="bg-[#f7fbfc] text-xs font-black text-slate-400"><tr><th className="px-5 py-4">الكود</th><th className="px-5 py-4">اسم الصنف</th><th className="px-5 py-4">التصنيف</th><th className="px-5 py-4">الرصيد الحالي</th><th className="px-5 py-4">الحالة</th>{showFinancialDetails ? <><th className="px-5 py-4">سعر الوحدة</th><th className="px-5 py-4">إجمالي السعر</th></> : null}</tr></thead><tbody className="divide-y divide-[#eef3f5]">{items.data.map(item => { const unitPrice = item.unitPrice == null ? null : Number(item.unitPrice); const totalPrice = unitPrice == null ? null : Number(item.currentStock) * unitPrice; return <tr key={item.id} className="hover:bg-[#fbfdff]"><td className="px-5 py-4 font-mono text-xs text-slate-500">{item.code}</td><td className="px-5 py-4 font-black text-[#102a43]">{item.name}</td><td className="px-5 py-4 text-slate-500">{item.category || "بدون تصنيف"}</td><td className="px-5 py-4 font-black text-[#0d806c]">{Number(item.currentStock).toLocaleString("en-US")}</td><td className="px-5 py-4">{(() => { const status = getInventoryStatus(item.currentStock, item.reorderLevel); return <Badge className={`rounded-full px-3 py-1 text-[11px] font-black ${status.className}`}><span className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full ${status.dotClassName}`} />{status.label}</Badge>; })()}</td>{showFinancialDetails ? <><td className="px-5 py-4 text-[#0d4f62]">{unitPrice == null ? "—" : `${unitPrice.toLocaleString("en-US")} ج.م`}</td><td className="px-5 py-4 font-black text-[#0d4f62]">{totalPrice == null ? "—" : `${totalPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`}</td></> : null}</tr>; })}</tbody></table></div> : <div className="p-12 text-center text-sm text-slate-400">لا توجد أصناف مرتبطة بهذا المخزن حالياً. اختر المخزن عند إضافة صنف جديد.</div>}</CardContent></Card><Dialog open={reportOpen} onOpenChange={setReportOpen}><DialogContent className="max-w-5xl rounded-2xl p-3" dir="rtl"><DialogHeader className="px-3 pt-3"><DialogTitle className="flex items-center gap-2 text-xl font-black text-[#102a43]"><FileText className="h-5 w-5 text-[#0d4f62]" />معاينة تقرير {reportName}</DialogTitle><DialogDescription>يعرض أصناف {reportName} فقط، مع الصورة والرصيد والحركات المرتبطة قبل الطباعة.</DialogDescription></DialogHeader><div className="min-h-[58vh] overflow-hidden rounded-xl border border-[#dce7ee] bg-slate-100">{reportBuilding || reportCards.isLoading ? <div className="flex h-[58vh] items-center justify-center gap-2 text-sm font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />جاري تجهيز تقرير PDF العربي...</div> : reportUrl ? <iframe ref={reportIframeRef} src={reportUrl} title={`معاينة تقرير ${reportName} PDF`} className="h-[58vh] w-full bg-white" /> : <div className="flex h-[58vh] items-center justify-center text-sm text-slate-500">لا توجد أصناف في {reportName} لإنشاء التقرير.</div>}</div><DialogFooter className="pdf-action-toolbar flex flex-col items-stretch gap-2 px-3 pb-2 [&>button]:w-full"><Button type="button" variant="outline" onClick={() => setReportOpen(false)} title="إغلاق معاينة PDF" className="rounded-xl">إغلاق</Button><Button type="button" variant="outline" onClick={printWarehouseReport} disabled={!reportUrl} title={`طباعة تقرير ${reportName} مباشرة`} className="rounded-xl"><Printer className="ml-2 h-4 w-4" />طباعة مباشرة</Button><Button type="button" variant="outline" onClick={openWarehouseReportExternal} disabled={!reportUrl} title={`فتح تقرير ${reportName} في نافذة خارجية`} className="rounded-xl"><FileText className="ml-2 h-4 w-4" />معاينة خارجية</Button><Button type="button" variant="outline" onClick={() => void shareWarehouseOnPhone()} disabled={!reportUrl} title={`مشاركة تقرير ${reportName} من الهاتف`} className="rounded-xl border-[#0d806c] text-[#0d806c]"><Share2 className="ml-2 h-4 w-4" />مشاركة الهاتف</Button><Button type="button" variant="outline" onClick={shareWarehouseReportByEmail} disabled={!reportUrl} title={`إرسال تقرير ${reportName} عبر البريد الإلكتروني`} className="rounded-xl border-[#b9d4d9] text-[#0d4f62]"><Mail className="ml-2 h-4 w-4" />مشاركة بالبريد</Button><Button type="button" onClick={downloadWarehouseReport} disabled={!reportUrl} title={`تنزيل تقرير ${reportName} بصيغة PDF`} className="rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]"><FileText className="ml-2 h-4 w-4" />تنزيل PDF</Button></DialogFooter></DialogContent></Dialog>
  </div></DashboardLayout>;
}

export function SuppliersPage() {
  const suppliers = trpc.suppliers.list.useQuery();
  const create = trpc.suppliers.create.useMutation();
  const update = trpc.suppliers.update.useMutation();
  const utils = trpc.useUtils();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "phone" | "email">("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const visibleSuppliers = useMemo(() => filterAndSortDirectory(suppliers.data ?? [], search, sortKey, direction), [suppliers.data, search, sortKey, direction]);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(current => ({ ...current, [key]: event.target.value }));
  function reset() { setEditingId(null); setForm({ name: "", phone: "", email: "", address: "", notes: "" }); }
  function edit(item: any) { setEditingId(item.id); setForm({ name: item.name, phone: item.phone ?? "", email: item.email ?? "", address: item.address ?? "", notes: item.notes ?? "" }); }
  async function submit(event: React.FormEvent) { event.preventDefault(); try { const payload = { ...form, phone: form.phone || null, email: form.email || null, address: form.address || null, notes: form.notes || null }; if (editingId) await update.mutateAsync({ id: editingId, ...payload }); else await create.mutateAsync(payload); await utils.suppliers.list.invalidate(); toast.success(editingId ? "تم تحديث بيانات المورد" : "تمت إضافة المورد"); reset(); } catch (error: any) { toast.error(error?.message || "تعذر حفظ بيانات المورد"); } }
  const busy = create.isPending || update.isPending;
  return <DashboardLayout><div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-7">
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-[#d08a3b]">SUPPLIER DIRECTORY</p><h2 className="text-3xl font-black tracking-tight text-[#102a43]">الموردون</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">احتفظ بدليل موحد للموردين وبيانات التواصل، واستخدمه عند تسجيل الإضافات والحركات.</p></div><Badge className="w-fit rounded-full bg-[#e7f5ef] px-4 py-2 text-[#0d806c]">{suppliers.data?.length ?? 0} مورد</Badge></div>
    <Card className={surface}><CardHeader><CardTitle className="flex items-center gap-2 text-lg font-black text-[#102a43]"><Plus className="h-5 w-5 text-[#0d806c]" />{editingId ? "تعديل المورد" : "إضافة مورد جديد"}</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><div className="space-y-2"><Label>اسم المورد *</Label><Input value={form.name} onChange={set("name")} required placeholder="مثال: شركة النور" className="rounded-xl" /></div><div className="space-y-2"><Label>الهاتف</Label><Input value={form.phone} onChange={set("phone")} placeholder="رقم التواصل" className="rounded-xl" /></div><div className="space-y-2"><Label>البريد الإلكتروني</Label><Input type="email" value={form.email} onChange={set("email")} placeholder="supplier@example.com" className="rounded-xl" /></div><div className="space-y-2"><Label>العنوان</Label><Input value={form.address} onChange={set("address")} placeholder="العنوان" className="rounded-xl" /></div><div className="flex items-end gap-2"><Button type="submit" disabled={busy} className="h-10 flex-1 rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]">{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : editingId ? <Save className="ml-2 h-4 w-4" /> : <Plus className="ml-2 h-4 w-4" />}{editingId ? "حفظ التعديل" : "إضافة المورد"}</Button>{editingId ? <Button type="button" variant="outline" onClick={reset} className="h-10 rounded-xl">إلغاء</Button> : null}</div></form></CardContent></Card>
    <Card className={surface}><CardHeader className="border-b border-[#edf2f5] pb-4"><CardTitle className="flex items-center gap-2 text-lg font-black text-[#102a43]"><Truck className="h-5 w-5 text-[#d08a3b]" />دليل الموردين</CardTitle></CardHeader><CardContent className="p-0">{suppliers.isLoading ? <div className="p-12 text-center text-slate-400">جارٍ تحميل الموردين...</div> : suppliers.data?.length ? <><DirectoryToolbar search={search} onSearch={setSearch} sortKey={sortKey} onSortKey={setSortKey} direction={direction} onDirection={() => setDirection(value => value === "asc" ? "desc" : "asc")} /><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-right text-sm"><thead className="bg-[#f7fbfc] text-xs font-black text-slate-400"><tr><th className="px-5 py-4">المورد</th><th className="px-5 py-4">الهاتف</th><th className="px-5 py-4">البريد</th><th className="px-5 py-4">العنوان</th><th className="px-5 py-4">إجراء</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{visibleSuppliers.map(item => <tr key={item.id} className="hover:bg-[#fbfdff]"><td className="px-5 py-4 font-black text-[#102a43]">{item.name}</td><td className="px-5 py-4 text-slate-500">{item.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{item.phone}</span> : "—"}</td><td className="px-5 py-4 text-slate-500">{item.email ? <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{item.email}</span> : "—"}</td><td className="px-5 py-4 text-slate-500">{item.address ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.address}</span> : "—"}</td><td className="px-5 py-4"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => edit(item)} className="rounded-xl border-[#dce7ee] text-[#0d4f62]"><Edit3 className="ml-1 h-3.5 w-3.5" />تعديل</Button><Button variant="outline" size="sm" onClick={() => window.location.href = `/suppliers/${item.id}/statement`} className="rounded-xl"><FileText className="ml-1 h-3.5 w-3.5" />كشف الحساب</Button></div></td></tr>)}</tbody></table></div></> : <div className="p-12 text-center text-sm text-slate-400">لم تتم إضافة موردين بعد. ابدأ بإضافة أول مورد من النموذج أعلاه.</div>}</CardContent></Card>
  </div></DashboardLayout>;
}

export function CustomersPage() {
  const customers = trpc.customers.list.useQuery();
  const create = trpc.customers.create.useMutation();
  const update = trpc.customers.update.useMutation();
  const utils = trpc.useUtils();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "phone" | "email">("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const visibleCustomers = useMemo(() => filterAndSortDirectory(customers.data ?? [], search, sortKey, direction), [customers.data, search, sortKey, direction]);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm(current => ({ ...current, [key]: event.target.value }));
  function reset() { setEditingId(null); setForm({ name: "", phone: "", email: "", address: "", notes: "" }); }
  async function submit(event: React.FormEvent) { event.preventDefault(); try { const payload = { ...form, phone: form.phone || null, email: form.email || null, address: form.address || null, notes: form.notes || null }; if (editingId) await update.mutateAsync({ id: editingId, ...payload }); else await create.mutateAsync(payload); await utils.customers.list.invalidate(); toast.success(editingId ? "تم تحديث بيانات العميل" : "تمت إضافة العميل أو الجهة"); reset(); } catch (error: any) { toast.error(error?.message || "تعذر حفظ بيانات العميل"); } }
  const busy = create.isPending || update.isPending;
  return <DashboardLayout><div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-7"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-[#d08a3b]">CUSTOMER DIRECTORY</p><h2 className="text-3xl font-black tracking-tight text-[#102a43]">العملاء والجهات المستلمة</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">دليل مستقل للجهات التي تستلم الأصناف من أذونات الصرف، بعيداً عن دليل الموردين الخاص بالإضافة.</p></div><Badge className="w-fit rounded-full bg-[#fbeceb] px-4 py-2 text-[#bd5147]">{customers.data?.length ?? 0} جهة</Badge></div><Card className={surface}><CardHeader><CardTitle className="flex items-center gap-2 text-lg font-black text-[#102a43]"><Plus className="h-5 w-5 text-[#bd5147]" />{editingId ? "تعديل العميل أو الجهة" : "إضافة عميل أو جهة"}</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><div className="space-y-2"><Label>اسم العميل/الجهة *</Label><Input value={form.name} onChange={set("name")} required placeholder="مثال: فرع القاهرة" className="rounded-xl" /></div><div className="space-y-2"><Label>الهاتف</Label><Input value={form.phone} onChange={set("phone")} className="rounded-xl" /></div><div className="space-y-2"><Label>البريد الإلكتروني</Label><Input type="email" value={form.email} onChange={set("email")} className="rounded-xl" /></div><div className="space-y-2"><Label>العنوان</Label><Input value={form.address} onChange={set("address")} className="rounded-xl" /></div><div className="flex items-end gap-2"><Button type="submit" disabled={busy} className="h-10 flex-1 rounded-xl bg-[#bd5147] text-white hover:bg-[#a9433b]">{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Plus className="ml-2 h-4 w-4" />}{editingId ? "حفظ التعديل" : "إضافة الجهة"}</Button>{editingId ? <Button type="button" variant="outline" onClick={reset} className="h-10 rounded-xl">إلغاء</Button> : null}</div></form></CardContent></Card><Card className={surface}><CardHeader className="border-b border-[#edf2f5] pb-4"><CardTitle className="text-lg font-black text-[#102a43]">دليل العملاء والجهات</CardTitle></CardHeader><CardContent className="p-0">{customers.data?.length ? <><DirectoryToolbar search={search} onSearch={setSearch} sortKey={sortKey} onSortKey={setSortKey} direction={direction} onDirection={() => setDirection(value => value === "asc" ? "desc" : "asc")} /><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-right text-sm"><thead className="bg-[#f7fbfc] text-xs font-black text-slate-400"><tr><th className="px-5 py-4">الاسم</th><th className="px-5 py-4">الهاتف</th><th className="px-5 py-4">البريد</th><th className="px-5 py-4">العنوان</th><th className="px-5 py-4">إجراء</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{visibleCustomers.map(item => <tr key={item.id}><td className="px-5 py-4 font-black text-[#102a43]">{item.name}</td><td className="px-5 py-4 text-slate-500">{item.phone || "—"}</td><td className="px-5 py-4 text-slate-500">{item.email || "—"}</td><td className="px-5 py-4 text-slate-500">{item.address || "—"}</td><td className="px-5 py-4"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => { setEditingId(item.id); setForm({ name: item.name, phone: item.phone ?? "", email: item.email ?? "", address: item.address ?? "", notes: item.notes ?? "" }); }} className="rounded-xl">تعديل</Button><Button variant="outline" size="sm" onClick={() => window.location.href = `/customers/${item.id}/statement`} className="rounded-xl"><FileText className="ml-1 h-3.5 w-3.5" />كشف الحساب</Button></div></td></tr>)}</tbody></table></div></> : <div className="p-12 text-center text-sm text-slate-400">لم تتم إضافة عملاء أو جهات مستلمة بعد.</div>}</CardContent></Card></div></DashboardLayout>;
}


type StatementKind = "supplier" | "customer";
export function AccountStatementPage({ kind }: { kind: StatementKind }) {
  const [, supplierParams] = useRoute("/suppliers/:id/statement");
  const [, customerParams] = useRoute("/customers/:id/statement");
  const id = Number((kind === "supplier" ? supplierParams?.id : customerParams?.id) ?? 0);
  const suppliers = trpc.suppliers.list.useQuery(undefined, { enabled: kind === "supplier" });
  const customers = trpc.customers.list.useQuery(undefined, { enabled: kind === "customer" });
  const additions = trpc.additions.account.useQuery({ supplierId: id }, { enabled: kind === "supplier" && id > 0 });
  const disbursements = trpc.disbursements.account.useQuery({ customerId: id }, { enabled: kind === "customer" && id > 0 });
  const permissions = trpc.permissions.mine.useQuery();
  const settings = trpc.settings.list.useQuery();
  const preferences = trpc.preferences.get.useQuery();
  const updatePreferences = trpc.preferences.update.useMutation({
    onSuccess: () => toast.success("تم حفظ تفضيلات كشف الحساب"),
    onError: () => toast.error("تعذر حفظ تفضيلات كشف الحساب"),
  });
  const entity = kind === "supplier" ? suppliers.data?.find(item => item.id === id) : customers.data?.find(item => item.id === id);
  const [exportBusy, setExportBusy] = useState<"excel" | "pdf" | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfColumnsOpen, setPdfColumnsOpen] = useState(false);
  const [selectedPdfColumns, setSelectedPdfColumns] = useState<ExportColumnKey[]>([]);
  const [pdfBuilding, setPdfBuilding] = useState(false);
  const [financialPreferenceVisible, setFinancialPreferenceVisible] = useState(false);
  const pdfIframeRef = useRef<HTMLIFrameElement>(null);
  const accountColumnLabels: Record<string, string> = {
    name: "اسم الصنف",
    date: "التاريخ",
    eznNum: "رقم الإذن",
    type: "الحركة",
    quantity: "الكمية",
    unitPrice: "سعر الوحدة",
    totalValue: "الإجمالي",
  };
  const accountLoading = kind === "supplier" ? additions.isLoading || suppliers.isLoading : disbursements.isLoading || customers.isLoading;
  const accountDataAvailable = kind === "supplier" ? additions.data !== undefined && suppliers.data !== undefined : disbursements.data !== undefined && customers.data !== undefined;
  const accountError = !accountDataAvailable && (kind === "supplier" ? additions.error || suppliers.error : disbursements.error || customers.error);
  const canViewAccountFinancialDetails = permissions.data?.allowedReports.includes(WAREHOUSE_FINANCIAL_PERMISSION) ?? false;
  const accountPreferenceKey = `account:${kind}:${id}`;
  const accountFinancialPreferenceKey = `account-financial-details:${kind}:${id}`;
  const baseAccountColumns: ExportColumnKey[] = ["name", "date", "eznNum", "type", "quantity"];
  const accountColumns = useMemo<ExportColumnKey[]>(() => canViewAccountFinancialDetails ? [...baseAccountColumns, "unitPrice", "totalValue"] : baseAccountColumns, [canViewAccountFinancialDetails]);
  const showAccountFinancialDetails = canViewAccountFinancialDetails && financialPreferenceVisible;
  const rows = kind === "supplier"
    ? buildAccountStatementRows(additions.data ?? [], "supplier", id)
    : buildAccountStatementRows(disbursements.data ?? [], "customer", id);
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const exportRows = rows.map(row => ({
    id: row.id,
    type: row.type,
    date: row.date,
    eznNum: row.number,
    name: row.item ?? "—",
    itemCode: row.item ?? "—",
    quantity: row.quantity,
    detail: entity?.name ?? "—",
    unitPrice: row.unitPrice,
    totalValue: row.total,
  }));
  const companyLogo = resolveCompanyLogoUrl(settings.data?.find(item => item.key === "company_logo")?.value ?? settings.data?.find(item => item.key === "company_logo_url")?.value);
  const reportSummary = [
    `الجهة: ${entity?.name ?? "—"}`,
    `إجمالي الكمية: ${totalQuantity.toLocaleString("en-US")}`,
    ...(canViewAccountFinancialDetails ? [`إجمالي القيمة: ${total.toLocaleString("en-US", { minimumFractionDigits: 2 })} ج.م`] : []),
  ];

  useEffect(() => {
    const savedColumns = preferences.data?.reportColumnOrder?.[accountPreferenceKey] ?? [];
    const normalizedColumns = savedColumns.filter(column => accountColumns.includes(column as ExportColumnKey)) as ExportColumnKey[];
    setSelectedPdfColumns(normalizedColumns.length ? normalizedColumns : [...accountColumns]);
  }, [preferences.data?.reportColumnOrder, accountColumns, accountPreferenceKey]);

  useEffect(() => {
    const savedFinancialPreference = preferences.data?.reportColumnOrder?.[accountFinancialPreferenceKey] ?? [];
    setFinancialPreferenceVisible(canViewAccountFinancialDetails && savedFinancialPreference.includes("visible"));
  }, [accountFinancialPreferenceKey, canViewAccountFinancialDetails, preferences.data?.reportColumnOrder]);

  useEffect(() => () => {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
  }, [pdfPreviewUrl]);

  const persistAccountPreferences = (reportColumnOrder: Record<string, string[]>) => updatePreferences.mutate({
    quickActions: preferences.data?.quickActions ?? ["/additions", "/disbursements", "/transfers"],
    hapticEnabled: preferences.data?.hapticEnabled ?? true,
    reportColumnOrder,
  });
  const saveAccountColumnOrder = (order: ExportColumnKey[]) => persistAccountPreferences({
    ...(preferences.data?.reportColumnOrder ?? {}),
    [accountPreferenceKey]: order,
  });
  const toggleAccountFinancialDetails = async () => {
    const next = !financialPreferenceVisible;
    setFinancialPreferenceVisible(next);
    try {
      await updatePreferences.mutateAsync({
        quickActions: preferences.data?.quickActions ?? ["/additions", "/disbursements", "/transfers"],
        hapticEnabled: preferences.data?.hapticEnabled ?? true,
        reportColumnOrder: {
          ...(preferences.data?.reportColumnOrder ?? {}),
          [accountFinancialPreferenceKey]: next ? ["visible"] : [],
        },
      });
    } catch (error: any) {
      setFinancialPreferenceVisible(!next);
      toast.error(error?.message || "تعذر حفظ اختيار التفاصيل المالية");
    }
  };
  const moveAccountColumn = (dragged: ExportColumnKey, target: ExportColumnKey) => {
    if (dragged === target) return;
    setSelectedPdfColumns(current => {
      const next = [...current];
      const from = next.indexOf(dragged);
      const to = next.indexOf(target);
      if (from < 0 || to < 0) return current;
      next.splice(from, 1);
      next.splice(to, 0, dragged);
      saveAccountColumnOrder(next);
      return next;
    });
  };
  const toggleAccountColumn = (column: ExportColumnKey) => setSelectedPdfColumns(current => current.includes(column) ? current.filter(item => item !== column) : [...current, column]);
  const openAccountColumns = () => {
    const savedColumns = preferences.data?.reportColumnOrder?.[accountPreferenceKey] ?? [];
    const normalizedColumns = savedColumns.filter(column => accountColumns.includes(column as ExportColumnKey)) as ExportColumnKey[];
    setSelectedPdfColumns(normalizedColumns.length ? normalizedColumns : [...accountColumns]);
    setPdfColumnsOpen(true);
  };
  async function openAccountPdfPreview() {
    if (!selectedPdfColumns.length) {
      toast.error("اختر عموداً واحداً على الأقل");
      return;
    }
    setPdfBuilding(true);
    try {
      saveAccountColumnOrder(selectedPdfColumns);
      const doc = await buildAccountStatementPdf(exportRows, {
        columns: selectedPdfColumns,
        logo: companyLogo,
        date: new Date(),
        title: `كشف حساب ${kind === "supplier" ? "المورد" : "العميل/الجهة"} - ${entity?.name ?? ""}`,
        summary: reportSummary,
      });
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(URL.createObjectURL(doc.output("blob")));
      setPdfColumnsOpen(false);
    } catch (error: any) {
      toast.error(error?.message || "تعذر تجهيز معاينة كشف الحساب");
    } finally {
      setPdfBuilding(false);
    }
  }
  async function exportStatement(format: "excel" | "pdf") {
    setExportBusy(format);
    try {
      const fileBase = `smart-inventory-${kind === "supplier" ? "supplier" : "customer"}-statement-${id}`;
      if (format === "excel") {
        await downloadAccountStatementExcel(exportRows, { columns: selectedPdfColumns, fileName: `${fileBase}.xlsx` });
      } else {
        await downloadAccountStatementPdf(exportRows, {
          columns: selectedPdfColumns,
          logo: companyLogo,
          date: new Date(),
          summary: reportSummary,
          title: `كشف حساب ${kind === "supplier" ? "المورد" : "العميل/الجهة"} - ${entity?.name ?? ""}`,
          fileName: `${fileBase}.pdf`,
        });
      }
      toast.success(`تم تجهيز كشف الحساب بصيغة ${format === "excel" ? "Excel" : "PDF"}`);
    } catch (error: any) {
      toast.error(error?.message || "تعذر تصدير كشف الحساب");
    } finally {
      setExportBusy(null);
    }
  }

  if (accountLoading) return <DashboardLayout><div className="p-12 text-center text-slate-500">جارٍ تحميل كشف الحساب...</div></DashboardLayout>;
  if (accountError) return <DashboardLayout><div className="p-12 text-center text-red-500">تعذر تحميل كشف الحساب.</div></DashboardLayout>;
  if (!entity) return <DashboardLayout><div className="p-12 text-center text-slate-500">الجهة المطلوبة غير موجودة.</div></DashboardLayout>;

  return <DashboardLayout>
    <div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-7">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-[#d08a3b]">ACCOUNT STATEMENT / {kind === "supplier" ? "SUPPLIER" : "CUSTOMER"}</p>
          <h2 className="text-3xl font-black tracking-tight text-[#102a43]">كشف حساب {kind === "supplier" ? "المورد" : "العميل/الجهة"}</h2>
          <p className="mt-2 text-sm leading-7 text-slate-500">تفاصيل الحركات المسجلة للجهة مع الكميات ومعلومات الأذونات.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="w-fit rounded-full bg-[#e8f1f2] px-4 py-2 text-[#0d4f62]">{entity.name}</Badge>
          {canViewAccountFinancialDetails ? <Button type="button" variant="outline" size="sm" onClick={() => void toggleAccountFinancialDetails()} disabled={updatePreferences.isPending || permissions.isLoading || preferences.isLoading} aria-pressed={showAccountFinancialDetails} className="movement-financial-toggle rounded-xl px-2 text-[10px] font-black sm:px-3 sm:text-xs"><Eye className="ml-1 h-3.5 w-3.5" />{showAccountFinancialDetails ? "إخفاء التفاصيل المالية" : "إظهار التفاصيل المالية"}</Button> : null}
          <Button type="button" variant="outline" onClick={() => void exportStatement("excel")} disabled={Boolean(exportBusy)} className="rounded-xl"><FileText className="ml-1 h-4 w-4" />{exportBusy === "excel" ? "جارٍ التصدير..." : "Excel"}</Button>
          <Button type="button" variant="outline" onClick={openAccountColumns} disabled={Boolean(exportBusy)} className="rounded-xl"><FileText className="ml-1 h-4 w-4" />اختيار أعمدة PDF</Button>
          <Button type="button" onClick={openAccountColumns} disabled={Boolean(exportBusy)} className="rounded-xl bg-[#0d4f62] text-white"><FileText className="ml-1 h-4 w-4" />{pdfBuilding ? "جاري تجهيز PDF" : "معاينة PDF"}</Button>
        </div>
      </div>
      <div className={`grid gap-4 ${showAccountFinancialDetails ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <Card className={surface}><CardContent className="p-5"><p className="text-xs font-bold text-slate-400">عدد الحركات</p><p className="mt-2 text-2xl font-black text-[#102a43]">{rows.length}</p></CardContent></Card>
        <Card className={surface}><CardContent className="p-5"><p className="text-xs font-bold text-slate-400">إجمالي الكميات</p><p className="mt-2 text-2xl font-black text-[#0d806c]">{totalQuantity.toLocaleString("en-US")}</p></CardContent></Card>
        {showAccountFinancialDetails ? <Card className={surface}><CardContent className="p-5"><p className="text-xs font-bold text-slate-400">إجمالي القيمة</p><p className="mt-2 text-2xl font-black text-[#bd5147]">{total.toLocaleString("en-US", { minimumFractionDigits: 2 })} ج.م</p></CardContent></Card> : null}
      </div>
      <Card className={surface}>
        <CardHeader className="border-b border-[#edf2f5] pb-4"><CardTitle className="text-lg font-black text-[#102a43]">حركات {entity.name}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {rows.length ? <div className="overflow-x-auto account-statement-scroll-region"><table data-account-statement-table="true" dir="rtl" className="table-auto w-max min-w-[780px] text-right text-[13px]"><thead className="bg-[#f7fbfc] text-[11px] font-black text-slate-400"><tr><th className="px-4 py-3">التاريخ</th><th className="px-4 py-3">رقم الإذن</th><th className="px-4 py-3">الحركة</th><th className="px-4 py-3">الصنف</th><th className="px-4 py-3">الكمية</th>{showAccountFinancialDetails ? <><th className="px-4 py-3">سعر الوحدة</th><th className="px-4 py-3">الإجمالي</th></> : null}</tr></thead><tbody className="divide-y divide-[#eef3f5]">{rows.map(row => <tr key={row.id}><td className="px-4 py-3 text-slate-500">{row.date}</td><td className="px-4 py-3 font-mono text-xs text-[#0d4f62]">{row.number}</td><td className="px-4 py-3 font-bold">{row.type}</td><td className="px-4 py-3 font-black text-[#102a43]">{row.item}</td><td className="px-4 py-3">{row.quantity.toLocaleString("en-US")}</td>{showAccountFinancialDetails ? <><td className="px-4 py-3">{row.unitPrice.toLocaleString("en-US")} ج.م</td><td className="px-4 py-3 font-black text-[#0d4f62]">{row.total.toLocaleString("en-US", { minimumFractionDigits: 2 })} ج.م</td></> : null}</tr>)}</tbody></table></div> : <div className="p-12 text-center text-sm text-slate-400">لا توجد حركات مرتبطة بهذه الجهة حتى الآن.</div>}
          <Dialog open={pdfColumnsOpen} onOpenChange={setPdfColumnsOpen}>
            <DialogContent className="max-w-2xl rounded-2xl bg-white" dir="rtl">
              <DialogHeader><DialogTitle className="text-xl font-black text-[#102a43]">اختيار أعمدة كشف الحساب</DialogTitle><DialogDescription>اسحب الأعمدة لترتيبها من اليمين إلى اليسار، ثم اختر الأعمدة التي تريد ظهورها في PDF وExcel.</DialogDescription></DialogHeader>
              <div className="rounded-xl border border-dashed border-[#b9d4d9] bg-[#f8fcfc] p-3"><p className="mb-2 text-xs font-bold text-[#0d4f62]">أول بطاقة في القائمة تظهر أقصى اليمين في التقرير.</p><div className="flex flex-wrap gap-2">{selectedPdfColumns.map(column => <button key={`account-drag-${column}`} type="button" draggable onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", column); }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); moveAccountColumn(event.dataTransfer.getData("text/plain") as ExportColumnKey, column); }} className="inline-flex cursor-grab items-center gap-1 rounded-lg border border-[#9fcbd0] bg-white px-2.5 py-1.5 text-xs font-bold text-[#0d4f62] shadow-sm"><GripVertical className="h-3.5 w-3.5" />{accountColumnLabels[column]}</button>)}</div></div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">{accountColumns.map(column => <label key={column} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${selectedPdfColumns.includes(column) ? "border-[#0d7180] bg-[#eef7f7]" : "border-[#dce7ee] bg-white"}`}><input type="checkbox" checked={selectedPdfColumns.includes(column)} onChange={() => toggleAccountColumn(column)} className="h-4 w-4 accent-[#0d7180]" /><span className="text-sm font-bold text-[#102a43]">{accountColumnLabels[column]}</span></label>)}</div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setPdfColumnsOpen(false)} className="rounded-xl">إلغاء</Button><Button type="button" variant="outline" onClick={() => { const next = [...accountColumns]; setSelectedPdfColumns(next); saveAccountColumnOrder(next); }} className="rounded-xl">إظهار الكل</Button><Button type="button" onClick={() => void openAccountPdfPreview()} disabled={!selectedPdfColumns.length || pdfBuilding} className="rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]">فتح معاينة PDF</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={Boolean(pdfPreviewUrl) || pdfBuilding} onOpenChange={nextOpen => { if (!nextOpen && !pdfBuilding) setPdfPreviewUrl(null); }}>
            <DialogContent showCloseButton={false} className="max-w-5xl rounded-2xl bg-white p-3" dir="rtl" onPointerDownOutside={event => event.preventDefault()}>
              <div className="flex items-center justify-between gap-3 border-b border-[#edf2f5] pb-3"><Button type="button" variant="outline" onClick={() => setPdfPreviewUrl(null)} disabled={pdfBuilding} className="rounded-xl border-[#b9d4d9] text-[#0d4f62]"><ArrowRight className="ml-2 h-4 w-4" />رجوع إلى كشف الحساب</Button><div className="text-right"><DialogTitle className="text-lg font-black text-[#102a43]">معاينة كشف الحساب PDF</DialogTitle><DialogDescription>{entity.name} · {rows.length} حركة</DialogDescription></div></div>
              <div className="mt-3 min-h-[58vh] overflow-hidden rounded-xl border border-[#dce7ee] bg-slate-100">{pdfBuilding ? <div className="flex h-[58vh] items-center justify-center gap-2 text-sm font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />جاري تجهيز ملف PDF العربي...</div> : pdfPreviewUrl ? <iframe ref={pdfIframeRef} src={pdfPreviewUrl} title="معاينة كشف الحساب PDF" className="h-[58vh] w-full bg-white" /> : null}</div>
              <DialogFooter className="pdf-action-toolbar flex flex-col items-stretch gap-2 [&>button]:w-full"><Button type="button" variant="outline" onClick={() => setPdfPreviewUrl(null)} disabled={pdfBuilding} title="إغلاق معاينة كشف الحساب" className="rounded-xl">إغلاق والعودة</Button><Button type="button" variant="outline" onClick={() => { if (pdfPreviewUrl) window.open(pdfPreviewUrl, "_blank", "noopener,noreferrer"); }} disabled={!pdfPreviewUrl} title="فتح كشف الحساب في نافذة خارجية" className="rounded-xl"><Eye className="ml-2 h-4 w-4" />معاينة خارجية</Button><Button type="button" variant="outline" onClick={() => { const frame = pdfIframeRef.current; frame?.contentWindow?.focus(); frame?.contentWindow?.print(); }} disabled={!pdfPreviewUrl} title="طباعة كشف الحساب مباشرة" className="rounded-xl"><Printer className="ml-2 h-4 w-4" />طباعة</Button><Button type="button" variant="outline" onClick={async () => { if (!pdfPreviewUrl) return; await sharePdfFile(pdfPreviewUrl, `كشف حساب ${entity.name}`, `smart-inventory-account-statement-${id}.pdf`); }} disabled={!pdfPreviewUrl} title="مشاركة كشف الحساب" className="rounded-xl"><Share2 className="ml-2 h-4 w-4" />مشاركة</Button><Button type="button" onClick={() => { if (pdfPreviewUrl) { const anchor = document.createElement("a"); anchor.href = pdfPreviewUrl; anchor.download = `smart-inventory-account-statement-${id}.pdf`; anchor.click(); } }} disabled={!pdfPreviewUrl} title="تنزيل كشف الحساب بصيغة PDF" className="rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]"><Download className="ml-2 h-4 w-4" />تنزيل PDF</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  </DashboardLayout>;
}
