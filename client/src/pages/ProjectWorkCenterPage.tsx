import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowUpFromLine, Building2, CalendarDays, ChevronLeft, ChevronRight, Edit3, Loader2, Plus, RefreshCw, Warehouse } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useActiveProjectState } from "@/components/ProjectSwitcher";
import { PageHeader } from "@/components/patterns/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MovementDialog, type MovementRow } from "@/pages/InventoryPages";
import { cairoDateKey, formatCairoDateLabel, parseProjectWorkCenterLocation } from "@/lib/projectWorkCenter";
import { trpc } from "@/lib/trpc";

const FINANCIAL_PREFERENCE_KEY = "movement-financial-columns-v1";
const quantityFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
const moneyFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatQuantity = (value: unknown) => quantityFormat.format(Number(value ?? 0));
const formatMoney = (value: unknown) => `${moneyFormat.format(Number(value ?? 0))} EGP`;

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card className="border-[#dce7ee] bg-white shadow-[0_10px_28px_rgba(18,44,84,.055)]">
    <CardContent className="p-4 sm:p-5">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-2 truncate text-xl font-black text-[#0d4f62] sm:text-2xl" dir="ltr">{value}</p>
      <p className="mt-1 text-[10px] font-semibold text-slate-400">{detail}</p>
    </CardContent>
  </Card>;
}

