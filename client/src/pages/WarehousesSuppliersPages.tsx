import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import OfflineDataNotice from "@/components/OfflineDataNotice";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { resolveCompanyLogoUrl } from "@/lib/brandAssets";
import { createReportMailtoUrl, sharePdfFile } from "@/lib/reportSharing";
import { summarizeAccountStatementItems } from "@/lib/accountStatementGrouping";
import { buildAccountStatementPdf, buildMainWarehousePdf, downloadAccountStatementExcel, downloadAccountStatementPdf, formatPdfCurrency, type ExportColumnKey } from "@/lib/inventoryExportFiles";
import { ArrowRight, ArrowUpDown, Boxes, BrickWall, Building2, Cable, Check, Copy, Download, Droplets, Edit3, Eye, FileText, GripVertical, Lightbulb, Loader2, Mail, MapPin, Package, Phone, Plus, Printer, Save, Search, Share2, Snowflake, Tag, Truck, UserRound, Warehouse, Wind, Wrench } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";

const surface = "rounded-[1.5rem] border-[#dce7ee] bg-white shadow-[0_18px_50px_rgba(18,44,84,0.06)]";
function getCategoryIcon(category: string) {
  const value = category.toLocaleLowerCase("ar-EG");
  if (/(كابل|كيبل|سلك|تيار|كهرب|elect|cable|wire)/i.test(value)) return <Cable className="h-3 w-3" />;
  if (/(إنار|انار|لمب|مصباح|light|lamp)/i.test(value)) return <Lightbulb className="h-3 w-3" />;
  if (/(تكييف|تبريد|تهوية|مكيف|air|cool)/i.test(value)) return <Snowflake className="h-3 w-3" />;
  if (/(مياه|سباك|صرف|water|plumb)/i.test(value)) return <Droplets className="h-3 w-3" />;
  if (/(ميكانيك|معدات|أدوات|عدد|mechan|tool)/i.test(value)) return <Wrench className="h-3 w-3" />;
  if (/(بناء|خرسانة|طوب|أسمنت|اسمنت|حديد|عزل|build|cement|steel)/i.test(value)) return <BrickWall className="h-3 w-3" />;
  if (/(هواء|رياح|دكت|air)/i.test(value)) return <Wind className="h-3 w-3" />;
  if (/(صنف|مواد|مخزون|general)/i.test(value)) return <Boxes className="h-3 w-3" />;
  return <Tag className="h-3 w-3" />;
}

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

export type AccountStatementRow = { id: number; date: string; number: string; item: string | null; itemCode: string; quantity: number; unitPrice: number; total: number; type: "إضافة" | "صرف" | "مرتجع" | "تحويل"; documentImageUrl: string | null };
function isReturnMovement(value: unknown) { return /مرتجع|ارتجاع|return/i.test(String(value ?? "")); }

export function buildAccountStatementRows(rows: Array<{ id: number; date: string; eznNum: string; itemName?: string | null; itemCode?: string | null; quantity: unknown; unitPrice?: unknown; totalValue?: unknown; documentImageUrl?: string | null; supplierId?: number | null; customerId?: number | null; transferType?: string | null }>, kind: "supplier" | "customer", entityId: number): AccountStatementRow[] {
  return rows.filter(row => (kind === "supplier" ? row.supplierId === entityId : row.customerId === entityId)).map(row => {
    const quantity = Number(row.quantity ?? 0);
    const totalValue = Number(row.totalValue ?? 0);
    const type = kind === "supplier" ? "إضافة" : row.transferType ? (isReturnMovement(row.transferType) ? "مرتجع" : "تحويل") : "صرف";
    return { id: row.id, date: row.date, number: row.eznNum, item: row.itemName ?? null, itemCode: row.itemCode ?? "", quantity, unitPrice: Number(row.unitPrice ?? 0), total: totalValue, type, documentImageUrl: row.documentImageUrl ?? null };
  });
}

export function normalizeAccountSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ar-EG")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function filterAccountStatementRows(rows: AccountStatementRow[], search: { permit: string; item: string }) {
  const permit = normalizeAccountSearch(search.permit);
  const itemTokens = normalizeAccountSearch(search.item).split(" ").filter(Boolean);
  return rows.filter(row => {
    const permitMatch = !permit || normalizeAccountSearch(row.number).includes(permit);
    const itemText = normalizeAccountSearch(`${row.item ?? ""} ${row.itemCode}`);
    const itemMatch = !itemTokens.length || itemTokens.every(token => itemText.includes(token));
    return permitMatch && itemMatch;
  });
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

export function filterWarehouseItemReference(rows: WarehouseStockTableRow[], search: string) {
  const normalized = search.trim().toLocaleLowerCase("ar-EG");
  return [...rows]
    .filter(row => !normalized || `${row.name} ${row.code}`.toLocaleLowerCase("ar-EG").includes(normalized))
    .sort((left, right) => left.name.localeCompare(right.name, "ar"));
}

const WAREHOUSE_FINANCIAL_PERMISSION = "warehouse-financial-details";
const WAREHOUSE_FINANCIAL_PREFERENCE_KEY = "warehouse-financial-columns-v3";

