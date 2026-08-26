import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { dashboardQueryOptions, inventoryQueryOptions } from "@/lib/queryOptions";
import {
  AlertTriangle,
  Bookmark,
  Check,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Boxes,
  CalendarDays,
  Clock3,
  ChevronLeft,
  ArrowDownAZ,
  ListFilter,
  CircleCheck,
  Package,
  Plus,
  RefreshCcw,
  Share2,
  Warehouse,
} from "lucide-react";
import { useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
const formatNumber = (value: number | string | null | undefined) => numberFormatter.format(Number(value ?? 0));
const formatChartDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(parsed);
};

export function formatHomeBannerTime(value: Date, locale = "en-US", timeZone?: string) {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(value);
}

function HomeHeroDateTime() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  return <div className="home-hero-datetime mb-4 space-y-1.5"><div className="home-hero-date flex items-center gap-2"><CalendarDays className="h-4 w-4" style={{ color: "#ffffff" }} /><span className="text-xs font-bold" style={{ color: "#ffffff" }}>{new Intl.DateTimeFormat("en-US", { dateStyle: "full" }).format(now)}</span></div><div className="home-hero-time mr-6 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-black" aria-live="polite" aria-label="الوقت الحالي"><Clock3 className="h-3.5 w-3.5" /><span className="font-mono" dir="ltr">{formatHomeBannerTime(now)}</span></div></div>;
}

const movementChartConfig = {
  additions: { label: "الوارد", color: "#0d806c" },
  disbursements: { label: "المنصرف", color: "#bd5147" },
  transfers: { label: "التحويلات", color: "#d08a3b" },
};

type WarehouseSummaryInput = { id: number; slot: number; name: string };
type InventoryBalanceInput = { warehouseId?: number | null; currentStock?: unknown; reorderLevel?: unknown };
type CurrentBalanceItem = { id?: number; code?: string | null; name?: string | null; unit?: string | null; currentStock?: unknown };
type CurrentBalanceCardItem = { id?: number; code: string; name: string };
type WarehouseItemCountInput = { warehouseId?: number | null; count?: number | string | null };
type WarehouseItemCountDetail = { id?: number; name: string; count: number };
type LatestPermit = { eznNum?: string | null; date?: string | null } | null | undefined;
export function summarizeWarehouseBalances(warehouses: WarehouseSummaryInput[], inventory: InventoryBalanceInput[]) {
  return warehouses.map(warehouse => { const rows = inventory.filter(item => item.warehouseId === warehouse.id); return { ...warehouse, itemCount: rows.length, balance: rows.reduce((total, item) => total + Number(item.currentStock ?? 0), 0), lowCount: rows.filter(item => Number(item.currentStock ?? 0) <= Number(item.reorderLevel ?? 0)).length }; });
}

export function getWarehouseItemCountDetails(warehouses: WarehouseSummaryInput[], counts: WarehouseItemCountInput[]) {
  const countByWarehouseId = new Map<number, number>();
  let unassignedCount = 0;
  counts.forEach(entry => {
    const count = Number(entry.count ?? 0);
    if (!Number.isFinite(count) || count <= 0) return;
    if (entry.warehouseId == null) unassignedCount += count;
    else countByWarehouseId.set(entry.warehouseId, (countByWarehouseId.get(entry.warehouseId) ?? 0) + count);
  });
  const details: WarehouseItemCountDetail[] = warehouses
    .map(warehouse => ({ id: warehouse.id, name: warehouse.name, count: countByWarehouseId.get(warehouse.id) ?? 0 }))
    .filter(warehouse => warehouse.count > 0);
  if (unassignedCount > 0) details.push({ name: "دون مخزن محدد", count: unassignedCount });
  return details;
}

function formatPermitDate(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  const parsed = new Date(`${raw}T00:00:00`);
  return raw && !Number.isNaN(parsed.getTime())
    ? new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", year: "numeric" }).format(parsed)
    : raw;
}

export function getLatestPermitCardDetail(type: "incoming" | "outgoing", permit: LatestPermit) {
  const movementLabel = type === "incoming" ? "الوارد" : "الصرف";
  if (!permit?.eznNum || !permit.date) return `لا يوجد إذن ${movementLabel} مسجل`;
  return `آخر إذن ${movementLabel}: ${permit.eznNum} · ${formatPermitDate(permit.date)}`;
}

export function getDashboardLatestPermitDetails(latestPermits?: { addition?: LatestPermit; disbursement?: LatestPermit }) {
  return {
    incoming: getLatestPermitCardDetail("incoming", latestPermits?.addition),
    outgoing: getLatestPermitCardDetail("outgoing", latestPermits?.disbursement),
  };
}

