import { useMemo, useState } from "react";
import { Download, Loader2, RefreshCcw, TrendingDown, WalletCards } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

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
  const report = trpc.reports.buildingCostComparison.useQuery({ fromDate: fromDate || undefined, toDate: toDate || undefined });
  const rows = report.data?.rows ?? [];
  const totals = report.data?.totals ?? { movements: 0, quantity: 0, cost: 0, budget: 0, remainingBudget: 0 };
  const highestCost = useMemo(() => Math.max(1, ...rows.map(row => Number(row.cost))), [rows]);
  const overBudgetCount = rows.filter(row => !row.isUnassigned && row.budget > 0 && row.cost > row.budget).length;

  return <DashboardLayout>
    <div className="mx-auto w-full max-w-[1500px] space-y-6" dir="rtl">
      <section className="overflow-hidden rounded-[1.75rem] border border-[#d6eaec] bg-gradient-to-l from-[#edf9f8] via-white to-[#fffaf0] p-5 shadow-[0_18px_50px_rgba(18,44,84,0.06)] sm:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-[#d08a3b]">BUILDINGS / COST ANALYTICS</p><h1 className="text-3xl font-black tracking-tight text-[#102a43]">مقارنة استهلاك المباني والتكاليف</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">يعرض التقرير قيمة وكميات أذونات الصرف المرتبطة بكل مبنى، مع مقارنة التكلفة بالميزانية المحددة لاكتشاف المباني الأعلى استهلاكاً قبل إعداد الشارتات والملخصات اليومية.</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void report.refetch()} disabled={report.isFetching} className="rounded-xl border-[#dce7ee] bg-white font-bold text-[#0d4f62]">{report.isFetching ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="ml-2 h-4 w-4" />}تحديث</Button><Button onClick={() => downloadCsv(rows as unknown as Array<Record<string, unknown>>, fromDate, toDate)} disabled={!rows.length} className="rounded-xl bg-[#0d4f62] font-bold text-white hover:bg-[#0a4150]"><Download className="ml-2 h-4 w-4" />تصدير CSV</Button></div>
        </div>
      </section>

      <Card className="rounded-[1.5rem] border-[#dce7ee] shadow-sm"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-black text-[#102a43]">نطاق المقارنة</p><p className="mt-1 text-xs text-slate-400">يتم احتساب أذونات الصرف داخل الفترة فقط.</p></div><div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2"><label className="text-xs font-bold text-slate-500">من تاريخ<Input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className="mt-1 rounded-xl" /></label><label className="text-xs font-bold text-slate-500">إلى تاريخ<Input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className="mt-1 rounded-xl" /></label></div></CardContent></Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="عدد المباني" value={rows.filter(row => !row.isUnassigned).length} hint="المباني النشطة" tone="teal" />
        <SummaryCard label="إجمالي الحركات" value={totals.movements} hint="إذن صرف" tone="blue" />
        <SummaryCard label="إجمالي الكميات" value={quantity(totals.quantity)} hint="كمية مصروفة" tone="green" />
        <SummaryCard label="إجمالي التكلفة" value={money(totals.cost)} hint="قيمة الصرف" tone="amber" />
        <SummaryCard label="تجاوز الميزانية" value={overBudgetCount} hint="مبانٍ تحتاج مراجعة" tone={overBudgetCount ? "red" : "green"} />
      </div>

      <Card className="overflow-hidden rounded-[1.75rem] border-[#dce7ee] shadow-[0_18px_50px_rgba(18,44,84,0.06)]"><CardHeader className="border-b border-[#edf2f5] bg-white"><CardTitle className="flex items-center gap-2 text-xl font-black text-[#102a43]"><WalletCards className="h-5 w-5 text-[#0d7180]" />تفصيل المقارنة حسب المبنى</CardTitle><p className="text-xs text-slate-400">الترتيب من الأعلى تكلفة إلى الأقل، مع إبقاء الصرف غير المرتبط ظاهراً للمراجعة.</p></CardHeader><CardContent className="p-0">{report.isLoading ? <div className="flex items-center justify-center gap-2 p-12 text-sm font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />جارٍ تحميل مقارنة المباني...</div> : report.error ? <div className="p-12 text-center text-sm font-bold text-red-600">تعذر تحميل تقرير مقارنة المباني.</div> : rows.length === 0 ? <div className="p-12 text-center text-sm font-bold text-slate-500">لا توجد مبانٍ نشطة أو أذونات صرف ضمن الفترة المحددة.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-right text-sm"><thead className="bg-[#f7fbfc] text-xs font-black text-slate-500"><tr><th className="px-5 py-4">المبنى</th><th className="px-5 py-4">الحركات</th><th className="px-5 py-4">الكمية المصروفة</th><th className="px-5 py-4">تكلفة الاستهلاك</th><th className="px-5 py-4">الميزانية</th><th className="px-5 py-4">المتبقي</th><th className="px-5 py-4">الاستخدام</th><th className="px-5 py-4">المقارنة البصرية</th></tr></thead><tbody className="divide-y divide-[#eef3f5]">{rows.map(row => { const over = row.budget > 0 && row.cost > row.budget; return <tr key={`${row.buildingId ?? "unassigned"}-${row.code}`} className="hover:bg-[#fbfdff]"><td className="px-5 py-4"><div className="font-black text-[#102a43]">{row.name}</div><div className="mt-1 text-xs text-slate-400">{row.code}{row.type ? ` · ${row.type === "subcontractor" ? "مقاول" : "مبنى مملوك"}` : ""}</div></td><td className="px-5 py-4 font-bold">{quantity(row.movements)}</td><td className="px-5 py-4 font-bold">{quantity(row.quantity)}</td><td className="px-5 py-4 font-black text-[#bd5147]">{money(row.cost)}</td><td className="px-5 py-4">{row.budget ? money(row.budget) : "—"}</td><td className={`px-5 py-4 font-black ${over ? "text-red-700" : "text-[#0d806c]"}`}>{row.budget ? money(row.remainingBudget) : "—"}</td><td className="px-5 py-4">{row.budgetUsagePercent == null ? <span className="text-slate-400">—</span> : <Badge className={over ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{row.budgetUsagePercent.toFixed(1)}%</Badge>}</td><td className="px-5 py-4"><div className="h-3 min-w-44 overflow-hidden rounded-full bg-[#e8f1f2]"><div className={`h-full rounded-full ${over ? "bg-[#bd5147]" : "bg-[#0d7180]"}`} style={{ width: `${Math.min(100, Number(row.cost) / highestCost * 100)}%` }} /></div></td></tr>; })}</tbody><tfoot className="border-t-2 border-[#dce7ee] bg-[#f7fbfc] font-black text-[#102a43]"><tr><td className="px-5 py-4">الإجمالي</td><td className="px-5 py-4">{quantity(totals.movements)}</td><td className="px-5 py-4">{quantity(totals.quantity)}</td><td className="px-5 py-4">{money(totals.cost)}</td><td className="px-5 py-4">{money(totals.budget)}</td><td className="px-5 py-4">{money(totals.remainingBudget)}</td><td className="px-5 py-4">{totals.budget ? `${(totals.cost / totals.budget * 100).toFixed(1)}%` : "—"}</td><td className="px-5 py-4"><TrendingDown className="h-5 w-5 text-[#0d7180]" /></td></tr></tfoot></table></div>}</CardContent></Card>
    </div>
  </DashboardLayout>;
}

function SummaryCard({ label, value, hint, tone }: { label: string; value: string | number; hint: string; tone: "teal" | "blue" | "green" | "amber" | "red" }) {
  const colors = { teal: "border-[#b9d4d9] bg-[#f0f8f8] text-[#0d7180]", blue: "border-blue-100 bg-blue-50 text-blue-700", green: "border-emerald-100 bg-emerald-50 text-emerald-700", amber: "border-amber-100 bg-amber-50 text-amber-700", red: "border-red-100 bg-red-50 text-red-700" };
  return <Card className={`rounded-2xl border ${colors[tone]}`}><CardContent className="p-4"><p className="text-xs font-bold opacity-75">{label}</p><p className="mt-2 text-2xl font-black">{value}</p><p className="mt-1 text-[11px] font-bold opacity-70">{hint}</p></CardContent></Card>;
}