export default function ProjectWorkCenterPage() {
  const utils = trpc.useUtils();
  const [location] = useLocation();
  const routeParams = useMemo(() => parseProjectWorkCenterLocation(location), [location]);
  const [day, setDay] = useState(() => routeParams.date ?? cairoDateKey());
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<MovementRow>();
  const activeProjectState = useActiveProjectState();
  const activeProjectQuery = trpc.projects.active.useQuery(undefined, { refetchOnWindowFocus: true });
  const activeProject = activeProjectState.resolved.project;
  const persistedProjectId = activeProjectQuery.data?.id ?? null;
  const requestedProjectUnavailable = routeParams.projectId != null &&
    !activeProjectState.isLoading &&
    (!activeProjectState.projectsAvailable || !activeProjectState.projects.some(project => project.id === routeParams.projectId));
  const waitingForRequestedProject = routeParams.projectId != null &&
    !requestedProjectUnavailable && persistedProjectId !== routeParams.projectId;
  const projectReady = activeProjectState.projectsAvailable
    ? Boolean(activeProject?.id && persistedProjectId === activeProject.id && !requestedProjectUnavailable && !waitingForRequestedProject && !activeProjectState.isSwitching)
    : routeParams.projectId == null;
  const permissions = trpc.permissions.mine.useQuery();
  const preferences = trpc.preferences.get.useQuery();
  const canWrite = permissions.data?.readOnly === false;
  const canViewFinancialDetails = permissions.data?.allowedReports.includes("warehouse-financial-details") ?? false;
  const financialPreferenceEnabled = preferences.data?.reportColumnOrder?.[FINANCIAL_PREFERENCE_KEY]?.includes("visible") ?? false;
  const showFinancialDetails = canViewFinancialDetails && financialPreferenceEnabled;
  const queryInput = useMemo(() => ({ page, pageSize: 50, fromDate: day || undefined, toDate: day || undefined }), [day, page]);
  const disbursements = trpc.disbursements.listPaged.useQuery(queryInput, {
    enabled: Boolean(projectReady && day),
    refetchOnWindowFocus: true,
  });
  const rows = (disbursements.data?.rows ?? []) as MovementRow[];
  const totalCount = disbursements.data?.total ?? 0;
  const pageCount = disbursements.data?.pageCount ?? 1;

  useEffect(() => {
    if (!routeParams.date) return;
    setDay(routeParams.date);
    setPage(1);
  }, [routeParams.date]);

  async function refreshAfterSave() {
    await Promise.all([
      utils.disbursements.listPaged.invalidate(),
      utils.dashboard.summary.invalidate(),
      utils.items.list.invalidate(),
      utils.items.warehouseStocks.invalidate(),
    ]);
  }

  const projectLabel = activeProject?.name || activeProject?.code || "المشروع النشط";
  const noActiveProject = !activeProjectState.isLoading && activeProjectState.projectsAvailable && !activeProject?.id;

  return <DashboardLayout>
    <div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-5 sm:space-y-7">
      <PageHeader
        eyebrow="PROJECT OPERATIONS / DAILY ISSUE"
        title="مركز العمل اليومي للمشروع"
        description="سجّل منصرفات اليوم للمشروع النشط وتابع الأذونات والكميات. تستخدم الشاشة أصناف المشروع ومخازنه وأكوادها نفسها، ولا تنشئ قوائم مكررة."
        actions={<Button type="button" onClick={() => { setEditingMovement(undefined); setDialogOpen(true); }} disabled={!projectReady || !canWrite} className="h-11 w-full rounded-xl bg-[#0d4f62] px-5 font-black text-white hover:bg-[#0a4150] sm:w-auto"><Plus className="h-4 w-4" />إذن صرف جديد</Button>}
      />

      <Card className="overflow-hidden rounded-2xl border-[#b9d4d9] bg-gradient-to-l from-[#eff8f7] via-white to-[#f8fbfc] shadow-[0_12px_32px_rgba(18,44,84,.06)]">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#0d7180] shadow-sm"><Building2 className="h-5 w-5" /></span>
            <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#0d7180]">المشروع النشط المحدد للنظام</p><p className="mt-1 truncate text-lg font-black text-[#102a43]">{activeProjectState.isLoading || waitingForRequestedProject ? "جارٍ تحميل المشروع..." : !activeProjectState.projectsAvailable ? "تعذر تحميل المشروع النشط" : projectLabel}</p>{activeProject?.code ? <p className="mt-0.5 font-mono text-[10px] text-slate-500">{activeProject.code}</p> : null}</div>
          </div>
          <label className="flex items-center gap-2 text-xs font-black text-[#102a43]"><CalendarDays className="h-4 w-4 text-[#0d7180]" /><span>تاريخ المتابعة</span><Input type="date" value={day} onChange={event => { setDay(event.target.value); setPage(1); }} className="h-11 w-[155px] rounded-xl border-[#cbdfe2] bg-white" aria-label="اختر تاريخ منصرفات المشروع" /></label>
          <p className="w-full text-[11px] font-semibold text-slate-500">عرض الحركات بتاريخ <strong className="text-[#0d4f62]">{formatCairoDateLabel(day)}</strong>. تغيير المشروع يتم من محدد المشروع في الشريط العلوي.</p>
        </CardContent>
      </Card>

      {noActiveProject ? <Card className="border-amber-200 bg-amber-50"><CardContent className="p-4 text-sm font-bold leading-7 text-amber-900">لم يتم اختيار مشروع نشط لهذا الحساب. اختر مشروعاً من محدد المشاريع أعلى الشاشة، أو اطلب من المدير تخصيص مشروع لحسابك.</CardContent></Card> : null}
      {!activeProjectState.projectsAvailable && !activeProjectState.isLoading ? <Card className="border-red-200 bg-red-50"><CardContent className="p-4 text-sm font-bold leading-7 text-red-800">تعذر قراءة المشروع النشط. حدّث الشاشة أو راجع صلاحية الوصول للمشاريع.</CardContent></Card> : null}
      {requestedProjectUnavailable ? <Card className="border-amber-200 bg-amber-50"><CardContent className="p-4 text-sm font-bold leading-7 text-amber-900">المشروع المرتبط بإشعار التقرير اليومي غير متاح لهذا الحساب. لم يتم عرض منصرفات مشروع آخر.</CardContent></Card> : null}
      {waitingForRequestedProject ? <Card className="border-sky-200 bg-sky-50"><CardContent className="flex items-center gap-2 p-4 text-sm font-bold text-sky-900"><Loader2 className="h-4 w-4 animate-spin" />جارٍ فتح منصرفات المشروع المرتبط بالإشعار...</CardContent></Card> : null}

      {projectReady ? <>
        <section className="grid gap-3 sm:grid-cols-3" aria-label="ملخص منصرفات المشروع">
          <SummaryCard label="أذونات / أسطر الصرف" value={formatQuantity(totalCount)} detail="ضمن المشروع والتاريخ المحددين" />
          <SummaryCard label="صافي الكمية المصروفة" value={formatQuantity(disbursements.data?.totalQuantity)} detail="الحركات السالبة والتصحيحات تخصم من الإجمالي" />
          <SummaryCard label="صافي قيمة الصرف" value={showFinancialDetails ? formatMoney(disbursements.data?.totalValue) : "مخفية"} detail={showFinancialDetails ? "حسب صلاحية وتفضيل التفاصيل المالية" : "التفاصيل المالية مخفية أو غير مصرح بها"} />
        </section>

        <Card className="overflow-hidden rounded-2xl border-[#dce7ee] shadow-[0_12px_32px_rgba(18,44,84,.055)]">
          <CardHeader className="flex flex-col gap-3 border-b border-[#edf2f5] bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div><CardTitle className="flex items-center gap-2 text-base font-black text-[#102a43] sm:text-lg"><ArrowUpFromLine className="h-5 w-5 text-[#bd5147]" />منصرفات {projectLabel} · {formatCairoDateLabel(day)}</CardTitle><p className="mt-1 text-[11px] text-slate-500">تظهر أذونات المشروع النشط فقط. المخازن والأصناف والأكواد تأتي من بيانات المشروع الحالية.</p></div>
            <div className="flex items-center gap-2"><Badge variant="outline" className="rounded-full border-[#cbdfe2] bg-white px-3 py-1 font-black text-[#0d4f62]">{formatQuantity(totalCount)} حركة</Badge><Button type="button" variant="outline" size="icon" onClick={() => void disbursements.refetch()} disabled={disbursements.isFetching} aria-label="تحديث الحركات" className="h-10 w-10 rounded-xl border-[#cbdfe2] text-[#0d4f62]"><RefreshCw className={`h-4 w-4 ${disbursements.isFetching ? "animate-spin" : ""}`} /></Button></div>
          </CardHeader>
          <CardContent className="p-0">
            {activeProjectState.isLoading || activeProjectState.isSwitching || disbursements.isLoading || disbursements.isFetching ? <div className="flex min-h-44 items-center justify-center gap-2 text-sm font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-[#0d7180]" />جاري تحميل منصرفات المشروع...</div> : disbursements.error ? <div className="p-5 text-sm font-bold text-red-700">تعذر تحميل الحركات. راجع صلاحية أذونات الصرف أو حاول التحديث.</div> : rows.length === 0 ? <div className="px-5 py-12 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f1f7f8] text-[#0d7180]"><ArrowUpFromLine className="h-5 w-5" /></span><h3 className="mt-3 text-sm font-black text-[#102a43]">لا توجد منصرفات في هذا التاريخ</h3><p className="mt-1 text-xs leading-6 text-slate-500">أنشئ إذن صرف جديداً؛ سيستخدم المشروع النشط ومخازنه وأصنافه المصرح بها تلقائياً.</p></div> : <>
              <div className="space-y-3 p-3 md:hidden">{rows.map(row => <article key={row.id} className="rounded-xl border border-[#e2ecee] bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-[#102a43]">{row.itemName || row.itemCode}</p><p className="mt-1 text-[10px] text-slate-500">كود {row.itemCode} · إذن {row.eznNum}</p></div>{canWrite ? <Button type="button" variant="outline" size="icon" onClick={() => { setEditingMovement(row); setDialogOpen(true); }} aria-label={`تعديل إذن ${row.eznNum}`} className="h-9 w-9 shrink-0 rounded-lg"><Edit3 className="h-4 w-4" /></Button> : null}</div><div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><div className="rounded-lg bg-[#f7fafb] p-2"><span className="block text-slate-400">الكمية</span><strong className="mt-1 block text-[#0d4f62]">{formatQuantity(row.quantity)}</strong></div><div className="rounded-lg bg-[#f7fafb] p-2"><span className="block text-slate-400">المخزن المصدر</span><strong className="mt-1 block truncate text-[#0d4f62]">{row.store || "غير محدد"}</strong></div>{showFinancialDetails ? <div className="col-span-2 rounded-lg bg-[#fff9f1] p-2"><span className="block text-slate-400">القيمة</span><strong className="mt-1 block text-[#945f1f]">{formatMoney(row.totalValue)}</strong></div> : null}</div></article>)}</div>
              <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-right text-sm"><thead className="bg-[#f7fafb] text-[11px] font-black text-slate-500"><tr><th className="px-4 py-3">رقم الإذن</th><th className="px-4 py-3">الصنف / الكود</th><th className="px-4 py-3">المخزن المصدر</th><th className="px-4 py-3">الكمية</th>{showFinancialDetails ? <th className="px-4 py-3">القيمة</th> : null}<th className="px-4 py-3">البيان</th>{canWrite ? <th className="px-4 py-3">إجراء</th> : null}</tr></thead><tbody className="divide-y divide-[#edf2f5]">{rows.map(row => <tr key={row.id} className="hover:bg-[#f8fbfc]"><td className="whitespace-nowrap px-4 py-3 font-bold text-slate-600">{row.eznNum}</td><td className="px-4 py-3"><strong className="block text-[#102a43]">{row.itemName || "صنف غير محدد"}</strong><span className="mt-1 block font-mono text-[10px] text-slate-400">{row.itemCode}</span></td><td className="px-4 py-3"><span className="inline-flex items-center gap-1.5"><Warehouse className="h-3.5 w-3.5 text-[#0d7180]" />{row.store || "غير محدد"}</span></td><td className="px-4 py-3 font-black text-[#0d4f62]">{formatQuantity(row.quantity)}</td>{showFinancialDetails ? <td className="px-4 py-3 font-bold text-[#945f1f]">{formatMoney(row.totalValue)}</td> : null}<td className="max-w-64 truncate px-4 py-3 text-xs text-slate-500" title={row.disburseType || row.notes || "—"}>{row.disburseType || row.notes || "—"}</td>{canWrite ? <td className="px-4 py-3"><Button type="button" variant="outline" size="icon" onClick={() => { setEditingMovement(row); setDialogOpen(true); }} aria-label={`تعديل إذن ${row.eznNum}`} className="h-9 w-9 rounded-lg"><Edit3 className="h-4 w-4" /></Button></td> : null}</tr>)}</tbody></table></div>
              <div className="flex items-center justify-between gap-3 border-t border-[#edf2f5] px-4 py-3"><Button type="button" variant="outline" size="sm" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page <= 1 || disbursements.isFetching} className="rounded-xl"><ChevronRight className="h-4 w-4" />السابق</Button><span className="text-[11px] font-bold text-slate-500">صفحة {page} من {pageCount}</span><Button type="button" variant="outline" size="sm" onClick={() => setPage(value => Math.min(pageCount, value + 1))} disabled={page >= pageCount || disbursements.isFetching} className="rounded-xl">التالي<ChevronLeft className="h-4 w-4" /></Button></div>
            </>}
          </CardContent>
        </Card>
      </> : null}

      {permissions.data?.readOnly ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-6 text-amber-900">حسابك للعرض فقط؛ يمكنك متابعة منصرفات اليوم لكن لا يمكنك تسجيل أو تعديل إذن.</p> : null}
      <MovementDialog kind="disbursements" open={dialogOpen} onOpenChange={setDialogOpen} editing={editingMovement} defaultDate={day} onSaved={() => { void refreshAfterSave(); }} />
    </div>
  </DashboardLayout>;
}
