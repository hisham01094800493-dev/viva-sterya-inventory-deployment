import { useEffect, useState } from "react";
import { FilePenLine, Mic, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { useAuth } from "@/_core/hooks/useAuth";

type DraftKind = "note" | "movement";
type DraftForm = { kind: DraftKind; title: string; body: string; movementType: string; itemCode: string; quantity: string; counterparty: string; warehouse: string };
type LocalDraft = DraftForm & { id: string; createdAt: string; updatedAt: string };
const emptyDraft: DraftForm = { kind: "note", title: "", body: "", movementType: "addition", itemCode: "", quantity: "", counterparty: "", warehouse: "" };
const storagePrefix = "viva-sterya-local-drafts";
function formatDraftDate(value: Date | string | null | undefined) { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }); }
function readLocalDrafts(key: string): LocalDraft[] { if (typeof window === "undefined") return []; try { const parsed = JSON.parse(window.localStorage.getItem(key) || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }

export default function DraftsPage() {
  const { user } = useAuth();
  const storageKey = `${storagePrefix}:${user?.id ?? "guest"}`;
  const [drafts, setDrafts] = useState<LocalDraft[]>(() => readLocalDrafts(storageKey));
  const [form, setForm] = useState<DraftForm>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => { setDrafts(readLocalDrafts(storageKey)); setEditingId(null); setForm(emptyDraft); }, [storageKey]);
  useEffect(() => { if (!form.title) setForm(current => ({ ...current, title: current.kind === "note" ? "ملاحظة جديدة" : "مسودة إذن مخزني" })); }, [form.kind, form.title]);
  function persist(next: LocalDraft[]) { setDrafts(next); try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { toast.error("تعذر الحفظ المحلي. تحقق من مساحة المتصفح."); } }
  function selectDraft(draft: LocalDraft) { setEditingId(draft.id); setForm({ kind: draft.kind, title: draft.title, body: draft.body, movementType: draft.movementType, itemCode: draft.itemCode, quantity: draft.quantity, counterparty: draft.counterparty, warehouse: draft.warehouse }); }
  function reset() { setEditingId(null); setForm(emptyDraft); }
  function save() { const title = form.title.trim(); const body = form.body.trim(); if (!title || !body) { toast.error("اكتب عنوان الملاحظة ومحتواها أولاً"); return; } const now = new Date().toISOString(); const nextDraft: LocalDraft = { ...form, title, body, id: editingId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: editingId ? (drafts.find(item => item.id === editingId)?.createdAt ?? now) : now, updatedAt: now }; persist(editingId ? drafts.map(item => item.id === editingId ? nextDraft : item) : [nextDraft, ...drafts]); toast.success(editingId ? "تم تحديث الملاحظة محليًا" : "تم حفظ الملاحظة محليًا"); reset(); }
  function deleteDraft(id: string) { persist(drafts.filter(item => item.id !== id)); if (editingId === id) reset(); toast.success("تم حذف الملاحظة محليًا"); }
  return <DashboardLayout><div className="mx-auto w-full max-w-[1450px] space-y-6" dir="rtl">
    <div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-[#d08a3b]">WORKSPACE / NOTES</p><h1 className="text-3xl font-black text-[#102a43] dark:text-white">الملاحظات والمسودات</h1><p className="mt-2 text-sm leading-7 text-slate-500 dark:text-slate-300">ملاحظات شخصية محفوظة على هذا المتصفح فقط، ولا تؤثر على المخزون أو قاعدة البيانات.</p></div>
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <Card className="border-0 bg-white/85 shadow-sm dark:bg-[#172b35]"><CardHeader><CardTitle className="flex items-center justify-between text-lg dark:text-white">الملاحظات المحفوظة <Button type="button" size="icon" onClick={reset} className="rounded-xl bg-[#0d7180] text-white" aria-label="ملاحظة جديدة"><Plus className="h-4 w-4" /></Button></CardTitle></CardHeader><CardContent className="space-y-3">{drafts.length === 0 ? <p className="text-sm text-slate-500">لا توجد ملاحظات محفوظة بعد.</p> : drafts.map(draft => <div key={draft.id} className={`rounded-2xl border p-3 ${editingId === draft.id ? "border-[#0d7180] bg-[#e8f8f8]" : "border-slate-200 bg-white dark:border-slate-600 dark:bg-[#203d47]"}`}><div className="flex items-start gap-2"><button type="button" onClick={() => selectDraft(draft)} className="min-w-0 flex-1 text-right"><p className="truncate text-sm font-black text-[#102a43] dark:text-white">{draft.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-300">{draft.body}</p><p className="mt-2 text-[10px] text-slate-400">{formatDraftDate(draft.updatedAt)} · {draft.kind === "movement" ? "مسودة إذن" : "ملاحظة"}</p></button><Button type="button" variant="outline" size="icon" onClick={() => deleteDraft(draft.id)} className="h-9 w-9 shrink-0 rounded-xl border-red-200 text-red-600 hover:bg-red-50" aria-label={`حذف ${draft.title}`}><Trash2 className="h-4 w-4" /></Button></div></div>)}</CardContent></Card>
      <Card className="border-0 bg-white/85 shadow-sm dark:bg-[#172b35]"><CardHeader><CardTitle className="flex items-center gap-2 text-lg dark:text-white"><FilePenLine className="h-5 w-5 text-[#0d7180]" />{editingId ? "تعديل الملاحظة" : "ملاحظة جديدة"}</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2"><Button type="button" variant={form.kind === "note" ? "default" : "outline"} onClick={() => setForm(current => ({ ...current, kind: "note", title: current.title || "ملاحظة جديدة" }))} className="rounded-xl">ملاحظة عامة</Button><Button type="button" variant={form.kind === "movement" ? "default" : "outline"} onClick={() => setForm(current => ({ ...current, kind: "movement", title: current.title || "مسودة إذن مخزني" }))} className="rounded-xl">مسودة إذن مخزني</Button></div>
        <Input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="عنوان الملاحظة" className="h-12 rounded-xl" />
        <div className="flex items-start gap-2"><Textarea value={form.body} onChange={event => setForm(current => ({ ...current, body: event.target.value }))} placeholder="اكتب الملاحظة أو اضغط الميكروفون للإملاء الصوتي..." className="min-h-40 rounded-xl text-base leading-8" /><VoiceInputButton onText={text => setForm(current => ({ ...current, body: current.body ? `${current.body}\n${text}` : text }))} label="إملاء الملاحظة بالصوت" className="h-12 w-12 rounded-full border-[#0d7180] bg-[#e8f8f8] text-[#0d7180]" /></div>
        {form.kind === "movement" && <div className="grid gap-3 sm:grid-cols-2"><select value={form.movementType} onChange={event => setForm(current => ({ ...current, movementType: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3"><option value="addition">إضافة من مورد</option><option value="disbursement">صرف لعميل/جهة</option><option value="transfer">تحويل بين مخازن</option></select><Input value={form.itemCode} onChange={event => setForm(current => ({ ...current, itemCode: event.target.value }))} placeholder="كود الصنف" className="rounded-xl" /><Input value={form.quantity} onChange={event => setForm(current => ({ ...current, quantity: event.target.value }))} placeholder="الكمية" className="rounded-xl" /><Input value={form.counterparty} onChange={event => setForm(current => ({ ...current, counterparty: event.target.value }))} placeholder="المورد أو العميل" className="rounded-xl" /><Input value={form.warehouse} onChange={event => setForm(current => ({ ...current, warehouse: event.target.value }))} placeholder="المخزن" className="rounded-xl" /></div>}
        <div className="flex flex-wrap gap-3"><Button type="button" onClick={save} className="rounded-xl bg-[#0d4f62] text-white"><Save className="ml-2 h-4 w-4" />{editingId ? "تحديث الملاحظة" : "حفظ الملاحظة"}</Button><Button type="button" variant="outline" onClick={reset} className="rounded-xl">ملاحظة جديدة</Button><span className="flex items-center gap-2 text-xs text-slate-500"><Mic className="h-4 w-4" />يمكنك إملاء النص بالعربية أو بالإنجليزية</span></div>
      </CardContent></Card>
    </div>
  </div></DashboardLayout>;
}
