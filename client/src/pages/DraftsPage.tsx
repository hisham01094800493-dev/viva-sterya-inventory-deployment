import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Eraser, FilePenLine, Mic, PenLine, Plus, Printer, Save, Share2, Trash2, X } from "lucide-react";
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
type ReceiptRow = { item: string; unit: string; quantity: string; notes: string };
type ReceiptData = { warehouse: string; date: string; hotel: string; job: string; rows: ReceiptRow[]; receiver: string; handover: string };
type DraftForm = { kind: DraftKind; title: string; body: string; movementType: string; itemCode: string; quantity: string; counterparty: string; warehouse: string; inkDataUrl: string; receiptData?: ReceiptData };
type LocalDraft = DraftForm & { id: string; createdAt: string; updatedAt: string };
const emptyReceipt: ReceiptData = { warehouse: "", date: "", hotel: "", job: "", rows: Array.from({ length: 5 }, () => ({ item: "", unit: "", quantity: "", notes: "" })), receiver: "", handover: "" };
const emptyDraft: DraftForm = { kind: "note", title: "", body: "", movementType: "addition", itemCode: "", quantity: "", counterparty: "", warehouse: "", inkDataUrl: "", receiptData: undefined };
const storagePrefix = "viva-sterya-local-drafts";
const memoTemplates = [
  { key: "loss", label: "مذكرة فقد", title: "مذكرة فقد صنف / عهدة مخزنية", body: "التاريخ: ..............\nالمخزن: ..............\nالصنف: ..............\nالكود: ..............\nالكمية المفقودة: ..............\nبيان الواقعة والظروف: \n........................................................................\n........................................................................\nالإجراء المقترح: \n........................................................................\n........................................................................\nتحريرًا في: ..............    اسم محرر المذكرة: ..............\nتوقيع أمين المخزن: ..............    اعتماد المدير: .............." },
  { key: "waste", label: "مذكرة هالك", title: "مذكرة هالك أصناف مخزنية", body: "التاريخ: ..............\nالمخزن: ..............\nالصنف: ..............\nالكود: ..............\nالكمية الهالكة: ..............\nسبب الهلاك (تلف / كسر / انتهاء صلاحية / أخرى): ..............\nوصف الحالة: \n........................................................................\n........................................................................\nالتوصية: معاينة الصنف واتخاذ إجراء الإعدام أو التخريد حسب لائحة الشركة.\nأعضاء لجنة المعاينة: .............. / .............. / ..............\nتوقيع أمين المخزن: ..............    اعتماد المدير: .............." },
  { key: "shortage", label: "مذكرة عجز جرد", title: "مذكرة عجز نتيجة جرد مخزني", body: "التاريخ: ..............\nالمخزن: ..............\nالصنف: ..............\nالكود: ..............\nالرصيد الدفتري: ..............\nالرصيد الفعلي: ..............\nقيمة العجز: ..............\nملاحظات لجنة الجرد: \n........................................................................\n........................................................................\nسبب العجز والإجراء التصحيحي: \n........................................................................\nتوقيع لجنة الجرد: ..............    اعتماد المدير: .............." },
  { key: "approval", label: "طلب اعتماد حركة", title: "مذكرة طلب اعتماد حركة مخزنية", body: "التاريخ: ..............\nنوع الحركة: إضافة / صرف / تحويل / مرتجع\nالمخزن: ..............\nالجهة أو المقاول: ..............\nالصنف: ..............\nالكود: ..............\nالكمية: ..............\nالغرض والبيان: \n........................................................................\n........................................................................\nنرجو التفضل بالمراجعة والاعتماد لاتخاذ الإجراء النظامي.\nمقدم الطلب: ..............    توقيع المسؤول: ..............\nالاعتماد: .............." },
  { key: "custody", label: "مذكرة عهدة أجهزة المساحة", title: "محضر عهدة تشغيل مؤقتة لأجهزة المساحة", body: "محضر عهدة تشغيل مؤقتة\n\nأولاً: بيانات المحضر\nالتاريخ: ..............    رقم المحضر: ..............\nالمشروع / الموقع: ..............    المبنى / المنطقة: ..............\nالمخزن المسلِّم: ..............    رقم المخزن: ..............\n\nثانيًا: بيانات مستلم العهدة\nالاسم: ..............    الرقم الوظيفي: ..............\nالوظيفة: ..............    القسم / الجهة: ..............\nرقم الهاتف: ..............\n\nثالثًا: الأجهزة والأدوات المسلَّمة للعمل\nم | الجهاز / الصنف | كود الصنف | الرقم التسلسلي | الباركود | الملحقات | الحالة عند التسليم\n1 | ................ | .......... | ................. | .......... | .......... | جديد / صالح / مستخدم\n2 | ................ | .......... | ................. | .......... | .......... | جديد / صالح / مستخدم\n3 | ................ | .......... | ................. | .......... | .......... | جديد / صالح / مستخدم\n\nرابعًا: إقرار العهدة المؤقتة\nأقر أنا مستلم العهدة بأن الأجهزة والأدوات الموضحة أعلاه سُلِّمت إليّ لاستخدامها في أعمال المساحة بالمشروع / الموقع المحدد، وأنها أصبحت في عهدتي التشغيلية من تاريخ التسليم. أتعهد بالمحافظة عليها وعدم تسليمها أو نقلها للغير، وإبلاغ المسؤول فورًا عند فقدها أو تلفها أو تعطلها. تظل هذه العهدة قائمة لحين إعادة الأجهزة والأدوات كاملة إلى المخزن، وفحصها واعتماد محضر التسليم والاستلام من أمين المخزن والمسؤول المختص.\n\nخامسًا: حالة الإعادة والتسليم للمخزن\nتاريخ الإعادة: ..............    رقم إذن أو محضر الإعادة: ..............\nحالة الأجهزة عند الإعادة: سليمة / بها تلف / ناقصة ملحقات / تحتاج فحصًا\nملاحظات الفحص والاستلام: \n........................................................................\n........................................................................\n\nتوقيع مستلم العهدة: ..............    التاريخ: ..............\nتوقيع المسؤول المباشر: ..............    التاريخ: ..............\nتوقيع أمين المخزن عند التسليم: ..............    التاريخ: ..............\nتوقيع أمين المخزن عند الإعادة والإقفال: ..............    التاريخ: .............." },
  { key: "receipt", label: "محضر استلام بضائع", title: "محضر استلام بضائع", body: "المخازن: ........................................................\nالتاريخ: ........................................................\n\nأقر أنا الموقع أدناه:\nبصفتي مندوبًا عن إدارة فندق: ........................................................\nالوظيفة: ........................................................\nبأنني استلمت من مخازن شركة تراڤكو للهندسة والإنشاءات الأصناف بعد معاينتها معاينة جيدة وبيانها كالتالي:\n\nم | اسم الصنف | الوحدة | الكمية | ملاحظات\n1 |  |  |  | \n2 |  |  |  | \n3 |  |  |  | \n4 |  |  |  | \n5 |  |  |  | \n\nاستلمت الأصناف عالية سليمة وبحالة جيدة.\n\nالمستلم: ................................        القائم بالتسليم: ................................" },
] as const;
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character] ?? character)); }
function formatDraftDate(value: Date | string | null | undefined) { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }); }
function readLocalDrafts(key: string): LocalDraft[] { if (typeof window === "undefined") return []; try { const parsed = JSON.parse(window.localStorage.getItem(key) || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }

const RECEIPT_LAYOUT = { warehouse: { top: 17.35, left: 56.2, width: 22.8 }, date: { top: 19.85, left: 56.2, width: 22.8 }, hotel: { top: 32.7, left: 30.5, width: 35 }, job: { top: 35.65, left: 32.5, width: 30 }, notes: { left: 7, width: 24.8 }, quantity: { left: 31.8, width: 9.6 }, unit: { left: 41.4, width: 9.8 }, item: { left: 51.2, width: 30.4 }, firstRowTop: 49.25, rowStep: 3.88, signaturesTop: 77.55, receiver: { left: 62, width: 20 }, handover: { left: 15, width: 20 } } as const;
function receiptFieldPosition(field: { top?: number; left: number; width: number }) { return `top:${field.top ?? 0}%;left:${field.left}%;width:${field.width}%;transform:translateY(-50%)`; }
function receiptEditorStyle(field: { top?: number; left: number; width: number }) { return { top: `${field.top ?? 0}%`, left: `${field.left}%`, width: `${field.width}%`, transform: "translateY(-50%)" }; }

function normalizeReceiptData(value: Partial<ReceiptData> | null | undefined): ReceiptData {
  const source = value ?? {};
  return { ...emptyReceipt, ...source, rows: Array.from({ length: 5 }, (_, index) => ({ ...emptyReceipt.rows[index], ...(source.rows?.[index] ?? {}) })) };
}
function receiptDocumentHtml(receiptData: ReceiptData) {
  const rows = receiptData.rows.map((row, index) => { const top = RECEIPT_LAYOUT.firstRowTop + index * RECEIPT_LAYOUT.rowStep; return `<span class="field item" style="${receiptFieldPosition({ ...RECEIPT_LAYOUT.item, top })}">${escapeHtml(row.item)}</span><span class="field unit" style="${receiptFieldPosition({ ...RECEIPT_LAYOUT.unit, top })}">${escapeHtml(row.unit)}</span><span class="field qty" style="${receiptFieldPosition({ ...RECEIPT_LAYOUT.quantity, top })}">${escapeHtml(row.quantity)}</span><span class="field notes" style="${receiptFieldPosition({ ...RECEIPT_LAYOUT.notes, top })}">${escapeHtml(row.notes)}</span>`; }).join("");
  const fieldRules = { warehouse: receiptFieldPosition(RECEIPT_LAYOUT.warehouse), date: receiptFieldPosition(RECEIPT_LAYOUT.date), hotel: receiptFieldPosition(RECEIPT_LAYOUT.hotel), job: receiptFieldPosition(RECEIPT_LAYOUT.job), receiver: receiptFieldPosition({ top: RECEIPT_LAYOUT.signaturesTop, ...RECEIPT_LAYOUT.receiver }), handover: receiptFieldPosition({ top: RECEIPT_LAYOUT.signaturesTop, ...RECEIPT_LAYOUT.handover }) };
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>محضر استلام بضائع</title><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;width:100%;min-height:100%;background:#e9eef0}body{display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:12px}.sheet{position:relative;width:min(210mm,calc(100vw - 24px));height:auto;aspect-ratio:210 / 297;flex:0 0 auto;overflow:hidden;background:#fff;box-shadow:0 2px 14px rgba(16,42,67,.18)}.sheet>img{position:absolute;inset:0;width:100%;height:100%;display:block}.field{position:absolute;display:block;text-align:center;font:700 clamp(11px,2vw,16px) Tahoma,Arial,sans-serif;color:#102a43;direction:rtl;white-space:nowrap;overflow:hidden;line-height:1.15}.notes{text-align:center}.item{text-align:center}.warehouse,.date,.hotel,.job{text-align:right}.clean-field{background:#fff;padding:0 2px}@media print{html,body{width:210mm;height:297mm;min-height:297mm;padding:0;background:#fff;overflow:hidden}.sheet{width:210mm;height:297mm;aspect-ratio:auto;box-shadow:none}.field{font-size:16px}}@media (min-width:700px){body{padding:24px}.sheet{width:min(210mm,calc(100vw - 48px))}}</style></head><body><div class="sheet"><img src="/assets/receipt-template.png" alt="محضر استلام بضائع"><span class="field warehouse clean-field" style="${fieldRules.warehouse}">${escapeHtml(receiptData.warehouse)}</span><span class="field date clean-field" style="${fieldRules.date}">${escapeHtml(receiptData.date)}</span><span class="field hotel" style="${fieldRules.hotel}">${escapeHtml(receiptData.hotel)}</span><span class="field job" style="${fieldRules.job}">${escapeHtml(receiptData.job)}</span>${rows}<span class="field receiver clean-field" style="${fieldRules.receiver}">${escapeHtml(receiptData.receiver)}</span><span class="field handover clean-field" style="${fieldRules.handover}">${escapeHtml(receiptData.handover)}</span></div></body></html>`;
}
function ReceiptTemplateEditor({ data, onChange }: { data: ReceiptData; onChange: (next: ReceiptData) => void }) {
  const setField = (field: keyof Omit<ReceiptData, "rows">, value: string) => onChange({ ...data, [field]: value });
  const setRow = (index: number, field: keyof ReceiptRow, value: string) => onChange({ ...data, rows: data.rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row) });
  const inputClass = "receipt-draft-input h-11 w-full rounded-lg border-[#b9d4d9] bg-white px-3 text-sm font-bold text-[#102a43] placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-[#0d7180]";
  const labelClass = "receipt-draft-label block space-y-1.5 text-xs font-black leading-5 text-[#536b78]";
  return <div className="receipt-draft-editor space-y-4"><p className="text-xs leading-6 text-slate-500">نفس ورقة المحضر الأصلية والترويسة محفوظة. اكتب البيانات في الخانات الواضحة أسفل المعاينة، وستظهر فوق الخانات المطبوعة عند المعاينة والطباعة.</p><div className="receipt-draft-preview relative mx-auto w-full max-w-[760px] overflow-hidden rounded-xl border border-[#b9d4d9] bg-white shadow-sm"><img src="/assets/receipt-template.png" alt="محضر استلام بضائع" className="block w-full" /><div className="pointer-events-none absolute inset-0">{[data.warehouse, data.date, data.hotel, data.job].map((value, index) => <span key={index} className="receipt-overlay-field absolute block overflow-hidden text-center text-[clamp(11px,2vw,16px)] font-bold leading-tight text-[#102a43]" style={receiptEditorStyle([RECEIPT_LAYOUT.warehouse, RECEIPT_LAYOUT.date, RECEIPT_LAYOUT.hotel, RECEIPT_LAYOUT.job][index])}>{value}</span>)}{data.rows.map((row, index) => <div key={index}>{(["item", "unit", "quantity", "notes"] as const).map(key => <span key={key} className="receipt-overlay-field absolute block overflow-hidden text-center text-[clamp(11px,2vw,16px)] font-bold leading-tight text-[#102a43]" style={receiptEditorStyle({ ...RECEIPT_LAYOUT[key], top: RECEIPT_LAYOUT.firstRowTop + index * RECEIPT_LAYOUT.rowStep })}>{row[key]}</span>)}</div>)}<span className="receipt-overlay-field absolute block overflow-hidden text-center text-[clamp(11px,2vw,16px)] font-bold leading-tight text-[#102a43]" style={receiptEditorStyle({ top: RECEIPT_LAYOUT.signaturesTop, ...RECEIPT_LAYOUT.receiver })}>{data.receiver}</span><span className="receipt-overlay-field absolute block overflow-hidden text-center text-[clamp(11px,2vw,16px)] font-bold leading-tight text-[#102a43]" style={receiptEditorStyle({ top: RECEIPT_LAYOUT.signaturesTop, ...RECEIPT_LAYOUT.handover })}>{data.handover}</span></div></div><div className="rounded-xl border border-[#b9d4d9] bg-[#f7fbfc] p-4"><div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>المخازن<Input value={data.warehouse} onChange={event => setField("warehouse", event.target.value)} placeholder="المخزن" className={inputClass} /></label><label className={labelClass}>التاريخ<Input value={data.date} onChange={event => setField("date", event.target.value)} placeholder="التاريخ" className={inputClass} /></label><label className={labelClass}>اسم الفندق / الإدارة بعد النقطتين<Input value={data.hotel} onChange={event => setField("hotel", event.target.value)} placeholder="اختياري" className={inputClass} /></label><label className={labelClass}>الوظيفة بعد النقطتين<Input value={data.job} onChange={event => setField("job", event.target.value)} placeholder="اختياري" className={inputClass} /></label></div><div className="receipt-draft-table-wrap mt-4 overflow-x-auto"><table className="receipt-draft-table w-full min-w-[680px] table-fixed text-sm"><thead><tr className="text-xs font-black text-[#536b78]"><th className="w-8">م</th><th className="w-[31%] text-right">اسم الصنف</th><th className="w-[15%]">الوحدة</th><th className="w-[14%]">الكمية</th><th className="w-[31%] text-right">الملاحظات</th></tr></thead><tbody>{data.rows.map((row, index) => <tr key={index}><td className="py-1 text-center font-bold">{index + 1}</td>{(["item", "unit", "quantity", "notes"] as const).map(key => <td key={key} className="px-1 py-1 align-middle"><Input aria-label={`${key} ${index + 1}`} value={row[key]} onChange={event => setRow(index, key, event.target.value)} className={inputClass} /></td>)}</tr>)}</tbody></table></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className={labelClass}>اسم المستلم<Input value={data.receiver} onChange={event => setField("receiver", event.target.value)} placeholder="اختياري" className={inputClass} /></label><label className={labelClass}>اسم القائم بالتسليم<Input value={data.handover} onChange={event => setField("handover", event.target.value)} placeholder="اختياري" className={inputClass} /></label></div></div></div>;
}
export default function DraftsPage() {
  const { user } = useAuth();
  const storageKey = `${storagePrefix}:${user?.id ?? "guest"}`;
  const [drafts, setDrafts] = useState<LocalDraft[]>(() => readLocalDrafts(storageKey));
  const [form, setForm] = useState<DraftForm>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
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
    setForm(current => ({ ...current, kind: "note", title: template.title, body: template.key === "receipt" ? JSON.stringify(emptyReceipt) : template.body, receiptData: template.key === "receipt" ? { ...emptyReceipt, rows: emptyReceipt.rows.map(row => ({ ...row })) } : undefined, inkDataUrl: "" }));
    setCustodyWarehouseId("");
    setCustodyItemId("");
    window.requestAnimationFrame(() => loadInk(""));
    toast.success(`تم فتح نموذج ${template.label} — عدّل البيانات ثم احفظ أو اطبع`);
  }
  const isSurveyCustody = form.title.includes("عهدة") && form.title.includes("مساحة");
  const isReceipt = form.title.trim() === "محضر استلام بضائع";
  const receiptData = normalizeReceiptData(form.receiptData);
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
    if (isReceipt) {
      setPreviewHtml(receiptDocumentHtml(receiptData));
      return;
    }
    const isCustodyPrint = isSurveyCustody;
    const ink = form.inkDataUrl ? `<div class="ink"><h3>التوقيع أو الملاحظات اليدوية</h3><img src="${form.inkDataUrl}" alt="كتابة يدوية" /></div>` : "";
    const custodyNotice = isCustodyPrint ? `<div class="notice"><strong>طبيعة المحضر:</strong> عهدة تشغيل مؤقتة. الجهاز في عهدة المستلم لحين إعادته إلى المخزن وفحصه واعتماد إقفال العهدة.</div>` : "";
    const signatures = isCustodyPrint ? `<section class="signatures"><div><strong>مستلم العهدة</strong><br>الاسم: ................<br>التوقيع: ................<br>التاريخ: ................</div><div><strong>المسؤول المباشر</strong><br>الاسم: ................<br>التوقيع: ................<br>التاريخ: ................</div><div><strong>أمين المخزن عند التسليم</strong><br>الاسم: ................<br>التوقيع: ................<br>التاريخ: ................</div><div><strong>أمين المخزن عند الإعادة</strong><br>الاسم: ................<br>التوقيع: ................<br>التاريخ: ................</div></section>` : `<section class="signatures"><div>إعداد<br>................</div><div>مراجعة أمين المخزن<br>................</div><div>اعتماد الإدارة<br>................</div></section>`;
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) { toast.error("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى."); return; }
    printWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,Tahoma,sans-serif;color:#102a43;margin:18mm 15mm;line-height:1.75}h1{text-align:center;color:#0d4f62;border-bottom:3px solid #0d4f62;padding-bottom:12px;margin-bottom:18px}pre{font-family:Arial,Tahoma,sans-serif;white-space:pre-wrap;font-size:${isCustodyPrint ? "12.5" : "15"}px;line-height:${isCustodyPrint ? "1.75" : "2.1"};border:1px solid #b9d4d9;border-radius:10px;padding:18px;min-height:260px}.meta{display:flex;justify-content:space-between;color:#536b78;font-size:11px}.notice{margin:14px 0;padding:12px 16px;border:1px solid #d7b46a;background:#fff9eb;border-radius:8px;color:#694b16}.signatures{display:grid;grid-template-columns:repeat(${isCustodyPrint ? "2" : "3"},1fr);gap:14px;margin-top:24px;text-align:center;page-break-inside:avoid}.signatures>div{border:1px solid #b9d4d9;border-radius:8px;padding:14px;min-height:82px;font-size:12px}.ink{margin-top:24px}.ink img{max-width:100%;height:130px;border:1px solid #b9d4d9;border-radius:8px}@media print{body{margin:12mm}.notice{break-inside:avoid}h1{font-size:22px}}</style></head><body><div class="meta"><span>قطاع المخازن والإنشاءات</span><span>${new Date().toLocaleDateString("ar-EG")}</span></div><h1>${escapeHtml(title)}</h1>${custodyNotice}<pre>${escapeHtml(body)}</pre>${ink}${signatures}<script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  }
  function printPreview() {
    const frame = document.getElementById("draft-print-preview") as HTMLIFrameElement | null;
    frame?.contentWindow?.focus();
    frame?.contentWindow?.print();
  }
  async function shareCurrentDraft() {
    const title = form.title.trim() || "مسودة مخزنية";
    const body = isReceipt ? `المخازن: ${receiptData.warehouse}\nالتاريخ: ${receiptData.date}\nإدارة الفندق: ${receiptData.hotel}\nالوظيفة: ${receiptData.job}\n${receiptData.rows.map((row, index) => `${index + 1}. ${row.item} | ${row.unit} | ${row.quantity} | ${row.notes}`).join("\n")}\nالمستلم: ${receiptData.receiver}\nالقائم بالتسليم: ${receiptData.handover}` : form.body.trim() || "—";
    const text = `${title}\n\n${body}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text });
        return;
      }
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
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
    let receiptData = draft.receiptData ? normalizeReceiptData(draft.receiptData) : undefined;
    if (!receiptData && draft.title.trim() === "محضر استلام بضائع") { try { receiptData = normalizeReceiptData(JSON.parse(draft.body) as ReceiptData); } catch { receiptData = { ...emptyReceipt, rows: emptyReceipt.rows.map(row => ({ ...row })) }; } }
    setForm({ kind: draft.kind, title: draft.title, body: draft.body, movementType: draft.movementType, itemCode: draft.itemCode, quantity: draft.quantity, counterparty: draft.counterparty, warehouse: draft.warehouse, inkDataUrl, receiptData });
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
    <Card className="border-0 bg-white/85 shadow-sm dark:bg-[#172b35]"><CardHeader><CardTitle className="flex items-center gap-2 text-lg dark:text-white"><FilePenLine className="h-5 w-5 text-[#d08a3b]" />نماذج مذكرات قطاع المخازن والإنشاءات</CardTitle><p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-300">اختر نموذجًا جاهزًا، أكمل البيانات، ثم احفظه أو اطبعه.</p></CardHeader><CardContent><div className="flex flex-wrap gap-2">{memoTemplates.map(template => <Button key={template.key} type="button" variant="outline" onClick={() => applyTemplate(template)} className="rounded-xl border-[#d9c08d] bg-[#fffaf0] text-[#9b621d] hover:bg-[#fff4df]"><FilePenLine className="ml-2 h-4 w-4" />{template.label}</Button>)}<Button type="button" variant="outline" onClick={printCurrentDraft} className="rounded-xl border-[#0d7180] text-[#0d4f62]"><Printer className="ml-2 h-4 w-4" />معاينة وطباعة النموذج الحالي</Button></div><p className="mt-3 text-xs leading-6 text-slate-500">النماذج تشغيلية وقابلة للتعديل، وتحتوي أماكن فارغة للتوقيع والمراجعة والاعتماد.</p></CardContent></Card>
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <Card className="border-0 bg-white/85 shadow-sm dark:bg-[#172b35]"><CardHeader><CardTitle className="flex items-center justify-between text-lg dark:text-white">الملاحظات المحفوظة <Button type="button" size="icon" onClick={reset} className="rounded-xl bg-[#0d7180] text-white" aria-label="ملاحظة جديدة"><Plus className="h-4 w-4" /></Button></CardTitle></CardHeader><CardContent className="space-y-3">{drafts.length === 0 ? <p className="text-sm text-slate-500">لا توجد ملاحظات محفوظة بعد.</p> : drafts.map(draft => <div key={draft.id} className={`rounded-2xl border p-3 ${editingId === draft.id ? "border-[#0d7180] bg-[#e8f8f8]" : "border-slate-200 bg-white dark:border-slate-600 dark:bg-[#203d47]"}`}><div className="flex items-start gap-2"><button type="button" onClick={() => selectDraft(draft)} className="min-w-0 flex-1 text-right"><p className="truncate text-sm font-black text-[#102a43] dark:text-white">{draft.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-300">{draft.body}</p><p className="mt-2 text-[10px] text-slate-400">{formatDraftDate(draft.updatedAt)} · {draft.kind === "movement" ? "مسودة إذن" : "ملاحظة"}</p></button><Button type="button" variant="outline" size="icon" onClick={() => deleteDraft(draft.id)} className="h-9 w-9 shrink-0 rounded-xl border-red-200 text-red-600 hover:bg-red-50" aria-label={`حذف ${draft.title}`}><Trash2 className="h-4 w-4" /></Button></div></div>)}</CardContent></Card>
      <Card className="border-0 bg-white/85 shadow-sm dark:bg-[#172b35]"><CardHeader><CardTitle className="flex items-center gap-2 text-lg dark:text-white"><FilePenLine className="h-5 w-5 text-[#0d7180]" />{editingId ? "تعديل الملاحظة" : "ملاحظة جديدة"}</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2"><Button type="button" variant={form.kind === "note" ? "default" : "outline"} onClick={() => setForm(current => ({ ...current, kind: "note", title: current.title || "ملاحظة جديدة" }))} className="rounded-xl">ملاحظة عامة</Button><Button type="button" variant={form.kind === "movement" ? "default" : "outline"} onClick={() => setForm(current => ({ ...current, kind: "movement", title: current.title || "مسودة إذن مخزني" }))} className="rounded-xl">مسودة إذن مخزني</Button></div>
        <Input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="عنوان الملاحظة" className="h-12 rounded-xl" />
        {isSurveyCustody && <div className="space-y-3 rounded-2xl border border-[#b9d4d9] bg-[#f7fbfc] p-4"><div><p className="font-black text-[#102a43]">ربط العهدة بالمخزن والأكواد</p><p className="mt-1 text-xs leading-5 text-slate-500">اختر المخزن والجهاز من البيانات المعتمدة. سيُدرج كود الصنف تلقائيًا، بينما يُستكمل الرقم التسلسلي والباركود الخاص بالجهاز يدويًا.</p></div><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs font-bold text-slate-500">المخزن<select value={custodyWarehouseId} onChange={event => { setCustodyWarehouseId(event.target.value); setCustodyItemId(""); }} className="mt-1 h-11 w-full rounded-xl border border-input bg-white px-3 text-sm font-bold text-[#102a43]"><option value="">اختر المخزن</option>{(warehouses.data ?? []).map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} — رقم {warehouse.slot}</option>)}</select></label><label className="space-y-1 text-xs font-bold text-slate-500">الجهاز / الصنف<select value={custodyItemId} onChange={event => setCustodyItemId(event.target.value)} disabled={!custodyWarehouseId} className="mt-1 h-11 w-full rounded-xl border border-input bg-white px-3 text-sm font-bold text-[#102a43]"><option value="">اختر الجهاز أو الصنف</option>{custodyItems.map(item => <option key={item.id} value={item.id}>{item.name} — {item.code}</option>)}</select></label></div><Button type="button" onClick={insertCustodyItem} disabled={!custodyItemId} className="rounded-xl bg-[#0d7180] text-white hover:bg-[#095d69]">إدراج الجهاز بالكود في المذكرة</Button></div>}
        {isReceipt ? <ReceiptTemplateEditor data={receiptData} onChange={next => setForm(current => ({ ...current, receiptData: next, body: JSON.stringify(next) }))} /> : <div className="flex items-start gap-2"><Textarea value={form.body} onChange={event => setForm(current => ({ ...current, body: event.target.value }))} placeholder="اكتب الملاحظة أو اضغط الميكروفون للإملاء الصوتي..." className="min-h-40 rounded-xl text-base leading-8" /><VoiceInputButton onText={text => setForm(current => ({ ...current, body: current.body ? `${current.body}\n${text}` : text }))} label="إملاء الملاحظة بالصوت" className="h-12 w-12 rounded-full border-[#0d7180] bg-[#e8f8f8] text-[#0d7180]" /></div>}
        <div className="rounded-2xl border border-[#b9d4d9] bg-[#f7fbfc] p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-black text-[#102a43]"><PenLine className="h-4 w-4 text-[#0d7180]" />كتابة بالقلم أو اللمس</div><Button type="button" variant="outline" size="sm" onClick={clearInk} className="h-8 rounded-lg text-xs"><Eraser className="ml-1 h-3.5 w-3.5" />مسح</Button></div><canvas ref={inkCanvasRef} width={1200} height={260} onPointerDown={startInk} onPointerMove={drawInk} onPointerUp={stopInk} onPointerCancel={stopInk} onPointerLeave={event => { if (drawingRef.current) drawInk(event); }} className="h-52 w-full touch-none rounded-xl border border-dashed border-[#9fcbd0] bg-white" aria-label="لوحة الكتابة بالقلم أو اللمس" /><p className="mt-2 text-[11px] leading-5 text-slate-500">اكتب بإصبعك أو بالقلم الإلكتروني أو بالماوس، ثم احفظ المسودة.</p></div>
        {form.kind === "movement" && <div className="grid gap-3 sm:grid-cols-2"><select value={form.movementType} onChange={event => setForm(current => ({ ...current, movementType: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3"><option value="addition">إضافة من مورد</option><option value="disbursement">صرف لعميل/جهة</option><option value="transfer">تحويل بين مخازن</option></select><Input value={form.itemCode} onChange={event => setForm(current => ({ ...current, itemCode: event.target.value }))} placeholder="كود الصنف" className="rounded-xl" /><Input value={form.quantity} onChange={event => setForm(current => ({ ...current, quantity: event.target.value }))} placeholder="الكمية" className="rounded-xl" /><Input value={form.counterparty} onChange={event => setForm(current => ({ ...current, counterparty: event.target.value }))} placeholder="المورد أو العميل" className="rounded-xl" /><Input value={form.warehouse} onChange={event => setForm(current => ({ ...current, warehouse: event.target.value }))} placeholder="المخزن" className="rounded-xl" /></div>}
        <div className="flex flex-wrap gap-3"><Button type="button" onClick={save} className="rounded-xl bg-[#0d4f62] text-white"><Save className="ml-2 h-4 w-4" />{editingId ? "تحديث الملاحظة" : "حفظ الملاحظة"}</Button><Button type="button" variant="outline" onClick={printCurrentDraft} className="rounded-xl border-[#0d7180] text-[#0d4f62]"><Printer className="ml-2 h-4 w-4" />معاينة قبل الطباعة</Button><Button type="button" variant="outline" onClick={() => void shareCurrentDraft()} className="rounded-xl border-[#25d366] text-[#128c45]"><Share2 className="ml-2 h-4 w-4" />مشاركة واتساب</Button><Button type="button" variant="outline" onClick={reset} className="rounded-xl">ملاحظة جديدة</Button><span className="flex items-center gap-2 text-xs text-slate-500"><Mic className="h-4 w-4" />يمكنك إملاء النص بالعربية أو بالإنجليزية</span></div>
      </CardContent></Card>
    </div>
    {previewHtml && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6"><div className="flex h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><div><h2 className="font-black text-[#102a43]">معاينة محضر الاستلام</h2><p className="text-xs text-slate-500">يمكن طباعة النموذج كاملًا حتى لو كانت جميع الخانات فارغة.</p></div><div className="flex gap-2"><Button type="button" onClick={printPreview} className="rounded-xl bg-[#0d4f62] text-white"><Printer className="ml-2 h-4 w-4" />طباعة</Button><Button type="button" variant="outline" onClick={() => setPreviewHtml("")} className="rounded-xl"><X className="ml-2 h-4 w-4" />إغلاق</Button></div></div><iframe id="draft-print-preview" title="معاينة المحضر قبل الطباعة" srcDoc={previewHtml} className="min-h-0 flex-1 bg-slate-100" /></div></div>}
  </div></DashboardLayout>;
}
