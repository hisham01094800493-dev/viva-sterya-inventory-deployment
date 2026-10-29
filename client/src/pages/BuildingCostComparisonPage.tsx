import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Pencil, Plus, RefreshCcw, Save, TrendingDown, WalletCards, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
  const [editingBuildingId, setEditingBuildingId] = useState<number | null>(null);
  const [buildingForm, setBuildingForm] = useState({ name: "", code: "", type: "owned_building" as "owned_building" | "subcontractor", budget: "0" });
  const buildingsQuery = trpc.buildings.list.useQuery();
  const createBuilding = trpc.buildings.create.useMutation({ onSuccess: () => { toast.success("تمت إضافة المبنى"); void buildingsQuery.refetch(); void report.refetch(); resetBuildingForm(); }, onError: error => toast.error(error.message || "تعذر إضافة المبنى") });
  const updateBuilding = trpc.buildings.update.useMutation({ onSuccess: () => { toast.success("تم تعديل بيانات المبنى"); void buildingsQuery.refetch(); void report.refetch(); resetBuildingForm(); }, onError: error => toast.error(error.message || "تعذر تعديل المبنى") });
  const report = trpc.reports.buildingCostComparison.useQuery({ fromDate: fromDate || undefined, toDate: toDate || undefined });
  const rows = report.data?.rows ?? [];
  function resetBuildingForm() { setEditingBuildingId(null); setBuildingForm({ name: "", code: "", type: "owned_building", budget: "0" }); }
  function submitBuildingForm() {
    const payload = { name: buildingForm.name, code: buildingForm.code, type: buildingForm.type, budget: Number(buildingForm.budget || 0) };
    if (editingBuildingId) updateBuilding.mutate({ id: editingBuildingId, ...payload }); else createBuilding.mutate(payload);
  }
  function editBuilding(building: { id: number; name: string; code: string; type: "owned_building" | "subcontractor"; budget: unknown }) { setEditingBuildingId(building.id); setBuildingForm({ name: building.name, code: building.code, type: building.type, budget: String(Number(building.budget ?? 0)) }); }
  const totals = report.data?.totals ?? { movements: 0, quantity: 0, cost: 0, budget: 0, remainingBudget: 0 };
  const highestCost = useMemo(() => Math.max(1, ...rows.map(row => Number(row.cost))), [rows]);
  const overBudgetCount = rows.filter(row => !row.isUnassigned && row.budget > 0 && row.cost > row.budget).length;
  const chartRows = useMemo(() => rows.filter(row => !row.isUnassigned && row.movements > 0).slice(0, 20).map(row => ({ ...row, shortName: row.name.length > 22 ? `${row.name.slice(0, 22)}…` : row.name })), [rows]);
  const itemRows = report.data?.itemRows ?? [];
  const buildingOptions = rows.filter(row => !row.isUnassigned && row.movements > 0);
  useEffect(() => {
    if (!selectedBuildingId || !buildingOptions.some(row => String(row.buildingId) === selectedBuildingId)) setSelectedBuildingId(buildingOptions[0] ? String(buildingOptions[0].buildingId) : "");
  }, [buildingOptions, selectedBuildingId]);
  const selectedBuilding = buildingOptions.find(row => String(row.buildingId) === selectedBuildingId) ?? null;
  const selectedItemRows = useMemo(() => itemRows.filter(row => String(row.buildingId) === selectedBuildingId).slice(0, 20).map(row => ({ ...row, shortName: row.itemName.length > 24 ? `${row.itemName.slice(0, 24)}…` : row.itemName })), [itemRows, selectedBuildingId]);

  return <DashboardLayout>
    <div className="mx-auto w-full max-w-[1500px] space-y-6" dir="rtl">
      <section className="overflow-hidden rounded-[1.75rem] border border-[#d6eaec] bg-gradient-to-l from-[#edf9f8] via-white to-[#fffaf0] p-5 shadow-[0_18px_50px_rgba(18,44,84,0.06)] sm:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-[#d08a3b]">BUILDINGS / COST ANALYTICS</p><h1 className="text-3xl font-black tracking-tight text-[#102a43]">مقارنة استهلاك المباني والتكاليف</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">يعرض التقرير قيمة وكميات أذونات الصرف المرتبطة بكل مبنى، مع مقارنة التكلفة بالميزانية المحددة لاكتشاف المباني الأعلى استهلاكاً قبل إعداد الشارتات والملخصات اليومية.</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void report.refetch()} disabled={report.isFetching} className="rounded-xl border-[#dce7ee] bg-white font-bold text-[#0d4f62]">{report.isFetching ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="ml-2 h-4 w-4" />}تحديث</Button><Button onClick={() => downloadCsv(rows as unknown as Array<Record<string, unknown>>, fromDate, toDate)} disabled={!rows.length} className="rounded-xl bg-[#0d4f62] font-bold text-white hover:bg-[#0a4150]"><Download className="ml-2 h-4 w-4" />تصدير CSV</Button></div>
        </div>
      </section>

      {activeTab === "buildings" && (
      <Card className="rounded-[1.5rem] border-[#dce7ee] shadow-sm">
        <CardHeader className="border-b border-[#edf2f5]"><CardTitle className="flex items-center gap-2 text-lg font-black text-[#102a43]"><Plus className="h-5 w-5 text-[#0d7180]" />إدارة المباني</CardTitle><p className="text-xs text-slate-400">أضف المباني أو عدّل أسماءها وأكوادها وميزانياتها، وستظهر مباشرة في أذونات الصرف والتقارير.</p></CardHeader>
        <CardContent className="space-y-4 p-5"><div className="grid gap-3 md:grid-cols-5"><label className="text-xs font-bold text-slate-500 md:col-span-2">اسم المبنى<Input value={buildingForm.name} onChange={event => setBuildingForm(current => ({ ...current, name: event.target.value }))} placeholder="مثال: مبنى الإدارة" className="mt-1 rounded-xl" /></label><label className="text-xs font-bold text-slate-500">كود المبنى<Input value={buildingForm.code} onChange={event => setBuildingForm(current => ({ ...current, code: event.target.value }))} placeholder="BLD-01" className="mt-1 rounded-xl" /></label><label className="text-xs font-bold text-slate-500">نوع المبنى<select value={buildingForm.type} onChange={event => setBuildingForm(current => ({ ...current, type: event.target.value as "owned_building" | "subcontractor" }))} className="mt-1 h-10 w-full rounded-xl border border-[#dce7ee] bg-white px-3 font-bold text-[#102a43]"><option value="owned_building">مبنى مملوك</option><option value="subcontractor">مقاول</option></select></label><label className="text-xs font-bold text-slate-500">الميزانية<Input type="number" min="0" value={buildingForm.budget} onChange={event => setBuildingForm(current => ({ ...current, budget: event.target.value }))} className="mt-1 rounded-xl" /></label></div><div className="flex flex-wrap gap-2"><Button type="button" onClick={submitBuildingForm} disabled={!buildingForm.name.trim() || !buildingForm.code.trim() || createBuilding.isPending || updateBuilding.isPending} className="rounded-xl bg-[#0d7180] font-black text-white hover:bg-[#0a5d69]">{editingBuildingId ? <Save className="ml-2 h-4 w-4" /> : <Plus className="ml-2 h-4 w-4" />}{editingBuildingId ? "حفظ التعديل" : "إضافة المبنى"}</Button>{editingBuildingId ? <Button type="button" variant="outline" onClick={resetBuildingForm} className="rounded-xl"><X className="ml-2 h-4 w-4" />إلغاء التعديل</Button> : null}</div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{(buildingsQuery.data ?? []).map(building => <div key={building.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#dce7ee] bg-[#f8fcfc] px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-black text-[#102a43]">{building.name}</p><p className="text-[11px] text-slate-400">{building.code} · {Number(building.budget ?? 0).toLocaleString("en-US")} ج.م</p></div><Button type="button" variant="outline" size="icon" onClick={() => editBuilding(building)} className="h-8 w-8 shrink-0 rounded-lg border-[#b9d4d9] text-[#0d4f62]" title={`تعديل ${building.name}`}><Pencil className="h-3.5 w-3.5" /></Button></div>)}</div></CardContent>
      </Card>
      )}

      <Card className="rounded-[1.5rem] border-[#dce7ee] shadow-sm"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-black text-[#102a43]">نطاق المقارنة</p><p className="mt-1 text-xs text-slate-400">يتم احتساب أذونات الصرف داخل الفترة فقط.</p></div><div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2"><label className="text-xs font-bold text-slate-500">من تاريخ<Input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className="mt-1 rounded-xl" /></label><label className="text-xs font-bold text-slate-500">إلى تاريخ<Input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className="mt-1 rounded-xl" /></label></div></CardContent></Card>

      <div className="sticky top-[4.5rem] z-20 rounded-2xl border border-[#dce7ee] bg-white/95 p-2 shadow-[0_10px_28px_rgba(18,44,84,0.08)] backdrop-blur-md">
        <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="أقسام تقرير المباني">
          {([{ id: "overview", label: "نظرة عامة", hint: "الإجماليات والمقارنة" }, { id: "items", label: "استهلاك الأصناف", hint: "تفصيل المواد" }, { id: "buildings", label: "إدارة المباني", hint: "إضافة وتعديل" }] as const).map(tab => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={`rounded-xl px-3 py-3 text-right transition ${activeTab === tab.id ? "bg-[#0d7180] text-white shadow-md" : "text-[#102a43] hover:bg-[#edf9f8]"}`}><span className="block text-sm font-black">{tab.label}</span><span className={`mt-1 block text-[10px] font-bold ${activeTab === tab.id ? "text-white/75" : "text-slate-400"}`}>{tab.hint}</span></button>)}
        </div>
      </div>
      {activeTab === "overview" && (<>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="عدد المباني" value={rows.filter(row => !row.isUnassigned).length} hint="المباني النشطة" tone="teal" />
        <SummaryCard label="إجمالي الحركات" value={totals.movements} hint="إذن صرف" tone="blue" />
        <SummaryCard label="إجمالي الكميات" value={quantity(totals.quantity)} hint="كمية مصروفة" tone="green" />
        <SummaryCard label="إجمالي التكلفة" value={money(totals.cost)} hint="قيمة الصرف" tone="amber" />
        <SummaryCard label="تجاوز الميزانية" value={overBudgetCount} hint="مبانٍ تحتاج مراجعة" tone={overBudgetCount ? "red" : "green"} />
      </div>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="rounded-[1.75rem] border-[#dce7ee] shadow-[0_18px_50px_rgba(18,44,84,0.06)]">
          <CardHeader className="border-b border-[#edf2f5]"><CardTitle className="text-lg font-black text-[#102a43]">إجمالي الاستهلاك حسب المبنى</CardTitle><p className="text-xs text-slate-400">إجمالي الكميات المصروفة خلال الفترة المحددة.</p></CardHeader>
          <CardContent className="p-4">{chartRows.length ? <div className="h-[330px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows} layout="vertical" margin={{ top: 8, right: 18, left: 12, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#e5eef1" horizontal={false} /><XAxis type="number" tickFormatter={value => quantity(value)} tick={{ fontSize: 11, fill: "#64748b" }} /><YAxis type="category" dataKey="shortName" width={120} tick={{ fontSize: 11, fill: "#102a43" }} /><Tooltip formatter={(value: unknown) => [quantity(value), "الكمية"]} labelFormatter={label => `المبنى: ${label}`} contentStyle={{ direction: "rtl", borderRadius: 12, borderColor: "#dce7ee" }} /><Bar dataKey="quantity" name="الكمية" fill="#0d7180" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></div> : <div className="flex h-[330px] items-center justify-center text-sm font-bold text-slate-400">لا توجد كميات مصروفة للرسم.</div>}</CardContent>
        </Card>
        <Card className="rounded-[1.75rem] border-[#dce7ee] shadow-[0_18px_50px_rgba(18,44,84,0.06)]">
          <CardHeader className="border-b border-[#edf2f5]"><CardTitle className="text-lg font-black text-[#102a43]">تكلفة الاستهلاك حسب المبنى</CardTitle><p className="text-xs text-slate-400">القيمة المالية للصرف مرتبة حسب أعلى مبنى استهلاكاً.</p></CardHeader>
          <CardContent className="p-4">{chartRows.length ? <div className="h-[330px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows} layout="vertical" margin={{ top: 8, right: 18, left: 12, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#e5eef1" horizontal={false} /><XAxis type="number" tickFormatter={value => moneyFormat.format(Number(value))} tick={{ fontSize: 11, fill: "#64748b" }} /><YAxis type="category" dataKey="shortName" width={120} tick={{ fontSize: 11, fill: "#102a43" }} /><Tooltip formatter={(value: unknown) => [money(value), "التكلفة"]} labelFormatter={label => `المبنى: ${label}`} contentStyle={{ direction: "rtl", borderRadius: 12, borderColor: "#dce7ee" }} /><Bar dataKey="cost" name="التكلفة" fill="#bd5147" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></div> : <div className="flex h-[330px] items-center justify-center text-sm font-bold text-slate-400">لا توجد تكاليف للرسم.</div>}</CardContent>
        </Card>
      </section>
      </>)}
      {activeTab === "items" && (
      <Card className="rounded-[1.75rem] border-[#dce7ee] shadow-[0_18px_50px_rgba(18,44,84,0.06)]">
        <CardHeader className="border-b border-[#edf2f5]"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><CardTitle className="text-lg font-black text-[#102a43]">استهلاك المبنى حسب الصنف</CardTitle><p className="mt-1 text-xs text-slate-400">اختر مبنى لعرض أنواع المواد والكميات المستخدمة داخله.</p></div><select value={selectedBuildingId} onChange={event => setSelectedBuildingId(event.target.value)} className="h-10 min-w-56 rounded-xl border border-[#dce7ee] bg-white px-3 text-sm font-bold text-[#102a43]" disabled={!buildingOptions.length}><option value="">اختر المبنى</option>{buildingOptions.map(row => <option key={row.buildingId} value={String(row.buildingId)}>{row.name}</option>)}</select></div></CardHeader>
        <CardContent className="p-4">{selectedItemRows.length ? <div className="grid gap-5 xl:grid-cols-2"><div><p className="mb-2 text-sm font-black text-[#0d7180]">الكميات حسب الصنف{selectedBuilding ? ` — ${selectedBuilding.name}` : ""}</p><div className="h-[360px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={selectedItemRows} layout="vertical" margin={{ top: 8, right: 18, left: 12, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#e5eef1" horizontal={false} /><XAxis type="number" tickFormatter={value => quantity(value)} tick={{ fontSize: 11, fill: "#64748b" }} /><YAxis type="category" dataKey="shortName" width={140} tick={{ fontSize: 11, fill: "#102a43" }} /><Tooltip formatter={(value: unknown) => [quantity(value), "الكمية"]} labelFormatter={label => `الصنف: ${label}`} contentStyle={{ direction: "rtl", borderRadius: 12, borderColor: "#dce7ee" }} /><Bar dataKey="quantity" name="الكمية" fill="#0d806c" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></div></div><div><p className="mb-2 text-sm font-black text-[#bd5147]">التكلفة حسب الصنف</p><div className="h-[360px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={selectedItemRows} layout="vertical" margin={{ top: 8, right: 18, left: 12, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#e5eef1" horizontal={false} /><XAxis type="number" tickFormatter={value => moneyFormat.format(Number(value))} tick={{ fontSize: 11, fill: "#64748b" }} /><YAxis type="category" dataKey="shortName" width={140} tick={{ fontSize: 11, fill: "#102a43" }} /><Tooltip formatter={(value: unknown) => [money(value), "التكلفة"]} labelFormatter={label => `الصنف: ${label}`} contentStyle={{ direction: "rtl", borderRadius: 12, borderColor: "#dce7ee" }} /><Bar dataKey="cost" name="التكلفة" fill="#bd5147" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></div></div></div> : <div className="p-10 text-center text-sm font-bold text-slate-400">اختر مبنى لديه حركات صرف لعرض استهلاك الأصناف.</div>}</CardContent>
      </Card>

      )}
      {activeTab === "overview" && (
      <Card className="overflow-hidden rounded-[1.75rem] border-[#dce7ee] shadow-[0_18px_50px_rgba(18,44,84,0.06)]"><CardHeader className="border-b border-[#edf2f5] bg-white"><CardTitle className="flex items-center gap-2 text-xl font-black text-[#102a43]"><WalletCards className="h-5 w-5 text-[#0d7180]" />تفصيل المقارنة حسب المبنى</CardTitle><p className="text-xs text-slate-400">الترتيب من الأعلى تكلفة إلى الأقل، مع إبقاء الصرف غير المرتبط ظاهراً للمراجعة.</p></CardHeader><CardContent className="p-0">{report.isLoading ? <div className="flex items-center justify-center gap-2 p-12 text-sm font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />جارٍ تحميل مقارنة المباني...</div> : report.error ? <div className="p-12 text-center text-sm font-bold text-red-600">تعذر تحميل تقرير مقارنة المباني.</div> : rows.length === 0 ? <div className="p-12 text-center text-sm font-bold text-slate-500">لا توجد مبانٍ نشطة أو أذونات صرف ضمن الفترة المحددة.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-right text-sm"><thead className="bg-[#f7fbfc] text-xs font-black text-slate-500"><tr><th className="px-5 py-4">المبنى</th><th className="px-5 py-4">الحركات</th><th className="px-5 py-4">الكمية المصروفة</th><th className="px-5 py-4">تكلفة الاستهلاك</th><th className="px-5 py-4">الميزانية</th><th className="px-5 py-4">المتبقي</th><th className="px-5 py-4">الاستخدام</th><th className="px-5 py-4">المقارنة البصرية</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{rows.map(row => { const over = row.budget > 0 && row.cost > row.budget; return <tr key={`${row.buildingId ?? "unassigned"}-${row.code}`} className="hover:bg-[#fbfdff]"><td className="px-5 py-4"><div className="font-black text-[#102a43]">{row.name}</div><div className="mt-1 text-xs text-slate-400">{row.code}{row.type ? ` · ${row.type === "subcontractor" ? "مقاول" : "مبنى مملوك"}` : ""}</div></td><td className="px-5 py-4 font-bold">{quantity(row.movements)}</td><td className="px-5 py-4 font-bold">{quantity(row.quantity)}</td><td className="px-5 py-4 font-black text-[#bd5147]">{money(row.cost)}</td><td className="px-5 py-4">{row.budget ? money(row.budget) : "—"}</td><td className={`px-5 py-4 font-black ${over ? "text-red-700" : "text-[#0d806c]"}`}>{row.budget ? money(row.remainingBudget) : "—"}</td><td className="px-5 py-4">{row.budgetUsagePercent == null ? <span className="text-slate-400">—</span> : <Badge className={over ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{row.budgetUsagePercent.toFixed(1)}%</Badge>}</td><td className="px-5 py-4"><div className="h-3 min-w-44 overflow-hidden rounded-full bg-[#e8f1f2]"><div className={`h-full rounded-full ${over ? "bg-[#bd5147]" : "bg-[#0d7180]"}`} style={{ width: `${Math.min(100, Number(row.cost) / highestCost * 100)}%` }} /></div></td></tr>; })}</tbody><tfoot className="border-t-2 border-[#dce7ee] bg-[#f7fbfc] font-black text-[#102a43]"><tr><td className="px-5 py-4">الإجمالي</td><td className="px-5 py-4">{quantity(totals.movements)}</td><td className="px-5 py-4">{quantity(totals.quantity)}</td><td className="px-5 py-4">{money(totals.cost)}</td><td className="px-5 py-4">{money(totals.budget)}</td><td className="px-5 py-4">{money(totals.remainingBudget)}</td><td className="px-5 py-4">{totals.budget ? `${(totals.cost / totals.budget * 100).toFixed(1)}%` : "—"}</td><td className="px-5 py-4"><TrendingDown className="h-5 w-5 text-[#0d7180]" /></td></tr></tfoot></table></div>}</CardContent></Card>
      )}
    </div>
  </DashboardLayout>;
}

function SummaryCard({ label, value, hint, tone }: { label: string; value: string | number; hint: string; tone: "teal" | "blue" | "green" | "amber" | "red" }) {
  const colors = { teal: "border-[#b9d4d9] bg-[#f0f8f8] text-[#0d7180]", blue: "border-blue-100 bg-blue-50 text-blue-700", green: "border-emerald-100 bg-emerald-50 text-emerald-700", amber: "border-amber-100 bg-amber-50 text-amber-700", red: "border-red-100 bg-red-50 text-red-700" };
  return <Card className={`rounded-2xl border ${colors[tone]}`}><CardContent className="p-4"><p className="text-xs font-bold opacity-75">{label}</p><p className="mt-2 text-2xl font-black">{value}</p><p className="mt-1 text-[11px] font-bold opacity-70">{hint}</p></CardContent></Card>;
}
