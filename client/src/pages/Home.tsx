import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { dashboardQueryOptions, inventoryQueryOptions } from "@/lib/queryOptions";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Boxes,
  Calculator,
  CalendarDays,
  CalendarCheck,
  Clock3,
  Delete,
  ChevronLeft,
  ChevronDown,
  Plus,
  RefreshCcw,
  RotateCcw,
  Warehouse,
} from "lucide-react";
import { useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
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

export function calculateQuickExpression(rawExpression: string): number | null {
  const expression = rawExpression.replaceAll("×", "*").replaceAll("÷", "/").replaceAll(" ", "");
  if (!/^\d+(?:\.\d+)?(?:[+\-*/]\d+(?:\.\d+)?)*$/.test(expression)) return null;
  const values = expression.split(/[+\-*/]/).map(Number);
  const operators = expression.match(/[+\-*/]/g) ?? [];
  let total = 0;
  let current = values[0];
  for (let index = 0; index < operators.length; index += 1) {
    const next = values[index + 1];
    if (operators[index] === "*") current *= next;
    else if (operators[index] === "/") {
      if (next === 0) return null;
      current /= next;
    } else if (operators[index] === "+") {
      total += current;
      current = next;
    } else {
      total += current;
      current = -next;
    }
  }
  const result = total + current;
  return Number.isFinite(result) ? Number(result.toFixed(8)) : null;
}

function formatAbsenceDate(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  const parsed = new Date(raw + "T00:00:00");
  return raw && !Number.isNaN(parsed.getTime()) ? new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric" }).format(parsed) : raw;
}
function getAbsenceEndDate(startDate: string, days: number) {
  const end = new Date(startDate + "T00:00:00");
  if (Number.isNaN(end.getTime()) || !Number.isFinite(days) || days < 1) return "";
  end.setDate(end.getDate() + days - 1);
  return end.toISOString().slice(0, 10);
}
function HomeHeroDateTime() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  return <div className="home-hero-datetime mb-4 space-y-1.5"><div className="home-hero-date flex items-center gap-2"><CalendarDays className="h-4 w-4" style={{ color: "#ffffff" }} /><span className="text-xs font-bold" style={{ color: "#ffffff" }}>{new Intl.DateTimeFormat("en-US", { dateStyle: "full" }).format(now)}</span></div><div className="home-hero-time mr-6 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-black" aria-live="polite" aria-label="الوقت الحالي"><Clock3 className="h-3.5 w-3.5" /><span className="font-mono" dir="ltr">{formatHomeBannerTime(now)}</span></div></div>;
}

