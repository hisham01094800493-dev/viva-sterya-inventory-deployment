import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Boxes,
  CalendarDays,
  ChartColumn,
  CircleDollarSign,
  Download,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  TrendingDown,
  WalletCards,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const today = () => new Date().toISOString().slice(0, 10);
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
const moneyFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const quantity = (value: unknown) => numberFormat.format(Number(value ?? 0));
const money = (value: unknown) => `${moneyFormat.format(Number(value ?? 0))} ج.م`;
const chartColors = ["#0d7180", "#0d806c", "#4f73b8", "#d08a3b", "#a66a93", "#5e8991"];

type ChartMetric = "cost" | "quantity";
type ChartRow = {
  name: string;
  shortName: string;
  quantity: number;
  cost: number;
  budget?: number;
  category?: string;
  unit?: string;
  itemCode?: string;
  baselineDaily?: number;
  baselineWeekly?: number;
  anomaly?: boolean;
  anomalyRatio?: number | null;
};

function downloadCsv(rows: Array<Record<string, unknown>>, from: string, to: string) {
  const headers = ["المبنى", "الكود", "عدد الحركات", "الكمية المصروفة", "تكلفة الاستهلاك", "الميزانية", "المتبقي", "نسبة استخدام الميزانية"];
  const lines = [headers, ...rows.map(row => [row.name, row.code, row.movements, row.quantity, row.cost, row.budget, row.remainingBudget, row.budgetUsagePercent == null ? "—" : `${Number(row.budgetUsagePercent).toFixed(1)}%`])]
    .map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","));
  const blob = new Blob(["\uFEFF", lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `building-cost-comparison-${from || "all"}-${to || "today"}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function BuildingCostComparisonPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(today());
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"overview" | "items" | "buildings">("overview");
  const [buildingMetric, setBuildingMetric] = useState<ChartMetric>("cost");
  const [itemMetric, setItemMetric] = useState<ChartMetric>("quantity");
  const [editingBuildingId, setEditingBuildingId] = useState<number | null>(null);
  const [buildingForm, setBuildingForm] = useState({ name: "", code: "", type: "owned_building" as "owned_building" | "subcontractor", budget: "0" });

  const buildingsQuery = trpc.buildings.list.useQuery();
  const createBuilding = trpc.buildings.create.useMutation({ onSuccess: () => { toast.success("تمت إضافة المبنى"); void buildingsQuery.refetch(); void report.refetch(); resetBuildingForm(); }, onError: error => toast.error(error.message || "تعذر إضافة المبنى") });
  const updateBuilding = trpc.buildings.update.useMutation({ onSuccess: () => { toast.success("تم تعديل بيانات المبنى"); void buildingsQuery.refetch(); void report.refetch(); resetBuildingForm(); }, onError: error => toast.error(error.message || "تعذر تعديل المبنى") });
  const report = trpc.reports.buildingCostComparison.useQuery({ fromDate: fromDate || undefined, toDate: toDate || undefined });
  const rows = report.data?.rows ?? [];
  const itemRows = report.data?.itemRows ?? [];
  const totals = report.data?.totals ?? { movements: 0, quantity: 0, cost: 0, budget: 0, remainingBudget: 0 };
  const highestCost = useMemo(() => Math.max(1, ...rows.map(row => Number(row.cost))), [rows]);
  const overBudgetCount = rows.filter(row => !row.isUnassigned && row.budget > 0 && row.cost > row.budget).length;
  const chartRows = useMemo<ChartRow[]>(() => rows.filter(row => !row.isUnassigned && row.movements > 0).slice(0, 20).map(row => ({
    name: row.name,
    shortName: row.name.length > 19 ? `${row.name.slice(0, 19)}…` : row.name,
    quantity: Number(row.quantity),
    cost: Number(row.cost),
    budget: Number(row.budget),
  })), [rows]);
  const buildingOptions = rows.filter(row => !row.isUnassigned && row.movements > 0);
  useEffect(() => {
    if (!selectedBuildingId || !buildingOptions.some(row => String(row.buildingId) === selectedBuildingId)) setSelectedBuildingId(buildingOptions[0] ? String(buildingOptions[0].buildingId) : "");
  }, [buildingOptions, selectedBuildingId]);
  const selectedBuilding = buildingOptions.find(row => String(row.buildingId) === selectedBuildingId) ?? null;
  const selectedItemRows = useMemo<ChartRow[]>(() => itemRows.filter(row => String(row.buildingId) === selectedBuildingId).map(row => ({
    name: row.itemName,
    shortName: `${row.itemName.slice(0, 14)}${row.itemName.length > 14 ? "…" : ""} · ${row.unit || "؟"}`,
    quantity: Number(row.quantity),
    cost: Number(row.cost),
    category: row.category || "غير مصنف",
    unit: row.unit || "غير محدد",
    itemCode: row.itemCode,
    baselineDaily: Number(row.baselineDaily ?? 0),
    baselineWeekly: Number(row.baselineWeekly ?? 0),
    anomaly: Boolean(row.anomaly),
    anomalyRatio: row.anomalyRatio == null ? null : Number(row.anomalyRatio),
  })), [itemRows, selectedBuildingId]);
  const selectedItemChartRows = useMemo(() => selectedItemRows.slice().sort((left, right) => right[itemMetric] - left[itemMetric]).slice(0, 20), [selectedItemRows, itemMetric]);
  const selectedItemGroups = useMemo(() => {
    const grouped = new Map<string, ChartRow[]>();
    selectedItemRows.forEach(row => {
      const category = row.category || "غير مصنف";
      grouped.set(category, [...(grouped.get(category) ?? []), row]);
    });
    return Array.from(grouped.entries()).map(([category, categoryRows]) => {
      const items = categoryRows.slice().sort((left, right) => right[itemMetric] - left[itemMetric] || left.name.localeCompare(right.name, "ar"));
      return {
        category,
        items,
        cost: items.reduce((sum, row) => sum + row.cost, 0),
      };
    }).sort((left, right) => right.cost - left.cost || left.category.localeCompare(right.category, "ar"));
  }, [selectedItemRows, itemMetric]);
  const selectedItemTotals = useMemo(() => selectedItemRows.reduce((result, row) => ({
    cost: result.cost + row.cost,
    count: result.count + 1,
  }), { cost: 0, count: 0 }), [selectedItemRows]);
  const selectedItemUnitTotals = useMemo(() => {
    const totalsByUnit = new Map<string, number>();
    selectedItemRows.forEach(row => {
      const unit = row.unit || "غير محدد";
      totalsByUnit.set(unit, (totalsByUnit.get(unit) ?? 0) + row.quantity);
    });
    return Array.from(totalsByUnit, ([unit, total]) => ({ unit, total })).sort((left, right) => left.unit.localeCompare(right.unit, "ar"));
  }, [selectedItemRows]);

  function resetBuildingForm() {
    setEditingBuildingId(null);
    setBuildingForm({ name: "", code: "", type: "owned_building", budget: "0" });
  }

  function submitBuildingForm() {
    const payload = { name: buildingForm.name, code: buildingForm.code, type: buildingForm.type, budget: Number(buildingForm.budget || 0) };
    if (editingBuildingId) updateBuilding.mutate({ id: editingBuildingId, ...payload }); else createBuilding.mutate(payload);
  }

  function editBuilding(building: { id: number; name: string; code: string; type: "owned_building" | "subcontractor"; budget: unknown }) {
    setEditingBuildingId(building.id);
    setBuildingForm({ name: building.name, code: building.code, type: building.type, budget: String(Number(building.budget ?? 0)) });
  }

  const tabs = [
    { id: "overview" as const, label: "النظرة العامة", shortLabel: "نظرة عامة", hint: "التكلفة والميزانيات", icon: ChartColumn },
    { id: "items" as const, label: "استهلاك الأصناف", shortLabel: "الأصناف", hint: "المواد المستخدمة", icon: Boxes },
    { id: "buildings" as const, label: "إدارة المباني", shortLabel: "المباني", hint: "الأسماء والميزانيات", icon: Building2 },
  ];

  return <DashboardLayout>
    <div className="mx-auto w-full max-w-[1500px] space-y-5 pb-8 sm:space-y-6" dir="rtl">
      <section className="relative isolate overflow-hidden rounded-[1.5rem] border border-[#d6eaec] bg-gradient-to-bl from-[#e7f5f4] via-white to-[#fff8ed] p-4 shadow-[0_16px_46px_rgba(18,44,84,0.07)] sm:rounded-[1.9rem] sm:p-7">
        <div className="pointer-events-none absolute -left-12 -top-20 -z-10 h-56 w-56 rounded-full bg-[#0d7180]/[0.06] blur-2xl" />
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#b9d4d9] bg-white/80 px-3 py-1.5 text-[10px] font-black tracking-[0.12em] text-[#0d7180] sm:text-[11px]">
              <Building2 className="h-3.5 w-3.5" />
              BUILDINGS · COST & CONSUMPTION
            </div>
            <h1 className="text-2xl font-black tracking-tight text-[#102a43] sm:text-3xl">استهلاك المباني والتكاليف</h1>
            <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-600 sm:text-sm sm:leading-7">تابع الكميات المصروفة وتكلفتها وميزانية كل مبنى في لوحة واحدة، مع مقارنة سريعة ورسوم واضحة على الهاتف والكمبيوتر.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button variant="outline" onClick={() => void report.refetch()} disabled={report.isFetching} className="h-10 rounded-xl border-[#cfe1e4] bg-white/90 px-3 font-bold text-[#0d4f62] sm:px-4">
              {report.isFetching ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="ml-2 h-4 w-4" />}
              تحديث البيانات
            </Button>
            <Button onClick={() => downloadCsv(rows as unknown as Array<Record<string, unknown>>, fromDate, toDate)} disabled={!rows.length} className="h-10 rounded-xl bg-[#0d4f62] px-3 font-bold text-white shadow-sm hover:bg-[#0a4150] sm:px-4">
              <Download className="ml-2 h-4 w-4" />تصدير CSV
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#dce7ee] bg-white p-4 shadow-[0_8px_24px_rgba(18,44,84,0.04)] sm:p-5" aria-label="مرشحات الفترة">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#edf7f6] text-[#0d7180]"><CalendarDays className="h-5 w-5" /></span>
            <div><p className="text-sm font-black text-[#102a43]">الفترة الزمنية</p><p className="mt-0.5 text-[11px] leading-5 text-slate-500">تُحدّث المؤشرات والرسوم حسب أذونات الصرف في الفترة.</p></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:w-auto sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-500">من تاريخ<Input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className="mt-1 h-10 w-full rounded-xl" /></label>
            <label className="text-xs font-bold text-slate-500">إلى تاريخ<Input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className="mt-1 h-10 w-full rounded-xl" /></label>
          </div>
        </div>
      </section>

      <div className="sticky top-[4.5rem] z-20 rounded-2xl border border-[#dce7ee] bg-white/95 p-1.5 shadow-[0_10px_28px_rgba(18,44,84,0.08)] backdrop-blur-md sm:p-2">
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2" role="tablist" aria-label="أقسام تقرير المباني">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return <button key={tab.id} type="button" role="tab" aria-selected={active} onClick={() => setActiveTab(tab.id)} className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-1.5 py-2.5 text-center transition sm:justify-start sm:gap-3 sm:px-4 sm:py-3 ${active ? "bg-[#0d7180] text-white shadow-md shadow-[#0d7180]/20" : "text-[#102a43] hover:bg-[#edf9f8]"}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-white/15" : "bg-[#edf7f6] text-[#0d7180]"}`}><Icon className="h-4 w-4" /></span>
              <span className="min-w-0"><span className="block truncate text-[11px] font-black sm:text-sm">{tab.shortLabel}</span><span className={`mt-0.5 hidden text-[10px] font-bold sm:block ${active ? "text-white/75" : "text-slate-400"}`}>{tab.hint}</span></span>
            </button>;
          })}
        </div>
      </div>

      {activeTab === "overview" && <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 sm:gap-4">
          <SummaryCard label="المباني النشطة" value={rows.filter(row => !row.isUnassigned).length} hint="ضمن دليل المباني" tone="teal" icon={<Building2 className="h-5 w-5" />} />
          <SummaryCard label="إجمالي الحركات" value={totals.movements} hint="إذن صرف" tone="blue" icon={<ChartColumn className="h-5 w-5" />} />
          <SummaryCard label="إجمالي الكميات" value={quantity(totals.quantity)} hint="كمية مصروفة" tone="green" icon={<Package className="h-5 w-5" />} />
          <SummaryCard label="إجمالي التكلفة" value={money(totals.cost)} hint="قيمة الصرف" tone="amber" icon={<CircleDollarSign className="h-5 w-5" />} />
          <SummaryCard label="تجاوز الميزانية" value={overBudgetCount} hint="مبانٍ تحتاج مراجعة" tone={overBudgetCount ? "red" : "green"} icon={<AlertTriangle className="h-5 w-5" />} />
        </div>

        {report.error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">تعذر تحميل تقرير مقارنة المباني. حاول تحديث البيانات.</div> : <section className="grid min-w-0 gap-4 xl:grid-cols-[1.45fr_0.85fr] xl:gap-5">
          <MetricChartCard title="مقارنة الاستهلاك حسب المبنى" description="رتّب المباني حسب الكمية أو التكلفة، واكتشف تجاوز الميزانية من لون المؤشر." rows={chartRows} metric={buildingMetric} onMetricChange={setBuildingMetric} label="المبنى" loading={report.isLoading} emptyText="لا توجد أذونات صرف مرتبطة بمبانٍ ضمن الفترة." />
          <DistributionChartCard title="توزيع التكلفة" description="حصة كل مبنى من قيمة الصرف المرتبطة بالمباني." rows={buildingOptions.map(row => ({ name: row.name, shortName: row.name, cost: Number(row.cost), quantity: Number(row.quantity) }))} loading={report.isLoading} emptyText="لا توجد تكلفة مسجلة للمباني ضمن الفترة." centerLabel="تكلفة مرتبطة" footnote="يعرض الرسم الصرف المرتبط بمبنى فقط؛ إجمالي التقرير يتضمن أيضًا الصرف غير المرتبط." />
        </section>}

        <BuildingComparisonSection rows={rows} totals={totals} highestCost={highestCost} loading={report.isLoading} onSelectBuilding={buildingId => { setSelectedBuildingId(String(buildingId)); setActiveTab("items"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      </>}

      {activeTab === "items" && <section className="space-y-4">
        <Card className="overflow-hidden rounded-[1.5rem] border-[#dce7ee] shadow-[0_14px_38px_rgba(18,44,84,0.055)] sm:rounded-[1.75rem]">
          <CardHeader className="border-b border-[#edf2f5] bg-gradient-to-l from-[#f2faf9] to-white p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#0d7180] shadow-sm"><Boxes className="h-5 w-5" /></span><div><CardTitle className="text-base font-black text-[#102a43] sm:text-lg">استهلاك المواد داخل المبنى</CardTitle><p className="mt-1 text-[11px] leading-5 text-slate-500 sm:text-xs">اختر مبنى لمقارنة المواد المصروفة وكمياتها وتكاليفها.</p></div></div>
              <select value={selectedBuildingId} onChange={event => setSelectedBuildingId(event.target.value)} className="h-11 w-full rounded-xl border border-[#dce7ee] bg-white px-3 text-sm font-bold text-[#102a43] outline-none transition focus:border-[#0d7180] focus:ring-2 focus:ring-[#0d7180]/10 sm:w-72" disabled={!buildingOptions.length} aria-label="اختر المبنى">
                <option value="">اختر المبنى</option>{buildingOptions.map(row => <option key={row.buildingId} value={String(row.buildingId)}>{row.name}</option>)}
              </select>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-5">
            {selectedBuilding && selectedItemRows.length > 0 && <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <MiniMetric label="عدد الأصناف" value={selectedItemTotals.count} tone="teal" />
              <MiniMetric label="عدد الفئات" value={selectedItemGroups.length} tone="green" />
              <MiniMetric label="تكلفة المواد" value={money(selectedItemTotals.cost)} tone="amber" />
            </div>}
            {selectedBuilding && selectedItemUnitTotals.length > 0 && <div className="rounded-2xl border border-[#e2ecee] bg-[#f8fbfc] p-3 sm:p-4"><div className="mb-2 flex items-center gap-2"><Package className="h-4 w-4 text-[#0d7180]" /><p className="text-[11px] font-black text-[#102a43]">إجمالي الكمية مفصّل حسب الوحدة</p></div><div className="flex flex-wrap gap-2">{selectedItemUnitTotals.map(row => <span key={row.unit} className="inline-flex items-center gap-2 rounded-xl border border-[#d8e8e9] bg-white px-3 py-2 text-[11px]"><strong className="font-black text-[#0d4f62]" dir="ltr">{quantity(row.total)}</strong><span className="font-bold text-[#0d806c]">{row.unit}</span></span>)}</div></div>}
            {selectedItemRows.length ? <>
              <div className="grid min-w-0 gap-4 xl:grid-cols-[1.35fr_0.85fr] xl:gap-5">
                <MetricChartCard title={`استهلاك الأصناف${selectedBuilding ? ` · ${selectedBuilding.name}` : ""}`} description="بدّل بين الكمية والتكلفة؛ ترتيب الرسم يتبع المقياس المختار." rows={selectedItemChartRows} metric={itemMetric} onMetricChange={setItemMetric} label="الصنف" loading={report.isLoading} emptyText="لا توجد بيانات أصناف لهذا المبنى." />
                <DistributionChartCard title="نصيب كل صنف من التكلفة" description="توزيع قيمة جميع المواد المصروفة داخل المبنى." rows={selectedItemRows} loading={report.isLoading} emptyText="لا توجد تكاليف أصناف لعرضها." centerLabel="تكلفة المواد" footnote="يعرض الرسم جميع الأصناف، ويجمع ما بعد أعلى خمسة أصناف في شريحة واحدة." />
              </div>
              <ItemCategorySection groups={selectedItemGroups} metric={itemMetric} />
            </> : <EmptyState icon={<Package className="h-6 w-6" />} title="لا توجد تفاصيل لعرضها" text={buildingOptions.length ? "اختر مبنى لديه حركات صرف، وستظهر المواد والكميات والتكلفة هنا." : "لا توجد أذونات صرف مرتبطة بمبانٍ في الفترة الحالية."} />}
          </CardContent>
        </Card>
      </section>}

      {activeTab === "buildings" && <BuildingManagementSection
        buildings={buildingsQuery.data ?? []}
        isLoading={buildingsQuery.isLoading}
        form={buildingForm}
        setForm={setBuildingForm}
        editingBuildingId={editingBuildingId}
        isSaving={createBuilding.isPending || updateBuilding.isPending}
        onSubmit={submitBuildingForm}
        onEdit={editBuilding}
        onCancel={resetBuildingForm}
      />}
    </div>
  </DashboardLayout>;
}

function MetricChartCard({
  title,
  description,
  rows,
  metric,
  onMetricChange,
  label,
  loading,
  emptyText,
}: {
  title: string;
  description: string;
  rows: ChartRow[];
  metric: ChartMetric;
  onMetricChange: (metric: ChartMetric) => void;
  label: string;
  loading: boolean;
  emptyText: string;
}) {
  const chartHeight = Math.max(260, Math.min(680, rows.length * 38));
  const metricTitle = metric === "cost" ? "التكلفة" : "الكمية";
  const rankedRows = useMemo(() => rows.slice().sort((left, right) => right[metric] - left[metric]), [metric, rows]);
  return <Card className="min-w-0 overflow-hidden rounded-[1.5rem] border-[#dce7ee] shadow-[0_14px_38px_rgba(18,44,84,0.055)] sm:rounded-[1.75rem]">
    <CardHeader className="gap-3 border-b border-[#edf2f5] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex items-start gap-3"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#edf7f6] text-[#0d7180]"><ChartColumn className="h-4 w-4" /></span><div className="min-w-0"><CardTitle className="text-base font-black leading-6 text-[#102a43] sm:text-lg">{title}</CardTitle><p className="mt-1 text-[11px] leading-5 text-slate-500 sm:text-xs">{description}</p></div></div>
      <MetricToggle value={metric} onChange={onMetricChange} />
    </CardHeader>
    <CardContent className="p-3 sm:p-5">
      {loading ? <ChartLoading height={270} /> : rows.length ? <div className="w-full min-w-0" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rankedRows} layout="vertical" margin={{ top: 8, right: 8, left: 2, bottom: 8 }} barCategoryGap="24%">
            <CartesianGrid strokeDasharray="3 5" stroke="#e8eff1" horizontal={false} />
            <XAxis type="number" domain={[0, "dataMax"]} tickFormatter={value => metric === "cost" ? moneyFormat.format(Number(value)) : quantity(value)} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="shortName" width={118} tick={{ fontSize: 10, fill: "#334155" }} tickLine={false} axisLine={false} interval={0} />
            <Tooltip formatter={(value: unknown) => [metric === "cost" ? money(value) : quantity(value), metricTitle]} labelFormatter={value => `${label}: ${value}`} contentStyle={{ direction: "rtl", borderRadius: 14, borderColor: "#dce7ee", boxShadow: "0 12px 30px rgba(18,44,84,.12)", fontSize: 12 }} cursor={{ fill: "#f3f8f8" }} />
            <Bar dataKey={metric} name={metricTitle} radius={[0, 8, 8, 0]} maxBarSize={24}>
              {rankedRows.map((row, index) => <Cell key={`${row.name}-${index}`} fill={metric === "cost" && row.budget && row.cost > row.budget ? "#c75048" : chartColors[index % chartColors.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div> : <EmptyState icon={<ChartColumn className="h-6 w-6" />} title="الرسم غير متاح بعد" text={emptyText} compact />}
      {rows.length > 0 && !loading && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#edf2f5] pt-3 text-[10px] font-bold text-slate-500 sm:text-[11px]">
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#0d7180]" />{metric === "cost" ? "داخل الميزانية" : "كمية مصروفة"}</span>
        {metric === "cost" && rankedRows.some(row => row.budget && row.cost > row.budget) && <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#c75048]" />تجاوز الميزانية</span>}
        <span className="mr-auto text-slate-400">أعلى {rows.length} نتيجة</span>
      </div>}
    </CardContent>
  </Card>;
}

function DistributionChartCard({
  title,
  description,
  rows,
  loading,
  emptyText,
  centerLabel,
  footnote,
}: {
  title: string;
  description: string;
  rows: ChartRow[];
  loading: boolean;
  emptyText: string;
  centerLabel: string;
  footnote: string;
}) {
  const sorted = rows.filter(row => Number(row.cost) > 0).slice().sort((left, right) => right.cost - left.cost);
  const topRows = sorted.slice(0, 5).map((row, index) => ({ name: row.name, value: row.cost, color: chartColors[index % chartColors.length] }));
  const remaining = sorted.slice(5).reduce((sum, row) => sum + row.cost, 0);
  if (remaining > 0) topRows.push({ name: "بقية العناصر", value: remaining, color: "#94a3b8" });
  const total = topRows.reduce((sum, row) => sum + row.value, 0);

  return <Card className="min-w-0 overflow-hidden rounded-[1.5rem] border-[#dce7ee] shadow-[0_14px_38px_rgba(18,44,84,0.055)] sm:rounded-[1.75rem]">
    <CardHeader className="border-b border-[#edf2f5] p-4 sm:p-5">
      <div className="flex items-start gap-3"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fff5e8] text-[#b77924]"><CircleDollarSign className="h-4 w-4" /></span><div><CardTitle className="text-base font-black leading-6 text-[#102a43] sm:text-lg">{title}</CardTitle><p className="mt-1 text-[11px] leading-5 text-slate-500 sm:text-xs">{description}</p></div></div>
    </CardHeader>
    <CardContent className="p-4 sm:p-5">
      {loading ? <ChartLoading height={250} /> : topRows.length ? <>
        <div className="relative mx-auto h-[210px] w-full max-w-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={topRows} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="#fff" strokeWidth={3}>
                {topRows.map(row => <Cell key={row.name} fill={row.color} />)}
              </Pie>
              <Tooltip formatter={(value: unknown) => [money(value), "التكلفة"]} contentStyle={{ direction: "rtl", borderRadius: 14, borderColor: "#dce7ee", boxShadow: "0 12px 30px rgba(18,44,84,.12)", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-bold text-slate-400">{centerLabel}</span>
            <strong className="mt-1 max-w-[70%] truncate text-base font-black text-[#102a43] sm:text-lg" dir="ltr">{money(total)}</strong>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {topRows.map(row => <div key={row.name} className="flex min-w-0 items-center gap-2 rounded-xl bg-[#f8fbfc] px-2.5 py-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
            <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-slate-600" title={row.name}>{row.name}</span>
            <span className="shrink-0 text-[10px] font-black text-[#102a43]" dir="ltr">{total ? `${(row.value / total * 100).toFixed(0)}%` : "0%"}</span>
          </div>)}
        </div>
        <p className="mt-3 border-t border-[#edf2f5] pt-3 text-[10px] leading-5 text-slate-400">{footnote}</p>
      </> : <EmptyState icon={<CircleDollarSign className="h-6 w-6" />} title="لا توجد قيم كافية للرسم" text={emptyText} compact />}
    </CardContent>
  </Card>;
}

function MetricToggle({ value, onChange }: { value: ChartMetric; onChange: (value: ChartMetric) => void }) {
  return <div className="grid w-full grid-cols-2 rounded-xl border border-[#e6eef0] bg-[#f6f9fa] p-1 sm:w-auto" role="group" aria-label="اختيار مقياس الرسم">
    {([{ id: "cost" as const, label: "التكلفة" }, { id: "quantity" as const, label: "الكمية" }]).map(option => <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)} className={`rounded-lg px-3 py-2 text-[11px] font-black transition sm:px-4 ${value === option.id ? "bg-white text-[#0d4f62] shadow-sm" : "text-slate-500 hover:text-[#0d4f62]"}`}>{option.label}</button>)}
  </div>;
}

function BuildingComparisonSection({
  rows,
  totals,
  highestCost,
  loading,
  onSelectBuilding,
}: {
  rows: Array<{ buildingId: number | null; name: string; code: string; type: string | null; budget: number; movements: number; quantity: number; cost: number; remainingBudget: number; budgetUsagePercent: number | null; isUnassigned?: boolean }>;
  totals: { movements: number; quantity: number; cost: number; budget: number; remainingBudget: number };
  highestCost: number;
  loading: boolean;
  onSelectBuilding: (buildingId: number) => void;
}) {
  return <Card className="overflow-hidden rounded-[1.5rem] border-[#dce7ee] shadow-[0_14px_38px_rgba(18,44,84,0.055)] sm:rounded-[1.75rem]">
    <CardHeader className="border-b border-[#edf2f5] bg-gradient-to-l from-[#f5fafb] to-white p-4 sm:p-5">
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#0d7180] shadow-sm"><WalletCards className="h-5 w-5" /></span><div><CardTitle className="text-base font-black text-[#102a43] sm:text-lg">تفصيل المقارنة حسب المبنى</CardTitle><p className="mt-1 text-[11px] leading-5 text-slate-500 sm:text-xs">مرتبة من الأعلى تكلفة إلى الأقل، مع إبقاء الصرف غير المرتبط ظاهراً للمراجعة.</p></div></div>
    </CardHeader>
    <CardContent className="p-3 sm:p-5">
      {loading ? <ChartLoading height={180} /> : rows.length === 0 ? <EmptyState icon={<Building2 className="h-6 w-6" />} title="لا توجد بيانات في الفترة المحددة" text="عدّل نطاق التاريخ أو راجع أذونات الصرف المرتبطة بالمباني." compact /> : <>
        <div className="space-y-3 lg:hidden">
          {rows.map(row => <BuildingMobileCard key={`${row.buildingId ?? "unassigned"}-${row.code}`} row={row} highestCost={highestCost} onSelectBuilding={onSelectBuilding} />)}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-[#e5eef1] lg:block">
          <table className="w-full min-w-[980px] text-right text-sm">
            <thead className="bg-[#f7fbfc] text-[11px] font-black text-slate-500"><tr><th className="px-4 py-3.5">المبنى</th><th className="px-4 py-3.5">الحركات</th><th className="px-4 py-3.5">الكمية المصروفة</th><th className="px-4 py-3.5">تكلفة الاستهلاك</th><th className="px-4 py-3.5">الميزانية</th><th className="px-4 py-3.5">المتبقي</th><th className="px-4 py-3.5">الاستخدام</th><th className="px-4 py-3.5">مؤشر التكلفة</th></tr></thead>
            <tbody className="divide-y divide-[#eef3f5]">{rows.map(row => <BuildingTableRow key={`${row.buildingId ?? "unassigned"}-${row.code}`} row={row} highestCost={highestCost} />)}</tbody>
            <tfoot className="border-t-2 border-[#dce7ee] bg-[#f7fbfc] text-xs font-black text-[#102a43]"><tr><td className="px-4 py-4">الإجمالي</td><td className="px-4 py-4">{quantity(totals.movements)}</td><td className="px-4 py-4">{quantity(totals.quantity)}</td><td className="px-4 py-4 text-[#bd5147]">{money(totals.cost)}</td><td className="px-4 py-4">{money(totals.budget)}</td><td className="px-4 py-4">{money(totals.remainingBudget)}</td><td className="px-4 py-4">{totals.budget ? `${(totals.cost / totals.budget * 100).toFixed(1)}%` : "—"}</td><td className="px-4 py-4"><TrendingDown className="h-5 w-5 text-[#0d7180]" /></td></tr></tfoot>
          </table>
        </div>
      </>}
    </CardContent>
  </Card>;
}

function BuildingMobileCard({ row, highestCost, onSelectBuilding }: { row: BuildingComparisonRow; highestCost: number; onSelectBuilding: (buildingId: number) => void }) {
  const over = row.budget > 0 && row.cost > row.budget;
  const budgetPercent = row.budget > 0 ? Number(row.budgetUsagePercent ?? 0) : null;
  const selectable = row.buildingId != null && !row.isUnassigned;
  return <article role={selectable ? "button" : undefined} tabIndex={selectable ? 0 : undefined} onClick={() => selectable && onSelectBuilding(row.buildingId as number)} onKeyDown={event => { if (selectable && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelectBuilding(row.buildingId as number); } }} className={`rounded-2xl border border-[#e3ecef] bg-white p-3.5 shadow-[0_5px_16px_rgba(18,44,84,0.035)] sm:p-4 ${selectable ? "cursor-pointer transition hover:-translate-y-0.5 hover:border-[#8fcfce] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#0d7180]/30" : ""}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="truncate text-sm font-black text-[#102a43]">{row.name}</h3><p className="mt-1 text-[10px] text-slate-400">{row.code}{row.type ? ` · ${row.type === "subcontractor" ? "مقاول" : "مبنى مملوك"}` : ""}</p></div>
      <StatusBadge over={over} budget={row.budget} />
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <MobileValue label="الكمية المصروفة" value={quantity(row.quantity)} tone="teal" />
      <MobileValue label="تكلفة الاستهلاك" value={money(row.cost)} tone="red" />
      <MobileValue label="عدد الحركات" value={quantity(row.movements)} tone="blue" />
      <MobileValue label="المتبقي من الميزانية" value={row.budget ? money(row.remainingBudget) : "—"} tone={over ? "red" : "green"} />
    </div>
    <div className="mt-3 flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#edf2f4]"><div className={`h-full rounded-full transition-all ${over ? "bg-[#c75048]" : "bg-[#0d7180]"}`} style={{ width: `${row.budget ? Math.min(100, Math.max(0, budgetPercent ?? 0)) : Math.min(100, row.cost / highestCost * 100)}%` }} /></div>
      <span className="shrink-0 text-[10px] font-black text-slate-500">{budgetPercent == null ? "مقارنة التكلفة" : `${budgetPercent.toFixed(1)}% من الميزانية`}</span>
    </div>
  </article>;
}

type BuildingComparisonRow = {
  buildingId: number | null;
  name: string;
  code: string;
  type: string | null;
  budget: number;
  movements: number;
  quantity: number;
  cost: number;
  remainingBudget: number;
  budgetUsagePercent: number | null;
  isUnassigned?: boolean;
};

function BuildingTableRow({ row, highestCost }: { row: BuildingComparisonRow; highestCost: number }) {
  const over = row.budget > 0 && row.cost > row.budget;
  return <tr className="transition hover:bg-[#f8fbfc]">
    <td className="px-4 py-3.5"><div className="font-black text-[#102a43]">{row.name}</div><div className="mt-1 text-[10px] text-slate-400">{row.code}{row.type ? ` · ${row.type === "subcontractor" ? "مقاول" : "مبنى مملوك"}` : ""}</div></td>
    <td className="px-4 py-3.5 font-bold">{quantity(row.movements)}</td>
    <td className="px-4 py-3.5 font-bold">{quantity(row.quantity)}</td>
    <td className="px-4 py-3.5 font-black text-[#bd5147]">{money(row.cost)}</td>
    <td className="px-4 py-3.5">{row.budget ? money(row.budget) : "—"}</td>
    <td className={`px-4 py-3.5 font-black ${over ? "text-red-700" : "text-[#0d806c]"}`}>{row.budget ? money(row.remainingBudget) : "—"}</td>
    <td className="px-4 py-3.5">{row.budgetUsagePercent == null ? <StatusBadge over={false} budget={0} /> : <Badge className={`rounded-full border ${over ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{row.budgetUsagePercent.toFixed(1)}%</Badge>}</td>
    <td className="px-4 py-3.5"><div className="flex min-w-32 items-center gap-2"><div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#e8f1f2]"><div className={`h-full rounded-full ${over ? "bg-[#bd5147]" : "bg-[#0d7180]"}`} style={{ width: `${Math.min(100, Math.max(0, Number(row.cost) / highestCost * 100))}%` }} /></div><span className="text-[10px] font-bold text-slate-400">{money(row.cost)}</span></div></td>
  </tr>;
}

function StatusBadge({ over, budget }: { over: boolean; budget: number }) {
  if (!budget) return <Badge variant="outline" className="shrink-0 rounded-full border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-500">بلا ميزانية</Badge>;
  return <Badge className={`shrink-0 rounded-full border text-[10px] font-bold ${over ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{over ? "تجاوز الميزانية" : "ضمن الميزانية"}</Badge>;
}

function MobileValue({ label, value, tone }: { label: string; value: string; tone: "teal" | "red" | "blue" | "green" }) {
  const tones = { teal: "text-[#0d7180]", red: "text-[#bd5147]", blue: "text-[#426b9e]", green: "text-[#0d806c]" };
  return <div className="min-w-0 rounded-xl bg-[#f7fafb] px-2.5 py-2"><p className="truncate text-[9px] font-bold text-slate-400 sm:text-[10px]">{label}</p><p className={`mt-1 truncate text-xs font-black sm:text-sm ${tones[tone]}`} title={value}>{value}</p></div>;
}

function ItemCategorySection({ groups, metric }: { groups: Array<{ category: string; items: ChartRow[]; cost: number }>; metric: ChartMetric }) {
  const metricLabel = metric === "cost" ? "التكلفة" : "الكمية";
  return <Card className="overflow-hidden rounded-[1.5rem] border-[#dce7ee] shadow-[0_12px_32px_rgba(18,44,84,0.045)] sm:rounded-[1.75rem]">
    <CardHeader className="border-b border-[#edf2f5] bg-gradient-to-l from-[#f4faf9] to-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#0d7180] shadow-sm"><Boxes className="h-5 w-5" /></span><div><CardTitle className="text-base font-black text-[#102a43] sm:text-lg">الأصناف مجمعة حسب التصنيف</CardTitle><p className="mt-1 text-[11px] leading-5 text-slate-500 sm:text-xs">الفئات مرتبة حسب تكلفة الصرف، والأصناف داخل كل فئة مرتبة تنازليًا حسب {metricLabel}. الكمية ظاهرة بوحدتها لتجنب خلط الأطنان بالأمتار والعدد.</p></div></div><Badge variant="outline" className="shrink-0 rounded-full border-[#cfe1e4] bg-white text-[10px] font-black text-[#0d4f62]">{groups.length} فئة</Badge></div>
    </CardHeader>
    <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-5">
      {groups.map(group => <section key={group.category} className="overflow-hidden rounded-2xl border border-[#e2ecee] bg-white">
        <div className="flex flex-col gap-3 bg-[#f8fbfc] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#0d7180] shadow-sm"><Package className="h-4 w-4" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-black text-[#102a43]">{group.category}</h3><Badge variant="outline" className="rounded-full border-[#dce7ee] bg-white text-[9px] font-bold text-slate-500">{group.items.length} صنف</Badge></div>{group.category === "غير مصنف" ? <p className="mt-1 text-[10px] leading-5 text-amber-700">أصناف بلا تصنيف محفوظ في بياناتها؛ يمكنك تحديد الفئة من سجل الصنف.</p> : <p className="mt-1 text-[10px] text-slate-400">مرتبة حسب {metricLabel} داخل هذه المجموعة</p>}</div></div>
          <MiniMetric label="تكلفة الفئة" value={money(group.cost)} tone="amber" />
        </div>
        <div className="divide-y divide-[#edf2f5]">
          {group.items.map((item, index) => <article key={`${item.itemCode || item.name}-${index}`} className={`flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3 ${item.anomaly ? "bg-amber-50/60" : ""}`}>
            <div className="flex min-w-0 items-start gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#f3f8f9] text-[10px] font-black text-[#0d7180]">{index + 1}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="text-xs font-black leading-5 text-[#102a43] sm:text-sm">{item.name}</h4><Badge className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${item.unit && item.unit !== "غير محدد" ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-amber-100 bg-amber-50 text-amber-700"}`}>{item.unit && item.unit !== "غير محدد" ? item.unit : "وحدة غير محددة"}</Badge>{item.anomaly ? <Badge className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-800"><AlertTriangle className="ml-1 inline h-3 w-3" />قفزة غير معتادة</Badge> : null}</div><p className="mt-1 text-[10px] text-slate-400">كود الصنف: {item.itemCode || "—"}</p><p className="mt-1 text-[10px] font-bold text-[#0d7180]">المتوسط المعتاد: {item.baselineDaily ? `${quantity(item.baselineDaily)} / يوم · ${quantity(item.baselineWeekly)} / أسبوع` : "لا توجد بيانات تاريخية كافية بعد"}</p></div></div>
            <div className="grid grid-cols-2 gap-2 sm:w-[300px] sm:shrink-0"><MiniMetric label={`الكمية · ${item.unit || "وحدة غير محددة"}`} value={quantity(item.quantity)} tone="teal" /><MiniMetric label="التكلفة" value={money(item.cost)} tone="amber" /></div>
          </article>)}
        </div>
      </section>)}
    </CardContent>
  </Card>;
}

function BuildingManagementSection({
  buildings,
  isLoading,
  form,
  setForm,
  editingBuildingId,
  isSaving,
  onSubmit,
  onEdit,
  onCancel,
}: {
  buildings: Array<{ id: number; name: string; code: string; type: "owned_building" | "subcontractor"; budget: unknown }>;
  isLoading: boolean;
  form: { name: string; code: string; type: "owned_building" | "subcontractor"; budget: string };
  setForm: (update: (current: { name: string; code: string; type: "owned_building" | "subcontractor"; budget: string }) => { name: string; code: string; type: "owned_building" | "subcontractor"; budget: string }) => void;
  editingBuildingId: number | null;
  isSaving: boolean;
  onSubmit: () => void;
  onEdit: (building: { id: number; name: string; code: string; type: "owned_building" | "subcontractor"; budget: unknown }) => void;
  onCancel: () => void;
}) {
  return <section className="grid min-w-0 gap-4 xl:grid-cols-[1fr_1.1fr] xl:gap-5">
    <Card className="overflow-hidden rounded-[1.5rem] border-[#dce7ee] shadow-[0_14px_38px_rgba(18,44,84,0.055)] sm:rounded-[1.75rem]">
      <CardHeader className="border-b border-[#edf2f5] bg-gradient-to-l from-[#f2faf9] to-white p-4 sm:p-5"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#0d7180] shadow-sm"><Building2 className="h-5 w-5" /></span><div><CardTitle className="text-base font-black text-[#102a43] sm:text-lg">{editingBuildingId ? "تعديل بيانات المبنى" : "إضافة مبنى"}</CardTitle><p className="mt-1 text-[11px] leading-5 text-slate-500">أسماء وأكواد وميزانيات واضحة لتظهر في أذونات الصرف والتقارير.</p></div></div></CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-500 sm:col-span-2">اسم المبنى<Input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="مثال: مبنى الإدارة" className="mt-1.5 h-11 rounded-xl" /></label>
          <label className="text-xs font-bold text-slate-500">كود المبنى<Input value={form.code} onChange={event => setForm(current => ({ ...current, code: event.target.value }))} placeholder="BLD-01" className="mt-1.5 h-11 rounded-xl" /></label>
          <label className="text-xs font-bold text-slate-500">نوع الجهة<select value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value as "owned_building" | "subcontractor" }))} className="mt-1.5 h-11 w-full rounded-xl border border-[#dce7ee] bg-white px-3 font-bold text-[#102a43] outline-none focus:border-[#0d7180]"><option value="owned_building">مبنى مملوك</option><option value="subcontractor">مقاول / جهة خارجية</option></select></label>
          <label className="text-xs font-bold text-slate-500 sm:col-span-2">الميزانية المحددة (ج.م)<Input type="number" min="0" value={form.budget} onChange={event => setForm(current => ({ ...current, budget: event.target.value }))} className="mt-1.5 h-11 rounded-xl" /></label>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={onSubmit} disabled={!form.name.trim() || !form.code.trim() || isSaving} className="h-11 flex-1 rounded-xl bg-[#0d7180] font-black text-white hover:bg-[#0a5d69]">{isSaving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : editingBuildingId ? <Save className="ml-2 h-4 w-4" /> : <Plus className="ml-2 h-4 w-4" />}{editingBuildingId ? "حفظ التعديل" : "إضافة المبنى"}</Button>
          {editingBuildingId ? <Button type="button" variant="outline" onClick={onCancel} className="h-11 rounded-xl"><X className="ml-2 h-4 w-4" />إلغاء التعديل</Button> : null}
        </div>
      </CardContent>
    </Card>

    <Card className="overflow-hidden rounded-[1.5rem] border-[#dce7ee] shadow-[0_14px_38px_rgba(18,44,84,0.055)] sm:rounded-[1.75rem]">
      <CardHeader className="border-b border-[#edf2f5] p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-base font-black text-[#102a43] sm:text-lg">دليل المباني والجهات</CardTitle><p className="mt-1 text-[11px] text-slate-500">{buildings.length} جهة مسجلة</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#edf7f6] text-[#0d7180]"><Boxes className="h-4 w-4" /></span></div></CardHeader>
      <CardContent className="p-3 sm:p-4">
        {isLoading ? <ChartLoading height={160} /> : buildings.length ? <div className="grid gap-2.5 sm:grid-cols-2">
          {buildings.map(building => <article key={building.id} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-[#e5eef1] bg-[#fbfdfe] p-3 transition hover:border-[#b9d4d9] hover:bg-[#f5fafb]">
            <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#0d7180] shadow-sm"><Building2 className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-black text-[#102a43]">{building.name}</p><p className="mt-1 truncate text-[10px] text-slate-400">{building.code} · {building.type === "subcontractor" ? "مقاول" : "مبنى مملوك"}</p><p className="mt-1 text-[10px] font-bold text-[#0d7180]">الميزانية: {money(building.budget)}</p></div></div>
            <Button type="button" variant="outline" size="icon" onClick={() => onEdit(building)} className="h-9 w-9 shrink-0 rounded-xl border-[#c8dde0] bg-white text-[#0d4f62] hover:bg-[#edf7f6]" title={`تعديل ${building.name}`} aria-label={`تعديل ${building.name}`}><Pencil className="h-4 w-4" /></Button>
          </article>)}
        </div> : <EmptyState icon={<Building2 className="h-6 w-6" />} title="لا توجد مبانٍ بعد" text="أضف اسم المبنى وكوده وميزانيته لتظهر خياراته في تقارير الصرف." compact />}
      </CardContent>
    </Card>
  </section>;
}

function SummaryCard({ label, value, hint, tone, icon }: { label: string; value: string | number; hint: string; tone: "teal" | "blue" | "green" | "amber" | "red"; icon: React.ReactNode }) {
  const colors = {
    teal: "border-[#d4e8e9] bg-gradient-to-br from-[#f4fbfa] to-white text-[#0d7180]",
    blue: "border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-700",
    green: "border-emerald-100 bg-gradient-to-br from-emerald-50 to-white text-emerald-700",
    amber: "border-amber-100 bg-gradient-to-br from-amber-50 to-white text-amber-700",
    red: "border-red-100 bg-gradient-to-br from-red-50 to-white text-red-700",
  };
  return <Card className={`min-w-0 overflow-hidden rounded-2xl border shadow-[0_8px_22px_rgba(18,44,84,0.035)] ${colors[tone]}`}><CardContent className="flex min-h-[112px] items-start justify-between gap-2 p-3 sm:min-h-[128px] sm:p-4"><div className="min-w-0"><p className="truncate text-[10px] font-bold opacity-75 sm:text-xs">{label}</p><p className="mt-2 truncate text-lg font-black sm:text-2xl" title={String(value)}>{value}</p><p className="mt-1 truncate text-[9px] font-bold opacity-65 sm:text-[10px]">{hint}</p></div><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/90 shadow-sm sm:h-9 sm:w-9">{icon}</span></CardContent></Card>;
}

function MiniMetric({ label, value, tone }: { label: string; value: string | number; tone: "teal" | "green" | "amber" }) {
  const colors = { teal: "text-[#0d7180]", green: "text-[#0d806c]", amber: "text-[#b77924]" };
  return <div className="min-w-0 rounded-xl border border-[#e5eef1] bg-white p-2.5 sm:rounded-2xl sm:p-3"><p className="truncate text-[9px] font-bold text-slate-400 sm:text-[10px]">{label}</p><p className={`mt-1 truncate text-[11px] font-black sm:text-sm ${colors[tone]}`} title={String(value)}>{value}</p></div>;
}

function ChartLoading({ height }: { height: number }) {
  return <div className="flex items-center justify-center gap-2 text-sm font-bold text-slate-400" style={{ height }}><Loader2 className="h-5 w-5 animate-spin text-[#0d7180]" />جارٍ تحميل بيانات التقرير...</div>;
}

function EmptyState({ icon, title, text, compact = false }: { icon: React.ReactNode; title: string; text: string; compact?: boolean }) {
  return <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#d8e6e9] bg-[#fbfdfe] px-5 text-center ${compact ? "py-8" : "py-12"}`}><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf7f6] text-[#0d7180]">{icon}</span><h3 className="mt-3 text-sm font-black text-[#102a43]">{title}</h3><p className="mt-1 max-w-md text-[11px] leading-5 text-slate-500">{text}</p></div>;
}
