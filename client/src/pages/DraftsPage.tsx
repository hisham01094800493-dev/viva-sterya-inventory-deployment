import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Eraser, FilePenLine, Mic, PenLine, Plus, Printer, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

type DraftKind = "note" | "movement";
type DraftForm = { kind: DraftKind; title: string; body: string; movementType: string; itemCode: string; quantity: string; counterparty: string; warehouse: string; inkDataUrl: string };
type LocalDraft = DraftForm & { id: string; createdAt: string; updatedAt: string };
const emptyDraft: DraftForm = { kind: "note", title: "", body: "", movementType: "addition", itemCode: "", quantity: "", counterparty: "", warehouse: "", inkDataUrl: "" };
const storagePrefix = "viva-sterya-local-drafts";
const memoTemplates = [
  { key: "loss", label: "مذكرة فقد", title: "مذكرة فقد صنف / عهدة مخزنية", body: "التاريخ: ..............\nالمخزن: ..............\nالصنف: ..............\nالكود: ..............\nالكمية المفقودة: ..............\nبيان الواقعة والظروف: \n........................................................................\n........................................................................\nالإجراء المقترح: \n........................................................................\n........................................................................\nتحريرًا في: ..............    اسم محرر المذكرة: ..............\nتوقيع أمين المخزن: ..............    اعتماد المدير: .............." },
  { key: "waste", label: "مذكرة هالك", title: "مذكرة هالك أصناف مخزنية", body: "التاريخ: ..............\nالمخزن: ..............\nالصنف: ..............\nالكود: ..............\nالكمية الهالكة: ..............\nسبب الهلاك (تلف / كسر / انتهاء صلاحية / أخرى): ..............\nوصف الحالة: \n........................................................................\n........................................................................\nالتوصية: معاينة الصنف واتخاذ إجراء الإعدام أو التخريد حسب لائحة الشركة.\nأعضاء لجنة المعاينة: .............. / .............. / ..............\nتوقيع أمين المخزن: ..............    اعتماد المدير: .............." },
  { key: "shortage", label: "مذكرة عجز جرد", title: "مذكرة عجز نتيجة جرد مخزني", body: "التاريخ: ..............\nالمخزن: ..............\nالصنف: ..............\nالكود: ..............\nالرصيد الدفتري: ..............\nالرصيد الفعلي: ..............\nقيمة العجز: ..............\nملاحظات لجنة الجرد: \n........................................................................\n........................................................................\nسبب العجز والإجراء التصحيحي: \n........................................................................\nتوقيع لجنة الجرد: ..............    اعتماد المدير: .............." },
  { key: "approval", label: "طلب اعتماد حركة", title: "مذكرة طلب اعتماد حركة مخزنية", body: "التاريخ: ..............\nنوع الحركة: إضافة / صرف / تحويل / مرتجع\nالمخزن: ..............\nالجهة أو المقاول: ..............\nالصنف: ..............\nالكود: ..............\nالكمية: ..............\nالغرض والبيان: \n........................................................................\n........................................................................\nنرجو التفضل بالمراجعة والاعتماد لاتخاذ الإجراء النظامي.\nمقدم الطلب: ..............    توقيع المسؤول: ..............\nالاعتماد: .............." },
  { key: "custody", label: "مذكرة عهدة أجهزة المساحة", title: "مذكرة تسليم واستلام عهدة أجهزة مساحة", body: "التاريخ: ..............\nرقم المذكرة: ..............\nالمشروع / الموقع: ..............\nالمخزن المصدر: ..............    رقم المخزن: ..............\nاسم مستلم العهدة: ..............\nالوظيفة / الرقم الوظيفي: ..............\nالجهة أو القسم: ..............\n\nبيانات أجهزة وأدوات المساحة المسلّمة:\nم | اسم الجهاز / الصنف | كود الصنف | الرقم التسلسلي | الباركود | الوحدة | الكمية | حالة التسليم\n1 | .................... | .......... | ................. | .......... | عدد | ....... | جديد / صالح / مستخدم\n2 | .................... | .......... | ................. | .......... | عدد | ....... | جديد / صالح / مستخدم\n3 | .................... | .......... | ................. | .......... | عدد | ....... | جديد / صالح / مستخدم\n\nمصدر الكود: كود الصنف المعتمد في المخزن، ولا يتم تغييره يدويًا.\nتفاصيل الحالة أو الملحقات أو الملاحظات:\n........................................................................\n........................................................................\nأقر أنا مستلم العهدة باستلام الأجهزة والأدوات الموضحة أعلاه بالأكواد والأرقام التسلسلية المذكورة، والمحافظة عليها واستخدامها في الغرض المخصص لها، وإعادتها أو تسوية عهدتها عند انتهاء الحاجة إليها.\n\nتاريخ التسليم: ..............    تاريخ الإعادة أو التسوية: ..............\nاسم أمين المخزن: ..............    التوقيع: ..............\nاسم مستلم العهدة: ..............    التوقيع: ..............\nاعتماد المسؤول / المدير: ..............    التوقيع: .............." },
] as const;
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character] ?? character)); }
function formatDraftDate(value: Date | string | null | undefined) { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }); }
function readLocalDrafts(key: string): LocalDraft[] { if (typeof window === "undefined") return []; try { const parsed = JSON.parse(window.localStorage.getItem(key) || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }

export default function DraftsPage() {
  const { user } = useAuth();
  const storageKey = `${storagePrefix}:${user?.id ?? "guest"}`;
  const [drafts, setDrafts] = useState<LocalDraft[]>(() => readLocalDrafts(storageKey));
  const [form, setForm] = useState<DraftForm>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const warehouses = trpc.warehouses.list.useQuery(undefined, { staleTime: 30_000 });
  const inventoryItems = trpc.items.list.useQuery(undefined, { staleTime: 30_000 });
  const [custodyWarehouseId, setCustodyWarehouseId] = useState("");
  const [custodyItemId, setCustodyItemId] = useState("");
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => { setDrafts(readLocalDrafts(storageKey)); setEditingId(null); setForm(emptyDraft); }, [storageKey]);
  useEffect(() => { if (!form.title) setForm(current => ({ ...current, title: current.kind === "note" ? "ملاحظة جديدة" : "مسودة إذن مخزني" })); }, [form.kind, form.title]);
  function persist(next: LocalDraft[]) { setDrafts(next); try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { toast.error("تعذر الحفظ المحلي. تحقق من مساحة المتصفح."); } }
  function applyTemplate(template: typeof memoTemplates[number]) {
    setEditingId(null);
    setForm(current => ({ ...current, kind: "note", title: template.title, body: template.body, inkDataUrl: "" }));
    setCustodyWarehouseId("");
    setCustodyItemId("");
    window.requestAnimationFrame(() => loadInk(""));
    toast.success(`تم فتح نموذج ${template.label} — عدّل البيانات ثم احفظ أو اطبع`);
  }
  const isSurveyCustody = form.title.includes("عهدة") && form.title.includes("مساحة");
  const custodyItems = (inventoryItems.data ?? []).filter(item => !custodyWarehouseId || String(item.warehouseId) === custodyWarehouseId);
  function insertCustodyItem() {
    const item = custodyItems.find(candidate => String(candidate.id) === custodyItemId);
    const warehouse = (warehouses.data ?? []).find(candidate => String(candidate.id) === custodyWarehouseId);
    if (!item) { toast.error("اختر جهازًا أو صنفًا من المخزن أولاً"); return; }
    const line = `${item.name} | الكود: ${item.code} | الوحدة: ${item.unit || "عدد"} | الكمية: 1 | الرقم التسلسلي: .............. | الباركود: .............. | الحالة: صالح`;
    setForm(current => ({ ...current, warehouse: warehouse ? `${warehouse.name} (#${warehouse.slot})` : current.warehouse, itemCode: item.code, body: `${current.body.trim()}\n${line}` }));
    toast.success(`تم إدراج ${item.name} بالكود ${item.code} في المذكرة`);
  }
  function printCurrentDraft() {
    const title = form.title.trim() || "مذكرة مخزنية";
    const body = form.body.trim() || "—";
    const ink = form.inkDataUrl ? `<div class="ink"><h3>التوقيع أو الملاحظات اليدوية</h3><img src="${form.inkDataUrl}" alt="كتابة يدوية" /></div>` : "";
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) { toast.error("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى."); return; }
    printWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,Tahoma,sans-serif;color:#102a43;margin:28mm 18mm;line-height:1.9}h1{text-align:center;color:#0d4f62;border-bottom:2px solid #0d4f62;padding-bottom:12px}h2{font-size:14px;color:#536b78;margin-top:28px}pre{font-family:Arial,Tahoma,sans-serif;white-space:pre-wrap;font-size:15px;line-height:2.1;border:1px solid #b9d4d9;border-radius:10px;padding:18px;min-height:260px}.meta{display:flex;justify-content:space-between;color:#536b78;font-size:12px}.ink{margin-top:24px}.ink img{max-width:100%;height:130px;border:1px solid #b9d4d9;border-radius:8px}@media print{body{margin:15mm}}</style></head><body><div class="meta"><span>قطاع المخازن والإنشاءات</span><span>${new Date().toLocaleDateString("ar-EG")}</span></div><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(body)}</pre>${ink}<h2>ملاحظات واعتمادات</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:30px;margin-top:45px;text-align:center"><div>إعداد<br>................</div><div>مراجعة أمين المخزن<br>................</div><div>اعتماد الإدارة<br>................</div></div><script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  }
  function clearInk() {
    const canvas = inkCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setForm(current => ({ ...current, inkDataUrl: "" }));
  }
  function loadInk(dataUrl: string) {
    const canvas = inkCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!dataUrl) return;
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = dataUrl;
  }
  function selectDraft(draft: LocalDraft) {
    setEditingId(draft.id);
    const inkDataUrl = draft.inkDataUrl ?? "";
    setForm({ kind: draft.kind, title: draft.title, body: draft.body, movementType: draft.movementType, itemCode: draft.itemCode, quantity: draft.quantity, counterparty: draft.counterparty, warehouse: draft.warehouse, inkDataUrl });
    window.requestAnimationFrame(() => loadInk(inkDataUrl));
  }
  function reset() { setEditingId(null); setForm(emptyDraft); window.requestAnimationFrame(() => loadInk("")); }
  function pointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
  }
  function startInk(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(event);
  }
  function drawInk(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !lastPointRef.current) return;
    event.preventDefault();
    const next = pointFromEvent(event);
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    context.strokeStyle = "#102a43";
    context.lineWidth = event.pointerType === "pen" ? 3 : 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    lastPointRef.current = next;
  }
  function stopInk(event?: ReactPointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    lastPointRef.current = null;
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const canvas = inkCanvasRef.current;
    if (canvas) setForm(current => ({ ...current, inkDataUrl: canvas.toDataURL("image/png") }));
  }
  function save() { const title = form.title.trim(); const body = form.body.trim(); if (!title || (!body && !form.inkDataUrl)) { toast.error("اكتب عنوان الملاحظة ومحتواها أو أضف كتابة بالقلم أولاً"); return; } const now = new Date().toISOString(); const nextDraft: LocalDraft = { ...form, title, body, id: editingId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: editingId ? (drafts.find(item => item.id === editingId)?.createdAt ?? now) : now, updatedAt: now }; persist(editingId ? drafts.map(item => item.id === editingId ? nextDraft : item) : [nextDraft, ...drafts]); toast.success(editingId ? "تم تحديث الملاحظة محليًا" : "تم حفظ الملاحظة محليًا"); reset(); }
  function deleteDraft(id: string) { persist(drafts.filter(item => item.id !== id)); if (editingId === id) reset(); toast.success("تم حذف الملاحظة محليًا"); }
  return <DashboardLayout><div className="mx-auto w-full max-w-[1450px] space-y-6" dir="rtl">
    <div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-[#d08a3b]">WORKSPACE / NOTES</p><h1 className="text-3xl font-black text-[#102a43] dark:text-white">الملاحظات والمسودات</h1><p className="mt-2 text-sm leading-7 text-slate-500 dark:text-slate-300">ملاحظات شخصية محفوظة على هذا المتصفح فقط، ولا تؤثر على المخزون أو قاعدة البيانات.</p></div>
    <Card className="border-0 bg-white/85 shadow-sm dark:bg-[#172b35]"><CardHeader><CardTitle className="flex items-center gap-2 text-lg dark:text-white"><FilePenLine className="h-5 w-5 text-[#d08a3b]" />نماذج مذكرات قطاع المخازن والإنشاءات</CardTitle><p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-300">اختر نموذجًا جاهزًا، أكمل البيانات، ثم احفظه أو اطبعه.</p></CardHeader><CardContent><div className="flex flex-wrap gap-2">{memoTemplates.map(template => <Button key={template.key} type="button" variant="outline" onClick={() => applyTemplate(template)} className="rounded-xl border-[#d9c08d] bg-[#fffaf0] text-[#9b621d] hover:bg-[#fff4df]"><FilePenLine className="ml-2 h-4 w-4" />{template.label}</Button>)}<Button type="button" variant="outline" onClick={printCurrentDraft} className="rounded-xl border-[#0d7180] text-[#0d4f62]"><Printer className="ml-2 h-4 w-4" />طباعة النموذج الحالي</Button></div><p className="mt-3 text-xs leading-6 text-slate-500">النماذج تشغيلية وقابلة للتعديل، وتحتوي أماكن فارغة للتوقيع والمراجعة والاعتماد.</p></CardContent></Card>
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <Card className="border-0 bg-white/85 shadow-sm dark:bg-[#172b35]"><CardHeader><CardTitle className="flex items-center justify-between text-lg dark:text-white">الملاحظات المحفوظة <Button type="button" size="icon" onClick={reset} className="rounded-xl bg-[#0d7180] text-white" aria-label="ملاحظة جديدة"><Plus className="h-4 w-4" /></Button></CardTitle></CardHeader><CardContent className="space-y-3">{drafts.length === 0 ? <p className="text-sm text-slate-500">لا توجد ملاحظات محفوظة بعد.</p> : drafts.map(draft => <div key={draft.id} className={`rounded-2xl border p-3 ${editingId === draft.id ? "border-[#0d7180] bg-[#e8f8f8]" : "border-slate-200 bg-white dark:border-slate-600 dark:bg-[#203d47]"}`}><div className="flex items-start gap-2"><button type="button" onClick={() => selectDraft(draft)} className="min-w-0 flex-1 text-right"><p className="truncate text-sm font-black text-[#102a43] dark:text-white">{draft.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-300">{draft.body}</p><p className="mt-2 text-[10px] text-slate-400">{formatDraftDate(draft.updatedAt)} · {draft.kind === "movement" ? "مسودة إذن" : "ملاحظة"}</p></button><Button type="button" variant="outline" size="icon" onClick={() => deleteDraft(draft.id)} className="h-9 w-9 shrink-0 rounded-xl border-red-200 text-red-600 hover:bg-red-50" aria-label={`حذف ${draft.title}`}><Trash2 className="h-4 w-4" /></Button></div></div>)}</CardContent></Card>
      <Card className="border-0 bg-white/85 shadow-sm dark:bg-[#172b35]"><CardHeader><CardTitle className="flex items-center gap-2 text-lg dark:text-white"><FilePenLine className="h-5 w-5 text-[#0d7180]" />{editingId ? "تعديل الملاحظة" : "ملاحظة جديدة"}</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2"><Button type="button" variant={form.kind === "note" ? "default" : "outline"} onClick={() => setForm(current => ({ ...current, kind: "note", title: current.title || "ملاحظة جديدة" }))} className="rounded-xl">ملاحظة عامة</Button><Button type="button" variant={form.kind === "movement" ? "default" : "outline"} onClick={() => setForm(current => ({ ...current, kind: "movement", title: current.title || "مسودة إذن مخزني" }))} className="rounded-xl">مسودة إذن مخزني</Button></div>
        <Input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="عنوان الملاحظة" className="h-12 rounded-xl" />
        {isSurveyCustody && <div className="space-y-3 rounded-2xl border border-[#b9d4d9] bg-[#f7fbfc] p-4"><div><p className="font-black text-[#102a43]">ربط العهدة بالمخزن والأكواد</p><p className="mt-1 text-xs leading-5 text-slate-500">اختر المخزن والجهاز من البيانات المعتمدة. سيُدرج كود الصنف تلقائيًا، بينما يُستكمل الرقم التسلسلي والباركود الخاص بالجهاز يدويًا.</p></div><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs font-bold text-slate-500">المخزن<select value={custodyWarehouseId} onChange={event => { setCustodyWarehouseId(event.target.value); setCustodyItemId(""); }} className="mt-1 h-11 w-full rounded-xl border border-input bg-white px-3 text-sm font-bold text-[#102a43]"><option value="">اختر المخزن</option>{(warehouses.data ?? []).map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} — رقم {warehouse.slot}</option>)}</select></label><label className="space-y-1 text-xs font-bold text-slate-500">الجهاز / الصنف<select value={custodyItemId} onChange={event => setCustodyItemId(event.target.value)} disabled={!custodyWarehouseId} className="mt-1 h-11 w-full rounded-xl border border-input bg-white px-3 text-sm font-bold text-[#102a43]"><option value="">اختر الجهاز أو الصنف</option>{custodyItems.map(item => <option key={item.id} value={item.id}>{item.name} — {item.code}</option>)}</select></label></div><Button type="button" onClick={insertCustodyItem} disabled={!custodyItemId} className="rounded-xl bg-[#0d7180] text-white hover:bg-[#095d69]">إدراج الجهاز بالكود في المذكرة</Button></div>}
        <div className="flex items-start gap-2"><Textarea value={form.body} onChange={event => setForm(current => ({ ...current, body: event.target.value }))} placeholder="اكتب الملاحظة أو اضغط الميكروفون للإملاء الصوتي..." className="min-h-40 rounded-xl text-base leading-8" /><VoiceInputButton onText={text => setForm(current => ({ ...current, body: current.body ? `${current.body}\n${text}` : text }))} label="إملاء الملاحظة بالصوت" className="h-12 w-12 rounded-full border-[#0d7180] bg-[#e8f8f8] text-[#0d7180]" /></div>
        <div className="rounded-2xl border border-[#b9d4d9] bg-[#f7fbfc] p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-black text-[#102a43]"><PenLine className="h-4 w-4 text-[#0d7180]" />كتابة بالقلم أو اللمس</div><Button type="button" variant="outline" size="sm" onClick={clearInk} className="h-8 rounded-lg text-xs"><Eraser className="ml-1 h-3.5 w-3.5" />مسح</Button></div><canvas ref={inkCanvasRef} width={1200} height={260} onPointerDown={startInk} onPointerMove={drawInk} onPointerUp={stopInk} onPointerCancel={stopInk} onPointerLeave={event => { if (drawingRef.current) drawInk(event); }} className="h-52 w-full touch-none rounded-xl border border-dashed border-[#9fcbd0] bg-white" aria-label="لوحة الكتابة بالقلم أو اللمس" /><p className="mt-2 text-[11px] leading-5 text-slate-500">اكتب بإصبعك أو بالقلم الإلكتروني أو بالماوس، ثم احفظ المسودة.</p></div>
        {form.kind === "movement" && <div className="grid gap-3 sm:grid-cols-2"><select value={form.movementType} onChange={event => setForm(current => ({ ...current, movementType: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3"><option value="addition">إضافة من مورد</option><option value="disbursement">صرف لعميل/جهة</option><option value="transfer">تحويل بين مخازن</option></select><Input value={form.itemCode} onChange={event => setForm(current => ({ ...current, itemCode: event.target.value }))} placeholder="كود الصنف" className="rounded-xl" /><Input value={form.quantity} onChange={event => setForm(current => ({ ...current, quantity: event.target.value }))} placeholder="الكمية" className="rounded-xl" /><Input value={form.counterparty} onChange={event => setForm(current => ({ ...current, counterparty: event.target.value }))} placeholder="المورد أو العميل" className="rounded-xl" /><Input value={form.warehouse} onChange={event => setForm(current => ({ ...current, warehouse: event.target.value }))} placeholder="المخزن" className="rounded-xl" /></div>}
        <div className="flex flex-wrap gap-3"><Button type="button" onClick={save} className="rounded-xl bg-[#0d4f62] text-white"><Save className="ml-2 h-4 w-4" />{editingId ? "تحديث الملاحظة" : "حفظ الملاحظة"}</Button><Button type="button" variant="outline" onClick={printCurrentDraft} className="rounded-xl border-[#0d7180] text-[#0d4f62]"><Printer className="ml-2 h-4 w-4" />طباعة المذكرة</Button><Button type="button" variant="outline" onClick={reset} className="rounded-xl">ملاحظة جديدة</Button><span className="flex items-center gap-2 text-xs text-slate-500"><Mic className="h-4 w-4" />يمكنك إملاء النص بالعربية أو بالإنجليزية</span></div>
      </CardContent></Card>
    </div>
  </div></DashboardLayout>;
}
