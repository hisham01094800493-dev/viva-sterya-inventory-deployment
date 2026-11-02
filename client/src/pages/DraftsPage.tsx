import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { FilePenLine, ImagePlus, Mic, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { useAuth } from "@/_core/hooks/useAuth";
import { compressImageFile } from "@/lib/imageCompression";

type DraftKind = "note" | "movement";
type DraftForm = { kind: DraftKind; title: string; body: string; movementType: string; itemCode: string; quantity: string; counterparty: string; warehouse: string; handwriting: string; image: string; imageName: string };
type LocalDraft = DraftForm & { id: string; createdAt: string; updatedAt: string };
const emptyDraft: DraftForm = { kind: "note", title: "", body: "", movementType: "addition", itemCode: "", quantity: "", counterparty: "", warehouse: "", handwriting: "", image: "", imageName: "" };
const storagePrefix = "viva-sterya-local-drafts";
function formatDraftDate(value: Date | string | null | undefined) { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }); }
function readLocalDrafts(key: string): LocalDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((draft): draft is Partial<LocalDraft> => Boolean(draft && typeof draft === "object")).map((draft: Partial<LocalDraft>) => ({ ...emptyDraft, ...draft, id: String(draft.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`), createdAt: draft.createdAt ?? new Date().toISOString(), updatedAt: draft.updatedAt ?? draft.createdAt ?? new Date().toISOString() })) : [];
  } catch { return []; }
}

function HandwritingPad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activePointer = useRef<number | null>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#fffefa";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!value) return;
    const image = new Image();
    image.onload = () => {
      context.fillStyle = "#fffefa";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / image.width, canvas.height / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    };
    image.src = value;
  }, [open, value]);

  function pointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!canvas || !rect) return null;
    const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
    const offsetX = (rect.width - canvas.width * scale) / 2;
    const offsetY = (rect.height - canvas.height * scale) / 2;
    return { x: (event.clientX - rect.left - offsetX) / scale, y: (event.clientY - rect.top - offsetY) / scale };
  }
  function startDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const canvas = canvasRef.current;
    const point = pointFromEvent(event);
    const context = canvas?.getContext("2d");
    if (!canvas || !point || !context || point.x < 0 || point.y < 0 || point.x > canvas.width || point.y > canvas.height) return;
    canvas.setPointerCapture(event.pointerId);
    activePointer.current = event.pointerId;
    lastPoint.current = point;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#173f46";
    context.lineWidth = event.pointerType === "pen" ? Math.max(2, event.pressure * 7) : 7;
    context.fillStyle = "#173f46";
    context.beginPath();
    context.arc(point.x, point.y, context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();
  }
  function continueDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (activePointer.current !== event.pointerId) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const point = pointFromEvent(event);
    if (!canvas || !context || !point || !lastPoint.current) return;
    context.beginPath();
    context.moveTo(lastPoint.current.x, lastPoint.current.y);
    context.lineTo(point.x, point.y);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#173f46";
    context.lineWidth = event.pointerType === "pen" ? Math.max(2, event.pressure * 7) : 7;
    context.stroke();
    lastPoint.current = point;
  }
  function finishDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    lastPoint.current = null;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  }
  function clearDrawing() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) { onChange(""); return; }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#fffefa";
    context.fillRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return <section className="space-y-2" aria-label="الكتابة بالقلم">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dce7ee] bg-[#f8fcfc] p-3 dark:border-slate-700 dark:bg-slate-900/60">
      <div><p className="text-sm font-black text-[#102a43] dark:text-white">الكتابة بالقلم أو الرسم</p><p className="text-xs leading-5 text-slate-500 dark:text-slate-300">افتح صفحة بيضاء كبيرة مناسبة لقلم الشاشة أو اللمس.</p></div>
      <Button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-[#0d7180] text-white hover:bg-[#095b66]"><FilePenLine className="ml-2 h-4 w-4" />{value ? "متابعة الكتابة بالقلم" : "افتح صفحة الكتابة"}</Button>
      {value ? <img src={value} alt="معاينة الكتابة بالقلم" className="h-16 w-24 rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-700" /> : null}
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        dir="rtl"
        aria-describedby="handwriting-page-description"
        className="!fixed !inset-0 !left-0 !right-0 !top-0 !z-[100] !h-[100dvh] !w-full !max-w-none !translate-x-0 !translate-y-0 overflow-hidden rounded-none border-0 bg-[#fffefa] p-0 text-[#102a43]"
        style={{ position: "fixed", inset: 0, left: 0, right: 0, top: 0, width: "100%", minWidth: 0, maxWidth: "none", height: "100dvh", minHeight: 0, maxHeight: "100dvh", transform: "none", zIndex: 100, borderRadius: 0, border: 0, padding: 0, display: "flex", flexDirection: "column", gap: 0, overflow: "hidden", boxSizing: "border-box" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e7e2d5] bg-[#fffefa] px-3 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8f7f6] text-[#0d7180]"><FilePenLine className="h-5 w-5" /></div><div className="min-w-0"><DialogTitle className="truncate text-base font-black text-[#102a43] sm:text-lg">صفحة كتابة الملاحظة</DialogTitle><DialogDescription id="handwriting-page-description" className="mt-0.5 text-xs text-slate-500">صفحة بيضاء كاملة — اكتب بالقلم أو بإصبعك.</DialogDescription></div></div>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} className="shrink-0 rounded-xl border-[#cbdcde] bg-white text-[#0d4f62]"><X className="ml-2 h-4 w-4" /><span className="hidden sm:inline">رجوع للملاحظة</span><span className="sm:hidden">رجوع</span></Button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#f4f1e8] p-2 sm:p-5">
          <canvas ref={canvasRef} width={1200} height={1800} aria-label="صفحة بيضاء كبيرة للكتابة بالقلم أو الرسم" className="block h-auto max-h-full w-auto max-w-full touch-none select-none bg-[#fffefa] shadow-sm" style={{ aspectRatio: "2 / 3" }} onPointerDown={startDrawing} onPointerMove={continueDrawing} onPointerUp={finishDrawing} onPointerCancel={finishDrawing} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#e7e2d5] bg-[#fffefa] px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
          <p className="hidden text-xs text-slate-500 sm:block">تُحفظ كتابتك مع الملاحظة عند الضغط على زر الحفظ في النموذج.</p>
          <div className="mr-auto flex w-full gap-2 sm:w-auto"><Button type="button" variant="outline" onClick={clearDrawing} disabled={!value} className="flex-1 rounded-xl border-slate-300 bg-white text-slate-700 sm:flex-none"><X className="ml-1 h-4 w-4" />مسح الصفحة</Button><Button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150] sm:flex-none"><Save className="ml-2 h-4 w-4" />حفظ الكتابة والعودة</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}
export default function DraftsPage() {
  const { user } = useAuth();
  const storageKey = `${storagePrefix}:${user?.id ?? "guest"}`;
  const [drafts, setDrafts] = useState<LocalDraft[]>(() => readLocalDrafts(storageKey));
  const [form, setForm] = useState<DraftForm>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDrafts(readLocalDrafts(storageKey)); setEditingId(null); setForm(emptyDraft); }, [storageKey]);
  useEffect(() => { if (!form.title) setForm(current => ({ ...current, title: current.kind === "note" ? "ملاحظة جديدة" : "مسودة إذن مخزني" })); }, [form.kind, form.title]);

  function persist(next: LocalDraft[]) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setDrafts(next);
      return true;
    } catch {
      toast.error("تعذر الحفظ المحلي؛ قد تكون مساحة المتصفح ممتلئة. قلّل حجم الصورة أو احذف ملاحظة قديمة.");
      return false;
    }
  }
  function selectDraft(draft: LocalDraft) {
    setEditingId(draft.id);
    setForm({ ...emptyDraft, ...draft });
  }
  function reset() { setEditingId(null); setForm(emptyDraft); if (imageInputRef.current) imageInputRef.current.value = ""; }

  async function attachImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("اختر ملف صورة صالحًا"); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error("حجم الصورة كبير؛ اختر صورة أقل من 15 ميجابايت"); return; }
    setIsCompressingImage(true);
    try {
      const compressed = await compressImageFile(file, { maxDimension: 1200, quality: 0.72 });
      if (compressed.dataBase64.length > 1_250_000) { toast.error("الصورة ما زالت كبيرة بعد الضغط؛ اختر صورة أصغر"); return; }
      setForm(current => ({ ...current, image: compressed.dataBase64, imageName: compressed.fileName }));
      toast.success("تم تجهيز الصورة وإرفاقها بالملاحظة");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تجهيز الصورة");
    } finally {
      setIsCompressingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  function save() {
    const title = form.title.trim();
    const body = form.body.trim();
    if (!title || (!body && !form.handwriting && !form.image)) { toast.error("اكتب عنوان الملاحظة وأضف نصًا أو كتابة بالقلم أو صورة"); return; }
    const now = new Date().toISOString();
    const nextDraft: LocalDraft = { ...form, title, body, id: editingId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: editingId ? (drafts.find(item => item.id === editingId)?.createdAt ?? now) : now, updatedAt: now };
    if (persist(editingId ? drafts.map(item => item.id === editingId ? nextDraft : item) : [nextDraft, ...drafts])) {
      toast.success(editingId ? "تم تحديث الملاحظة محليًا" : "تم حفظ الملاحظة محليًا");
      reset();
    }
  }
  function deleteDraft(id: string) { if (persist(drafts.filter(item => item.id !== id))) { if (editingId === id) reset(); toast.success("تم حذف الملاحظة محليًا"); } }

  return <DashboardLayout><div className="mx-auto w-full max-w-[1450px] space-y-6" dir="rtl">
    <div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-[#d08a3b]">WORKSPACE / NOTES</p><h1 className="text-3xl font-black text-[#102a43] dark:text-white">الملاحظات والمسودات</h1><p className="mt-2 text-sm leading-7 text-slate-500 dark:text-slate-300">ملاحظات شخصية محفوظة على هذا المتصفح فقط، ولا تؤثر على المخزون أو قاعدة البيانات. اكتب بالقلم أو أرفق صورة عند الحاجة.</p></div>
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <Card className="border-0 bg-white/85 shadow-sm dark:bg-[#172b35]"><CardHeader><CardTitle className="flex items-center justify-between text-lg dark:text-white">الملاحظات المحفوظة <Button type="button" size="icon" onClick={reset} className="rounded-xl bg-[#0d7180] text-white" aria-label="ملاحظة جديدة"><Plus className="h-4 w-4" /></Button></CardTitle></CardHeader><CardContent className="space-y-3">{drafts.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-300">لا توجد ملاحظات محفوظة بعد.</p> : drafts.map(draft => <div key={draft.id} className={`rounded-2xl border p-3 ${editingId === draft.id ? "border-[#0d7180] bg-[#e8f8f8] dark:bg-teal-950/30" : "border-slate-200 bg-white dark:border-slate-600 dark:bg-[#203d47]"}`}><div className="flex items-start gap-2"><button type="button" onClick={() => selectDraft(draft)} className="min-w-0 flex-1 text-right"><p className="truncate text-sm font-black text-[#102a43] dark:text-white">{draft.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-300">{draft.body || (draft.handwriting ? "ملاحظة مكتوبة بالقلم" : draft.image ? "ملاحظة مرفقة بصورة" : "مسودة")}</p><div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-400"><span>{formatDraftDate(draft.updatedAt)}</span><span>· {draft.kind === "movement" ? "مسودة إذن" : "ملاحظة"}</span>{draft.handwriting && <span>· كتابة بالقلم</span>}{draft.image && <span>· صورة مرفقة</span>}</div></button><Button type="button" variant="outline" size="icon" onClick={() => deleteDraft(draft.id)} className="h-9 w-9 shrink-0 rounded-xl border-red-200 text-red-600 hover:bg-red-50" aria-label={`حذف ${draft.title}`}><Trash2 className="h-4 w-4" /></Button></div></div>)}</CardContent></Card>
      <Card className="border-0 bg-white/85 shadow-sm dark:bg-[#172b35]"><CardHeader><CardTitle className="flex items-center gap-2 text-lg dark:text-white"><FilePenLine className="h-5 w-5 text-[#0d7180]" />{editingId ? "تعديل الملاحظة" : "ملاحظة جديدة"}</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2"><Button type="button" variant={form.kind === "note" ? "default" : "outline"} onClick={() => setForm(current => ({ ...current, kind: "note", title: current.title || "ملاحظة جديدة" }))} className="rounded-xl">ملاحظة عامة</Button><Button type="button" variant={form.kind === "movement" ? "default" : "outline"} onClick={() => setForm(current => ({ ...current, kind: "movement", title: current.title || "مسودة إذن مخزني" }))} className="rounded-xl">مسودة إذن مخزني</Button></div>
        <Input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="عنوان الملاحظة" className="h-12 rounded-xl dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
        <div className="flex items-start gap-2"><Textarea value={form.body} onChange={event => setForm(current => ({ ...current, body: event.target.value }))} placeholder="اكتب الملاحظة أو اضغط الميكروفون للإملاء الصوتي..." className="min-h-32 rounded-xl text-base leading-8 dark:border-slate-600 dark:bg-slate-900 dark:text-white" /><VoiceInputButton onText={text => setForm(current => ({ ...current, body: current.body ? `${current.body}\n${text}` : text }))} label="إملاء الملاحظة بالصوت" className="h-12 w-12 rounded-full border-[#0d7180] bg-[#e8f8f8] text-[#0d7180]" /></div>
        <HandwritingPad value={form.handwriting} onChange={handwriting => setForm(current => ({ ...current, handwriting }))} />
        <section className="space-y-3 rounded-2xl border border-dashed border-[#b9d4d9] bg-[#f8fcfc] p-3 dark:border-slate-600 dark:bg-slate-900/60"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-black text-[#102a43] dark:text-white">إرفاق صورة</p><p className="text-xs leading-5 text-slate-500 dark:text-slate-300">اختر صورة من الجهاز أو التقطها بالكاميرا؛ سيتم ضغطها قبل حفظها على هذا الجهاز.</p></div><input ref={imageInputRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="اختيار صورة للملاحظة" onChange={event => void attachImage(event.target.files?.[0])} /><Button type="button" variant="outline" onClick={() => imageInputRef.current?.click()} disabled={isCompressingImage} className="rounded-xl border-[#9cc7cc] text-[#0d4f62] dark:border-slate-600 dark:text-teal-200"><ImagePlus className="ml-2 h-4 w-4" />{isCompressingImage ? "جارٍ تجهيز الصورة..." : form.image ? "تغيير الصورة" : "اختيار صورة"}</Button></div>{form.image && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-950"><img src={form.image} alt={form.imageName || "صورة مرفقة بالملاحظة"} className="h-20 w-20 rounded-lg object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[#102a43] dark:text-white">{form.imageName || "صورة مرفقة"}</p><p className="text-xs text-slate-500 dark:text-slate-300">سيتم حفظها مع الملاحظة محليًا</p></div><Button type="button" variant="outline" size="sm" onClick={() => setForm(current => ({ ...current, image: "", imageName: "" }))} className="rounded-lg border-red-200 text-red-600"><Trash2 className="ml-1 h-4 w-4" />إزالة الصورة</Button></div>}</section>
        {form.kind === "movement" && <div className="grid gap-3 sm:grid-cols-2"><select value={form.movementType} onChange={event => setForm(current => ({ ...current, movementType: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 dark:border-slate-600 dark:bg-slate-900 dark:text-white"><option value="addition">إضافة من مورد</option><option value="disbursement">صرف لعميل/جهة</option><option value="transfer">تحويل بين مخازن</option></select><Input value={form.itemCode} onChange={event => setForm(current => ({ ...current, itemCode: event.target.value }))} placeholder="كود الصنف" className="rounded-xl dark:border-slate-600 dark:bg-slate-900 dark:text-white" /><Input value={form.quantity} onChange={event => setForm(current => ({ ...current, quantity: event.target.value }))} placeholder="الكمية" className="rounded-xl dark:border-slate-600 dark:bg-slate-900 dark:text-white" /><Input value={form.counterparty} onChange={event => setForm(current => ({ ...current, counterparty: event.target.value }))} placeholder="المورد أو العميل" className="rounded-xl dark:border-slate-600 dark:bg-slate-900 dark:text-white" /><Input value={form.warehouse} onChange={event => setForm(current => ({ ...current, warehouse: event.target.value }))} placeholder="المخزن" className="rounded-xl dark:border-slate-600 dark:bg-slate-900 dark:text-white" /></div>}
        <div className="flex flex-wrap gap-3"><Button type="button" onClick={save} disabled={isCompressingImage} className="rounded-xl bg-[#0d4f62] text-white"><Save className="ml-2 h-4 w-4" />{editingId ? "تحديث الملاحظة" : "حفظ الملاحظة"}</Button><Button type="button" variant="outline" onClick={reset} className="rounded-xl">ملاحظة جديدة</Button><span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300"><Mic className="h-4 w-4" />يمكنك الإملاء صوتيًا أو الكتابة بالقلم</span></div>
      </CardContent></Card>
    </div>
  </div></DashboardLayout>;
}