export function getCurrentBalanceCardDetails(items: CurrentBalanceItem[]) {
  const inStock = items.filter(item => Number(item.currentStock ?? 0) > 0);
  const total = inStock.reduce((sum, item) => sum + Number(item.currentStock ?? 0), 0);
  const units = Array.from(new Set(inStock.map(item => item.unit?.trim() || "وحدة")));
  const unit = units.length === 1 ? units[0] : null;
  const itemsWithBalance: CurrentBalanceCardItem[] = inStock.slice(0, 3).map(item => ({ id: item.id, code: item.code?.trim() || "—", name: item.name?.trim() || "صنف بدون اسم" }));
  return { value: unit ? `${formatNumber(total)} ${unit}` : formatNumber(total), detail: unit ? `${unit} متاحة` : inStock.length ? "رصيد بوحدات متعددة" : "لا رصيد متاح", itemsWithBalance, extraItemsCount: Math.max(0, inStock.length - itemsWithBalance.length) };
}

function StatCard({ label, value, detail, secondaryDetail, itemsWithBalance, warehouseItems, extraItemsCount = 0, onOpenItem, icon: Icon, tone }: { label: string; value: string; detail: string; secondaryDetail?: string; itemsWithBalance?: CurrentBalanceCardItem[]; warehouseItems?: WarehouseItemCountDetail[]; extraItemsCount?: number; onOpenItem?: (item: CurrentBalanceCardItem) => void; icon: typeof Boxes; tone: "teal" | "gold" | "rose" | "blue" }) {
  const tones = {
    teal: "bg-[#e7f3f1] text-[#0d4f62]",
    gold: "bg-[#fff4df] text-[#a96821]",
    rose: "bg-[#fff0ed] text-[#bd5147]",
    blue: "bg-[#eaf1fb] text-[#3c6395]",
  };
  const [saved, setSaved] = useState(false);
  const share = () => { const text = `${label}: ${value}`; if (navigator.share) { void navigator.share({ title: "Smart Inventory", text }).catch(() => undefined); } else { void navigator.clipboard?.writeText(text); } };
  return (
    <Card className="home-scroll-card home-stat-card modern-card border-0 bg-white/85 shadow-[0_10px_30px_rgba(18,44,84,0.055)] backdrop-blur-sm">
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className={`home-stat-icon flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" strokeWidth={2.4} /></div>
          <span className="text-[11px] font-bold text-slate-400">{detail}</span>
        </div>
        <p className="mt-3 text-sm font-bold text-slate-600">{label}</p>
        <p className="mt-0.5 text-2xl font-black tracking-tight text-[#102a43] sm:text-[1.7rem]">{value}</p>
        {secondaryDetail ? <p className="mt-1 truncate text-[10px] font-bold text-[#246d96]" title={secondaryDetail}>{secondaryDetail}</p> : null}
        {warehouseItems?.length ? <div className="mt-2 space-y-1 border-t border-[#dbeaf0] pt-2">{warehouseItems.map(item => <div key={item.id ?? item.name} className="flex items-center justify-between gap-2 px-1 text-[10px]"><span className="min-w-0 truncate font-black text-[#0d7180]">{item.name}</span><span className="shrink-0 font-bold text-slate-500">{formatNumber(item.count)} صنف</span></div>)}</div> : null}
        {itemsWithBalance?.length ? <div className="mt-2 space-y-1 border-t border-[#dbeaf0] pt-2">{itemsWithBalance.map(item => <button key={`${item.id ?? item.code}-${item.name}`} type="button" onClick={() => onOpenItem?.(item)} className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 text-right transition hover:bg-[#edf7f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a9fc9]"><span className="min-w-0 truncate text-[10px] font-black text-[#0d7180]">{item.name}</span><span className="shrink-0 font-mono text-[9px] text-slate-400">{item.code}</span></button>)}{extraItemsCount > 0 ? <p className="px-1 text-[9px] font-bold text-slate-400">و{extraItemsCount} أصناف أخرى</p> : null}</div> : null}
        <div className="home-card-actions mt-2 flex items-center gap-1">
          <button type="button" aria-label={saved ? "إلغاء حفظ البطاقة" : "حفظ البطاقة"} title={saved ? "محفوظ" : "حفظ"} data-tooltip={saved ? "إلغاء الحفظ" : "حفظ البطاقة"} onClick={() => setSaved(value => !value)} className="home-card-action rounded-lg p-1.5 text-[#246d96] transition"><>{saved ? <Check className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}</></button>
          <button type="button" aria-label="مشاركة البطاقة" title="مشاركة" data-tooltip="مشاركة البطاقة" onClick={share} className="home-card-action rounded-lg p-1.5 text-[#246d96] transition"><Share2 className="h-3.5 w-3.5" /></button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-2xl border border-dashed border-[#d7e5eb] bg-[#fbfdff] p-10 text-center text-sm text-slate-400">{label}</div>;
}

type WarehouseLowItem = { id: number; code: string; name: string; unit: string | null; currentStock: string; reorderLevel: string };

function LowStockItems({ items }: { items: WarehouseLowItem[] }) {
  return <><p className="mb-2 text-[10px] font-black text-[#9d3028]">أصناف تحت الحد الأدنى</p><div className="space-y-1.5">{items.slice(0, 5).map(item => <div key={item.id} className="flex items-center justify-between gap-2 border-b border-[#fff0ed] pb-1.5 last:border-0 last:pb-0"><span className="min-w-0"><span className="block truncate text-[11px] font-bold text-[#102a43]">{item.name}</span><span className="font-mono text-[9px] text-slate-400">{item.code}</span></span><span className="shrink-0 text-left"><strong className="block text-[11px] font-black text-[#bd5147]">{formatNumber(item.currentStock)} {item.unit || ""}</strong><span className="block text-[9px] text-slate-400">حد الطلب: {formatNumber(item.reorderLevel)}</span></span></div>)}</div>{items.length > 5 ? <p className="mt-2 text-[10px] font-bold text-slate-400">و{items.length - 5} أصناف أخرى تحتاج متابعة</p> : null}</>;
}

function WarehouseBranchCard({ warehouse, lowItems, onOpen }: { warehouse: { id: number; slot: number; name: string; itemCount: number; balance: number; incoming?: number }; lowItems: WarehouseLowItem[]; onOpen: () => void }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const damaged = warehouse.name.includes("هالك");
  const isEmpty = warehouse.itemCount === 0;
  const needsAttention = !damaged && lowItems.length > 0;
  const statusLabel = damaged ? "مخزن هالك" : needsAttention ? `${lowItems.length} صنف تحت الحد` : isEmpty ? "لا أصناف بعد" : "مستقر";
  const statusTone = damaged ? "text-[#9a4f25] bg-[#fff1e6]" : needsAttention ? "text-[#bd5147] bg-[#fff0ed]" : isEmpty ? "text-slate-500 bg-slate-100" : "text-[#0d806c] bg-[#e7f3f1]";
  const iconTone = needsAttention ? "bg-[#bd5147]" : damaged ? "bg-[#d08a3b]" : isEmpty ? "bg-slate-400" : "bg-[#0d806c]";
  return <div className={`relative rounded-lg border px-2.5 py-2 text-right transition hover:shadow-sm ${damaged ? "border-[#f2d2bf] bg-[#fffaf5] hover:border-[#d08a3b]" : needsAttention ? "border-[#f2c8c2] bg-[#fffafa] hover:border-[#bd5147]" : "border-[#e0ebef] bg-white hover:border-[#0d7180]"}`}>
    <button type="button" onClick={onOpen} className="flex w-full items-start justify-between gap-2 text-right"><span className="min-w-0"><span className={`block truncate text-[11px] font-black ${damaged ? "text-[#9a4f25]" : needsAttention ? "text-[#9d3028]" : "text-[#102a43]"}`}>{warehouse.name}</span><span className="mt-0.5 block text-[9px] text-slate-400">{formatNumber(warehouse.itemCount)} صنف</span></span><span className="text-left"><strong className={`block text-xs font-black ${damaged ? "text-[#9a4f25]" : needsAttention ? "text-[#bd5147]" : "text-[#0d806c]"}`}>الرصيد: {formatNumber(warehouse.balance)}</strong><span className="mt-0.5 block text-[9px] font-bold text-[#a96821]">الوارد: {formatNumber(warehouse.incoming)}</span></span></button>
    <div className="mt-1.5 flex items-center justify-between gap-2"><span className="text-[9px] text-slate-400">{needsAttention ? "مرّر أو المس التفاصيل" : ""}</span>{needsAttention ? <div className="relative"><Tooltip><TooltipTrigger asChild><button type="button" aria-label={`عرض أصناف ${warehouse.name} المنخفضة`} aria-expanded={detailsOpen} onClick={() => setDetailsOpen(value => !value)} className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-black ${statusTone}`}><span className={`h-1.5 w-1.5 rounded-full ${iconTone}`} />{statusLabel}</button></TooltipTrigger><TooltipContent side="top" align="start" className="w-64 rounded-xl border border-[#f2c8c2] bg-white p-3 text-right shadow-xl"><LowStockItems items={lowItems} /></TooltipContent></Tooltip>{detailsOpen ? <div className="mt-2 rounded-xl border border-[#f2c8c2] bg-white p-3 text-right shadow-sm sm:hidden"><LowStockItems items={lowItems} /></div> : null}</div> : <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-black ${statusTone}`}><span className={`h-1.5 w-1.5 rounded-full ${iconTone}`} />{statusLabel}</span>}</div>
  </div>;
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [previewReadOnly, setPreviewReadOnly] = useState<boolean | null>(() => { try { const raw = window.localStorage.getItem("smart-inventory-preview-permissions"); return raw ? Boolean(JSON.parse(raw)?.readOnly) : null; } catch { return null; } });
  useEffect(() => { const syncPreview = () => { try { const raw = window.localStorage.getItem("smart-inventory-preview-permissions"); setPreviewReadOnly(raw ? Boolean(JSON.parse(raw)?.readOnly) : null); } catch { setPreviewReadOnly(null); } }; window.addEventListener("smart-inventory-preview", syncPreview); return () => window.removeEventListener("smart-inventory-preview", syncPreview); }, []);
  const isReadOnly = previewReadOnly ?? ["viewer", "reviewer", "reports"].includes(user?.role ?? "");
  const summary = trpc.dashboard.summary.useQuery(undefined, dashboardQueryOptions);
  const warehouses = trpc.warehouses.list.useQuery(undefined, inventoryQueryOptions);
  const inventory = trpc.items.list.useQuery(undefined, inventoryQueryOptions);
  const warehouseLowStock = trpc.items.warehouseLowStock.useQuery(undefined, inventoryQueryOptions);
  const warehouseBalanceSummary = trpc.items.warehouseBalanceSummaries.useQuery(undefined, inventoryQueryOptions);
  const totalItems = Number(summary.data?.stats.totalItems ?? 0);
  const lowStockCount = Number(summary.data?.stats.lowStockCount ?? 0);
  const healthPercent = totalItems ? Math.max(0, Math.round(((totalItems - lowStockCount) / totalItems) * 100)) : 0;
  const [movementRange, setMovementRange] = useState<7 | 30 | 90>(30);
  const analytics = summary.data?.analytics;
  const movementSeries = useMemo(
    () => (analytics?.series ?? []).slice(-movementRange),
    [analytics?.series, movementRange],
  );
  const statusData = useMemo(
    () => [
      { key: "safe", label: "آمن", value: Number(analytics?.status.safe ?? 0), color: "#0d806c" },
      { key: "watch", label: "مراقبة", value: Number(analytics?.status.watch ?? 0), color: "#d08a3b" },
      { key: "low", label: "منخفض", value: Number(analytics?.status.low ?? 0), color: "#bd5147" },
      { key: "empty", label: "نفد", value: Number(analytics?.status.empty ?? 0), color: "#7f1d1d" },
    ],
    [analytics?.status],
  );
  const hasStatusData = statusData.some(item => item.value > 0);
  const warehouseBalances = warehouseBalanceSummary.data ?? summarizeWarehouseBalances(warehouses.data ?? [], inventory.data ?? []);
  const lowStockByWarehouse = useMemo(() => new Map((warehouseLowStock.data ?? []).map(entry => [entry.warehouseId, entry.lowItems])), [warehouseLowStock.data]);
  const [cardFilter, setCardFilter] = useState<"all" | "attention" | "balance">("all");
  const [cardSort, setCardSort] = useState<"default" | "high" | "low">("default");
  const warehouseItemCounts = useMemo(() => getWarehouseItemCountDetails(warehouses.data ?? [], summary.data?.stats.itemCountsByWarehouse ?? []), [warehouses.data, summary.data?.stats.itemCountsByWarehouse]);
  const cardDefinitions = useMemo(() => [
    { key: "items", label: "إجمالي الأصناف", value: formatNumber(summary.data?.stats.totalItems), numeric: Number(summary.data?.stats.totalItems ?? 0), detail: "صنف مسجل", secondaryDetail: undefined, warehouseItems: warehouseItemCounts, itemsWithBalance: undefined, extraItemsCount: 0, icon: Boxes, tone: "teal" as const },
    { key: "attention", label: "أصناف تحتاج متابعة", value: formatNumber(summary.data?.stats.lowStockCount), numeric: Number(summary.data?.stats.lowStockCount ?? 0), detail: `تحت ${summary.data?.thresholdPercentage ?? 20}%`, secondaryDetail: undefined, itemsWithBalance: undefined, extraItemsCount: 0, icon: AlertTriangle, tone: "rose" as const },
  ], [summary.data, warehouseItemCounts]);
  const visibleCards = useMemo(() => {
    const filtered = cardDefinitions.filter(card => cardFilter === "all" || (cardFilter === "attention" ? card.key === "attention" : card.key === "balance"));
    return cardSort === "default" ? filtered : [...filtered].sort((a, b) => cardSort === "high" ? b.numeric - a.numeric : a.numeric - b.numeric);
  }, [cardDefinitions, cardFilter, cardSort]);

  return (
    <DashboardLayout>
      <div className="home-dashboard mx-auto max-w-[1500px] space-y-5 lg:space-y-6">
        {isReadOnly && <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 shadow-sm"><p className="text-sm font-black">لوحة متابعة للقراءة فقط</p><p className="mt-1 text-xs leading-6">هذا الحساب مخصص لمشاهدة الأرصدة والتقارير والتنبيهات. لا يمكنه إضافة أو تعديل أو حذف بيانات المخزون.</p></section>}
        <section className="home-hero relative overflow-hidden rounded-[1.6rem] bg-[#0d4f62] px-5 py-6 text-white shadow-[0_20px_50px_rgba(13,79,98,0.2)] md:px-7 md:py-7">
          <div className="absolute -left-16 -top-20 h-64 w-64 rounded-full border-[28px] border-white/5" />
          <div className="absolute -bottom-28 right-24 h-72 w-72 rounded-full border-[36px] border-[#d08a3b]/10" />
          <div className="relative z-10 flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <HomeHeroDateTime />
              <p className="mb-2 text-xs font-black uppercase tracking-[0.3em] text-[#f5c27b]">SMART INVENTORY CONTROL ROOM</p>
              <h2 className="text-3xl font-black leading-tight tracking-tight md:text-4xl">المخزون تحت السيطرة،<br /><span className="text-[#f5c27b]">والقرار أسرع.</span></h2>
              <p className="home-intro-text mt-4 max-w-lg text-sm leading-7 text-white/70">تابع حركة الأصناف، راقب حد الطلب، ونفّذ الإضافات والصرف من مساحة عمل واحدة مصممة لفريق التشغيل.</p>
            </div>
            {!isReadOnly && <div className="flex flex-wrap gap-3">
              <Button onClick={() => setLocation("/additions")} className="h-11 rounded-xl bg-white px-4 font-bold text-[#0d4f62] hover:bg-[#f5f7f8]"><Plus className="ml-2 h-4 w-4" />إضافة مخزون</Button>
              <Button onClick={() => setLocation("/disbursements")} variant="outline" className="h-11 rounded-xl border-white/25 bg-white/10 px-4 font-bold text-white hover:bg-white/15 hover:text-white"><ArrowUpFromLine className="ml-2 h-4 w-4" />إنشاء إذن صرف</Button>
            </div>}
          </div>
        </section>

        {summary.isLoading && !summary.data ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="home-skeleton-card h-28 rounded-2xl bg-white" />)}</div>
        ) : summary.error && !summary.data ? (
          <Card className="border-red-100 bg-red-50"><CardContent className="flex items-center gap-3 p-5 text-sm font-bold text-red-700"><AlertTriangle className="h-5 w-5" />تعذر تحميل ملخص المخزون حالياً. اتصل بالإنترنت مرة واحدة لحفظ بيانات لوحة التحكم محلياً.</CardContent></Card>
        ) : (
          <>
            <section className="home-surface rounded-2xl border border-[#dce7ee] bg-white/90 p-4 shadow-[0_10px_28px_rgba(18,44,84,0.05)] backdrop-blur-sm">
              <div className="mb-3 flex items-center gap-2.5 text-right"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8f1f2] text-[#0d4f62]"><Warehouse className="h-4 w-4" /></div><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#d08a3b]">WAREHOUSE BALANCES</p><h3 className="text-sm font-black text-[#102a43]">رصيد ووارد كل مخزن</h3></div></div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{warehouseBalances.map(warehouse => <WarehouseBranchCard key={`summary-${warehouse.id}`} warehouse={warehouse} lowItems={lowStockByWarehouse.get(warehouse.id) ?? []} onOpen={() => setLocation(`/warehouses/${warehouse.slot}`)} />)}</div>
            </section>
            <section className="home-card-toolbar flex flex-col gap-3 rounded-2xl border border-[#b5dce9]/70 bg-white/75 p-3 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-[#246d96]"><ListFilter className="h-4 w-4" /> <span>تخصيص عرض البطاقات</span></div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><span>التصفية</span><select value={cardFilter} onChange={event => setCardFilter(event.target.value as typeof cardFilter)} className="home-card-select rounded-lg border border-[#a9d5e5] bg-white px-3 py-2 text-xs font-bold text-[#193b54] outline-none"><option value="all">كل البطاقات</option><option value="attention">المتابعة</option><option value="balance">الأرصدة</option></select></label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><ArrowDownAZ className="h-4 w-4 text-[#3a9fc9]" /><span>الفرز</span><select value={cardSort} onChange={event => setCardSort(event.target.value as typeof cardSort)} className="home-card-select rounded-lg border border-[#a9d5e5] bg-white px-3 py-2 text-xs font-bold text-[#193b54] outline-none"><option value="default">الافتراضي</option><option value="high">الأعلى أولاً</option><option value="low">الأقل أولاً</option></select></label>
              </div>
            </section>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{visibleCards.map(card => <StatCard key={card.key} label={card.label} value={card.value} detail={card.detail} secondaryDetail={card.secondaryDetail} warehouseItems={card.warehouseItems} itemsWithBalance={card.itemsWithBalance} extraItemsCount={card.extraItemsCount} onOpenItem={item => item.id ? setLocation(`/items?card=${item.id}`) : setLocation("/items")} icon={card.icon} tone={card.tone} />)}</div>

            <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <Card className="home-pulse-card overflow-hidden border-0 bg-[#102a43] text-white shadow-[0_15px_35px_rgba(16,42,67,0.14)]"><CardContent className="p-6"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-start"><div><div className="mb-3 flex items-center gap-2 text-[#f5c27b]"><CircleCheck className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-[0.18em]">OPERATIONAL PULSE</span></div><h3 className="text-2xl font-black">مؤشر استقرار المخزون</h3><p className="mt-2 max-w-xl text-sm leading-6 text-white/65">قياس سريع لنسبة الأصناف التي تعمل داخل الحدود الآمنة مقارنةً بالأصناف التي تحتاج إلى متابعة.</p></div><div className="text-left"><span className="text-4xl font-black text-[#f5c27b]">{healthPercent}%</span><p className="mt-1 text-xs text-white/55">نسبة الاستقرار الحالية</p></div></div><div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-l from-[#f5c27b] to-[#0d806c] transition-all duration-500" style={{ width: `${healthPercent}%` }} /></div><div className="mt-4 flex flex-wrap gap-5 text-xs font-bold text-white/65"><span>آمن: {formatNumber(Math.max(0, totalItems - lowStockCount))} صنف</span><span className="text-[#f5c27b]">يحتاج متابعة: {formatNumber(lowStockCount)} صنف</span><span>حد التنبيه: {summary.data?.thresholdPercentage ?? 20}%</span></div></CardContent></Card>
              <Card className="home-surface modern-card border-0 bg-white/85 shadow-[0_10px_30px_rgba(18,44,84,0.055)] backdrop-blur-sm"><CardContent className="p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#d08a3b]">QUICK OPERATIONS</p><h3 className="mt-2 text-xl font-black text-[#102a43]">بوابة التشغيل السريع</h3><p className="mt-2 text-sm leading-6 text-slate-400">اختصر الطريق إلى أكثر المهام استخداماً في دورة المخزون اليومية.</p></div><RefreshCcw className="h-5 w-5 text-[#b9d4d9]" /></div><div className="mt-5 grid grid-cols-3 gap-2"><button onClick={() => setLocation("/items")} className="home-quick-action rounded-xl bg-[#f7fbfc] p-3 text-right transition-colors hover:bg-[#e8f1f2]"><Package className="mb-4 h-5 w-5 text-[#0d4f62]" /><span className="block text-xs font-black text-[#102a43]">دليل الأصناف</span></button>{!isReadOnly && <button onClick={() => setLocation("/additions")} className="home-quick-action rounded-xl bg-[#f7fbfc] p-3 text-right transition-colors hover:bg-[#e7f3f1]"><ArrowDownToLine className="mb-4 h-5 w-5 text-[#0d806c]" /><span className="block text-xs font-black text-[#102a43]">إضافة وارد</span></button>}<button onClick={() => setLocation("/alerts")} className="home-quick-action rounded-xl bg-[#fffaf9] p-3 text-right transition-colors hover:bg-[#fff0ed]"><AlertTriangle className="mb-4 h-5 w-5 text-[#bd5147]" /><span className="block text-xs font-black text-[#102a43]">مركز التنبيه</span></button></div></CardContent></Card>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
              <Card className="modern-card border-0 bg-white/85 shadow-[0_10px_30px_rgba(18,44,84,0.055)] backdrop-blur-sm">
                <CardContent className="p-6">
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#0d806c]">MOVEMENT PULSE</p>
                      <h3 className="mt-2 text-xl font-black text-[#102a43]">حركة المخزون عبر الزمن</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-400">قارن الوارد والمنصرف والتحويلات لاكتشاف الارتفاعات غير المعتادة بسرعة.</p>
                    </div>
                    <div className="flex rounded-xl bg-[#f5f8f9] p-1" dir="rtl">
                      {[7, 30, 90].map(days => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => setMovementRange(days as 7 | 30 | 90)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-black transition-colors ${movementRange === days ? "bg-[#0d4f62] text-white shadow-sm" : "text-slate-400 hover:text-[#0d4f62]"}`}
                        >
                          {days} يوم
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs font-bold">
                    <div className="rounded-xl bg-[#e7f3f1] px-3 py-2 text-[#0d806c]">الوارد <strong className="mr-1">{formatNumber(analytics?.totals.additions)}</strong></div>
                    <div className="rounded-xl bg-[#fff0ed] px-3 py-2 text-[#bd5147]">المنصرف <strong className="mr-1">{formatNumber(analytics?.totals.disbursements)}</strong></div>
                    <div className="rounded-xl bg-[#fff4df] px-3 py-2 text-[#a96821]">التحويلات <strong className="mr-1">{formatNumber(analytics?.totals.transfers)}</strong></div>
                  </div>
                  {movementSeries.length ? (
                    <ChartContainer config={movementChartConfig} className="mt-4 h-[270px] min-h-[270px] w-full aspect-auto">
                      <LineChart accessibilityLayer data={movementSeries} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="#edf2f5" />
                        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={formatChartDate} minTickGap={28} />
                        <YAxis tickLine={false} axisLine={false} tickMargin={8} tickFormatter={value => formatNumber(value)} width={46} />
                        <ChartTooltip cursor={{ stroke: "#b9d4d9", strokeDasharray: "4 4" }} content={<ChartTooltipContent labelFormatter={value => formatChartDate(String(value))} formatter={(value, name) => [formatNumber(Number(value)), name]} />} />
                        <Line type="monotone" dataKey="additions" stroke="var(--color-additions)" strokeWidth={3} dot={false} activeDot={{ r: 5, fill: "#0d806c" }} />
                        <Line type="monotone" dataKey="disbursements" stroke="var(--color-disbursements)" strokeWidth={3} dot={false} activeDot={{ r: 5, fill: "#bd5147" }} />
                        <Line type="monotone" dataKey="transfers" stroke="var(--color-transfers)" strokeWidth={3} strokeDasharray="5 5" dot={false} activeDot={{ r: 5, fill: "#d08a3b" }} />
                      </LineChart>
                    </ChartContainer>
                  ) : (
                    <EmptyState label="لا توجد بيانات حركة كافية لبناء الرسم البياني حالياً." />
                  )}
                  <div className="mt-3 flex flex-wrap justify-center gap-5 text-xs font-bold text-slate-500">
                    {Object.entries(movementChartConfig).map(([key, item]) => <span key={key} className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>)}
                  </div>
                </CardContent>
              </Card>

              <Card className="modern-card border-0 bg-white/85 shadow-[0_10px_30px_rgba(18,44,84,0.055)] backdrop-blur-sm">
                <CardContent className="p-6">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#bd5147]">STOCK ALERTS</p>
                  <h3 className="mt-2 text-xl font-black text-[#102a43]">حالة الأصناف والتنبيهات</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-400">توزيع مباشر للأصناف حسب مستوى الأمان وحد التنبيه.</p>
                  {hasStatusData ? (
                    <ChartContainer config={{ safe: { label: "آمن", color: "#0d806c" }, watch: { label: "مراقبة", color: "#d08a3b" }, low: { label: "منخفض", color: "#bd5147" }, empty: { label: "نفد", color: "#7f1d1d" } }} className="mx-auto mt-3 h-[235px] min-h-[235px] w-full max-w-[300px] aspect-auto">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(value, name) => [formatNumber(Number(value)), name]} />} />
                        <Pie data={statusData} dataKey="value" nameKey="label" innerRadius={62} outerRadius={92} paddingAngle={3} strokeWidth={0}>
                          {statusData.map(item => <Cell key={item.key} fill={item.color} />)}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                  ) : <EmptyState label="لا توجد أصناف مسجلة لبناء توزيع التنبيهات حالياً." />}
                  <div className="grid grid-cols-2 gap-2">
                    {statusData.map(item => <div key={item.key} className="flex items-center justify-between rounded-xl bg-[#f8fafb] px-3 py-2 text-xs"><span className="inline-flex items-center gap-2 font-bold text-slate-500"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span><strong className="text-[#102a43]">{formatNumber(item.value)}</strong></div>)}
                  </div>
                  <Button variant="ghost" onClick={() => setLocation("/alerts")} className="mt-4 w-full rounded-lg text-xs font-bold text-[#bd5147] hover:bg-[#fff0ed]">فتح مركز التنبيهات<ChevronLeft className="mr-1 h-4 w-4" /></Button>
                </CardContent>
              </Card>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <Card className="modern-card border-0 bg-white/85 shadow-[0_10px_30px_rgba(18,44,84,0.055)] backdrop-blur-sm">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between border-b border-[#edf2f5] px-6 py-5">
                    <div><p className="text-lg font-black text-[#102a43]">الأصناف التي تحتاج متابعة</p><p className="mt-1 text-xs text-slate-400">تنبيه تلقائي حسب نسبة حد الطلب الحالية</p></div>
                    <Button variant="ghost" onClick={() => setLocation("/alerts")} className="rounded-lg text-xs font-bold text-[#0d4f62] hover:bg-[#e8f1f2]">عرض الكل<ChevronLeft className="mr-1 h-4 w-4" /></Button>
                  </div>
                  <div className="p-4 md:p-6">
                    {!summary.data?.lowStock.length ? <EmptyState label="لا توجد أصناف منخفضة المخزون حالياً. الوضع مستقر." /> : (
                      <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-right"><thead><tr className="text-[11px] font-black text-slate-400"><th className="pb-3 pr-2">الصنف</th><th className="pb-3">الكود</th><th className="pb-3">الرصيد الحالي</th><th className="pb-3">حد الطلب</th><th className="pb-3">الحالة</th></tr></thead><tbody className="divide-y divide-[#f0f4f6]">{summary.data.lowStock.slice(0, 7).map(item => <tr key={item.id} className="text-sm"><td className="py-4 pr-2 font-bold text-[#102a43]">{item.name}</td><td className="py-4 font-mono text-xs text-slate-400">{item.code}</td><td className="py-4 font-black text-[#bd5147]">{formatNumber(item.currentStock)}</td><td className="py-4 text-slate-500">{formatNumber(item.reorderLevel)}</td><td className="py-4"><span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff0ed] px-2.5 py-1 text-[11px] font-bold text-[#bd5147]"><span className="h-1.5 w-1.5 rounded-full bg-[#bd5147]" />يحتاج طلب</span></td></tr>)}</tbody></table></div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="modern-card border-0 bg-white/85 shadow-[0_10px_30px_rgba(18,44,84,0.055)] backdrop-blur-sm">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between border-b border-[#edf2f5] px-6 py-5"><div><p className="text-lg font-black text-[#102a43]">آخر الحركات</p><p className="mt-1 text-xs text-slate-400">ملخص سريع للنشاط الأخير</p></div><RefreshCcw className="h-4 w-4 text-slate-300" /></div>
                  <div className="divide-y divide-[#f0f4f6] px-6">{[
                    ...(summary.data?.recentMovements.additions ?? []).map(row => ({ id: `a${row.id}`, title: "إضافة مخزون", subtitle: `${row.itemName} • ${row.eznNum}`, quantity: `+${formatNumber(row.quantity)}`, icon: ArrowDownToLine, tone: "text-[#0d806c] bg-[#e7f3f1]" })),
                    ...(summary.data?.recentMovements.disbursements ?? []).map(row => ({ id: `d${row.id}`, title: "إذن صرف", subtitle: `${row.itemName} • ${row.eznNum}`, quantity: `-${formatNumber(row.quantity)}`, icon: ArrowUpFromLine, tone: "text-[#bd5147] bg-[#fff0ed]" })),
                    ...(summary.data?.recentMovements.transfers ?? []).map(row => ({ id: `t${row.id}`, title: "تحويل / مرتجع", subtitle: `${row.itemName} • ${row.eznNum}`, quantity: formatNumber(row.quantity), icon: ArrowLeftRight, tone: "text-[#a96821] bg-[#fff4df]" })),
                  ].slice(0, 6).map(row => <div key={row.id} className="flex items-center gap-3 py-4"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${row.tone}`}><row.icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[#102a43]">{row.title}</p><p className="mt-1 truncate text-[11px] text-slate-400">{row.subtitle}</p></div><span className={`text-sm font-black ${row.quantity.startsWith("-") ? "text-[#bd5147]" : "text-[#0d806c]"}`}>{row.quantity}</span></div>)}{!summary.data?.recentMovements.additions.length && !summary.data?.recentMovements.disbursements.length && !summary.data?.recentMovements.transfers.length ? <div className="py-12 text-center text-sm text-slate-400">لا توجد حركات مسجلة بعد.</div> : null}</div>
                  <Button variant="ghost" onClick={() => setLocation("/items")} className="mb-4 mr-4 rounded-lg text-xs font-bold text-[#0d4f62] hover:bg-[#e8f1f2]">استعراض المخزون<ChevronLeft className="mr-1 h-4 w-4" /></Button>
                </CardContent>
              </Card>
            </div>

            <section className="grid gap-4 md:grid-cols-3">
              <button onClick={() => setLocation("/items")} className="group rounded-2xl border border-[#e0ebef] bg-white p-5 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#a9c9cf] hover:shadow-lg"><div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f1f2] text-[#0d4f62]"><Package className="h-5 w-5" /></div><p className="font-black text-[#102a43]">دليل الأصناف</p><p className="mt-1 text-xs leading-6 text-slate-400">ابحث وعدّل مستويات إعادة الطلب وتابع الأرصدة.</p></button>
              <button onClick={() => setLocation("/transfers")} className="group rounded-2xl border border-[#e0ebef] bg-white p-5 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#f1d1a7] hover:shadow-lg"><div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff4df] text-[#a96821]"><ArrowLeftRight className="h-5 w-5" /></div><p className="font-black text-[#102a43]">التحويلات والمرتجعات</p><p className="mt-1 text-xs leading-6 text-slate-400">سجّل حركة الصنف بين المخازن أو أضف المرتجعات.</p></button>
              <button onClick={() => setLocation("/settings")} className="group rounded-2xl border border-[#e0ebef] bg-white p-5 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#b4d5d2] hover:shadow-lg"><div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-[#e7f3f1] text-[#0d806c]"><CircleCheck className="h-5 w-5" /></div><p className="font-black text-[#102a43]">إعدادات التنبيه</p><p className="mt-1 text-xs leading-6 text-slate-400">اضبط النسبة التي تحدد متى يظهر الصنف في قائمة التنبيه.</p></button>
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
