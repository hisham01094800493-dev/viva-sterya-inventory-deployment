import { useEffect, useRef, useState } from "react";
import { CalendarClock, CircleAlert, CircleCheckBig, Clock3, Download, FileClock, History, Loader2, Monitor, RefreshCw, RotateCcw, ShieldCheck, UploadCloud, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { permissionTemplates, type PermissionTemplateKey } from "@/lib/permissionTemplates";

const roles = [
  ["viewer", "قراءة فقط"], ["reports", "مشاهدة التقارير"], ["reviewer", "مراجعة"], ["operator", "إدخال الحركات"], ["user", "مستخدم تشغيلي"], ["manager", "مدير"], ["admin", "مدير عام"],
] as const;

const roleDescriptions: Record<(typeof roles)[number][0], string> = {
  viewer: "مشاهدة الأصناف والمخزون والتقارير دون إضافة أو تعديل أو حذف",
  reports: "الوصول إلى التقارير والمراجعة دون تعديل الأرصدة",
  reviewer: "المراجعة والتدقيق دون إنشاء حركات",
  operator: "إضافة حركات المخزون وتحديثها دون إدارة المستخدمين",
  user: "صلاحيات تشغيلية أساسية حسب إعداد النظام",
  manager: "إدارة تشغيلية موسعة",
  admin: "صلاحيات كاملة وإدارة المستخدمين",
};

const permissionScreens = [["dashboard", "لوحة التحكم"], ["inventory", "الأصناف والمخزون"], ["additions", "الإضافات"], ["disbursements", "الصرف"], ["transfers", "التحويلات والمرتجعات"], ["suppliers", "الموردون"], ["customers", "العملاء والجهات"], ["reports", "التقارير"], ["alerts", "التنبيهات"], ["chat", "محادثات فريق العمل"], ["stock-adjustments", "التسويات"], ["settings", "الإعدادات"]] as const;
const permissionReports = [["inventory-summary", "ملخص المخزون"], ["movement-reports", "تقارير الحركات"], ["item-card", "كارت الصنف"], ["supplier-account", "كشف حساب الموردين"], ["customer-account", "كشف حساب العملاء"], ["adjustments", "تقرير التسويات"], ["warehouse-financial-details", "التفاصيل المالية للمخازن"]] as const;

function downloadJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

type PermissionEditorProps = {
  userId: number;
  users: Array<{ id: number; name: string | null; email: string | null }>;
  records: Array<{ userId: number; allowedScreens: string; allowedReports: string; readOnly: boolean }>;
  pending: boolean;
  onClose: () => void;
  onSave: (input: any) => Promise<void>;
  onPreview: () => void;
};

function PermissionEditor({ userId, users, records, pending, onClose, onSave, onPreview }: PermissionEditorProps) {
  const record = records.find(item => item.userId === userId);
  const [screens, setScreens] = useState<string[]>(() => { try { return JSON.parse(record?.allowedScreens || "[]"); } catch { return ["dashboard", "inventory", "reports", "alerts", "chat"]; } });
  const [reports, setReports] = useState<string[]>(() => { try { return JSON.parse(record?.allowedReports || "[]"); } catch { return ["inventory-summary", "movement-reports", "item-card", "supplier-account", "customer-account"]; } });
  const [readOnly, setReadOnly] = useState(record?.readOnly ?? true);
  useEffect(() => {
    try { setScreens(JSON.parse(record?.allowedScreens || "[]")); } catch { setScreens(["dashboard", "inventory", "reports", "alerts", "chat"]); }
    try { setReports(JSON.parse(record?.allowedReports || "[]")); } catch { setReports(["inventory-summary", "movement-reports", "item-card", "supplier-account", "customer-account"]); }
    setReadOnly(record?.readOnly ?? true);
  }, [userId, record?.allowedScreens, record?.allowedReports, record?.readOnly]);
  const user = users.find(item => item.id === userId);
  const toggle = (value: string, values: string[], setter: (next: string[]) => void) => setter(values.includes(value) ? values.filter(item => item !== value) : [...values, value]);
  const applyTemplate = (key: PermissionTemplateKey) => { const template = permissionTemplates[key]; setScreens([...template.screens]); setReports([...template.reports]); setReadOnly(template.readOnly); };
  return <div className="mt-5 rounded-2xl border border-[#b9d4d9] bg-[#f7fbfc] p-4 shadow-inner"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black text-[#102a43]">تخصيص صلاحيات: {user?.name || user?.email || "المستخدم"}</h3><p className="mt-1 text-xs leading-5 text-slate-500">حدد الشاشات والتقارير التي يستطيع هذا الحساب الوصول إليها.</p></div><Button type="button" variant="ghost" onClick={onClose}>إغلاق</Button></div><label className="mt-4 flex items-center gap-2 text-sm font-bold text-[#0d4f62]"><input type="checkbox" checked={readOnly} onChange={event => setReadOnly(event.target.checked)} /> حساب قراءة فقط: يمنع الإضافة والتعديل والحذف</label><div className="mt-4 flex flex-wrap items-center gap-2"><span className="text-xs font-black text-slate-500">قوالب سريعة:</span>{(Object.keys(permissionTemplates) as PermissionTemplateKey[]).map(key => <Button key={key} type="button" variant="outline" className="rounded-xl px-3 py-1.5 text-xs" onClick={() => applyTemplate(key)}>{permissionTemplates[key].label}</Button>)}</div><div className="mt-4 grid gap-4 lg:grid-cols-2"><div><h4 className="mb-2 text-sm font-black text-[#102a43]">الشاشات</h4><div className="grid gap-2 sm:grid-cols-2">{permissionScreens.map(([value, label]) => <label key={value} className="flex items-center gap-2 rounded-xl bg-white p-2 text-sm"><input type="checkbox" checked={screens.includes(value)} onChange={() => toggle(value, screens, setScreens)} />{label}</label>)}</div></div><div><h4 className="mb-2 text-sm font-black text-[#102a43]">التقارير</h4><div className="grid gap-2 sm:grid-cols-2">{permissionReports.map(([value, label]) => <label key={value} className="flex items-center gap-2 rounded-xl bg-white p-2 text-sm"><input type="checkbox" checked={reports.includes(value)} onChange={() => toggle(value, reports, setReports)} />{label}</label>)}</div></div></div><div className="mt-4 flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={screens.length === 0} onClick={onPreview}>تجربة العرض كمستخدم</Button><Button type="button" disabled={pending || screens.length === 0} onClick={() => void onSave({ userId, allowedScreens: screens, allowedReports: reports, readOnly })}>{pending ? "جارٍ الحفظ..." : "حفظ الصلاحيات"}</Button></div></div>;
}

export default function GovernancePage() {
  const [tab, setTab] = useState<"users" | "audit" | "shares" | "logins" | "backup" | "backups" | "backup-center" | "reset">(() => { const requested = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null; return requested === "reset" || requested === "backups" || requested === "backup-center" || requested === "logins" || requested === "shares" ? requested : "users"; });
  const fileRef = useRef<HTMLInputElement>(null);
  const usersQuery = trpc.governance.users.useQuery(undefined, { enabled: tab === "users" });
  const permissionsQuery = trpc.permissions.list.useQuery(undefined, { enabled: tab === "users" });
  const updatePermissions = trpc.permissions.update.useMutation({ onSuccess: () => permissionsQuery.refetch() });
  const [selectedPermissionUserId, setSelectedPermissionUserId] = useState<number | null>(null);
  const auditQuery = trpc.governance.audit.useQuery(undefined, { enabled: tab === "audit" });
  const shareActivityQuery = trpc.governance.shareActivity.useQuery(undefined, { enabled: tab === "shares" });
  const loginLogsQuery = trpc.governance.loginLogs.useQuery(undefined, { enabled: tab === "logins" });
  const backupList = trpc.governance.backupList.useQuery(undefined, { enabled: tab === "backups" || tab === "backup-center" });
  const backupVerificationConfig = trpc.governance.backupVerificationConfig.useQuery(undefined, { enabled: tab === "backup-center" });
  const backupVerificationRuns = trpc.governance.backupVerificationRuns.useQuery(undefined, { enabled: tab === "backup-center" });
  const backupCreate = trpc.governance.backupCreate.useMutation();
  const backupVerificationRunNow = trpc.governance.backupVerificationRunNow.useMutation();
  const backupVerificationRunIsolatedFull = trpc.governance.backupVerificationRunIsolatedFull.useMutation();
  const backupVerificationSetSchedule = trpc.governance.backupVerificationSetSchedule.useMutation();
  const backupCleanupExpired = trpc.governance.backupCleanupExpired.useMutation();
  const backupEmailTest = trpc.governance.backupEmailTest.useMutation();
  const utils = trpc.useUtils();
  const updateRole = trpc.governance.updateUserRole.useMutation({ onSuccess: () => usersQuery.refetch() });
  const restore = trpc.governance.backupRestore.useMutation();
  const restoreRecord = trpc.governance.backupRestoreRecord.useMutation({ onSuccess: () => backupList.refetch() });
  const clearShareActivity = trpc.governance.clearShareActivity.useMutation({ onSuccess: () => shareActivityQuery.refetch() });
  const clearLoginActivity = trpc.governance.clearLoginActivity.useMutation({ onSuccess: () => loginLogsQuery.refetch() });
  const resetOperationalData = trpc.governance.resetOperationalData.useMutation();

  async function exportBackup() {
    try { const result = await backupCreate.mutateAsync(); downloadJson(result.snapshot, result.record.fileName); await backupList.refetch(); toast.success("تم إنشاء النسخة وحفظها في سجل النسخ الاحتياطية"); } catch (error: any) { toast.error(error?.message || "تعذر إنشاء النسخة الاحتياطية"); }
  }

  async function runBackupVerification() {
    try {
      const result = await backupVerificationRunNow.mutateAsync();
      await Promise.all([backupVerificationRuns.refetch(), backupVerificationConfig.refetch()]);
      if (result.status === "passed") toast.success("نجح اختبار الاستعادة الآمن؛ لم تُحفظ أي تغييرات في الإنتاج");
      else toast.warning(result.message || "اكتمل الاختبار مع حالة تحتاج مراجعة");
    } catch (error: any) { toast.error(error?.message || "تعذر تنفيذ اختبار الاستعادة الآمن"); }
  }

  async function runIsolatedFullRestore() {
    if (!window.confirm("سيتم إنشاء قاعدة اختبار منفصلة واستعادة أحدث نسخة كاملة بداخلها. لن تتغير بيانات الإنتاج. قد تستغرق العملية دقيقة؛ هل تريد المتابعة؟")) return;
    try {
      const result = await backupVerificationRunIsolatedFull.mutateAsync();
      await Promise.all([backupVerificationRuns.refetch(), backupVerificationConfig.refetch()]);
      if (result.status === "passed") toast.success("نجحت الاستعادة الكاملة في قاعدة الاختبار وتطابقت جميع أعداد الصفوف");
      else toast.warning(result.message || "اكتملت الاستعادة الكاملة مع حالة تحتاج مراجعة");
    } catch (error: any) { toast.error(error?.message || "تعذرت الاستعادة الكاملة في قاعدة الاختبار"); }
  }

  async function cleanupExpiredBackups() {
    if (!window.confirm("سيُزال من السجل كل ملف نسخة تجاوز 30 يومًا، مع الاحتفاظ بأحدث نسخة دائمًا. هل تريد المتابعة؟")) return;
    try {
      const result = await backupCleanupExpired.mutateAsync();
      await backupList.refetch();
      toast.success(result.deleted ? `تم تنظيف ${result.deleted} نسخة منتهية من السجل` : "لا توجد نسخ منتهية للتنظيف");
    } catch (error: any) { toast.error(error?.message || "تعذر تنظيف النسخ المنتهية"); }
  }

  async function sendBackupEmailTest() {
    if (!window.confirm("سيُرسل بريد اختبار فعلي إلى بريد المدير للتحقق من الإعدادات. هل تريد المتابعة؟")) return;
    try {
      await backupEmailTest.mutateAsync();
      toast.success("تم إرسال بريد الاختبار إلى بريد المدير");
    } catch (error: any) { toast.error(error?.message || "تعذر إرسال بريد الاختبار. راجع إعدادات SMTP."); }
  }

  async function setBackupVerificationSchedule(enabled: boolean) {
    try {
      const result = await backupVerificationSetSchedule.mutateAsync({ enabled, cronExpression: "0 0 2 * * 0" });
      await backupVerificationConfig.refetch();
      toast.success(enabled ? `تم تفعيل الاختبار الأسبوعي. الموعد التالي: ${result.nextExecutionAt ? new Date(result.nextExecutionAt).toLocaleString("ar-EG") : "سيظهر قريبًا"}` : "تم إيقاف الاختبار الدوري");
    } catch (error: any) { toast.error(error?.message || "تعذر تحديث جدولة اختبار الاستعادة"); }
  }

  async function downloadBackup(id: number) {
    try { const result = await utils.governance.backupDownload.fetch({ id }); downloadJson(result.snapshot, result.record.fileName); } catch (error: any) { toast.error(error?.message || "تعذر تنزيل النسخة الاحتياطية"); }
  }

  async function restoreSavedBackup(id: number, fileName: string) {
    if (!window.confirm(`سيتم دمج النسخة «${fileName}» دون حذف البيانات الحالية. هل تريد المتابعة؟`)) return;
    try { await restoreRecord.mutateAsync({ id }); toast.success("تمت استعادة النسخة ودمجها دون حذف البيانات الحالية"); } catch (error: any) { toast.error(error?.message || "تعذر استعادة النسخة الاحتياطية"); }
  }

  async function resetForNewUse() {
    const confirmation = window.prompt("للتأكيد اكتب العبارة التالية حرفياً: ابدأ استخدام جديد");
    if (confirmation !== "ابدأ استخدام جديد") return;
    if (!window.confirm("سيتم إنشاء نسخة احتياطية تلقائياً ثم حذف الأصناف والحركات والعملاء والموردين. المستخدمون والصلاحيات والإعدادات وسجل التدقيق ستبقى. هل تريد المتابعة؟")) return;
    try {
      const result = await resetOperationalData.mutateAsync({ confirmation: "ابدأ استخدام جديد", backupConfirmed: true });
      downloadJson(result.snapshot, `smart-inventory-pre-reset-backup-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success(`تم بدء استخدام جديد وحُفظت نسخة احتياطية. حُذف ${result.counts.items} صنفاً و${result.counts.additions + result.counts.disbursements + result.counts.transfers} حركة.`);
    } catch (error: any) { toast.error(error?.message || "تعذر إعادة تهيئة بيانات الاستخدام"); }
  }

  function importBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const snapshot = JSON.parse(String(reader.result));
        if (!window.confirm("سيتم دمج بيانات النسخة الاحتياطية دون حذف البيانات الحالية. هل تريد المتابعة؟")) return;
        await restore.mutateAsync({ snapshot });
        toast.success("تم دمج النسخة الاحتياطية دون حذف البيانات الحالية");
      } catch (error: any) { toast.error(error?.message || "ملف النسخة الاحتياطية غير صالح"); }
    };
    reader.readAsText(file);
  }

  return <DashboardLayout><div className="mx-auto w-full max-w-[1500px] space-y-7" dir="rtl">
    <div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-[#d08a3b]">GOVERNANCE / CONTROL</p><h1 className="text-3xl font-black tracking-tight text-[#102a43]">الحماية والنسخ الاحتياطي</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">إدارة الأدوار، مراجعة سجل العمليات، وإنشاء نسخ احتياطية قابلة للتنزيل والاستعادة بطريقة دمج غير تدميرية.</p></div>
    <div className="grid gap-3 md:grid-cols-8"><TabButton active={tab === "users"} onClick={() => setTab("users")} icon={<Users className="h-5 w-5" />} label="صلاحيات المستخدمين" /><TabButton active={tab === "audit"} onClick={() => setTab("audit")} icon={<History className="h-5 w-5" />} label="سجل التدقيق" /><TabButton active={tab === "shares"} onClick={() => setTab("shares")} icon={<UploadCloud className="h-5 w-5" />} label="سجل المشاركة" /><TabButton active={tab === "logins"} onClick={() => setTab("logins")} icon={<Monitor className="h-5 w-5" />} label="سجل الدخول" /><TabButton active={tab === "backup-center"} onClick={() => setTab("backup-center")} icon={<ShieldCheck className="h-5 w-5" />} label="مركز النسخ" /><TabButton active={tab === "backup"} onClick={() => setTab("backup")} icon={<UploadCloud className="h-5 w-5" />} label="استعادة/دمج" /><TabButton active={tab === "backups"} onClick={() => setTab("backups")} icon={<History className="h-5 w-5" />} label="النسخ السابقة" /><TabButton active={tab === "reset"} onClick={() => setTab("reset")} icon={<RotateCcw className="h-5 w-5" />} label="بدء استخدام جديد" /></div>
    {tab === "users" && <Card className="border-0 bg-white/85 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-xl font-black text-[#102a43]"><Users className="h-5 w-5 text-[#0d7180]" />أدوار المستخدمين</CardTitle></CardHeader><CardContent>{usersQuery.isLoading ? <Loading /> : usersQuery.error ? <Notice text="هذه الصفحة متاحة للمدير العام فقط." /> : <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-right"><thead><tr className="border-b text-xs text-slate-400"><th className="p-3">المستخدم</th><th className="p-3">البريد</th><th className="p-3">آخر دخول</th><th className="p-3">الدور والصلاحية</th></tr></thead><tbody>{(usersQuery.data ?? []).map(user => <tr key={user.id} className="border-b border-slate-100"><td className="p-3 font-bold text-[#102a43]">{user.name || "مستخدم بدون اسم"}</td><td className="p-3 text-sm text-slate-500">{user.email || "—"}</td><td className="p-3 text-sm text-slate-500">{new Date(user.lastSignedIn).toLocaleString("en-US")}</td><td className="p-3"><div className="space-y-1"><select value={user.role} disabled={updateRole.isPending} onChange={async event => { try { await updateRole.mutateAsync({ id: user.id, role: event.target.value as typeof roles[number][0] }); toast.success("تم تحديث الدور"); } catch (error: any) { toast.error(error?.message || "تعذر تحديث الدور"); } }} className="rounded-xl border border-[#dce7ee] bg-white px-3 py-2 text-sm font-bold text-[#0d4f62]">{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><p className="max-w-[280px] text-[11px] leading-5 text-slate-400">{roleDescriptions[user.role as keyof typeof roleDescriptions] || "صلاحية غير محددة"}</p><Button type="button" variant="outline" className="mt-2 rounded-lg px-2 py-1 text-[11px]" onClick={() => setSelectedPermissionUserId(user.id)}>تخصيص الشاشات والتقارير</Button></div></td></tr>)}</tbody></table></div>}{selectedPermissionUserId && <PermissionEditor userId={selectedPermissionUserId} users={usersQuery.data ?? []} records={permissionsQuery.data ?? []} pending={updatePermissions.isPending} onClose={() => setSelectedPermissionUserId(null)} onSave={async input => { try { await updatePermissions.mutateAsync(input); toast.success("تم حفظ صلاحيات المستخدم"); setSelectedPermissionUserId(null); } catch (error: any) { toast.error(error?.message || "تعذر حفظ الصلاحيات"); } }} onPreview={() => { const selected = (usersQuery.data ?? []).find(item => item.id === selectedPermissionUserId); const record = (permissionsQuery.data ?? []).find(item => item.userId === selectedPermissionUserId); if (!selected || !record) { toast.error("احفظ صلاحيات المستخدم أولاً قبل بدء المعاينة"); return; } let allowedScreens: string[] = []; let allowedReports: string[] = []; try { allowedScreens = JSON.parse(record.allowedScreens); allowedReports = JSON.parse(record.allowedReports); } catch { toast.error("تعذر قراءة صلاحيات المستخدم"); return; } window.localStorage.setItem("smart-inventory-preview-permissions", JSON.stringify({ userId: selected.id, userName: selected.name, userEmail: selected.email, allowedScreens, allowedReports, readOnly: record.readOnly })); window.location.assign("/"); }} />}</CardContent></Card>}
    {tab === "audit" && <Card className="border-0 bg-white/85 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-xl font-black text-[#102a43]"><FileClock className="h-5 w-5 text-[#0d7180]" />سجل التدقيق</CardTitle></CardHeader><CardContent>{auditQuery.isLoading ? <Loading /> : auditQuery.error ? <Notice text="تعذر تحميل سجل التدقيق أو لا تملك الصلاحية." /> : <div className="space-y-3">{(auditQuery.data ?? []).map(log => <div key={log.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-black text-[#102a43]">{log.userName || "مستخدم"} · {log.action} · {log.entity}</span><time className="text-xs text-slate-400">{new Date(log.createdAt).toLocaleString("en-US")}</time></div>{log.entityId && <p className="mt-1 text-xs text-slate-500">رقم السجل: {log.entityId}</p>}{log.details && <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-slate-400">{log.details}</pre>}</div>)}</div>}</CardContent></Card>}
    {tab === "shares" && <Card className="border-0 bg-white/85 shadow-sm"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="flex items-center gap-2 text-xl font-black text-[#102a43]"><UploadCloud className="h-5 w-5 text-[#0d7180]" />سجل مشاركة الملفات</CardTitle><Button type="button" variant="outline" disabled={clearShareActivity.isPending} onClick={async () => { if (!window.confirm("سيتم حذف سجل المشاركات فقط، مع الاحتفاظ بسجل التدقيق العام. هل تريد المتابعة؟")) return; try { const result = await clearShareActivity.mutateAsync(); toast.success(`تم مسح ${result.deleted} عملية مشاركة`); } catch (error: any) { toast.error(error?.message || "تعذر مسح سجل المشاركات"); } }} className="rounded-xl border-red-200 text-red-700 hover:bg-red-50">{clearShareActivity.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}مسح سجل المشاركات</Button></div></CardHeader><CardContent>{shareActivityQuery.isLoading ? <Loading /> : shareActivityQuery.error ? <Notice text="تعذر تحميل سجل المشاركة أو لا تملك الصلاحية." /> : (shareActivityQuery.data ?? []).length === 0 ? <div className="rounded-2xl border border-dashed border-[#b9d4d9] p-10 text-center text-sm font-bold text-slate-500">لا توجد عمليات مشاركة مسجلة بعد.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-right"><thead><tr className="border-b text-xs text-slate-400"><th className="p-3">المستخدم</th><th className="p-3">الملف</th><th className="p-3">التقرير</th><th className="p-3">القناة</th><th className="p-3">النتيجة</th><th className="p-3">الوقت</th></tr></thead><tbody>{(shareActivityQuery.data ?? []).map(log => { let details: Record<string, string> = {}; try { details = JSON.parse(log.details || "{}"); } catch {} return <tr key={log.id} className="border-b border-slate-100 align-top"><td className="p-3 font-bold text-[#102a43]">{log.userName || "مستخدم"}</td><td className="p-3 text-sm text-slate-500">{details.fileName || log.entityId || "—"}<span className="mr-2 rounded-full bg-[#e8f1f2] px-2 py-1 text-[10px] font-black text-[#0d4f62]">{String(log.entity).toLowerCase() === "excel" ? "Excel" : "PDF"}</span></td><td className="p-3 text-sm text-slate-500">{details.reportTitle || "—"}</td><td className="p-3 text-sm text-slate-500">{details.channel === "whatsapp" ? "واتساب" : details.channel === "email" ? "البريد الإلكتروني" : "مشاركة الجهاز"}</td><td className="p-3 text-sm font-bold text-slate-500">{details.status === "shared" ? "تمت المشاركة" : details.status === "cancelled" ? "أُلغيَت" : details.status === "failed" ? "فشلت" : "غير مدعومة"}</td><td className="p-3 text-sm text-slate-500">{new Date(log.createdAt).toLocaleString("en-US")}</td></tr>; })}</tbody></table></div>}</CardContent></Card>}
    {tab === "logins" && <Card className="border-0 bg-white/85 shadow-sm"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="flex items-center gap-2 text-xl font-black text-[#102a43]"><Monitor className="h-5 w-5 text-[#0d7180]" />سجل دخول المستخدمين</CardTitle><Button type="button" variant="outline" disabled={clearLoginActivity.isPending} onClick={async () => { if (!window.confirm("سيتم حذف سجل الدخول فقط، مع الاحتفاظ بسجل التدقيق العام. هل تريد المتابعة؟")) return; try { const result = await clearLoginActivity.mutateAsync(); toast.success(`تم مسح ${result.deleted} سجل دخول`); } catch (error: any) { toast.error(error?.message || "تعذر مسح سجل الدخول"); } }} className="rounded-xl border-red-200 text-red-700 hover:bg-red-50">{clearLoginActivity.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}مسح سجل الدخول</Button></div></CardHeader><CardContent>{loginLogsQuery.isLoading ? <Loading /> : loginLogsQuery.error ? <Notice text="تعذر تحميل سجل الدخول أو لا تملك الصلاحية." /> : (loginLogsQuery.data ?? []).length === 0 ? <div className="rounded-2xl border border-dashed border-[#b9d4d9] p-10 text-center text-sm font-bold text-slate-500">لا توجد عمليات دخول مسجلة بعد.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-right"><thead><tr className="border-b text-xs text-slate-400"><th className="p-3">المستخدم</th><th className="p-3">البريد</th><th className="p-3">وقت الدخول</th><th className="p-3">الجهاز</th><th className="p-3">طريقة الدخول</th><th className="p-3">المتصفح</th><th className="p-3">عنوان الشبكة</th></tr></thead><tbody>{(loginLogsQuery.data ?? []).map(log => <tr key={log.id} className="border-b border-slate-100 align-top"><td className="p-3 font-bold text-[#102a43]">{log.userName || "مستخدم"}</td><td className="p-3 text-sm text-slate-500">{log.email || "—"}</td><td className="p-3 text-sm text-slate-500">{new Date(log.loggedInAt).toLocaleString("en-US")}</td><td className="p-3 text-sm text-slate-500">{log.deviceType === "mobile" ? "هاتف" : log.deviceType === "tablet" ? "جهاز لوحي" : "كمبيوتر"}</td><td className="p-3 text-sm text-slate-500">{log.loginMethod || "—"}</td><td className="max-w-[320px] whitespace-normal break-words p-3 text-xs leading-5 text-slate-400">{log.userAgent || "—"}</td><td className="p-3 font-mono text-xs text-slate-400">{log.ipAddress || "—"}</td></tr>)}</tbody></table></div>}</CardContent></Card>}
    {tab === "backup-center" && <BackupOperationsCenter backups={backupList.data ?? []} backupsLoading={backupList.isLoading} backupsError={Boolean(backupList.error)} verificationConfig={backupVerificationConfig.data} verificationRuns={backupVerificationRuns.data ?? []} verificationLoading={backupVerificationRuns.isLoading || backupVerificationConfig.isLoading} verificationError={Boolean(backupVerificationRuns.error || backupVerificationConfig.error)} creating={backupCreate.isPending} testing={backupVerificationRunNow.isPending} isolatedTesting={backupVerificationRunIsolatedFull.isPending} cleaning={backupCleanupExpired.isPending} testingEmail={backupEmailTest.isPending} scheduling={backupVerificationSetSchedule.isPending} onCreate={exportBackup} onRunTest={runBackupVerification} onRunIsolatedFull={runIsolatedFullRestore} onCleanupExpired={cleanupExpiredBackups} onSendEmailTest={sendBackupEmailTest} onRefresh={() => { void backupList.refetch(); void backupVerificationRuns.refetch(); void backupVerificationConfig.refetch(); }} onSetSchedule={setBackupVerificationSchedule} onDownload={downloadBackup} />}
    {tab === "reset" && <Card className="border-0 bg-white/85 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-xl font-black text-red-700"><RotateCcw className="h-5 w-5" />بدء استخدام جديد</CardTitle></CardHeader><CardContent><div className="rounded-2xl border-2 border-red-200 bg-red-50 p-5"><h3 className="font-black text-red-800">حذف بيانات التشغيل الحالية</h3><p className="mt-2 text-sm leading-7 text-red-700">سيُنشئ النظام نسخة احتياطية تلقائياً للتنزيل، ثم يحذف الأصناف وجميع حركات الإضافة والصرف والتحويل والمرتجع والعملاء والموردين. ستبقى حسابات المستخدمين والصلاحيات والإعدادات وسجل التدقيق.</p><p className="mt-3 text-xs font-bold text-red-700">لا يمكن التراجع من داخل النظام بعد التنفيذ. احتفظ بالنسخة الاحتياطية قبل بدء الاستخدام الجديد.</p><Button onClick={() => void resetForNewUse()} disabled={resetOperationalData.isPending} className="mt-5 rounded-xl bg-red-700 text-white hover:bg-red-800">{resetOperationalData.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إنشاء نسخة وحذف بيانات التشغيل</Button></div></CardContent></Card>}
    {tab === "backups" && <Card className="border-0 bg-white/85 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-xl font-black text-[#102a43]"><History className="h-5 w-5 text-[#0d7180]" />النسخ الاحتياطية السابقة</CardTitle></CardHeader><CardContent><div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dce7ee] bg-[#f7fbfc] p-4"><p className="text-sm leading-6 text-slate-500">يتم حفظ النسخ المنشأة من النظام على التخزين الدائم، ويمكن تنزيلها أو دمجها دون حذف البيانات الحالية.</p><Button onClick={exportBackup} disabled={backupCreate.isPending} className="rounded-xl bg-[#0d4f62] text-white">{backupCreate.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إنشاء نسخة جديدة</Button></div>{backupList.isLoading ? <Loading /> : backupList.error ? <Notice text="تعذر تحميل سجل النسخ الاحتياطية أو لا تملك الصلاحية." /> : (backupList.data ?? []).length === 0 ? <div className="rounded-2xl border border-dashed border-[#b9d4d9] p-10 text-center text-sm font-bold text-slate-500">لا توجد نسخ محفوظة بعد. أنشئ نسخة جديدة لتظهر هنا.</div> : <div className="space-y-3">{(backupList.data ?? []).map(record => { let summary: Record<string, number> = {}; try { summary = JSON.parse(record.summary || "{}"); } catch {} return <div key={record.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black text-[#102a43]">{record.fileName}</h3><p className="mt-1 text-xs text-slate-500">{new Date(record.createdAt).toLocaleString("en-US")} · {record.createdByName || "المدير العام"} · {Math.max(1, Math.round(record.fileSize / 1024))} KB</p><p className="mt-2 text-xs text-slate-500">الأصناف: {summary.items ?? 0} · الإضافات: {summary.additions ?? 0} · الصرف: {summary.disbursements ?? 0} · التحويلات: {summary.transfers ?? 0}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void downloadBackup(record.id)} className="rounded-xl border-[#0d7180] text-[#0d4f62]">تنزيل</Button><Button variant="outline" onClick={() => void restoreSavedBackup(record.id, record.fileName)} disabled={restoreRecord.isPending} className="rounded-xl border-[#d08a3b] text-[#8c5c1d]">استعادة ودمج</Button></div></div></div>; })}</div>}</CardContent></Card>}
    {tab === "backup" && <Card className="border-0 bg-white/85 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-xl font-black text-[#102a43]"><ShieldCheck className="h-5 w-5 text-[#0d7180]" />النسخ الاحتياطي والاستعادة</CardTitle></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-[#dce7ee] bg-[#f7fbfc] p-5"><Download className="mb-3 h-6 w-6 text-[#0d7180]" /><h3 className="font-black text-[#102a43]">تنزيل نسخة احتياطية</h3><p className="mt-2 text-sm leading-6 text-slate-500">تشمل الأصناف والحركات والمخزن الرئيسي والإعدادات وسجل التدقيق.</p><Button onClick={exportBackup} disabled={backupCreate.isPending} className="mt-4 rounded-xl bg-[#0d4f62] text-white">{backupCreate.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}تنزيل النسخة</Button></div><div className="rounded-2xl border border-[#f0dfbe] bg-[#fffaf0] p-5"><UploadCloud className="mb-3 h-6 w-6 text-[#a96821]" /><h3 className="font-black text-[#102a43]">استعادة أو دمج نسخة</h3><p className="mt-2 text-sm leading-6 text-slate-500">تتم الاستعادة كعملية دمج دون حذف البيانات الحالية، ولا يسمح بها إلا للمدير العام.</p><input ref={fileRef} type="file" accept="application/json,.json" onChange={importBackup} className="hidden" /><Button variant="outline" onClick={() => fileRef.current?.click()} disabled={restore.isPending} className="mt-4 rounded-xl border-[#d08a3b] text-[#8c5c1d]">{restore.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}اختيار ملف النسخة</Button></div></div></CardContent></Card>}
  </div></DashboardLayout>;
}

type BackupOperationsCenterProps = {
  backups: Array<{ id: number; fileName: string; fileSize: number; createdAt: Date; createdByName: string | null; summary: string | null }>;
  backupsLoading: boolean;
  backupsError: boolean;
  verificationConfig: { isEnabled: boolean; cronExpression: string; nextExecutionAt: Date | null; lastRunAt: Date | null; lastStatus: string | null } | null | undefined;
  verificationRuns: Array<{ id: number; backupRecordId: number | null; runType: "manual" | "scheduled" | "isolated_full"; status: "running" | "passed" | "failed" | "skipped"; startedAt: Date; completedAt: Date | null; errorMessage: string | null }>;
  verificationLoading: boolean;
  verificationError: boolean;
  creating: boolean;
  testing: boolean;
  isolatedTesting: boolean;
  cleaning: boolean;
  testingEmail: boolean;
  scheduling: boolean;
  onCreate: () => Promise<void>;
  onRunTest: () => Promise<void>;
  onRunIsolatedFull: () => Promise<void>;
  onCleanupExpired: () => Promise<void>;
  onSendEmailTest: () => Promise<void>;
  onRefresh: () => void;
  onSetSchedule: (enabled: boolean) => Promise<void>;
  onDownload: (id: number) => Promise<void>;
};

function BackupOperationsCenter({ backups, backupsLoading, backupsError, verificationConfig, verificationRuns, verificationLoading, verificationError, creating, testing, isolatedTesting, cleaning, testingEmail, scheduling, onCreate, onRunTest, onRunIsolatedFull, onCleanupExpired, onSendEmailTest, onRefresh, onSetSchedule, onDownload }: BackupOperationsCenterProps) {
  const latestBackup = backups[0];
  const latestRun = verificationRuns[0];
  const formatDate = (value: Date | null | undefined) => value ? new Date(value).toLocaleString("ar-EG") : "—";
  const runLabel = latestRun?.status === "passed" ? "سليم" : latestRun?.status === "failed" ? "يتطلب مراجعة" : latestRun?.status === "running" ? "جارٍ التنفيذ" : latestRun?.status === "skipped" ? "لم يتوفر ملف" : "لم يُختبر بعد";
  const runTone = latestRun?.status === "passed" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : latestRun?.status === "failed" ? "text-red-700 bg-red-50 border-red-200" : "text-amber-700 bg-amber-50 border-amber-200";
  const runTypeLabel = (runType: "manual" | "scheduled" | "isolated_full") => runType === "scheduled" ? "دوري" : runType === "isolated_full" ? "كاملة معزولة" : "يدوي";
  const controlsDisabled = creating || testing || isolatedTesting || cleaning || testingEmail || scheduling;

  return <Card className="border-0 bg-white/85 shadow-sm"><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-xl font-black text-[#102a43]"><ShieldCheck className="h-5 w-5 text-[#0d7180]" />مركز النسخ الاحتياطي</CardTitle><p className="mt-2 text-sm leading-6 text-slate-500">أنشئ نسخة يدوية، تابع آخر اختبار استعادة آمن، وراجع السجل من مكان واحد.</p></div><Button type="button" variant="outline" onClick={onRefresh} disabled={backupsLoading || verificationLoading} className="rounded-xl border-[#b9d4d9] text-[#0d4f62]"><RefreshCw className={`ml-2 h-4 w-4 ${(backupsLoading || verificationLoading) ? "animate-spin" : ""}`} />تحديث الحالة</Button></div></CardHeader><CardContent className="space-y-6">
    {(backupsError || verificationError) && <Notice text="تعذر تحميل جزء من سجل النسخ أو الاختبارات. استخدم تحديث الحالة أو تحقق من صلاحية المسؤول." />}
    <div className="grid gap-3 md:grid-cols-3">
      <div className="min-h-[150px] rounded-2xl border border-[#b9d4d9] bg-[#f4fbfc] p-4"><div className="flex items-center justify-between"><p className="text-xs font-black text-[#0d4f62]">آخر نسخة محفوظة</p><Download className="h-5 w-5 text-[#0d7180]" /></div><p className="mt-4 text-lg font-black text-[#102a43]">{latestBackup ? "متاحة" : "لا توجد نسخة"}</p><p className="mt-2 text-xs leading-5 text-slate-500">{latestBackup ? `${formatDate(latestBackup.createdAt)} · ${Math.max(1, Math.round(latestBackup.fileSize / 1024))} KB` : "أنشئ أول نسخة يدوية لحفظ نقطة استرجاع."}</p></div>
      <div className={`min-h-[150px] rounded-2xl border p-4 ${runTone}`}><div className="flex items-center justify-between"><p className="text-xs font-black">آخر اختبار استعادة</p>{latestRun?.status === "passed" ? <CircleCheckBig className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}</div><p className="mt-4 text-lg font-black">{runLabel}</p><p className="mt-2 text-xs leading-5">{latestRun ? `${formatDate(latestRun.completedAt || latestRun.startedAt)} · ${runTypeLabel(latestRun.runType)}` : "لم يُنفّذ اختبار آمن بعد."}</p></div>
      <div className="min-h-[150px] rounded-2xl border border-[#e9d7b0] bg-[#fffaf0] p-4"><div className="flex items-center justify-between"><p className="text-xs font-black text-[#8c5c1d]">المراقبة الدورية</p><CalendarClock className="h-5 w-5 text-[#a96821]" /></div><p className="mt-4 text-lg font-black text-[#102a43]">{verificationConfig?.isEnabled ? "مفعّلة أسبوعيًا" : "غير مفعّلة"}</p><p className="mt-2 text-xs leading-5 text-slate-500">{verificationConfig?.isEnabled ? `الموعد القادم: ${formatDate(verificationConfig.nextExecutionAt)}` : "فعّل الاختبار الأسبوعي بعد نشر هذه النسخة."}</p></div>
    </div>
    <div className="grid gap-4 lg:grid-cols-3"><div className="rounded-2xl border border-[#dce7ee] bg-[#f7fbfc] p-5"><h3 className="font-black text-[#102a43]">إنشاء نسخة يدوية</h3><p className="mt-2 text-sm leading-6 text-slate-500">تُحفظ نسخة JSON في سجل النسخ ويمكن تنزيلها فورًا للاحتفاظ بها خارج النظام.</p><Button onClick={() => void onCreate()} disabled={controlsDisabled} className="mt-4 rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4050]">{creating && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إنشاء نسخة الآن</Button></div><div className="rounded-2xl border border-[#dce7ee] bg-white p-5"><h3 className="font-black text-[#102a43]">اختبار الاستعادة الآمن</h3><p className="mt-2 text-sm leading-6 text-slate-500">يتحقق من أحدث نسخة ويستعيد عينة صغيرة داخل معاملة تتراجع تلقائيًا، لذلك لا يغيّر بيانات الإنتاج.</p><Button onClick={() => void onRunTest()} disabled={controlsDisabled || !latestBackup} className="mt-4 rounded-xl bg-[#0d7180] text-white hover:bg-[#095861]">{testing && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}تشغيل الاختبار الآن</Button></div><div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5"><h3 className="font-black text-[#102a43]">استعادة كاملة معزولة</h3><p className="mt-2 text-sm leading-6 text-slate-600">تُنشئ قاعدة اختبار مستقلة، تستعيد النسخة كاملة، ثم تطابق عدد الصفوف في جميع جداول النسخة.</p><Button onClick={() => void onRunIsolatedFull()} disabled={controlsDisabled || !latestBackup} className="mt-4 rounded-xl bg-emerald-700 text-white hover:bg-emerald-800">{isolatedTesting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}تشغيل استعادة كاملة</Button></div></div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e9d7b0] bg-[#fffaf0] p-4"><div><h3 className="font-black text-[#102a43]">اختبار استعادة أسبوعي</h3><p className="mt-1 text-xs leading-5 text-slate-500">كل يوم أحد الساعة 02:00 UTC. لا ينشئ أو يعدل بيانات تشغيلية دائمة.</p></div><Button type="button" variant="outline" disabled={controlsDisabled} onClick={() => void onSetSchedule(!verificationConfig?.isEnabled)} className={`rounded-xl ${verificationConfig?.isEnabled ? "border-red-200 text-red-700 hover:bg-red-50" : "border-[#d08a3b] text-[#8c5c1d] hover:bg-[#fff3dc]"}`}>{scheduling && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}{verificationConfig?.isEnabled ? "إيقاف الاختبار الدوري" : "تفعيل الاختبار الأسبوعي"}</Button></div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4"><div><h3 className="font-black text-[#102a43]">اختبار البريد الإلكتروني</h3><p className="mt-1 text-xs leading-5 text-slate-500">يرسل رسالة حقيقية إلى بريد المدير للتحقق من إعداد SMTP وتنبيهات فشل الاستعادة.</p></div><Button type="button" variant="outline" disabled={controlsDisabled} onClick={() => void onSendEmailTest()} className="rounded-xl border-sky-300 text-sky-800 hover:bg-sky-100">{testingEmail && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إرسال رسالة اختبار</Button></div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div><h3 className="font-black text-[#102a43]">سياسة الاحتفاظ بالنسخ</h3><p className="mt-1 text-xs leading-5 text-slate-500">يُنظّف النظام سجلات النسخ الأقدم من 30 يومًا بعد إنشاء أي نسخة جديدة، مع الاحتفاظ بأحدث نسخة دائمًا.</p></div><Button type="button" variant="outline" disabled={controlsDisabled} onClick={() => void onCleanupExpired()} className="rounded-xl border-slate-300 text-slate-700 hover:bg-slate-100">{cleaning && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}تنظيف النسخ المنتهية</Button></div>
    <div className="grid gap-5 xl:grid-cols-2"><div><div className="mb-3 flex items-center justify-between"><h3 className="font-black text-[#102a43]">أحدث النسخ</h3><span className="text-xs font-bold text-slate-400">آخر {Math.min(backups.length, 5)} من {backups.length}</span></div>{backupsLoading ? <Loading /> : backups.length === 0 ? <div className="rounded-2xl border border-dashed border-[#b9d4d9] p-6 text-center text-sm font-bold text-slate-500">لا توجد نسخ محفوظة بعد.</div> : <div className="space-y-2">{backups.slice(0, 5).map(record => <div key={record.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3"><div><p className="font-bold text-[#102a43]">{formatDate(record.createdAt)}</p><p className="mt-1 text-xs text-slate-500">{record.createdByName || "المدير العام"} · {Math.max(1, Math.round(record.fileSize / 1024))} KB</p></div><Button type="button" variant="outline" onClick={() => void onDownload(record.id)} className="rounded-xl border-[#b9d4d9] text-[#0d4f62]">تنزيل</Button></div>)}</div>}</div><div><div className="mb-3 flex items-center justify-between"><h3 className="font-black text-[#102a43]">نتائج الاختبار</h3><span className="text-xs font-bold text-slate-400">آخر {Math.min(verificationRuns.length, 5)} نتائج</span></div>{verificationLoading ? <Loading /> : verificationRuns.length === 0 ? <div className="rounded-2xl border border-dashed border-[#b9d4d9] p-6 text-center text-sm font-bold text-slate-500">لم يُنفّذ اختبار استعادة بعد.</div> : <div className="space-y-2">{verificationRuns.slice(0, 5).map(run => <div key={run.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold text-[#102a43]">{run.status === "passed" ? "نجح الاختبار" : run.status === "failed" ? "فشل الاختبار" : run.status === "skipped" ? "تم التجاوز" : "جارٍ الاختبار"}</p><span className="text-xs font-bold text-slate-500">{runTypeLabel(run.runType)}</span></div><p className="mt-1 text-xs text-slate-500">{formatDate(run.completedAt || run.startedAt)}{run.backupRecordId ? ` · النسخة #${run.backupRecordId}` : ""}</p>{run.errorMessage && <p className="mt-2 text-xs leading-5 text-red-700">{run.errorMessage}</p>}</div>)}</div>}</div></div>
  </CardContent></Card>;
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button type="button" onClick={onClick} className={`flex items-center gap-3 rounded-2xl border p-4 text-right transition-all ${active ? "border-[#0d7180] bg-[#e8f7f6] text-[#0d4f62] shadow-md" : "border-white/80 bg-white/80 text-slate-500 hover:border-[#b9d4d9]"}`}><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#0d7180]">{icon}</span><span className="font-black">{label}</span></button>; }
function Loading() { return <div className="flex items-center gap-2 p-8 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />جاري التحميل...</div>; }
function Notice({ text }: { text: string }) { return <div className="rounded-2xl bg-[#fffaf0] p-6 text-sm font-bold text-[#8c5c1d]">{text}</div>; }