function QuickCalculator() {
  const [open, setOpen] = useState(false);
  const [expression, setExpression] = useState("0");
  const isOperator = (value: string) => ["+", "-", "×", "÷"].includes(value);
  const appendNumber = (value: string) => setExpression(current => {
    if (current === "خطأ") return value === "." ? "0." : value;
    const lastTerm = current.split(/[+\-×÷]/).at(-1) ?? "";
    if (value === "." && lastTerm.includes(".")) return current;
    if (current === "0") return value === "." ? "0." : value;
    if (lastTerm === "0" && value !== ".") return `${current.slice(0, -1)}${value}`;
    return `${current}${value}`;
  });
  const appendOperator = (operator: string) => setExpression(current => {
    if (current === "خطأ") return "0";
    if (isOperator(current.at(-1) ?? "")) return `${current.slice(0, -1)}${operator}`;
    return `${current}${operator}`;
  });
  const calculate = () => setExpression(current => {
    const result = calculateQuickExpression(current);
    return result === null ? "خطأ" : String(result);
  });
  const clear = () => setExpression("0");
  const erase = () => setExpression(current => current === "خطأ" || current.length <= 1 ? "0" : current.slice(0, -1));
  const display = expression.replaceAll("*", "×").replaceAll("/", "÷");
  const keys = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "-", ".", "0", "=", "+"];

  return <Dialog open={open} onOpenChange={setOpen}>
    <Button type="button" variant="outline" size="icon" onClick={() => setOpen(true)} className="home-calculator-trigger h-10 w-10 rounded-xl border-white/35 bg-white/10 text-white hover:bg-white/18 hover:text-white" aria-label="فتح الآلة الحاسبة" title="آلة حاسبة"><Calculator className="h-4.5 w-4.5" /></Button>
    <DialogContent className="home-calculator-dialog w-[calc(100vw-2rem)] max-w-sm rounded-2xl border-[#b9d4d9] bg-white p-5 shadow-2xl" dir="rtl">
      <DialogHeader><DialogTitle className="flex items-center gap-2 text-lg font-black text-[#102a43]"><Calculator className="h-5 w-5 text-[#0d806c]" />آلة حاسبة سريعة</DialogTitle><DialogDescription>للحسابات السريعة أثناء تسجيل الحركات.</DialogDescription></DialogHeader>
      <output aria-live="polite" className="home-calculator-display mt-4 block min-h-16 break-all rounded-xl border border-[#dce7ee] bg-[#f6fafb] px-4 py-4 text-left font-mono text-2xl font-black tracking-wide text-[#102a43]" dir="ltr">{display}</output>
      <div className="mt-3 grid grid-cols-4 gap-2">
        <button type="button" onClick={clear} className="home-calculator-key home-calculator-key--clear" aria-label="مسح العملية">C</button>
        <button type="button" onClick={erase} className="home-calculator-key" aria-label="حذف الرقم الأخير"><Delete className="h-4 w-4" /></button>
        <button type="button" onClick={() => appendOperator("÷")} className="home-calculator-key home-calculator-key--operator" aria-label="قسمة">÷</button>
        <button type="button" onClick={() => appendOperator("×")} className="home-calculator-key home-calculator-key--operator" aria-label="ضرب">×</button>
        {keys.filter(key => !["÷", "×"].includes(key)).map(key => <button key={key} type="button" onClick={() => key === "=" ? calculate() : isOperator(key) ? appendOperator(key) : appendNumber(key)} className={`home-calculator-key ${isOperator(key) ? "home-calculator-key--operator" : ""} ${key === "=" ? "home-calculator-key--equal" : ""}`}>{key}</button>)}
      </div>
      <Button type="button" variant="ghost" onClick={() => { clear(); setOpen(false); }} className="mt-3 w-full rounded-xl text-xs font-bold text-slate-500 hover:bg-[#eef7f7] hover:text-[#0d4f62]"><RotateCcw className="ml-1.5 h-3.5 w-3.5" />مسح وإغلاق</Button>
    </DialogContent>
  </Dialog>;
}

const movementChartConfig = {
  additions: { label: "الوارد", color: "#0d806c" },
  disbursements: { label: "المنصرف", color: "#bd5147" },
  transfers: { label: "التحويلات", color: "#d08a3b" },
};

type WarehouseSummaryInput = { id: number; slot: number; name: string };
type InventoryBalanceInput = { warehouseId?: number | null; currentStock?: unknown; reorderLevel?: unknown };
type CurrentBalanceItem = { id?: number; warehouseId?: number | null; code?: string | null; name?: string | null; unit?: string | null; currentStock?: unknown };
type CurrentBalanceCardItem = { id?: number; code: string; name: string };
type WarehouseItemCountInput = { warehouseId?: number | null; count?: number | string | null };
type WarehouseItemCountDetail = { id?: number; name: string; count: number };
type LatestPermit = { eznNum?: string | null; date?: string | null } | null | undefined;
export type MovementSeriesPoint = { additions?: number | string | null; disbursements?: number | string | null; transfers?: number | string | null };

export function getMovementSeriesTotals(series: MovementSeriesPoint[]): { additions: number; disbursements: number; transfers: number } {
  return series.reduce<{ additions: number; disbursements: number; transfers: number }>(
    (totals, point) => ({
      additions: totals.additions + Number(point.additions ?? 0),
      disbursements: totals.disbursements + Number(point.disbursements ?? 0),
      transfers: totals.transfers + Number(point.transfers ?? 0),
    }),
    { additions: 0, disbursements: 0, transfers: 0 },
  );
}

export function summarizeWarehouseBalances(warehouses: WarehouseSummaryInput[], inventory: InventoryBalanceInput[]) {
  return warehouses.map(warehouse => { const rows = inventory.filter(item => item.warehouseId === warehouse.id); return { ...warehouse, itemCount: rows.length, balance: rows.reduce((total, item) => total + Number(item.currentStock ?? 0), 0), lowCount: rows.filter(item => Number(item.currentStock ?? 0) <= Number(item.reorderLevel ?? 0)).length }; });
}

