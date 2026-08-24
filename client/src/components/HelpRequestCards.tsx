import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { HelpCircle, Loader2, MessageSquareText } from "lucide-react";
import { toast } from "sonner";

const priorityLabels = { low: "منخفضة", normal: "عادية", high: "مهمة", critical: "عاجلة" } as const;
const statusLabels = { new: "جديد", in_progress: "قيد المعالجة", completed: "مكتمل" } as const;

type Priority = keyof typeof priorityLabels;
type HelpStatus = keyof typeof statusLabels;

export function HelpRequestCard() {
  const myRequests = trpc.notifications.myHelpRequests.useQuery(undefined, { refetchInterval: 30000 });
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const submit = trpc.notifications.submitHelpRequest.useMutation({
    onSuccess: () => {
      setTitle("");
      setMessage("");
      setPriority("normal");
      void myRequests.refetch();
      toast.success("تم إرسال طلب المساعدة إلى المدير العام");
    },
    onError: error => toast.error(error.message || "تعذر إرسال طلب المساعدة"),
  });
  const canSubmit = title.trim().length >= 3 && message.trim().length >= 5;
  return <Card className="border-0 bg-white/85 shadow-[0_10px_30px_rgba(18,44,84,0.055)]"><CardContent className="space-y-5 p-5 md:p-6">
    <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e8f7f6] text-[#0d7180]"><HelpCircle className="h-5 w-5" /></div><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#0d7180]">HELP REQUEST</p><h2 className="mt-1 text-xl font-black text-[#102a43]">إشعار طلب مساعدة</h2><p className="mt-1 text-sm leading-6 text-slate-500">أرسل رسالة إلى المدير العام فقط. لن يستطيع المستخدم إرسال إشعارات لبقية المستخدمين.</p></div></div>
    <div className="grid gap-4 md:grid-cols-[1fr_180px]"><div><Label htmlFor="help-request-title">عنوان الطلب</Label><Input id="help-request-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="مثال: أحتاج مراجعة تقرير الصرف" className="mt-2 h-11 rounded-xl" maxLength={255} /></div><div><Label htmlFor="help-request-priority">الأولوية</Label><select id="help-request-priority" value={priority} onChange={event => setPriority(event.target.value as Priority)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="low">منخفضة</option><option value="normal">عادية</option><option value="high">مهمة</option><option value="critical">عاجلة</option></select></div></div>
    <div><Label htmlFor="help-request-message">تفاصيل الطلب</Label><Textarea id="help-request-message" value={message} onChange={event => setMessage(event.target.value)} placeholder="اكتب المشكلة أو المساعدة المطلوبة بالتفصيل..." className="mt-2 min-h-28 rounded-xl" maxLength={5000} /></div>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-400">سيصل الطلب إلى المدير العام مع اسمك ووقت الإرسال.</p><Button type="button" onClick={() => submit.mutate({ title: title.trim(), message: message.trim(), priority })} disabled={!canSubmit || submit.isPending} className="rounded-xl bg-[#0d4f62] px-5 text-white hover:bg-[#0a4150]">{submit.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إرسال طلب المساعدة</Button></div>
    <div className="border-t border-[#edf2f5] pt-5"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-black text-[#102a43]">طلباتك السابقة</h3><span className="text-xs text-slate-400">{myRequests.data?.length ?? 0} طلب</span></div>{myRequests.isLoading ? <p className="text-sm text-slate-400">جاري تحميل الحالات...</p> : !myRequests.data?.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">ستظهر حالات طلباتك هنا بعد الإرسال.</p> : <div className="space-y-2">{myRequests.data.map(request => <article key={request.id} className="rounded-xl border border-[#e5eef1] bg-[#fbfdff] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold text-[#102a43]">{request.title}</p><Badge className={`rounded-full px-2.5 py-1 text-[11px] ${request.helpStatus === "completed" ? "bg-emerald-100 text-emerald-700" : request.helpStatus === "in_progress" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>{statusLabels[request.helpStatus as HelpStatus] ?? "جديد"}</Badge></div><p className="mt-1 text-[11px] text-slate-400">{new Date(request.createdAt).toLocaleString("ar-EG")}</p></article>)}</div>}</div>
  </CardContent></Card>;
}

export function HelpRequestsAdminCard() {
  const requests = trpc.notifications.helpRequests.useQuery(undefined, { refetchInterval: 30000 });
  const markRead = trpc.notifications.markHelpRequestRead.useMutation({ onSuccess: () => void requests.refetch(), onError: error => toast.error(error.message || "تعذر تحديث حالة الطلب") });
  const updateStatus = trpc.notifications.updateHelpRequestStatus.useMutation({ onSuccess: () => { void requests.refetch(); toast.success("تم تحديث حالة طلب المساعدة"); }, onError: error => toast.error(error.message || "تعذر تحديث حالة الطلب") });
  const rows = requests.data ?? [];
  return <Card className="border-0 bg-white/85 shadow-[0_10px_30px_rgba(18,44,84,0.055)]"><CardContent className="p-0"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf2f5] bg-[#f4fafb] p-5"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#0d7180]">HELP REQUESTS</p><h2 className="mt-1 text-xl font-black text-[#102a43]">طلبات المساعدة</h2><p className="mt-1 text-sm text-slate-500">طلبات المستخدمين المرسلة إلى المدير العام فقط.</p></div><Badge className="rounded-full bg-white px-3 py-1 text-[#0d7180] hover:bg-white">{rows.filter(row => !row.notification.isRead).length} غير مقروءة</Badge></div>{requests.isLoading ? <p className="p-6 text-center text-sm text-slate-400">جاري تحميل الطلبات...</p> : !rows.length ? <p className="p-6 text-center text-sm text-slate-400">لا توجد طلبات مساعدة حالياً.</p> : <div className="space-y-3 p-5">{rows.map(row => <article key={row.notification.id} className={`rounded-2xl border p-4 ${row.notification.isRead ? "border-slate-100 bg-slate-50/70" : "border-[#b9d4d9] bg-[#f4fafb]"}`}><div className="flex items-start gap-3"><div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#0d7180]"><MessageSquareText className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black text-[#102a43]">{row.notification.title}</h3><Badge className={`rounded-full px-2.5 py-1 text-[11px] ${row.notification.priority === "critical" ? "bg-red-100 text-red-700" : row.notification.priority === "high" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{priorityLabels[row.notification.priority as Priority] ?? row.notification.priority}</Badge></div><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{row.notification.message}</p><p className="mt-2 text-xs text-slate-400">من: {row.senderName || row.senderEmail || "مستخدم"} · {new Date(row.notification.createdAt).toLocaleString("ar-EG")}</p><div className="mt-3 flex flex-wrap items-center gap-2"><select value={row.notification.helpStatus} onChange={event => updateStatus.mutate({ id: row.notification.id, status: event.target.value as HelpStatus })} disabled={updateStatus.isPending} aria-label={`حالة ${row.notification.title}`} className="h-10 rounded-xl border border-[#b9d4d9] bg-white px-3 text-xs font-bold text-[#0d4f62]"><option value="new">جديد</option><option value="in_progress">قيد المعالجة</option><option value="completed">مكتمل</option></select>{!row.notification.isRead && <Button type="button" variant="outline" onClick={() => markRead.mutate({ id: row.notification.id })} disabled={markRead.isPending} className="rounded-xl border-[#0d7180] text-[#0d7180]">تحديد كطلب تمت مراجعته</Button>}</div>
</div></div></article>)}</div>}</CardContent></Card>;
}
