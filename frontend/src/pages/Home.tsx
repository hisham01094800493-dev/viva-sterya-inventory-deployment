import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Boxes,
  CalendarDays,
  ChevronLeft,
  CircleCheck,
  Package,
  Plus,
  RefreshCcw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useLocation } from "wouter";
import { useMemo, useState } from "react";
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const numberFormatter = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 3 });
const formatNumber = (value: number | string | null | undefined) => numberFormatter.format(Number(value ?? 0));
const formatChartDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" }).format(parsed);
};

const movementChartConfig = {
  additions: { label: "الوارد", color: "#0d806c" },
  disbursements: { label: "المنصرف", color: "#bd5147" },
  transfers: { label: "التحويلات", color: "#d08a3b" },
};

function StatCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Boxes; tone: "teal" | "gold" | "rose" | "blue" }) {
  const tones = {
    teal: "bg-[#e7f3f1] text-[#0d4f62]",
    gold: "bg-[#fff4df] text-[#a96821]",
    rose: "bg-[#fff0ed] text-[#bd5147]",
    blue: "bg-[#eaf1fb] text-[#3c6395]",
  };
  return (
    <Card className="border-0 bg-white shadow-[0_10px_30px_rgba(18,44,84,0.055)] transition-transform duration-200 hover:-translate-y-0.5">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
          <span className="text-[11px] font-bold text-slate-400">{detail}</span>
        </div>
        <p className="mt-5 text-sm font-semibold text-slate-500">{label}</p>
        <p className="mt-1 text-3xl font-black tracking-tight text-[#102a43]">{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-2xl border border-dashed border-[#d7e5eb] bg-[#fbfdff] p-10 text-center text-sm text-slate-400">{label}</div>;
}

export default function Home() {
  const [, setLocation] = useLocation();
  const summary = trpc.dashboard.summary.useQuery();
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

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1500px] space-y-7">
        <section className="relative overflow-hidden rounded-[2rem] bg-[#0d4f62] px-6 py-7 text-white shadow-[0_20px_50px_rgba(13,79,98,0.2)] md:px-9 md:py-9">
          <div className="absolute -left-16 -top-20 h-64 w-64 rounded-full border-[28px] border-white/5" />
          <div className="absolute -bottom-28 right-24 h-72 w-72 rounded-full border-[36px] border-[#d08a3b]/10" />
          <div className="relative z-10 flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <div className="mb-4 flex items-center gap-2 text-[#f5c27b]"><CalendarDays className="h-4 w-4" /><span className="text-xs font-bold">{new Intl.DateTimeFormat("ar-EG", { dateStyle: "full" }).format(new Date())}</span></div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.3em] text-[#f5c27b]">SMART INVENTORY CONTROL ROOM</p>
              <h2 className="text-3xl font-black leading-tight tracking-tight md:text-4xl">المخزون تحت السيطرة،<br /><span className="text-[#f5c27b]">والقرار أسرع.</span></h2>
              <p className="mt-4 max-w-lg text-sm leading-7 text-white/70">تابع حركة الأصناف، راقب حد الطلب، ونفّذ الإضافات والصرف من مساحة عمل واحدة مصممة لفرق التشغيل.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setLocation("/additions")} className="h-11 rounded-xl bg-white px-4 font-bold text-[#0d4f62] hover:bg-[#f5f7f8]"><Plus className="ml-2 h-4 w-4" />إضافة مخزون</Button>
              <Button onClick={() => setLocation("/disbursements")} variant="outline" className="h-11 rounded-xl border-white/25 bg-white/10 px-4 font-bold text-white hover:bg-white/15 hover:text-white"><ArrowUpFromLine className="ml-2 h-4 w-4" />إنشاء إذن صرف</Button>
            </div>
          </div>
        </section>

        {summary.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-2xl bg-white" />)}</div>
        ) : summary.error ? (
          <Card className="border-red-100 bg-red-50"><CardContent className="flex items-center gap-3 p-5 text-sm font-bold text-red-700"><AlertTriangle className="h-5 w-5" />تعذر تحميل ملخص المخزون حالياً. تأكد من اتصال قاعدة البيانات ثم أعد المحاولة.</CardContent></Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="إجمالي الأصناف" value={formatNumber(summary.data?.stats.totalItems)} detail="صنف مسجل" icon={Boxes} tone="teal" />
              <StatCard label="أصناف تحتاج متابعة" value={formatNumber(summary.data?.stats.lowStockCount)} detail={`تحت ${summary.data?.thresholdPercentage ?? 20}%`} icon={AlertTriangle} tone="rose" />
              <StatCard label="الرصيد الحالي" value={formatNumber(summary.data?.stats.totalCurrentStock)} detail="وحدة متاحة" icon={Package} tone="blue" />
              <StatCard label="إجمالي الوارد" value={formatNumber(summary.data?.stats.totalIncoming)} detail="تراكمي" icon={TrendingUp} tone="gold" />
              <StatCard label="إجمالي المنصرف" value={formatNumber(summary.data?.stats.totalOutgoing)} detail="تراكمي" icon={TrendingDown} tone="rose" />
            </div>

            <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <Card className="overflow-hidden border-0 bg-[#102a43] text-white shadow-[0_15px_35px_rgba(16,42,67,0.14)]"><CardContent className="p-6"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-start"><div><div className="mb-3 flex items-center gap-2 text-[#f5c27b]"><CircleCheck className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-[0.18em]">OPERATIONAL PULSE</span></div><h3 className="text-2xl font-black">مؤشر استقرار المخزون</h3><p className="mt-2 max-w-xl text-sm leading-6 text-white/65">قياس سريع لنسبة الأصناف التي تعمل داخل الحدود الآمنة مقارنةً بالأصناف التي تحتاج إلى متابعة.</p></div><div className="text-left"><span className="text-4xl font-black text-[#f5c27b]">{healthPercent}%</span><p className="mt-1 text-xs text-white/55">نسبة الاستقرار الحالية</p></div></div><div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-l from-[#f5c27b] to-[#0d806c] transition-all duration-500" style={{ width: `${healthPercent}%` }} /></div><div className="mt-4 flex flex-wrap gap-5 text-xs font-bold text-white/65"><span>آمن: {formatNumber(Math.max(0, totalItems - lowStockCount))} صنف</span><span className="text-[#f5c27b]">يحتاج متابعة: {formatNumber(lowStockCount)} صنف</span><span>حد التنبيه: {summary.data?.thresholdPercentage ?? 20}%</span></div></CardContent></Card>
              <Card className="border-0 bg-white shadow-[0_10px_30px_rgba(18,44,84,0.055)]"><CardContent className="p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#d08a3b]">QUICK OPERATIONS</p><h3 className="mt-2 text-xl font-black text-[#102a43]">بوابة التشغيل السريع</h3><p className="mt-2 text-sm leading-6 text-slate-400">اختصر الطريق إلى أكثر المهام استخداماً في دورة المخزون اليومية.</p></div><RefreshCcw className="h-5 w-5 text-[#b9d4d9]" /></div><div className="mt-5 grid grid-cols-3 gap-2"><button onClick={() => setLocation("/items")} className="rounded-xl bg-[#f7fbfc] p-3 text-right transition-colors hover:bg-[#e8f1f2]"><Package className="mb-4 h-5 w-5 text-[#0d4f62]" /><span className="block text-xs font-black text-[#102a43]">دليل الأصناف</span></button><button onClick={() => setLocation("/additions")} className="rounded-xl bg-[#f7fbfc] p-3 text-right transition-colors hover:bg-[#e7f3f1]"><ArrowDownToLine className="mb-4 h-5 w-5 text-[#0d806c]" /><span className="block text-xs font-black text-[#102a43]">إضافة وارد</span></button><button onClick={() => setLocation("/alerts")} className="rounded-xl bg-[#fffaf9] p-3 text-right transition-colors hover:bg-[#fff0ed]"><AlertTriangle className="mb-4 h-5 w-5 text-[#bd5147]" /><span className="block text-xs font-black text-[#102a43]">مركز التنبيه</span></button></div></CardContent></Card>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
              <Card className="border-0 bg-white shadow-[0_10px_30px_rgba(18,44,84,0.055)]">
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

              <Card className="border-0 bg-white shadow-[0_10px_30px_rgba(18,44,84,0.055)]">
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
              <Card className="border-0 bg-white shadow-[0_10px_30px_rgba(18,44,84,0.055)]">
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

              <Card className="border-0 bg-white shadow-[0_10px_30px_rgba(18,44,84,0.055)]">
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
