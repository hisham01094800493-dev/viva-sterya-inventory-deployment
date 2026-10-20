import { useEffect, useMemo, useState } from "react";
import { FilePenLine, Mic, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { trpc } from "@/lib/trpc";

const emptyDraft = { kind: "note" as "note" | "movement", title: "", body: "", movementType: "addition", itemCode: "", quantity: "", counterparty: "", warehouse: "" };
export default function DraftsPage() {
  const drafts = trpc.drafts.list.useQuery();
  const create = trpc.drafts.create.useMutation({ onSuccess: () => drafts.refetch() });
  const update = trpc.drafts.update.useMutation({ onSuccess: () => drafts.refetch() });
  const remove = trpc.drafts.delete.useMutation({ onSuccess: () => drafts.refetch() });
  const [form, setForm] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const parsedPayload = useMemo(() => JSON.stringify({ movementType: form.movementType, itemCode: form.itemCode, quantity: form.quantity, counterparty: form.counterparty, warehouse: form.warehouse }), [form]);
  useEffect(() => { if (!form.title) setForm(current => ({ ...current, title: current.kind === "note" ? "ملاحظة جديدة" : "مسودة إذن مخزني" })); }, [form.kind]);
  function selectDraft(draft: NonNullable<typeof drafts.data>[number]) {
    let payload: Partial<typeof emptyDraft> = {};
    try { payload = JSON.parse(draft.payload || "{}"); } catch {}
    setEditingId(draft.id); setForm({ ...emptyDraft, ...payload, kind: draft.kind as "note" | "movement", title: draft.title, body: draft.body });
  }
  function reset() { setEditingId(null); setForm(emptyDraft); }
  async function save() {
    if (!form.title.trim() || !form.body.trim()) { toast.error("اكتب عنوان المسودة ومحتواها أولاً"); return; }
    try {
      if (editingId) await update.mutateAsync({ id: editingId, kind: form.kind, title: form.title, body: form.body, payload: form.kind === "movement" ? parsedPayload : null });
      else await create.mutateAsync({ kind: form.kind, title: form.title, body: form.body, payload: form.kind === "movement" ? parsedPayload : null });
      toast.success("تم حفظ المسودة"); reset();
    } catch (error: any) { toast.error(error?.message || "تعذر حفظ المسودة"); }
  }
  return <DashboardLayout><div className="mx-auto w-full max-w-[1450px] space-y-6" dir="rtl">
    <div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-[#d08a3b]">WORKSPACE / DRAFTS</p><h1 className="text-3xl font-black text-[#102a43] dark:text-white">المسودات</h1><p className="mt-2 text-sm leading-7 text-slate-500 dark:text-slate-300">اكتب أو تحدث، ثم احفظ ملاحظاتك ومسودات الأذونات قبل اعتمادها نهائياً.</p></div>
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <Card className="border-0 bg-white/85 shadow-sm dark:bg-[#172b35]"><CardHeader><CardTitle className="flex items-center justify-between text-lg dark:text-white">المحفوظة <Button type="button" size="icon" onClick={reset} className="rounded-xl bg-[#0d7180] text-white"><Plus className="h-4 w-4" /></Button></CardTitle></CardHeader><CardContent className="space-y-2">{drafts.isLoading ? <p className="text-sm text-slate-500">جارٍ التحميل...</p> : (drafts.data ?? []).length === 0 ? <p className="text-sm text-slate-500">لا توجد مسودات بعد.</p> : (drafts.data ?? []).map(draft => <div key={draft.id} className={`flex items-center gap-2 rounded-xl border p-3 ${editingId === draft.id ? "border-[#0d7180] bg-[#e8f8f8]" : "border-slate-200 dark:border-slate-600"}`}><button type="button" onClick={() => selectDraft(draft)} className="min-w-0 flex-1 text-right"><p className="truncate text-sm font-black text-[#102a43] dark:text-white">{draft.title}</p><p className="mt-1 text-[11px] text-slate-500">{draft.kind === "movement" ? "مسودة إذن" : "ملاحظة"}</p></button><Button type="button" variant="ghost" size="icon" onClick={async () => { await remove.mutateAsync({ id: draft.id }); if (editingId === draft.id) reset(); }} className="h-8 w-8 text-red-600"><Trash2 className="h-4 w-4" /></Button></div>)}</CardContent></Card>
      <Card className="border-0 bg-white/85 shadow-sm dark:bg-[#172b35]"><CardHeader><CardTitle className="flex items-center gap-2 text-lg dark:text-white"><FilePenLine className="h-5 w-5 text-[#0d7180]" />{editingId ? "تعديل المسودة" : "مسودة جديدة"}</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2"><Button type="button" variant={form.kind === "note" ? "default" : "outline"} onClick={() => setForm(current => ({ ...current, kind: "note", title: current.title || "ملاحظة جديدة" }))} className="rounded-xl">ملاحظة عامة</Button><Button type="button" variant={form.kind === "movement" ? "default" : "outline"} onClick={() => setForm(current => ({ ...current, kind: "movement", title: current.title || "مسودة إذن مخزني" }))} className="rounded-xl">مسودة إذن مخزني</Button></div>
        <Input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="عنوان المسودة" className="h-12 rounded-xl" />
        <div className="flex items-start gap-2"><Textarea value={form.body} onChange={event => setForm(current => ({ ...current, body: event.target.value }))} placeholder="اكتب المسودة أو اضغط الميكروفون للإملاء الصوتي..." className="min-h-40 rounded-xl text-base leading-8" /><VoiceInputButton onText={text => setForm(current => ({ ...current, body: current.body ? `${current.body}\n${text}` : text }))} label="إملاء المسودة بالصوت" className="h-12 w-12 rounded-full border-[#0d7180] bg-[#e8f8f8] text-[#0d7180]" /></div>
        {form.kind === "movement" && <div className="grid gap-3 sm:grid-cols-2"><select value={form.movementType} onChange={event => setForm(current => ({ ...current, movementType: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3"><option value="addition">إضافة من مورد</option><option value="disbursement">صرف لعميل/جهة</option><option value="transfer">تحويل بين مخازن</option></select><Input value={form.itemCode} onChange={event => setForm(current => ({ ...current, itemCode: event.target.value }))} placeholder="كود الصنف" className="rounded-xl" /><Input value={form.quantity} onChange={event => setForm(current => ({ ...current, quantity: event.target.value }))} placeholder="الكمية" className="rounded-xl" /><Input value={form.counterparty} onChange={event => setForm(current => ({ ...current, counterparty: event.target.value }))} placeholder="المورد أو العميل" className="rounded-xl" /><Input value={form.warehouse} onChange={event => setForm(current => ({ ...current, warehouse: event.target.value }))} placeholder="المخزن" className="rounded-xl" /></div>}
        <div className="flex flex-wrap gap-3"><Button type="button" onClick={() => void save()} disabled={create.isPending || update.isPending} className="rounded-xl bg-[#0d4f62] text-white"><Save className="ml-2 h-4 w-4" />حفظ المسودة</Button><Button type="button" variant="outline" onClick={reset} className="rounded-xl">مسودة جديدة</Button><span className="flex items-center gap-2 text-xs text-slate-500"><Mic className="h-4 w-4" />يمكنك إملاء النص بالعربية أو بالإنجليزية</span></div>
      </CardContent></Card>
    </div>
  </div></DashboardLayout>;
}