export function WarehousesPage() {
  const [, params] = useRoute("/warehouses/:slot");
  const [, setLocation] = useLocation();
  const requestedSlot = params?.slot ? Number(params.slot) : 1;
  const warehouses = trpc.warehouses.list.useQuery(undefined, { refetchOnMount: "always", refetchOnWindowFocus: true });
  const update = trpc.warehouses.update.useMutation();
  const renameCategory = trpc.items.renameCategory.useMutation();
  const utils = trpc.useUtils();
  const permissions = trpc.permissions.mine.useQuery(undefined, { refetchOnMount: "always", refetchOnWindowFocus: true });
  const allowedWarehouseIds = permissions.data?.allowedWarehouseIds ?? [];
  const visibleWarehouses = permissions.data ? (allowedWarehouseIds.length ? (warehouses.data ?? []).filter(item => allowedWarehouseIds.includes(item.id)) : warehouses.data ?? []) : [];
  const selected = visibleWarehouses.find(item => item.slot === requestedSlot) ?? visibleWarehouses[0];
  const items = trpc.items.warehouseStocks.useQuery({ warehouseId: selected?.id ?? 1 }, { enabled: Boolean(selected) }) as unknown as { data?: WarehouseStockTableRow[]; isLoading: boolean };
  const preferences = trpc.preferences.get.useQuery();
  const updatePreferences = trpc.preferences.update.useMutation();
  const canViewFinancialDetails = permissions.data?.allowedReports.includes(WAREHOUSE_FINANCIAL_PERMISSION) ?? false;
  const [financialPreferenceVisible, setFinancialPreferenceVisible] = useState(false);
  const [permitFilter, setPermitFilter] = useState("");
  const [appliedPermitFilter, setAppliedPermitFilter] = useState("");
  const [permitImage, setPermitImage] = useState<{ url: string; name: string } | null>(null);
  const [itemReferenceSearch, setItemReferenceSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categoryEditing, setCategoryEditing] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState("");
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

  useEffect(() => { setCategoryFilter("all"); setItemReferenceSearch(""); setCategoryEditing(null); }, [selected?.id]);

  const filteredWarehouseItems = useMemo(() => (items.data ?? []).filter(item => categoryFilter === "all" || (item.category?.trim() || "بدون تصنيف") === categoryFilter), [items.data, categoryFilter]);
  const referenceItems = useMemo(() => filterWarehouseItemReference(filteredWarehouseItems, itemReferenceSearch), [filteredWarehouseItems, itemReferenceSearch]);
  const filteredReportCards = useMemo(() => {
    const visibleIds = new Set(referenceItems.map(item => item.id));
    return (reportCards.data ?? []).filter(card => card && visibleIds.has(card.item.id));
  }, [referenceItems, reportCards.data]);

  useEffect(() => { let active = true; const cards = filteredReportCards as any[]; if (!reportOpen || !cards.length) { setReportUrl(null); setReportBuilding(false); return; } setReportBuilding(true); void buildMainWarehousePdf(cards, { logo: reportLogo, warehouseName: selected?.name ?? "المخزن الرئيسي", watermarkEnabled: reportWatermarkEnabled, watermarkOpacity: reportWatermarkOpacity, watermarkScale: reportWatermarkScale, watermarkPosition: reportWatermarkPosition, watermarkRepeat: reportWatermarkRepeat }).then(doc => { if (!active) return; setReportUrl(URL.createObjectURL(doc.output("blob"))); setReportBuilding(false); }).catch(error => { if (active) { setReportBuilding(false); toast.error(error?.message || `تعذر إنشاء تقرير ${selected?.name ?? "المخزن"}`); } }); return () => { active = false; setReportUrl(current => { if (current) URL.revokeObjectURL(current); return null; }); }; }, [reportOpen, filteredReportCards, reportLogo, selected?.name, reportWatermarkEnabled, reportWatermarkOpacity, reportWatermarkScale, reportWatermarkPosition, reportWatermarkRepeat]);

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

  async function saveCategoryName() {
    const fromCategory = categoryEditing?.trim() ?? "";
    const toCategory = categoryDraft.trim();
    if (!selected || !fromCategory || !toCategory) return;
    try {
      const result = await renameCategory.mutateAsync({ warehouseId: selected.id, fromCategory, toCategory });
      await utils.items.warehouseStocks.invalidate({ warehouseId: selected.id });
      setCategoryFilter(toCategory);
      setCategoryEditing(null);
      setCategoryDraft("");
      toast.success(result.updatedCount ? `تم تحديث ${result.updatedCount} صنف` : "لم يتغير اسم التصنيف");
    } catch (error: any) { toast.error(error?.message || "تعذر تحديث اسم التصنيف"); }
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
  const categoryOptions = useMemo(() => Array.from(new Set((items.data ?? []).map(item => item.category?.trim() || "بدون تصنيف"))).sort((left, right) => left.localeCompare(right, "ar")), [items.data]);
  async function copyItemCode(code: string) {
    if (!code || code === "—") return;
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`تم نسخ كود ${code}`);
    } catch {
      toast.info(`كود الصنف: ${code}`);
    }
  }

  return <DashboardLayout><div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-7">
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-[#d08a3b]">WAREHOUSE CONTROL</p><h2 className="text-3xl font-black tracking-tight text-[#102a43]">المخازن</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">ابدأ بالمخزن الرئيسي، ثم انتقل بين المخازن الأخرى من المبدّل الداخلي دون ازدحام التنقل الجانبي.</p></div><div className="flex flex-wrap items-center gap-2"><Badge className="w-fit rounded-full bg-[#e8f1f2] px-4 py-2 text-[#0d4f62]">{warehouses.data?.length ?? 1} مخازن</Badge><Button type="button" variant="outline" onClick={() => setLocation("/inventory-audit")} className="rounded-xl border-[#b9d4d9] text-[#0d4f62]"><Package className="ml-2 h-4 w-4" />تقرير الجرد الشامل</Button><Button type="button" onClick={() => setReportOpen(true)} disabled={!selected || items.isLoading} className="rounded-xl bg-[#0d4f62] font-bold text-white hover:bg-[#0a4150]"><FileText className="ml-2 h-4 w-4" />معاينة PDF لـ {reportName}</Button></div></div>
    <OfflineDataNotice resource="المخازن والأرصدة" hasCachedData={warehouses.data !== undefined || items.data !== undefined} />
    <WarehouseSwitcher warehouses={warehouses.data ?? []} selectedSlot={selected?.slot ?? requestedSlot} onSelect={slot => setLocation(slot === 1 ? "/warehouses" : `/warehouses/${slot}`)} />
    <div className="grid gap-4 md:grid-cols-2">
      {[selected ?? { id: 1, slot: 1, name: "المخزن الرئيسي" }].map(item => <Card key={item.id} className={`${surface} ring-2 ring-[#0d806c]/25`}><CardContent className="p-5"><div className="mb-5 flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8f1f2] text-[#0d4f62]"><Warehouse className="h-5 w-5" /></div><Badge variant="outline" className="rounded-full border-[#dce7ee] text-xs text-slate-400">#{item.slot}</Badge></div><p className="text-xs font-bold text-slate-400">اسم المخزن المحدد</p>{editingId === item.id ? <div className="mt-2 space-y-3"><Input value={draft} onChange={event => setDraft(event.target.value)} className="rounded-xl" autoFocus /><div className="flex gap-2"><Button size="sm" onClick={() => void saveWarehouse(item.id)} disabled={update.isPending} className="rounded-xl bg-[#0d4f62] text-white"><Save className="ml-1 h-3.5 w-3.5" />حفظ</Button><Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="rounded-xl">إلغاء</Button></div></div> : <div className="mt-2 flex items-center justify-between gap-2"><div className="min-w-0 flex-1"><h3 className="truncate text-lg font-black text-[#102a43]">{item.name}</h3><div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={`تصنيفات ${item.name}`}>{categoryOptions.length ? categoryOptions.map((category, index) => { const branchColors = ["border-sky-200 bg-sky-50 text-sky-800", "border-violet-200 bg-violet-50 text-violet-800", "border-amber-200 bg-amber-50 text-amber-800", "border-emerald-200 bg-emerald-50 text-emerald-800", "border-rose-200 bg-rose-50 text-rose-800"]; const active = categoryFilter === category; return <button key={category} type="button" onClick={() => setCategoryFilter(category)} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold transition ${active ? "border-[#0d7180] bg-[#0d4f62] text-white" : `${branchColors[index % branchColors.length]} hover:brightness-95`}`} title={`عرض أصناف ${category}`}>{getCategoryIcon(category)}{category}</button>; }) : <span className="text-[11px] text-slate-400">لا توجد تصنيفات بعد</span>}</div></div><Button size="icon" variant="ghost" onClick={() => { setEditingId(item.id); setDraft(item.name); }} className="rounded-xl text-[#0d4f62]" aria-label={`تعديل ${item.name}`}><Edit3 className="h-4 w-4" /></Button></div>}</CardContent></Card>)}
      <Card className={`${surface} border-[#b9d4d9] bg-gradient-to-br from-[#f7fbfc] to-white`}><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-400">مرجع سريع لتسجيل الحركات</p><h3 className="mt-1 flex items-center gap-2 text-lg font-black text-[#102a43]"><Package className="h-5 w-5 text-[#0d806c]" />أصناف وأكواد {selected?.name ?? "المخزن"}</h3></div><div className="flex items-center gap-2"><Badge className="rounded-full bg-[#e7f3f1] text-[#0d806c]">{filteredWarehouseItems.length} صنف</Badge><Button type="button" size="sm" variant="outline" onClick={() => setReportOpen(true)} disabled={items.isLoading || !referenceItems.length} className="h-8 rounded-lg border-[#b9d4d9] px-2.5 text-[10px] font-black text-[#0d4f62]" title="معاينة PDF للأصناف المفلترة"><FileText className="ml-1 h-3.5 w-3.5" />معاينة PDF</Button></div></div><div className="mt-4 rounded-xl border border-[#dce7ee] bg-white/70 p-2.5"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-[11px] font-black text-[#536b78]">تصنيفات أصناف {selected?.name ?? "المخزن"}</span>{categoryFilter !== "all" ? <button type="button" onClick={() => setCategoryFilter("all")} className="text-[10px] font-black text-[#0d7180]">عرض الكل</button> : null}</div><div className="flex flex-wrap gap-2">{categoryOptions.map((category, index) => { const count = (items.data ?? []).filter(item => (item.category?.trim() || "بدون تصنيف") === category).length; const colors = ["border-sky-200 bg-sky-50 text-sky-800", "border-violet-200 bg-violet-50 text-violet-800", "border-amber-200 bg-amber-50 text-amber-800", "border-emerald-200 bg-emerald-50 text-emerald-800", "border-rose-200 bg-rose-50 text-rose-800"]; const color = colors[index % colors.length]; const active = categoryFilter === category; return <div key={category} className={`inline-flex items-center overflow-hidden rounded-full border shadow-sm transition ${active ? "ring-2 ring-[#0d7180]/30" : ""} ${active ? "border-[#0d7180] bg-[#0d4f62] text-white" : color}`}><button type="button" onClick={() => setCategoryFilter(category)} className="px-3 py-2 text-[10px] font-black" title={`فلترة أصناف ${category}`}>{category} ({count})</button><Button type="button" variant="ghost" size="icon" onClick={() => { setCategoryEditing(category); setCategoryDraft(category === "بدون تصنيف" ? "" : category); }} className={`h-8 w-8 rounded-full ${active ? "text-white hover:bg-white/15" : "text-current hover:bg-black/5"}`} aria-label={`تعديل اسم التصنيف ${category}`} title="تعديل اسم التصنيف"><Edit3 className="h-3.5 w-3.5" /></Button></div>; })}<button type="button" onClick={() => setCategoryFilter("all")} className={`rounded-full border px-3 py-2 text-[10px] font-black transition ${categoryFilter === "all" ? "border-[#0d7180] bg-[#0d4f62] text-white" : "border-[#b9d4d9] bg-[#f7fbfc] text-[#0d4f62]"}`}>كل التصنيفات ({items.data?.length ?? 0})</button></div></div><div className="relative mt-4"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><Input value={itemReferenceSearch} onChange={event => setItemReferenceSearch(event.target.value)} placeholder="ابحث باسم الصنف أو الكود..." aria-label="البحث في أصناف وأكواد المخزن" className="rounded-xl border-[#b9d4d9] bg-white pr-9" /></div><div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto rounded-2xl border border-[#e4eef1] bg-white p-2" dir="rtl">{items.isLoading ? <div className="p-5 text-center text-xs font-bold text-slate-400">جارٍ تحميل الأكواد...</div> : referenceItems.length ? referenceItems.map(item => <div key={item.id} className="flex items-center gap-2 rounded-xl px-2.5 py-2 transition hover:bg-[#f4fafb]"><div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-[#102a43]">{item.name}</p><p className="mt-0.5 font-mono text-[11px] font-bold text-[#0d7180]" dir="ltr">{item.code}</p></div><Button type="button" variant="ghost" size="icon" onClick={() => void copyItemCode(item.code)} className="h-8 w-8 shrink-0 rounded-lg text-[#0d7180] hover:bg-[#e7f3f1]" aria-label={`نسخ كود ${item.name}`} title="نسخ الكود"><Copy className="h-3.5 w-3.5" /></Button></div>) : <div className="p-5 text-center text-xs font-bold text-slate-400">{itemReferenceSearch ? "لا يوجد صنف بهذا الاسم أو الكود." : "لا توجد أصناف مرتبطة بهذا المخزن."}</div>}</div><p className="mt-2 text-[11px] leading-5 text-slate-400">اكتب جزءًا من الاسم أو الكود للوصول السريع، واضغط زر النسخ بجوار الكود عند الحاجة.</p></CardContent></Card>
    </div>
    <Card className={surface}><CardHeader className="border-b border-[#edf2f5] pb-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-lg font-black text-[#102a43]"><Package className="h-5 w-5 text-[#0d806c]" />أصناف {selected?.name ?? "المخزن"}</CardTitle><p className="mt-1 text-xs font-bold text-slate-400">هذا العرض خاص بالمخزن المحدد فقط · {items.data?.length ?? 0} صنف</p></div>{canViewFinancialDetails ? <Button type="button" variant="outline" size="sm" onClick={() => void toggleFinancialDetails()} disabled={updatePreferences.isPending || permissions.isLoading || preferences.isLoading} aria-pressed={showFinancialDetails} className="movement-financial-toggle rounded-xl text-xs font-black"><Eye className="ml-1.5 h-4 w-4" />{showFinancialDetails ? "إخفاء التفاصيل المالية" : "إظهار التفاصيل المالية"}</Button> : null}</div></CardHeader><CardContent className="p-0">{(() => { const summary = summarizeInventoryStatuses(filteredWarehouseItems); return <div className="grid gap-3 border-b border-[#edf2f5] bg-[#fbfdff] p-4 sm:grid-cols-3"><div className="flex items-center justify-between rounded-2xl bg-[#e8f7f6] px-4 py-3"><span className="text-xs font-black text-[#0d806c]">متوفر</span><strong className="text-xl font-black text-[#0d806c]">{summary.available.toLocaleString("en-US")}</strong></div><div className="flex items-center justify-between rounded-2xl bg-[#fff4df] px-4 py-3"><span className="text-xs font-black text-[#a96821]">منخفض</span><strong className="text-xl font-black text-[#a96821]">{summary.low.toLocaleString("en-US")}</strong></div><div className="flex items-center justify-between rounded-2xl bg-[#fbeceb] px-4 py-3"><span className="text-xs font-black text-[#bd5147]">نافد</span><strong className="text-xl font-black text-[#bd5147]">{summary.outOfStock.toLocaleString("en-US")}</strong></div></div>; })()}{items.isLoading ? <div className="flex items-center justify-center p-12 text-slate-400"><Loader2 className="ml-2 h-5 w-5 animate-spin" />جارٍ تحميل الأصناف</div> : filteredWarehouseItems.length ? <div className="overflow-x-auto"><table data-warehouse-stock-table="true" className="w-full min-w-[700px] text-right text-sm"><thead className="bg-[#f7fbfc] text-xs font-black text-slate-400"><tr><th className="px-5 py-4">الكود</th><th className="px-5 py-4">اسم الصنف</th><th className="px-5 py-4">التصنيف</th><th className="px-5 py-4">الرصيد الحالي</th><th className="px-5 py-4">الحالة</th>{showFinancialDetails ? <><th className="px-5 py-4">سعر الوحدة</th><th className="px-5 py-4">إجمالي السعر</th></> : null}</tr></thead><tbody className="divide-y divide-[#eef3f5]">{filteredWarehouseItems.map(item => { const unitPrice = item.unitPrice == null ? null : Number(item.unitPrice); const totalPrice = unitPrice == null ? null : Number(item.currentStock) * unitPrice; return <tr key={item.id} className="hover:bg-[#fbfdff]"><td className="px-5 py-4 font-mono text-xs text-slate-500">{item.code}</td><td className="px-5 py-4 font-black text-[#102a43]">{item.name}</td><td className="px-5 py-4 text-slate-500">{item.category || "بدون تصنيف"}</td><td className="px-5 py-4 font-black text-[#0d806c]">{Number(item.currentStock).toLocaleString("en-US")}</td><td className="px-5 py-4">{(() => { const status = getInventoryStatus(item.currentStock, item.reorderLevel); return <Badge className={`rounded-full px-3 py-1 text-[11px] font-black ${status.className}`}><span className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full ${status.dotClassName}`} />{status.label}</Badge>; })()}</td>{showFinancialDetails ? <><td className="px-5 py-4 text-[#0d4f62]">{unitPrice == null ? "—" : `${unitPrice.toLocaleString("en-US")} ج.م`}</td><td className="px-5 py-4 font-black text-[#0d4f62]">{totalPrice == null ? "—" : `${totalPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`}</td></> : null}</tr>; })}</tbody></table></div> : <div className="p-12 text-center text-sm text-slate-400">لا توجد أصناف مطابقة لهذا التصنيف في المخزن حالياً.</div>}</CardContent></Card><Dialog open={categoryEditing !== null} onOpenChange={open => { if (!open) setCategoryEditing(null); }}><DialogContent className="max-w-md rounded-2xl" dir="rtl"><DialogHeader><DialogTitle>تعديل اسم التصنيف</DialogTitle><DialogDescription>سيتم تطبيق الاسم الجديد على جميع أصناف «{categoryEditing}» داخل {selected?.name ?? "المخزن"} فقط.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="warehouse-category-name">اسم التصنيف الجديد</Label><Input id="warehouse-category-name" value={categoryDraft} onChange={event => setCategoryDraft(event.target.value)} placeholder="مثال: طيار خفيف" autoFocus onKeyDown={event => { if (event.key === "Enter") void saveCategoryName(); }} /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setCategoryEditing(null)} className="rounded-xl">إلغاء</Button><Button type="button" onClick={() => void saveCategoryName()} disabled={!categoryDraft.trim() || renameCategory.isPending} className="rounded-xl bg-[#0d4f62] text-white"><Save className="ml-2 h-4 w-4" />{renameCategory.isPending ? "جاري الحفظ..." : "حفظ الاسم"}</Button></DialogFooter></DialogContent></Dialog><Dialog open={reportOpen} onOpenChange={setReportOpen}><DialogContent className="max-w-5xl rounded-2xl p-3" dir="rtl"><DialogHeader className="px-3 pt-3"><DialogTitle className="flex items-center gap-2 text-xl font-black text-[#102a43]"><FileText className="h-5 w-5 text-[#0d4f62]" />معاينة تقرير {reportName}</DialogTitle><DialogDescription>يعرض أصناف {reportName} فقط، مع الصورة والرصيد والحركات المرتبطة قبل الطباعة.</DialogDescription></DialogHeader><div className="min-h-[58vh] overflow-hidden rounded-xl border border-[#dce7ee] bg-slate-100">{reportBuilding || reportCards.isLoading ? <div className="flex h-[58vh] items-center justify-center gap-2 text-sm font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />جاري تجهيز تقرير PDF العربي...</div> : reportUrl ? <iframe ref={reportIframeRef} src={reportUrl} title={`معاينة تقرير ${reportName} PDF`} className="h-[58vh] w-full bg-white" /> : <div className="flex h-[58vh] items-center justify-center text-sm text-slate-500">لا توجد أصناف في {reportName} لإنشاء التقرير.</div>}</div><DialogFooter className="pdf-action-toolbar flex flex-col items-stretch gap-2 px-3 pb-2 [&>button]:w-full"><Button type="button" variant="outline" onClick={() => setReportOpen(false)} title="إغلاق معاينة PDF" className="rounded-xl">إغلاق</Button><Button type="button" variant="outline" onClick={printWarehouseReport} disabled={!reportUrl} title={`طباعة تقرير ${reportName} مباشرة`} className="rounded-xl"><Printer className="ml-2 h-4 w-4" />طباعة مباشرة</Button><Button type="button" variant="outline" onClick={openWarehouseReportExternal} disabled={!reportUrl} title={`فتح تقرير ${reportName} في نافذة خارجية`} className="rounded-xl"><FileText className="ml-2 h-4 w-4" />معاينة خارجية</Button><Button type="button" variant="outline" onClick={() => void shareWarehouseOnPhone()} disabled={!reportUrl} title={`مشاركة تقرير ${reportName} من الهاتف`} className="rounded-xl border-[#0d806c] text-[#0d806c]"><Share2 className="ml-2 h-4 w-4" />مشاركة الهاتف</Button><Button type="button" variant="outline" onClick={shareWarehouseReportByEmail} disabled={!reportUrl} title={`إرسال تقرير ${reportName} عبر البريد الإلكتروني`} className="rounded-xl border-[#b9d4d9] text-[#0d4f62]"><Mail className="ml-2 h-4 w-4" />مشاركة بالبريد</Button><Button type="button" onClick={downloadWarehouseReport} disabled={!reportUrl} title={`تنزيل تقرير ${reportName} بصيغة PDF`} className="rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]"><FileText className="ml-2 h-4 w-4" />تنزيل PDF</Button></DialogFooter></DialogContent></Dialog>
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
    <Card className={surface}><CardHeader className="border-b border-[#edf2f5] pb-4"><CardTitle className="flex items-center gap-2 text-lg font-black text-[#102a43]"><Truck className="h-5 w-5 text-[#d08a3b]" />دليل الموردين</CardTitle></CardHeader><CardContent className="p-0">{suppliers.isLoading ? <div className="p-12 text-center text-slate-400">جارٍ تحميل الموردين...</div> : suppliers.data?.length ? <><DirectoryToolbar search={search} onSearch={setSearch} sortKey={sortKey} onSortKey={setSortKey} direction={direction} onDirection={() => setDirection(value => value === "asc" ? "desc" : "asc")} /><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-right text-sm"><thead className="bg-[#f7fbfc] text-xs font-black text-slate-400"><tr><th className="px-5 py-4">المورد</th><th className="px-5 py-4">الهاتف</th><th className="px-5 py-4">البريد</th><th className="px-5 py-4">العنوان</th><th className="px-5 py-4">إجراء</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{visibleSuppliers.map(item => <tr key={item.id} className="hover:bg-[#fbfdff]"><td className="px-5 py-4 font-black text-[#102a43]">{item.name}</td><td className="px-5 py-4 text-slate-500">{item.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{item.phone}</span> : "—"}</td><td className="px-5 py-4 text-slate-500">{item.email ? <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{item.email}</span> : "—"}</td><td className="px-5 py-4 text-slate-500">{item.address ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.address}</span> : "—"}</td><td className="px-5 py-4"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => edit(item)} className="rounded-xl border-[#dce7ee] text-[#0d4f62]"><Edit3 className="ml-1 h-3.5 w-3.5" />تعديل</Button><Button variant="outline" size="sm" onClick={() => window.location.href = `/suppliers/${item.id}/statement`} className="rounded-xl"><FileText className="ml-1 h-3.5 w-3.5" />كشف الحساب</Button></div></td></tr>)}</tbody></table></div></> : <div className="p-12 text-center text-sm text-slate-400">لم تتم إضافة موردين بعد. ابدأ بإضافة أول مورد من النموذج أعلاه.</div>}</CardContent></Card>
    <Card className={surface}><CardHeader><CardTitle className="flex items-center gap-2 text-lg font-black text-[#102a43]"><Plus className="h-5 w-5 text-[#0d806c]" />{editingId ? "تعديل المورد" : "إضافة مورد جديد"}</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><div className="space-y-2"><Label>اسم المورد *</Label><Input value={form.name} onChange={set("name")} required placeholder="مثال: شركة النور" className="rounded-xl" /></div><div className="space-y-2"><Label>الهاتف</Label><Input value={form.phone} onChange={set("phone")} placeholder="رقم التواصل" className="rounded-xl" /></div><div className="space-y-2"><Label>البريد الإلكتروني</Label><Input type="email" value={form.email} onChange={set("email")} placeholder="supplier@example.com" className="rounded-xl" /></div><div className="space-y-2"><Label>العنوان</Label><Input value={form.address} onChange={set("address")} placeholder="العنوان" className="rounded-xl" /></div><div className="flex items-end gap-2"><Button type="submit" disabled={busy} className="h-10 flex-1 rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]">{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : editingId ? <Save className="ml-2 h-4 w-4" /> : <Plus className="ml-2 h-4 w-4" />}{editingId ? "حفظ التعديل" : "إضافة المورد"}</Button>{editingId ? <Button type="button" variant="outline" onClick={reset} className="h-10 rounded-xl">إلغاء</Button> : null}</div></form></CardContent></Card>
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
  return <DashboardLayout><div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-7"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-[#d08a3b]">CUSTOMER DIRECTORY</p><h2 className="text-3xl font-black tracking-tight text-[#102a43]">العملاء والجهات المستلمة</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">دليل مستقل للجهات التي تستلم الأصناف من أذونات الصرف، بعيداً عن دليل الموردين الخاص بالإضافة.</p></div><Badge className="w-fit rounded-full bg-[#fbeceb] px-4 py-2 text-[#bd5147]">{customers.data?.length ?? 0} جهة</Badge></div><Card className={surface}><CardHeader className="border-b border-[#edf2f5] pb-4"><CardTitle className="text-lg font-black text-[#102a43]">دليل العملاء والجهات</CardTitle></CardHeader><CardContent className="p-0">{customers.data?.length ? <><DirectoryToolbar search={search} onSearch={setSearch} sortKey={sortKey} onSortKey={setSortKey} direction={direction} onDirection={() => setDirection(value => value === "asc" ? "desc" : "asc")} /><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-right text-sm"><thead className="bg-[#f7fbfc] text-xs font-black text-slate-400"><tr><th className="px-5 py-4">الاسم</th><th className="px-5 py-4">الهاتف</th><th className="px-5 py-4">البريد</th><th className="px-5 py-4">العنوان</th><th className="px-5 py-4">إجراء</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{visibleCustomers.map(item => <tr key={item.id}><td className="px-5 py-4 font-black text-[#102a43]">{item.name}</td><td className="px-5 py-4 text-slate-500">{item.phone || "—"}</td><td className="px-5 py-4 text-slate-500">{item.email || "—"}</td><td className="px-5 py-4 text-slate-500">{item.address || "—"}</td><td className="px-5 py-4"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => { setEditingId(item.id); setForm({ name: item.name, phone: item.phone ?? "", email: item.email ?? "", address: item.address ?? "", notes: item.notes ?? "" }); }} className="rounded-xl">تعديل</Button><Button variant="outline" size="sm" onClick={() => window.location.href = `/customers/${item.id}/statement`} className="rounded-xl"><FileText className="ml-1 h-3.5 w-3.5" />كشف الحساب</Button></div></td></tr>)}</tbody></table></div></> : <div className="p-12 text-center text-sm text-slate-400">لم تتم إضافة عملاء أو جهات مستلمة بعد.</div>}</CardContent></Card><Card className={surface}><CardHeader><CardTitle className="flex items-center gap-2 text-lg font-black text-[#102a43]"><Plus className="h-5 w-5 text-[#bd5147]" />{editingId ? "تعديل العميل أو الجهة" : "إضافة عميل أو جهة"}</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><div className="space-y-2"><Label>اسم العميل/الجهة *</Label><Input value={form.name} onChange={set("name")} required placeholder="مثال: فرع القاهرة" className="rounded-xl" /></div><div className="space-y-2"><Label>الهاتف</Label><Input value={form.phone} onChange={set("phone")} className="rounded-xl" /></div><div className="space-y-2"><Label>البريد الإلكتروني</Label><Input type="email" value={form.email} onChange={set("email")} className="rounded-xl" /></div><div className="space-y-2"><Label>العنوان</Label><Input value={form.address} onChange={set("address")} className="rounded-xl" /></div><div className="flex items-end gap-2"><Button type="submit" disabled={busy} className="h-10 flex-1 rounded-xl bg-[#bd5147] text-white hover:bg-[#a9433b]">{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Plus className="ml-2 h-4 w-4" />}{editingId ? "حفظ التعديل" : "إضافة الجهة"}</Button>{editingId ? <Button type="button" variant="outline" onClick={reset} className="h-10 rounded-xl">إلغاء</Button> : null}</div></form></CardContent></Card></div></DashboardLayout>;
}


type StatementKind = "supplier" | "customer";
type AccountSummaryLine = "disbursement" | "negative" | "returns" | "net" | "financialValue";
const accountSummaryLineLabels: Record<AccountSummaryLine, string> = { disbursement: "إجمالي الصرف", negative: "الكميات السالبة", returns: "المرتجعات", net: "الرصيد الصافي", financialValue: "إجمالي القيمة المالية" };
export function AccountStatementPage({ kind }: { kind: StatementKind }) {
  const [, supplierParams] = useRoute("/suppliers/:id/statement");
  const [, customerParams] = useRoute("/customers/:id/statement");
  const id = Number((kind === "supplier" ? supplierParams?.id : customerParams?.id) ?? 0);
  const suppliers = trpc.suppliers.list.useQuery(undefined, { enabled: kind === "supplier" });
  const customers = trpc.customers.list.useQuery(undefined, { enabled: kind === "customer" });
  const additions = trpc.additions.account.useQuery({ supplierId: id }, { enabled: kind === "supplier" && id > 0 });
  const disbursements = trpc.disbursements.account.useQuery({ customerId: id }, { enabled: kind === "customer" && id > 0 });
  const inventoryItems = trpc.items.list.useQuery(undefined, { enabled: id > 0 });
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
  const [includeItemQuantitySummary, setIncludeItemQuantitySummary] = useState(false);
  const [includeCompanyLogoInHeader, setIncludeCompanyLogoInHeader] = useState(true);
  const [includeCurrentStockInItemSummary, setIncludeCurrentStockInItemSummary] = useState(false);
  const [selectedPdfSummaryLines, setSelectedPdfSummaryLines] = useState<AccountSummaryLine[]>([]);
  const [pdfBuilding, setPdfBuilding] = useState(false);
  const [financialPreferenceVisible, setFinancialPreferenceVisible] = useState(false);
  const [permitFilter, setPermitFilter] = useState("");
  const [appliedPermitFilter, setAppliedPermitFilter] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [appliedItemSearch, setAppliedItemSearch] = useState("");
  const [permitImage, setPermitImage] = useState<{ url: string; name: string } | null>(null);
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
  const accountLoading = kind === "supplier" ? additions.isLoading || suppliers.isLoading || inventoryItems.isLoading : disbursements.isLoading || customers.isLoading || inventoryItems.isLoading;
  const accountDataAvailable = kind === "supplier" ? additions.data !== undefined && suppliers.data !== undefined : disbursements.data !== undefined && customers.data !== undefined;
  const accountError = !accountDataAvailable && (kind === "supplier" ? additions.error || suppliers.error : disbursements.error || customers.error);
  const canViewAccountFinancialDetails = permissions.data?.allowedReports.includes(WAREHOUSE_FINANCIAL_PERMISSION) ?? false;
  const accountPreferenceKey = `account:${kind}:${id}`;
  const accountFinancialPreferenceKey = `account-financial-details:${kind}:${id}`;
  const baseAccountColumns: ExportColumnKey[] = ["name", "date", "eznNum", "type", "quantity"];
  const accountColumns = useMemo<ExportColumnKey[]>(() => canViewAccountFinancialDetails ? [...baseAccountColumns, "unitPrice", "totalValue"] : baseAccountColumns, [canViewAccountFinancialDetails]);
  const showAccountFinancialDetails = canViewAccountFinancialDetails && financialPreferenceVisible;
  const allRows = kind === "supplier"
    ? buildAccountStatementRows(additions.data ?? [], "supplier", id)
    : buildAccountStatementRows(disbursements.data ?? [], "customer", id);
  const rows = useMemo(() => filterAccountStatementRows(allRows, { permit: appliedPermitFilter, item: appliedItemSearch }), [allRows, appliedPermitFilter, appliedItemSearch]);
  const permitDetails = trpc.reports.permitDetails.useQuery({ permitNumber: appliedPermitFilter || "__none__" }, { enabled: Boolean(appliedPermitFilter) });
  const permitDetailRows = useMemo(() => {
    const data = permitDetails.data;
    if (!data) return [] as Array<{ type: string; row: any }>;
    return [
      ...data.additions.map(row => ({ type: "إضافة", row })),
      ...data.disbursements.map(row => ({ type: "صرف", row })),
      ...data.transfers.map(row => ({ type: String(row.transferType || "تحويل/مرتجع"), row })),
    ];
  }, [permitDetails.data]);
  const permitTotals = useMemo(() => permitDetailRows.reduce((summary, entry) => {
    const quantity = Math.abs(Number(entry.row.quantity ?? 0));
    if (entry.type === "إضافة") summary.additions += quantity;
    else if (entry.type === "صرف") summary.disbursements += quantity;
    else summary.returns += quantity;
    return summary;
  }, { additions: 0, disbursements: 0, returns: 0 }), [permitDetailRows]);
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const accountTotals = rows.reduce((summary, row) => {
    if (kind === "customer") {
      if (row.type === "صرف") row.quantity >= 0 ? summary.disbursed += row.quantity : summary.negative += Math.abs(row.quantity);
      else if (row.type === "مرتجع") summary.returns += Math.abs(row.quantity);
      else if (row.type === "تحويل") summary.transferNet += row.quantity;
    }
    summary.net = summary.disbursed - summary.negative - summary.returns + summary.transferNet;
    return summary;
  }, { disbursed: 0, negative: 0, returns: 0, transferNet: 0, net: 0 });
  const stockByIdentity = useMemo(() => new Map((inventoryItems.data ?? []).map(item => [String(item.code || item.name || "").trim().toLocaleLowerCase("ar-EG"), Number(item.currentStock ?? 0)])), [inventoryItems.data]);
  const unitByIdentity = useMemo(() => new Map((inventoryItems.data ?? []).map(item => [String(item.code || item.name || "").trim().toLocaleLowerCase("ar-EG"), item.unit ?? null])), [inventoryItems.data]);
  const exportRows = rows.map(row => ({
    id: row.id,
    currentStock: kind === "supplier" ? (stockByIdentity.get(String(row.itemCode || row.item || "").trim().toLocaleLowerCase("ar-EG")) ?? 0) : undefined,
    unit: unitByIdentity.get(String(row.itemCode || row.item || "").trim().toLocaleLowerCase("ar-EG")) ?? null,
    type: row.type,
    date: row.date,
    eznNum: row.number,
    name: row.item ?? "—",
    itemCode: row.itemCode || row.item || "—",
    quantity: row.quantity,
    detail: entity?.name ?? "—",
    unitPrice: row.unitPrice,
    totalValue: row.total,
  }));
  const companyLogo = resolveCompanyLogoUrl(settings.data?.find(item => item.key === "company_logo")?.value ?? settings.data?.find(item => item.key === "company_logo_url")?.value);
  const watermarkEnabled = settings.data?.find(item => item.key === "report_watermark_enabled")?.value !== "false";
  const watermarkOpacity = Number(settings.data?.find(item => item.key === "report_watermark_opacity")?.value ?? "0.08");
  const watermarkScale = Number(settings.data?.find(item => item.key === "report_watermark_scale")?.value ?? "0.42");
  const watermarkPosition = (settings.data?.find(item => item.key === "report_watermark_position")?.value ?? "center") as "center" | "top" | "bottom";
  const watermarkRepeat = settings.data?.find(item => item.key === "report_watermark_repeat")?.value === "true";
  const buildPdfItemSummary = () => {
    if (!includeItemQuantitySummary) return undefined;
    const summary = summarizeAccountStatementItems(exportRows);
    return includeCurrentStockInItemSummary ? summary : summary.map(({ currentStock: _currentStock, ...item }) => item);
  };
  const reportSummary = [
    `${kind === "customer" ? "جهة الصرف" : "المورد"}: ${entity?.name ?? "—"}`,
    `إجمالي الكمية: ${totalQuantity.toLocaleString("en-US")}`,
    ...(kind === "customer" && selectedPdfSummaryLines.includes("disbursement") ? [`إجمالي الصرف: ${accountTotals.disbursed.toLocaleString("en-US")}`] : []),
    ...(kind === "customer" && selectedPdfSummaryLines.includes("negative") ? [`الكميات السالبة: ${accountTotals.negative.toLocaleString("en-US")}`] : []),
    ...(kind === "customer" && selectedPdfSummaryLines.includes("returns") ? [`المرتجعات: ${accountTotals.returns.toLocaleString("en-US")}`] : []),
    ...(kind === "customer" && selectedPdfSummaryLines.includes("net") ? [`الرصيد الصافي: ${accountTotals.net.toLocaleString("en-US")}`] : []),
    ...(selectedPdfSummaryLines.includes("financialValue") && canViewAccountFinancialDetails ? [`إجمالي القيمة المالية: ${formatPdfCurrency(total)}`] : []),
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
  const toggleAccountSummaryLine = (line: AccountSummaryLine) => setSelectedPdfSummaryLines(current => current.includes(line) ? current.filter(item => item !== line) : [...current, line]);
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
      const itemSummary = buildPdfItemSummary();
      const doc = await buildAccountStatementPdf(exportRows, {
        columns: selectedPdfColumns,
        itemSummary,
        logo: companyLogo,
        includeHeaderLogo: includeCompanyLogoInHeader,
        watermarkEnabled,
        watermarkOpacity,
        watermarkScale,
        watermarkPosition,
        watermarkRepeat,
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
          itemSummary: buildPdfItemSummary(),
          logo: companyLogo,
          includeHeaderLogo: includeCompanyLogoInHeader,
          watermarkEnabled,
          watermarkOpacity,
          watermarkScale,
          watermarkPosition,
          watermarkRepeat,
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

  const showPermitDetails = (permitNumber: string) => {
    const normalized = String(permitNumber ?? "").trim();
    if (!normalized) return;
    setPermitFilter(normalized);
    setAppliedPermitFilter(normalized);
    window.setTimeout(() => document.getElementById("account-permit-details-card")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  const showItemMovements = (itemName: string | null, itemCode: string) => {
    const value = String(itemName || itemCode || "").trim();
    if (!value) return;
    setPermitFilter("");
    setAppliedPermitFilter("");
    setItemSearch(value);
    setAppliedItemSearch(value);
    window.setTimeout(() => document.getElementById("account-statement-filter-card")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  if (accountLoading) return <DashboardLayout><div className="space-y-4 p-12 text-center text-slate-500"><OfflineDataNotice resource={kind === "supplier" ? "كشف حساب المورد" : "كشف حساب العميل"} hasCachedData={accountDataAvailable} /><p>جارٍ تحميل كشف الحساب...</p></div></DashboardLayout>;
  if (accountError) return <DashboardLayout><div className="space-y-4 p-12 text-center text-red-500"><OfflineDataNotice resource={kind === "supplier" ? "كشف حساب المورد" : "كشف حساب العميل"} hasCachedData={accountDataAvailable} /><p>تعذر تحميل كشف الحساب.</p></div></DashboardLayout>;
  if (!entity) return <DashboardLayout><div className="p-12 text-center text-slate-500">الجهة المطلوبة غير موجودة.</div></DashboardLayout>;

  return <DashboardLayout>
    <div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-6">
      <section className="overflow-hidden rounded-[1.75rem] border border-[#d6eaec] bg-gradient-to-l from-[#edf9f8] via-white to-[#fffaf0] shadow-[0_18px_50px_rgba(18,44,84,0.06)]">
        <div className="flex flex-col justify-between gap-5 p-5 sm:p-6 lg:flex-row lg:items-end">
        <div className="min-w-0">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-[#d08a3b]">ACCOUNT STATEMENT / {kind === "supplier" ? "SUPPLIER" : "CUSTOMER"}</p>
          <h2 className="text-3xl font-black tracking-tight text-[#102a43]">كشف حساب {kind === "supplier" ? "المورد" : "العميل/الجهة"}</h2>
          <p className="mt-2 text-sm leading-7 text-slate-500">تفاصيل الحركات المسجلة للجهة مع الكميات ومعلومات الأذونات.</p>
          <div className="account-entity-badge mt-4 inline-flex max-w-full items-center gap-3 rounded-2xl border border-[#9ed9e1] bg-white/80 px-4 py-3 shadow-sm backdrop-blur" aria-label={`${kind === "supplier" ? "اسم المورد" : "اسم العميل"}: ${entity.name}`}>
            <span className="shrink-0 rounded-xl bg-[#0d7180] px-3 py-2 text-xs font-black text-white">{kind === "supplier" ? "اسم المورد" : "اسم العميل"}</span>
            <span className="account-entity-name truncate text-lg font-black text-[#102a43] dark:text-[#f1fbfc] sm:text-xl">{entity.name}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:max-w-[420px] lg:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => { window.location.href = kind === "supplier" ? "/suppliers" : "/customers"; }} className="h-9 rounded-xl border-[#9fcbd0] px-3 text-xs font-black text-[#0d4f62] hover:bg-[#e8f7f6]" title={kind === "supplier" ? "العودة إلى دليل الموردين" : "العودة إلى دليل العملاء"}><ArrowRight className="ml-1 h-3.5 w-3.5" />العودة لكشوف الحساب</Button>
          {canViewAccountFinancialDetails ? <Button type="button" variant="outline" size="sm" onClick={() => void toggleAccountFinancialDetails()} disabled={updatePreferences.isPending || permissions.isLoading || preferences.isLoading} aria-pressed={showAccountFinancialDetails} className="movement-financial-toggle rounded-xl px-2 text-[10px] font-black sm:px-3 sm:text-xs"><Eye className="ml-1 h-3.5 w-3.5" />{showAccountFinancialDetails ? "إخفاء التفاصيل المالية" : "إظهار التفاصيل المالية"}</Button> : null}
        </div>
      </div>
      </section>
      <div className={`grid gap-4 ${kind === "customer" ? "sm:grid-cols-3 lg:grid-cols-6" : showAccountFinancialDetails ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {kind === "customer" ? <><Card className={`${surface} border-r-4 border-r-[#0d4f62]`}><CardContent className="p-5"><p className="text-xs font-bold text-slate-400">الرصيد الصافي</p><p className="mt-2 text-2xl font-black text-[#0d4f62]">{accountTotals.net.toLocaleString("en-US")}</p><p className="mt-1 text-[10px] text-slate-400">بعد خصم المرتجعات والسالب</p></CardContent></Card><Card className={`${surface} border-r-4 border-r-[#bd5147]`}><CardContent className="p-5"><p className="text-xs font-bold text-slate-400">إجمالي الصرف الكلي</p><p className="mt-2 text-2xl font-black text-[#bd5147]">{accountTotals.disbursed.toLocaleString("en-US")}</p><p className="mt-1 text-[10px] text-slate-400">الصرف الكلي بدون خصم المرتجع</p></CardContent></Card><Card className={`${surface} border-r-4 border-r-[#d08a3b]`}><CardContent className="p-5"><p className="text-xs font-bold text-slate-400">المرتجع والسالب</p><p className="mt-2 text-2xl font-black text-[#a96821]">{(accountTotals.negative + accountTotals.returns).toLocaleString("en-US")}</p><p className="mt-1 text-[10px] text-slate-400">حركات عكسية مؤثرة</p></CardContent></Card><Card className={`${surface} border-r-4 border-r-[#0d806c]`}><CardContent className="p-5"><p className="text-xs font-bold text-slate-400">إجمالي الكميات</p><p className="mt-2 text-2xl font-black text-[#0d806c]">{totalQuantity.toLocaleString("en-US")}</p><p className="mt-1 text-[10px] text-slate-400">صافي الكمية بالحساب</p></CardContent></Card><Card className={`${surface} border-r-4 border-r-[#0d7180]`}><CardContent className="p-5"><p className="text-xs font-bold text-slate-400">عدد الحركات</p><p className="mt-2 text-2xl font-black text-[#102a43]">{rows.length}</p><p className="mt-1 text-[10px] text-slate-400">ضمن الفلتر الحالي</p></CardContent></Card><Card className={`${surface} border-r-4 border-r-[#0d7180]`}><CardContent className="p-5"><p className="text-xs font-bold text-slate-400">صافي التحويلات</p><p className="mt-2 text-2xl font-black text-[#0d7180]">{accountTotals.transferNet.toLocaleString("en-US")}</p><p className="mt-1 text-[10px] text-slate-400">تحويلات بين الجهات</p></CardContent></Card></> : <><Card className={`${surface} border-r-4 border-r-[#0d7180]`}><CardContent className="p-5"><p className="text-xs font-bold text-slate-400">عدد الحركات</p><p className="mt-2 text-2xl font-black text-[#102a43]">{rows.length}</p></CardContent></Card><Card className={`${surface} border-r-4 border-r-[#0d806c]`}><CardContent className="p-5"><p className="text-xs font-bold text-slate-400">إجمالي الكميات</p><p className="mt-2 text-2xl font-black text-[#0d806c]">{totalQuantity.toLocaleString("en-US")}</p></CardContent></Card>{showAccountFinancialDetails ? <Card className={`${surface} border-r-4 border-r-[#bd5147]`}><CardContent className="p-5"><p className="text-xs font-bold text-slate-400">إجمالي القيمة</p><p className="mt-2 text-2xl font-black text-[#bd5147]">{total.toLocaleString("en-US", { minimumFractionDigits: 2 })} ج.م</p></CardContent></Card> : null}</>}
      </div>
      <Card id="account-statement-filter-card" className={`${surface} overflow-hidden`}>
        <CardHeader className="border-b border-[#edf2f5] bg-[#fbfdff] pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><CardTitle className="flex items-center gap-2 text-lg font-black text-[#102a43]"><Search className="h-5 w-5 text-[#0d7180]" />فلترة كشف الحساب</CardTitle><p className="mt-1 text-xs leading-6 text-slate-400">استخدم أحد الحقلين للوصول السريع إلى الإذن أو الصنف، ثم طبّق الفلتر.</p></div>
            <Badge className="w-fit rounded-full bg-[#e8f7f6] px-3 py-1.5 text-[11px] font-black text-[#0d806c]">{rows.length} نتيجة حالية</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-xs font-black text-slate-500"><span>رقم الإذن</span><Input value={permitFilter} onChange={event => setPermitFilter(event.target.value)} onKeyDown={event => { if (event.key === "Enter") setAppliedPermitFilter(permitFilter.trim()); }} placeholder="مثال: 5207" className="h-11 rounded-xl bg-[#fbfdff] font-bold" /></label>
            <label className="space-y-2 text-xs font-black text-slate-500"><span>اسم الصنف أو الكود</span><Input value={itemSearch} onChange={event => setItemSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") setAppliedItemSearch(itemSearch.trim()); }} placeholder="اكتب اسم الصنف أو الكود" className="h-11 rounded-xl bg-[#fbfdff] font-bold" /></label>
          </div>
          <div className="flex flex-wrap items-center gap-2"><Button type="button" onClick={() => { setAppliedPermitFilter(permitFilter.trim()); setAppliedItemSearch(itemSearch.trim()); }} className="h-11 rounded-xl bg-[#0d7180] px-5 font-black text-white hover:bg-[#095d69]">تطبيق الفلتر</Button><Button type="button" variant="outline" onClick={() => { setPermitFilter(""); setAppliedPermitFilter(""); setItemSearch(""); setAppliedItemSearch(""); }} disabled={!permitFilter && !appliedPermitFilter && !itemSearch && !appliedItemSearch} className="h-11 rounded-xl">مسح الفلاتر</Button>{appliedPermitFilter ? <span className="rounded-full border border-[#b9d4d9] bg-[#f0f8f8] px-3 py-2 text-xs font-bold text-[#0d4f62]">إذن: {appliedPermitFilter}</span> : null}{appliedItemSearch ? <span className="max-w-full truncate rounded-full border border-[#b9d4d9] bg-[#f0f8f8] px-3 py-2 text-xs font-bold text-[#0d4f62]">صنف: {appliedItemSearch}</span> : null}</div>
        </CardContent>
      </Card>
      <Card className={`${surface} border-[#d6eaec] bg-[#f0f8f8]`}>
        <CardContent className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-black text-[#0d4f62]">النتائج الحالية</p><p className="text-xs text-slate-500">{entity.name} · كل الحركات المطابقة للفلاتر الحالية</p></div>
          <div className="flex items-center gap-3 text-xs font-bold"><span className="text-slate-500">{rows.length} حركة مطابقة</span><span className="rounded-full bg-white px-3 py-1.5 text-[#0d806c] shadow-sm">جاهز للتصدير</span></div>
        </CardContent>
      </Card>
      {appliedPermitFilter ? <Card id="account-permit-details-card" className={`${surface} overflow-hidden`}>
        <CardHeader className="border-b border-[#edf2f5] bg-gradient-to-l from-[#eef8f7] to-white pb-4"><CardTitle className="flex items-center gap-2 text-lg font-black text-[#102a43]"><FileText className="h-5 w-5 text-[#0d7180]" />ملخص الإذن رقم {appliedPermitFilter}</CardTitle><p className="mt-1 text-xs text-slate-500">{kind === "supplier" ? "تفاصيل مجمعة من حركات الإضافة والصرف والارتجاع." : "تفاصيل مجمعة من حركات الصرف والارتجاع."}</p></CardHeader>
        <CardContent className="space-y-4 p-5">{permitDetails.isLoading ? <div className="flex items-center justify-center gap-2 py-8 text-sm font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />جارٍ تحميل تفاصيل الإذن...</div> : permitDetails.error ? <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-center text-sm font-bold text-red-700">تعذر تحميل تفاصيل الإذن. تأكد من صلاحية التقارير.</div> : <>{kind === "supplier" ? <div className="grid gap-3 sm:grid-cols-1"><div className="rounded-2xl bg-[#e8f7f6] p-4"><p className="text-xs font-bold text-[#0d806c]">الكمية المضافة</p><p className="mt-1 text-2xl font-black text-[#0d806c]">{permitTotals.additions.toLocaleString("en-US")}</p></div></div> : <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[#fbeceb] p-4"><p className="text-xs font-bold text-[#bd5147]">الكمية المصروفة</p><p className="mt-1 text-2xl font-black text-[#bd5147]">{permitTotals.disbursements.toLocaleString("en-US")}</p></div><div className="rounded-2xl bg-[#fff4df] p-4"><p className="text-xs font-bold text-[#a96821]">الكمية المرتجعة</p><p className="mt-1 text-2xl font-black text-[#a96821]">{permitTotals.returns.toLocaleString("en-US")}</p></div></div>}{permitDetailRows.length ? <div className="overflow-x-auto rounded-2xl border border-[#dce7ee]"><table className="w-full min-w-[900px] text-right text-sm"><thead className="bg-[#0d4f62] text-xs font-black text-white"><tr><th className="px-4 py-3">الحركة</th><th className="px-4 py-3">التاريخ</th><th className="px-4 py-3">الصنف</th><th className="px-4 py-3">الكود</th><th className="px-4 py-3">الكمية</th><th className="px-4 py-3">البيان</th><th className="px-4 py-3">عرض الإذن</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{permitDetailRows.map(({ type, row }) => <tr key={`${type}-${row.id}`} className="odd:bg-[#fbfdff] hover:bg-[#eef8f7]"><td className="px-4 py-3"><Badge className={type === "صرف" ? "bg-red-50 text-red-700" : type === "إضافة" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}>{type}</Badge></td><td className="px-4 py-3 text-slate-500">{row.date}</td><td className="px-4 py-3 font-black text-[#102a43]">{row.itemName || "—"}</td><td className="px-4 py-3 font-mono text-xs text-slate-500">{row.itemCode || "—"}</td><td className="px-4 py-3 font-black text-[#0d4f62]">{Number(row.quantity ?? 0).toLocaleString("en-US")}</td><td className="px-4 py-3 text-slate-500">{row.purpose || row.disburseType || row.transferType || row.notes || "—"}</td><td className="px-4 py-3">{row.documentImageUrl ? <Button type="button" variant="outline" onClick={() => setPermitImage({ url: row.documentImageUrl, name: `permit-${appliedPermitFilter}.jpg` })} className="h-9 rounded-lg border-[#b9d4d9] px-3 text-xs font-black text-[#0d4f62]"><Eye className="ml-1 h-4 w-4" />عرض الصورة</Button> : <span className="text-xs text-slate-300">غير مرفق</span>}</td></tr>)}</tbody></table></div> : <div className="rounded-2xl border border-dashed border-[#b9d4d9] bg-[#f7fbfc] p-8 text-center text-sm font-bold text-slate-500">لا توجد بيانات إضافية بهذا الرقم في جداول الإضافة أو الصرف أو الارتجاع.</div>}</>}</CardContent>
      </Card> : null}
      <Card className={surface}>
        <CardHeader className="flex flex-col gap-4 border-b border-[#edf2f5] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle className="text-lg font-black text-[#102a43]">تفاصيل الحركات</CardTitle><p className="mt-1 text-xs text-slate-400">اضغط على رقم الإذن لفتح التفاصيل، أو على الصنف لعرض كل حركاته.</p></div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={openAccountColumns} disabled={Boolean(exportBusy)} className="h-9 rounded-xl border-[#d9c08d] bg-[#fffaf0] px-3 text-xs font-black text-[#9b621d]"><FileText className="ml-1 h-3.5 w-3.5" />اختيار أعمدة PDF</Button>
            <Button type="button" variant="outline" onClick={() => void exportStatement("excel")} disabled={Boolean(exportBusy)} className="h-9 rounded-xl px-3 text-xs font-black text-[#0d4f62]"><FileText className="ml-1 h-3.5 w-3.5" />{exportBusy === "excel" ? "جارٍ التصدير..." : "تصدير Excel"}</Button>
            <Button type="button" onClick={openAccountColumns} disabled={Boolean(exportBusy)} className="h-9 rounded-xl bg-[#0d4f62] px-3 text-xs font-black text-white"><FileText className="ml-1 h-3.5 w-3.5" />{pdfBuilding ? "جاري تجهيز PDF" : "معاينة PDF"}</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length ? <div className="overflow-x-auto account-statement-scroll-region"><table data-account-statement-table="true" dir="rtl" className="table-auto w-max min-w-[780px] text-right text-[13px]"><thead className="bg-[#f7fbfc] text-[11px] font-black text-slate-400"><tr><th className="px-4 py-3">التاريخ</th><th className="px-4 py-3">رقم الإذن</th><th className="px-4 py-3">الحركة</th><th className="px-4 py-3">الصنف</th><th className="px-4 py-3">الكمية</th>{showAccountFinancialDetails ? <><th className="px-4 py-3">سعر الوحدة</th><th className="px-4 py-3">الإجمالي</th></> : null}<th className="px-4 py-3">التفاصيل</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{rows.map(row => <tr key={row.id}><td className="px-4 py-3 text-slate-500">{row.date}</td><td className="px-4 py-3"><button type="button" onClick={() => showPermitDetails(row.number)} className="rounded-lg px-2 py-1 font-mono text-xs font-black text-[#0d4f62] underline decoration-dotted underline-offset-4 hover:bg-[#e8f7f6]" title="عرض تفاصيل الإذن">{row.number}</button></td><td className="px-4 py-3 font-bold">{row.type}</td><td className="px-4 py-3 font-black text-[#102a43]"><button type="button" onClick={() => showItemMovements(row.item, row.itemCode)} className="rounded-lg px-2 py-1 text-right underline decoration-dotted underline-offset-4 hover:bg-[#e8f7f6]" title="عرض كل حركات هذا الصنف">{row.item || row.itemCode || "—"}</button></td><td className="px-4 py-3">{row.quantity.toLocaleString("en-US")}</td>{showAccountFinancialDetails ? <><td className="px-4 py-3">{row.unitPrice.toLocaleString("en-US")} ج.م</td><td className="px-4 py-3 font-black text-[#0d4f62]">{row.total.toLocaleString("en-US", { minimumFractionDigits: 2 })} ج.م</td></> : null}<td className="px-4 py-3"><Button type="button" variant="outline" onClick={() => showPermitDetails(row.number)} className="h-9 rounded-lg border-[#0d7180] px-3 text-xs font-black text-[#0d4f62] hover:bg-[#e8f7f6]"><Eye className="ml-1 h-4 w-4" />عرض التفاصيل</Button></td></tr>)}</tbody></table></div> : <div className="p-12 text-center text-sm text-slate-400">لا توجد حركات مرتبطة بهذه الجهة حتى الآن.</div>}
          <Dialog open={Boolean(permitImage)} onOpenChange={open => { if (!open) setPermitImage(null); }}><DialogContent className="max-w-4xl rounded-2xl bg-white p-4" dir="rtl"><DialogHeader><DialogTitle className="font-black text-[#102a43]">صورة الإذن رقم {appliedPermitFilter}</DialogTitle><DialogDescription>يمكنك معاينة صورة الإذن ثم تنزيلها.</DialogDescription></DialogHeader>{permitImage ? <div className="flex min-h-[45vh] items-center justify-center rounded-2xl bg-slate-950/5 p-3"><img src={permitImage.url} alt={`صورة إذن ${appliedPermitFilter}`} className="max-h-[65vh] max-w-full rounded-xl object-contain" /></div> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setPermitImage(null)} className="rounded-xl">إغلاق</Button>{permitImage ? <a href={permitImage.url} download={permitImage.name} className="inline-flex h-10 items-center justify-center rounded-xl bg-[#0d4f62] px-4 text-sm font-bold text-white"><Download className="ml-2 h-4 w-4" />تنزيل الصورة</a> : null}</DialogFooter></DialogContent></Dialog>
          <Dialog open={pdfColumnsOpen} onOpenChange={setPdfColumnsOpen}>
            <DialogContent className="max-w-2xl rounded-2xl bg-white" dir="rtl">
              <DialogHeader><DialogTitle className="text-xl font-black text-[#102a43]">اختيار أعمدة كشف الحساب</DialogTitle><DialogDescription>اسحب الأعمدة لترتيبها من اليمين إلى اليسار، ثم اختر الأعمدة التي تريد ظهورها في PDF وExcel. ملخص كميات الأصناف خيار إضافي لملف PDF فقط.</DialogDescription></DialogHeader>
              <div className="rounded-xl border border-dashed border-[#b9d4d9] bg-[#f8fcfc] p-3"><p className="mb-2 text-xs font-bold text-[#0d4f62]">أول بطاقة في القائمة تظهر أقصى اليمين في التقرير.</p><div className="flex flex-wrap gap-2">{selectedPdfColumns.map(column => <button key={`account-drag-${column}`} type="button" draggable onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", column); }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); moveAccountColumn(event.dataTransfer.getData("text/plain") as ExportColumnKey, column); }} className="inline-flex cursor-grab items-center gap-1 rounded-lg border border-[#9fcbd0] bg-white px-2.5 py-1.5 text-xs font-bold text-[#0d4f62] shadow-sm"><GripVertical className="h-3.5 w-3.5" />{accountColumnLabels[column]}</button>)}</div></div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">{accountColumns.map(column => <label key={column} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${selectedPdfColumns.includes(column) ? "border-[#0d7180] bg-[#eef7f7]" : "border-[#dce7ee] bg-white"}`}><input type="checkbox" checked={selectedPdfColumns.includes(column)} onChange={() => toggleAccountColumn(column)} className="h-4 w-4 accent-[#0d7180]" /><span className="text-sm font-bold text-[#102a43]">{accountColumnLabels[column]}</span></label>)}</div>
              <label className={`mt-3 flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${includeItemQuantitySummary ? "border-[#0d7180] bg-[#eef7f7]" : "border-[#dce7ee] bg-white"}`}><input type="checkbox" checked={includeItemQuantitySummary} onChange={event => setIncludeItemQuantitySummary(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0d7180]" /><span><span className="block text-sm font-bold text-[#102a43]">ملخص كميات الأصناف في الترويسة</span><span className="mt-1 block text-xs leading-5 text-slate-500">يُبقي كل حركة وتاريخ ورقم إذن كما هي، ويضيف أعلى PDF صافي كمية كل صنف بعد خصم الكميات السالبة. يطبق هذا الخيار على PDF فقط.</span></span></label>
              <label className={`mt-3 flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${includeCompanyLogoInHeader ? "border-[#0d7180] bg-[#eef7f7]" : "border-[#dce7ee] bg-white"}`}><input type="checkbox" checked={includeCompanyLogoInHeader} onChange={event => setIncludeCompanyLogoInHeader(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0d7180]" /><span><span className="block text-sm font-bold text-[#102a43]">إظهار شعار الشركة في ترويسة PDF</span><span className="mt-1 block text-xs leading-5 text-slate-500">يمكنك إلغاء التحديد لإخفاء الشعار من الترويسة فقط؛ إعداد العلامة المائية لا يتغير.</span></span></label>
          {kind === "supplier" ? <label className={`mt-3 flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${includeCurrentStockInItemSummary ? "border-[#0d7180] bg-[#eef7f7]" : "border-[#dce7ee] bg-white"}`}><input type="checkbox" checked={includeCurrentStockInItemSummary} onChange={event => setIncludeCurrentStockInItemSummary(event.target.checked)} disabled={!includeItemQuantitySummary} className="mt-0.5 h-4 w-4 accent-[#0d7180]" /><span><span className="block text-sm font-bold text-[#102a43]">إظهار الرصيد الحالي بجوار كل صنف</span><span className="mt-1 block text-xs leading-5 text-slate-500">يضيف عمود الرصيد الحالي إلى جدول ملخص المورد. فعّل ملخص كميات الأصناف أولاً.</span></span></label> : null}
              {kind === "customer" ? <div className="mt-4 rounded-xl border border-dashed border-[#b9d4d9] bg-[#f8fcfc] p-3"><p className="mb-2 text-xs font-black text-[#0d4f62]">بيانات الترويسة الاختيارية</p><p className="mb-3 text-xs text-slate-500">سيظهر التاريخ ثم جهة الصرف وإجمالي الكمية تلقائياً. اختر أي بيانات إضافية تريدها في الترويسة.</p><div className="grid gap-3 sm:grid-cols-2">{(Object.keys(accountSummaryLineLabels) as AccountSummaryLine[]).map(line => <label key={line} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${selectedPdfSummaryLines.includes(line) ? "border-[#0d7180] bg-[#eef7f7]" : "border-[#dce7ee] bg-white"}`}><input type="checkbox" checked={selectedPdfSummaryLines.includes(line)} onChange={() => toggleAccountSummaryLine(line)} className="h-4 w-4 accent-[#0d7180]" /><span className="text-sm font-bold text-[#102a43]">{accountSummaryLineLabels[line]}</span></label>)}</div></div> : null}
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