function isLaterItemCode(candidate: CurrentBalanceItem, current: CurrentBalanceItem) {
  const candidateCode = candidate.code?.trim() ?? "";
  const currentCode = current.code?.trim() ?? "";
  const candidateNumber = Number(candidateCode.replace(/\D/g, ""));
  const currentNumber = Number(currentCode.replace(/\D/g, ""));
  if (Number.isFinite(candidateNumber) && Number.isFinite(currentNumber) && candidateNumber !== currentNumber) return candidateNumber > currentNumber;
  return candidateCode.localeCompare(currentCode, "en", { numeric: true }) > 0;
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

function StatCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Boxes; tone: "teal" | "gold" | "rose" | "blue" }) {
  const tones = {
    teal: "bg-[#e7f3f1] text-[#0d4f62]",
    gold: "bg-[#fff4df] text-[#a96821]",
    rose: "bg-[#fff0ed] text-[#bd5147]",
    blue: "bg-[#eaf1fb] text-[#3c6395]",
  };
  return (
    <Card className="home-stat-card home-surface h-full border border-[#dce7ee] bg-white shadow-[0_8px_22px_rgba(18,44,84,0.045)]">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className={`home-stat-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-4.5 w-4.5" strokeWidth={2.4} /></div>
          <span className="text-right text-[10px] font-bold text-slate-400 sm:text-[11px]">{detail}</span>
        </div>
        <p className="mt-2.5 text-[11px] font-bold leading-5 text-slate-600 sm:mt-3 sm:text-sm">{label}</p>
        <p className="mt-0.5 text-xl font-black tracking-tight text-[#102a43] sm:text-[1.7rem]">{value}</p>
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
  const absences = trpc.governance.absenceList.useQuery(undefined, { enabled: Boolean(user), refetchInterval: 5000, refetchOnWindowFocus: true });
  const [absenceDetailsOpen, setAbsenceDetailsOpen] = useState(false);
  const absenceDays = (absences.data ?? []).reduce((total, row) => total + Number(row.days ?? 0), 0);
  const warehouses = trpc.warehouses.list.useQuery(undefined, inventoryQueryOptions);
  const inventory = trpc.items.list.useQuery(undefined, inventoryQueryOptions);
  const warehouseLowStock = trpc.items.warehouseLowStock.useQuery(undefined, inventoryQueryOptions);
  const warehouseBalanceSummary = trpc.items.warehouseBalanceSummaries.useQuery(undefined, inventoryQueryOptions);
  const totalItems = Number(summary.data?.stats.totalItems ?? 0);
  const lowStockCount = Number(summary.data?.stats.lowStockCount ?? 0);
  const healthPercent = totalItems ? Math.max(0, Math.round(((totalItems - lowStockCount) / totalItems) * 100)) : 0;
  const [movementRange, setMovementRange] = useState<7 | 30 | 90>(30);
  const [timelineWarehouseId, setTimelineWarehouseId] = useState<number | "all">("all");
  const [warehouseCardsExpanded, setWarehouseCardsExpanded] = useState(false);
  const analytics = summary.data?.analytics;
  const timelineAnalyticsInput = useMemo(() => ({ warehouseId: timelineWarehouseId === "all" ? null : timelineWarehouseId }), [timelineWarehouseId]);
  const timelineAnalytics = trpc.dashboard.movementAnalytics.useQuery(timelineAnalyticsInput, dashboardQueryOptions);
  const selectedTimelineWarehouse = timelineWarehouseId === "all" ? null : warehouses.data?.find(warehouse => warehouse.id === timelineWarehouseId) ?? null;
  const timelineLabel = selectedTimelineWarehouse?.name ?? "كل المخازن";
  const movementSeries = useMemo(
    () => (timelineAnalytics.data?.series ?? analytics?.series ?? []).slice(-movementRange),
    [analytics?.series, movementRange, timelineAnalytics.data?.series],
  );
  const movementTotals = useMemo(() => getMovementSeriesTotals(movementSeries), [movementSeries]);
  const warehouseBalances = warehouseBalanceSummary.data ?? summarizeWarehouseBalances(warehouses.data ?? [], inventory.data ?? []);
  const latestItemsByWarehouse = useMemo(() => {
    const latest = new Map<number, CurrentBalanceItem>();
    for (const item of inventory.data ?? []) {
      if (item.warehouseId == null) continue;
      const current = latest.get(item.warehouseId);
      if (!current || isLaterItemCode(item, current)) latest.set(item.warehouseId, item);
    }
    return warehouseBalances
      .map(warehouse => ({ warehouse, item: latest.get(warehouse.id) }))
      .filter((entry): entry is { warehouse: (typeof warehouseBalances)[number]; item: CurrentBalanceItem } => Boolean(entry.item));
  }, [inventory.data, warehouseBalances]);
  const lowStockByWarehouse = useMemo(() => new Map((warehouseLowStock.data ?? []).map(entry => [entry.warehouseId, entry.lowItems])), [warehouseLowStock.data]);
  const cardDefinitions = useMemo(() => [
    { key: "items", label: "إجمالي الأصناف", value: formatNumber(summary.data?.stats.totalItems), detail: "صنف مسجل", icon: Boxes, tone: "teal" as const },
    { key: "attention", label: "أصناف تحتاج متابعة", value: formatNumber(summary.data?.stats.lowStockCount), detail: `تحت ${summary.data?.thresholdPercentage ?? 20}%`, icon: AlertTriangle, tone: "rose" as const },
    { key: "health", label: "استقرار المخزون", value: `${healthPercent}%`, detail: lowStockCount ? "يتطلب متابعة" : "مستقر", icon: Warehouse, tone: "blue" as const },
  ], [summary.data]);

  return (
    <DashboardLayout>
      <div className="home-dashboard mx-auto max-w-[1500px] space-y-5 lg:space-y-6">
        {isReadOnly && <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 shadow-sm"><p className="text-sm font-black">لوحة متابعة للقراءة فقط</p><p className="mt-1 text-xs leading-6">هذا الحساب مخصص لمشاهدة الأرصدة والتقارير والتنبيهات. لا يمكنه إضافة أو تعديل أو حذف بيانات المخزون.</p></section>}
        <section className="home-hero relative overflow-hidden rounded-[1.6rem] bg-[#0d4f62] px-5 py-6 text-white shadow-[0_20px_50px_rgba(13,79,98,0.2)] md:px-7 md:py-7">
          <div className="absolute -left-16 -top-20 h-64 w-64 rounded-full border-[28px] border-white/5" />
          <div className="absolute -bottom-28 right-24 h-72 w-72 rounded-full border-[36px] border-[#d08a3b]/10" />
          <div className="relative z-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <HomeHeroDateTime />
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#f5c27b]">SMART INVENTORY</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight md:text-3xl">لوحة تشغيل المخزون</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">ملخص اليوم، حركة المخازن، والتنبيهات المهمة في مكان واحد.</p>
            </div>
            <div className="flex flex-col items-start gap-3 md:items-end">
              <button type="button" onClick={() => setAbsenceDetailsOpen(true)} className="w-full max-w-sm rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-right shadow-inner backdrop-blur-sm transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-[#f5c27b]/70" dir="rtl" aria-label="فتح تفاصيل أيام الغياب"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f5c27b]/20 text-[#f5c27b]"><CalendarCheck className="h-4 w-4" /></span><p className="text-xs font-black text-white">ملخص الغياب</p><span className="mr-auto rounded-full bg-[#f5c27b] px-3 py-1 text-sm font-black text-[#102a43]">{absenceDays} {absenceDays === 1 ? "يوم" : "أيام"}</span></div><p className="mt-2 text-[11px] text-white/60">اضغط لعرض تفاصيل التواريخ المسجلة</p></button>
              <Dialog open={absenceDetailsOpen} onOpenChange={setAbsenceDetailsOpen}><DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto" dir="rtl"><DialogHeader><DialogTitle className="text-xl font-black text-[#102a43]">تفاصيل أيام الغياب</DialogTitle><DialogDescription>الفترات المسجلة لحسابك وإجماليها {absenceDays} يوم.</DialogDescription></DialogHeader><div className="space-y-3">{(absences.data ?? []).length ? [...(absences.data ?? [])].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate))).map(row => <div key={row.id} className="rounded-2xl border border-[#dcebee] bg-[#f7fbfc] p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-black text-[#102a43]">{formatAbsenceDate(row.startDate)}</span><span className="rounded-full bg-[#e8f7f6] px-3 py-1 text-xs font-black text-[#0d7180]">{row.days} {row.days === 1 ? "يوم" : "أيام"}</span></div><p className="mt-2 text-xs text-slate-500">حتى {formatAbsenceDate(getAbsenceEndDate(row.startDate, Number(row.days)))}</p></div>) : <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">لا توجد فترات غياب مسجلة حتى الآن.</div>}</div></DialogContent></Dialog>
              {!isReadOnly && <div className="flex flex-wrap gap-2">
                <Button onClick={() => setLocation("/additions")} className="h-10 rounded-xl bg-white px-3.5 text-sm font-bold text-[#0d4f62] hover:bg-[#f5f7f8]"><Plus className="ml-1.5 h-4 w-4" />إضافة وارد</Button>
                <Button onClick={() => setLocation("/disbursements")} variant="outline" className="h-10 rounded-xl border-white/25 bg-white/10 px-3.5 text-sm font-bold text-white hover:bg-white/15 hover:text-white"><ArrowUpFromLine className="ml-1.5 h-4 w-4" />إذن صرف</Button>
                <Button onClick={() => setLocation("/items?create=1")} variant="outline" className="h-10 rounded-xl border-[#f5c27b]/55 bg-[#f5c27b]/15 px-3.5 text-sm font-bold text-white hover:bg-[#f5c27b]/25 hover:text-white"><Boxes className="ml-1.5 h-4 w-4" />إضافة صنف جديد</Button>
                <QuickCalculator />
              </div>}
            </div>
          </div>
        </section>

        <section className="home-latest-ticker home-surface overflow-hidden rounded-2xl border border-[#dce7ee] bg-white shadow-[0_8px_22px_rgba(18,44,84,0.045)]" dir="rtl" aria-label="آخر صنف في كل مخزن">
          <div className="flex items-center gap-3 border-b border-[#edf2f5] px-4 py-3 sm:px-5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e7f3f1] text-[#0d7180]"><Clock3 className="h-4 w-4" /></span>
            <div className="min-w-0"><h3 className="text-sm font-black text-[#102a43]">آخر صنف في كل مخزن</h3><p className="mt-0.5 text-[11px] text-slate-400">يتحدث تلقائياً مع إضافة أو تعديل الأصناف</p></div>
          </div>
          {latestItemsByWarehouse.length ? <div className="home-latest-ticker__viewport"><div className="home-latest-ticker__track">
            {[...latestItemsByWarehouse, ...latestItemsByWarehouse].map(({ warehouse, item }, index) => <button key={`${warehouse.id}-${item.id ?? index}-${index}`} type="button" onClick={() => setLocation(`/warehouses/${warehouse.slot}`)} className="home-latest-ticker__item text-right" aria-label={`فتح ${warehouse.name}، آخر صنف ${item.name ?? "بدون اسم"}`}>
              <span className="home-latest-ticker__warehouse"><Warehouse className="h-3.5 w-3.5" />{warehouse.name}</span>
              <span className="home-latest-ticker__code">{item.code ?? "—"}</span>
              <span className="home-latest-ticker__name">{item.name ?? "صنف بدون اسم"}</span>
              <span className="home-latest-ticker__stock">الرصيد {formatNumber(item.currentStock)}</span>
            </button>)}
          </div></div> : <div className="px-5 py-5 text-center text-sm text-slate-400">لا توجد أصناف مرتبطة بالمخازن حتى الآن.</div>}
        </section>
        {summary.isLoading && !summary.data ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="home-skeleton-card h-28 rounded-2xl bg-white" />)}</div>
        ) : summary.error && !summary.data ? (
          <Card className="border-red-100 bg-red-50"><CardContent className="flex items-center gap-3 p-5 text-sm font-bold text-red-700"><AlertTriangle className="h-5 w-5" />تعذر تحميل ملخص المخزون حالياً. اتصل بالإنترنت مرة واحدة لحفظ بيانات لوحة التحكم محلياً.</CardContent></Card>
        ) : (
          <>
            <section className="grid grid-cols-3 gap-2.5 sm:gap-3">
              {cardDefinitions.map(({ key, ...card }) => <StatCard key={key} {...card} />)}
            </section>

            <section className="home-surface overflow-hidden rounded-2xl border border-[#dce7ee] bg-white shadow-[0_10px_30px_rgba(18,44,84,0.055)]">
              <div className="p-4 sm:p-5">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div>
                      <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#e7f3f1] text-[#0d806c]"><ArrowLeftRight className="h-4 w-4" /></span><h3 className="text-base font-black text-[#102a43] sm:text-lg">حركة المخزون عبر الزمن</h3></div>
                      <p className="mt-1.5 text-xs leading-5 text-slate-400 sm:text-sm">يعرض حركة {timelineLabel} فقط عند الاختيار.</p>
                    </div>
                  <div className="flex flex-col items-stretch gap-2 sm:items-end">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600"><Warehouse className="h-4 w-4 text-[#0d806c]" /><span>المخزن</span><select value={timelineWarehouseId} onChange={event => setTimelineWarehouseId(event.target.value === "all" ? "all" : Number(event.target.value))} className="home-timeline-select h-9 rounded-lg border border-[#b9d4d9] bg-white px-2 text-xs font-black text-[#102a43] outline-none"><option value="all">كل المخازن</option>{warehouses.data?.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
                    <div className="home-timeline-range flex rounded-xl bg-[#f5f8f9] p-1" dir="rtl">
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
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="home-timeline-metric home-timeline-metric--incoming"><span>إجمالي الوارد</span><strong>{formatNumber(movementTotals.additions)}</strong></div>
                  <div className="home-timeline-metric home-timeline-metric--outgoing"><span>إجمالي المنصرف</span><strong>{formatNumber(movementTotals.disbursements)}</strong></div>
                  <div className="home-timeline-metric home-timeline-metric--transfer"><span>التحويلات</span><strong>{formatNumber(movementTotals.transfers)}</strong></div>
                </div>
                {timelineAnalytics.isLoading && timelineWarehouseId !== "all" ? <div className="mt-4 flex h-[240px] items-center justify-center text-sm font-bold text-slate-400">جارٍ تحميل حركة {timelineLabel}...</div> : movementSeries.length ? (
                  <ChartContainer config={movementChartConfig} className="mt-4 h-[240px] min-h-[240px] w-full aspect-auto sm:h-[280px] sm:min-h-[280px]">
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
                ) : <EmptyState label="لا توجد بيانات حركة كافية لبناء الرسم البياني حالياً." />}
                <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[11px] font-bold text-slate-500 sm:text-xs">
                  {Object.entries(movementChartConfig).map(([key, item]) => <span key={key} className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>)}
                </div>
              </div>
            </section>

            <section className="home-surface rounded-2xl border border-[#dce7ee] bg-white p-4 shadow-[0_8px_22px_rgba(18,44,84,0.045)]">
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2.5"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8f1f2] text-[#0d4f62]"><Warehouse className="h-4 w-4" /></div><div><h3 className="text-sm font-black text-[#102a43]">المخازن والفروع</h3><p className="mt-0.5 text-[11px] font-semibold text-slate-400">{warehouseBalances.length} مخزن · افتح التفاصيل عند الحاجة</p></div></div><Button type="button" variant="outline" size="sm" onClick={() => setWarehouseCardsExpanded(value => !value)} aria-expanded={warehouseCardsExpanded} className="rounded-xl border-[#b9d4d9] text-xs font-black text-[#0d4f62]"><ChevronDown className={`ml-1 h-4 w-4 transition-transform ${warehouseCardsExpanded ? "rotate-180" : ""}`} />{warehouseCardsExpanded ? "إخفاء" : "عرض الفروع"}</Button></div>
              {warehouseCardsExpanded ? <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{warehouseBalances.map(warehouse => <WarehouseBranchCard key={`summary-${warehouse.id}`} warehouse={warehouse} lowItems={lowStockByWarehouse.get(warehouse.id) ?? []} onOpen={() => setLocation(`/warehouses/${warehouse.slot}`)} />)}</div> : null}
            </section>

            <details className="home-surface group rounded-2xl border border-[#dce7ee] bg-white shadow-[0_8px_22px_rgba(18,44,84,0.045)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 marker:content-none"><div><h3 className="text-sm font-black text-[#102a43]">تفاصيل المتابعة</h3><p className="mt-0.5 text-[11px] text-slate-400">الأصناف المنخفضة وآخر الحركات</p></div><ChevronDown className="h-4 w-4 text-[#0d4f62] transition-transform group-open:rotate-180" /></summary>
              <div className="grid gap-5 border-t border-[#edf2f5] p-4 xl:grid-cols-[1.15fr_0.85fr]">
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
            </details>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
