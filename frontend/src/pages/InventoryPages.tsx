import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Edit3,
  Filter,
  Loader2,
  Package,
  Plus,
  Search,
  Settings2,
  Upload,
  Trash2,
  Phone,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const formatQuantity = (value: number | string | null | undefined) => new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 3 }).format(Number(value ?? 0));
const today = () => new Date().toISOString().slice(0, 10);

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-[#d08a3b]">{eyebrow}</p><h2 className="text-3xl font-black tracking-tight text-[#102a43]">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">{description}</p></div>{action}</div>;
}

function LoadingRows({ columns = 5 }: { columns?: number }) {
  return <div className="space-y-3 p-6">{Array.from({ length: 5 }).map((_, row) => <div key={row} className="flex gap-3">{Array.from({ length: columns }).map((__, column) => <div key={column} className="h-10 flex-1 animate-pulse rounded-lg bg-slate-100" />)}</div>)}</div>;
}

function EmptyTable({ title, description, icon: Icon = Package }: { title: string; description: string; icon?: typeof Package }) {
  return <div className="flex flex-col items-center justify-center px-6 py-16 text-center"><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f1f2] text-[#0d4f62]"><Icon className="h-6 w-6" /></div><p className="font-black text-[#102a43]">{title}</p><p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">{description}</p></div>;
}

function ItemsDialog({ open, onOpenChange, editing, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; editing?: any; onSaved: () => void }) {
  const [form, setForm] = useState({ code: "", name: "", initialStock: "0", reorderLevel: "0", category: "", unit: "" });
  const utils = trpc.useUtils();
  const create = trpc.items.create.useMutation();
  const update = trpc.items.update.useMutation();
  const busy = create.isPending || update.isPending;

  useEffect(() => {
    setForm(editing ? { code: editing.code, name: editing.name, initialStock: String(editing.initialStock ?? "0"), reorderLevel: String(editing.reorderLevel ?? "0"), category: editing.category ?? "", unit: editing.unit ?? "" } : { code: "", name: "", initialStock: "0", reorderLevel: "0", category: "", unit: "" });
  }, [editing, open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      const payload = { code: form.code, name: form.name, initialStock: Number(form.initialStock), reorderLevel: Number(form.reorderLevel), category: form.category || null, unit: form.unit || null };
      if (editing) await update.mutateAsync({ id: editing.id, ...payload });
      else await create.mutateAsync(payload);
      await utils.items.list.invalidate();
      await utils.dashboard.summary.invalidate();
      toast.success(editing ? "تم تحديث بيانات الصنف" : "تمت إضافة الصنف بنجاح");
      onSaved();
      onOpenChange(false);
    } catch (error: any) { toast.error(error?.message || "تعذر حفظ الصنف"); }
  }

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm(current => ({ ...current, [key]: event.target.value }));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl rounded-2xl" dir="rtl"><DialogHeader><DialogTitle className="text-xl font-black text-[#102a43]">{editing ? "تعديل بيانات الصنف" : "إضافة صنف جديد"}</DialogTitle><DialogDescription>أدخل البيانات الأساسية وحدد المستوى الذي تبدأ عنده التنبيهات.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="كود الصنف" required><Input value={form.code} onChange={set("code")} placeholder="مثال: ST-001" required /></Field><Field label="اسم الصنف" required><Input value={form.name} onChange={set("name")} placeholder="اكتب اسم الصنف" required /></Field><Field label="الرصيد الأولي"><Input type="number" min="0" step="0.001" value={form.initialStock} onChange={set("initialStock")} /></Field><Field label="حد الطلب"><Input type="number" min="0" step="0.001" value={form.reorderLevel} onChange={set("reorderLevel")} /></Field><Field label="التصنيف"><Input value={form.category} onChange={set("category")} placeholder="اختياري" /></Field><Field label="وحدة القياس"><Input value={form.unit} onChange={set("unit")} placeholder="قطعة، كرتونة..." /></Field></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">إلغاء</Button><Button type="submit" disabled={busy} className="rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]">{busy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}{editing ? "حفظ التعديل" : "إضافة الصنف"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

type ImportRow = { code: string; name: string; initialStock: number; reorderLevel: number; category: string | null; unit: string | null };

function ImportItemsDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (open: boolean) => void; onImported: () => void }) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [rejected, setRejected] = useState(0);
  const [previewIssues, setPreviewIssues] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const importMutation = trpc.items.importBulk.useMutation();

  const parseNumber = (value: unknown) => {
    const normalized = String(value ?? "0").replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[٬,]/g, "").replace("٫", ".").trim();
    const numeric = Number(normalized);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
  };
  const getCell = (row: Record<string, unknown>, labels: string[]) => {
    const found = Object.entries(row).find(([key]) => labels.includes(key.trim().toLowerCase()));
    return found?.[1] ?? "";
  };

  async function readFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const source = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
      const accepted: ImportRow[] = [];
      const issues: string[] = [];
      const seenCodes = new Set<string>();
      let rejectedRows = 0;
      source.forEach((row, index) => {
        const code = String(getCell(row, ["code", "كود الصنف", "كود", "item code"])).trim();
        const name = String(getCell(row, ["name", "اسم الصنف", "بيان الصنف", "الاسم"])).trim();
        if (!code || !name) { rejectedRows += 1; issues.push(`الصف ${index + 2}: ${!code ? "كود الصنف مفقود" : "اسم الصنف مفقود"}`); return; }
        if (seenCodes.has(code)) issues.push(`الصف ${index + 2}: الكود ${code} مكرر داخل الملف وسيتم تحديث السجل الموجود`);
        seenCodes.add(code);
        accepted.push({
          code,
          name,
          initialStock: parseNumber(getCell(row, ["initialstock", "initial stock", "الرصيد الأولي", "رصيد الجرد", "الرصيد"])),
          reorderLevel: parseNumber(getCell(row, ["reorderlevel", "reorder level", "حد الطلب", "حد إعادة الطلب"])),
          category: String(getCell(row, ["category", "نوع الصنف", "التصنيف"])).trim() || null,
          unit: String(getCell(row, ["unit", "الوحدة", "وحدة القياس"])).trim() || null,
        });
      });
      setRows(accepted);
      setRejected(rejectedRows);
      setPreviewIssues(issues);
      setFileName(file.name);
    } catch (error: any) {
      toast.error(error?.message || "تعذر قراءة الملف. استخدم ملف Excel أو CSV صالحاً.");
    } finally {
      event.target.value = "";
    }
  }

  async function submit() {
    if (!rows.length) return;
    try {
      const result = await importMutation.mutateAsync({ rows });
      toast.success(`اكتمل الاستيراد: ${result.created} جديد، ${result.updated} محدث`);
      onImported();
      onOpenChange(false);
      setRows([]); setRejected(0); setPreviewIssues([]); setFileName("");
    } catch (error: any) { toast.error(error?.message || "تعذر استيراد البيانات"); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-4xl rounded-2xl" dir="rtl"><DialogHeader><DialogTitle className="text-xl font-black text-[#102a43]">استيراد دليل الأصناف</DialogTitle><DialogDescription>ارفع ملف Excel أو CSV. يجب أن يحتوي على كود الصنف واسم الصنف، ويمكنه احتواء الرصيد الأولي وحد الطلب والتصنيف والوحدة.</DialogDescription></DialogHeader><div className="space-y-5"><label className="flex cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#b9d4d9] bg-[#f7fbfc] px-6 py-8 text-center transition-colors hover:border-[#0d4f62] hover:bg-[#eef7f7]"><input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={readFile} /><FileSpreadsheet className="h-7 w-7 text-[#0d806c]" /><span><span className="block font-black text-[#102a43]">{fileName || "اختر ملف Excel أو CSV"}</span><span className="mt-1 block text-xs text-slate-400">سيتم فحص الصفوف قبل إدخالها إلى قاعدة البيانات</span></span><Upload className="h-5 w-5 text-[#0d4f62]" /></label>{rows.length > 0 || rejected > 0 || previewIssues.length > 0 ? <div className="overflow-hidden rounded-xl border border-[#e5eef1]"><div className="flex flex-wrap items-center gap-3 border-b border-[#e5eef1] bg-[#fbfdff] px-4 py-3 text-xs font-bold"><span className="flex items-center gap-1 text-[#0d806c]"><CheckCircle2 className="h-4 w-4" />{rows.length} صف جاهز</span>{rejected > 0 ? <span className="text-[#bd5147]">{rejected} صف مرفوض لغياب الكود أو الاسم</span> : null}</div>{previewIssues.length ? <div className="max-h-28 overflow-auto border-b border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800">{previewIssues.map((issue, index) => <div key={`${issue}-${index}`}>{issue}</div>)}</div> : null}<div className="max-h-64 overflow-auto"><table className="w-full min-w-[700px] text-right text-xs"><thead className="sticky top-0 bg-white text-slate-400"><tr><th className="px-4 py-3">الكود</th><th className="px-4 py-3">اسم الصنف</th><th className="px-4 py-3">الرصيد الأولي</th><th className="px-4 py-3">حد الطلب</th><th className="px-4 py-3">التصنيف</th><th className="px-4 py-3">الوحدة</th></tr></thead><tbody className="divide-y divide-[#f0f4f6]">{rows.slice(0, 20).map((row, index) => <tr key={`${row.code}-${index}`}><td className="px-4 py-3 font-mono">{row.code}</td><td className="px-4 py-3 font-bold text-[#102a43]">{row.name}</td><td className="px-4 py-3">{formatQuantity(row.initialStock)}</td><td className="px-4 py-3">{formatQuantity(row.reorderLevel)}</td><td className="px-4 py-3">{row.category || "—"}</td><td className="px-4 py-3">{row.unit || "—"}</td></tr>)}</tbody></table></div>{rows.length > 20 ? <p className="border-t border-[#e5eef1] px-4 py-3 text-xs text-slate-400">تظهر أول 20 صفاً فقط في المعاينة، وسيتم استيراد جميع الصفوف الجاهزة.</p> : null}</div> : <div className="rounded-xl border border-[#edf2f5] bg-[#fbfdff] px-5 py-6 text-center text-sm text-slate-400">لم يتم اختيار ملف بعد.</div>}</div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">إلغاء</Button><Button type="button" onClick={submit} disabled={!rows.length || importMutation.isPending} className="rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]">{importMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}استيراد {rows.length ? `${rows.length} صف` : "البيانات"}</Button></DialogFooter></DialogContent></Dialog>;
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) { return <div className="space-y-2"><Label className="text-xs font-bold text-slate-600">{label}{required ? <span className="mr-1 text-red-500">*</span> : null}</Label>{children}</div>; }

export function ItemsPage() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>();
  const [importOpen, setImportOpen] = useState(false);
  const input = useMemo(() => search.trim() ? { search: search.trim() } : undefined, [search]);
  const query = trpc.items.list.useQuery(input) as { data?: any[]; isLoading: boolean; error: unknown; refetch: () => unknown };
  const utils = trpc.useUtils();
  const categories = useMemo(() => Array.from(new Set((query.data ?? []).map(item => item.category || "بدون تصنيف"))).sort((a, b) => a.localeCompare(b, "ar")), [query.data]);
  const visibleItems = useMemo(() => [...(query.data ?? [])].filter(item => { const category = item.category || "بدون تصنيف"; const low = Number(item.reorderLevel) > 0 ? Number(item.currentStock) <= Number(item.reorderLevel) : Number(item.currentStock) <= 0; return (categoryFilter === "all" || category === categoryFilter) && (stockFilter === "all" || (stockFilter === "low" ? low : !low)); }).sort((a, b) => { if (sortBy === "stock") return Number(b.currentStock) - Number(a.currentStock); if (sortBy === "code") return a.code.localeCompare(b.code, "ar"); return a.name.localeCompare(b.name, "ar"); }), [query.data, categoryFilter, stockFilter, sortBy]);
  const remove = trpc.items.delete.useMutation();

  async function deleteItem(item: any) {
    if (!window.confirm(`هل تريد حذف الصنف «${item.name}»؟ لا يمكن حذف صنف لديه حركات.`)) return;
    try { await remove.mutateAsync({ id: item.id }); await utils.items.list.invalidate(); toast.success("تم حذف الصنف"); } catch (error: any) { toast.error(error?.message || "تعذر حذف الصنف"); }
  }

  return <DashboardLayout><div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-7"><PageHeader eyebrow="CATALOG / STOCK" title="الأصناف والمخزون" description="دليل مركزي لكل الأصناف مع الرصيد الحالي والوارد والمنصرف وحد الطلب." action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setImportOpen(true)} className="h-11 rounded-xl border-[#b9d4d9] bg-white px-4 font-bold text-[#0d4f62] hover:bg-[#eef7f7]"><Upload className="ml-2 h-4 w-4" />استيراد Excel / CSV</Button><Button onClick={() => { setEditing(undefined); setDialogOpen(true); }} className="h-11 rounded-xl bg-[#0d4f62] px-5 font-bold text-white shadow-lg shadow-[#0d4f62]/15 hover:bg-[#0a4150]"><Plus className="ml-2 h-4 w-4" />إضافة صنف</Button></div>} /><Card className="border-0 bg-white shadow-[0_10px_30px_rgba(18,44,84,0.055)]"><CardContent className="p-0"><div className="flex flex-col gap-3 border-b border-[#edf2f5] p-5 md:flex-row md:items-center md:justify-between"><div className="relative w-full max-w-md"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث بالكود أو اسم الصنف..." className="h-11 rounded-xl border-[#dce7ee] pr-10" /></div><div className="flex flex-wrap items-center gap-2"><select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="h-10 rounded-xl border border-[#dce7ee] bg-white px-3 text-xs font-bold text-slate-600 outline-none"><option value="all">كل التصنيفات</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select><select value={stockFilter} onChange={event => setStockFilter(event.target.value)} className="h-10 rounded-xl border border-[#dce7ee] bg-white px-3 text-xs font-bold text-slate-600 outline-none"><option value="all">كل الحالات</option><option value="low">منخفض المخزون</option><option value="healthy">مخزون مستقر</option></select><select value={sortBy} onChange={event => setSortBy(event.target.value)} className="h-10 rounded-xl border border-[#dce7ee] bg-white px-3 text-xs font-bold text-slate-600 outline-none"><option value="name">ترتيب حسب الاسم</option><option value="code">ترتيب حسب الكود</option><option value="stock">ترتيب حسب الرصيد</option></select><span className="flex items-center gap-2 text-xs font-bold text-slate-400"><Filter className="h-4 w-4" />{visibleItems.length} صنف</span></div></div>{query.isLoading ? <LoadingRows columns={7} /> : query.error ? <EmptyTable title="تعذر تحميل الأصناف" description="راجع اتصال قاعدة البيانات أو حاول تحديث الصفحة." /> : !visibleItems.length ? <EmptyTable title="لا توجد أصناف بعد" description="ابدأ بإضافة أول صنف إلى دليل المخزون." /> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-right"><thead><tr className="bg-[#fbfdff] text-[11px] font-black text-slate-400"><th className="px-6 py-4">الصنف</th><th className="px-4 py-4">الكود</th><th className="px-4 py-4">الرصيد الحالي</th><th className="px-4 py-4">الوارد</th><th className="px-4 py-4">المنصرف</th><th className="px-4 py-4">حد الطلب</th><th className="px-6 py-4">إجراء</th></tr></thead><tbody className="divide-y divide-[#f0f4f6]">{visibleItems.map(item => { const low = Number(item.reorderLevel) > 0 ? Number(item.currentStock) <= Number(item.reorderLevel) : Number(item.currentStock) <= 0; return <tr key={item.id} className="transition-colors hover:bg-[#fbfdff]"><td className="px-6 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8f1f2] text-[#0d4f62]"><Package className="h-4 w-4" /></div><div><p className="font-bold text-[#102a43]">{item.name}</p><p className="mt-1 text-[11px] text-slate-400">{item.category || "بدون تصنيف"}</p></div></div></td><td className="px-4 py-4 font-mono text-xs text-slate-500">{item.code}</td><td className={`px-4 py-4 text-sm font-black ${low ? "text-[#bd5147]" : "text-[#0d806c]"}`}>{formatQuantity(item.currentStock)} <span className="text-[10px] font-normal text-slate-400">{item.unit || "وحدة"}</span></td><td className="px-4 py-4 text-sm font-semibold text-slate-600">{formatQuantity(item.incomingStock)}</td><td className="px-4 py-4 text-sm font-semibold text-slate-600">{formatQuantity(item.outgoingStock)}</td><td className="px-4 py-4 text-sm text-slate-500">{formatQuantity(item.reorderLevel)}</td><td className="px-6 py-4"><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => { setEditing(item); setDialogOpen(true); }} className="h-9 w-9 rounded-lg text-slate-400 hover:bg-[#e8f1f2] hover:text-[#0d4f62]"><Edit3 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => deleteItem(item)} disabled={remove.isPending} className="h-9 w-9 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></Button></div></td></tr>; })}</tbody></table></div>}</CardContent></Card><ItemsDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={() => query.refetch()} /><ImportItemsDialog open={importOpen} onOpenChange={setImportOpen} onImported={() => { query.refetch(); void utils.dashboard.summary.invalidate(); }} /></div></DashboardLayout>;
}

type MovementKind = "additions" | "disbursements" | "transfers";
type MovementRow = { id: number; date: string; eznNum: string; itemCode: string; itemName: string; quantity: string; [key: string]: any };
type MovementForm = { date: string; eznNum: string; itemCode: string; quantity: string; store: string; purpose: string; supplier: string; category: string; destination: string; notes: string; disburseType: string; fromStore: string; toStore: string; transferType: string };

const blankMovement = (): MovementForm => ({ date: today(), eznNum: "", itemCode: "", quantity: "", store: "", purpose: "", supplier: "", category: "", destination: "", notes: "", disburseType: "", fromStore: "", toStore: "", transferType: "transfer" });

function movementMeta(kind: MovementKind) {
  if (kind === "additions") return { eyebrow: "MOVEMENTS / INBOUND", title: "إضافات المخزون", description: "سجّل التوريدات والإضافات مع ربطها مباشرة بالرصيد الحالي لكل صنف.", button: "إضافة حركة", icon: ArrowDownToLine, accent: "#0d806c" };
  if (kind === "disbursements") return { eyebrow: "MOVEMENTS / OUTBOUND", title: "أذونات الصرف", description: "أنشئ أذونات صرف مع تحقق فوري يمنع تجاوز الرصيد المتاح.", button: "إذن صرف جديد", icon: ArrowUpFromLine, accent: "#bd5147" };
  return { eyebrow: "MOVEMENTS / TRANSFERS", title: "التحويلات والمرتجعات", description: "تتبّع حركة الأصناف بين المخازن وسجّل المرتجعات ضمن دورة المخزون.", button: "تحويل جديد", icon: ArrowLeftRight, accent: "#a96821" };
}

function MovementDialog({ kind, open, onOpenChange, editing, onSaved }: { kind: MovementKind; open: boolean; onOpenChange: (open: boolean) => void; editing?: MovementRow; onSaved: () => void }) {
  const [form, setForm] = useState<MovementForm>(blankMovement());
  const utils = trpc.useUtils();
  const createAddition = trpc.additions.create.useMutation(); const updateAddition = trpc.additions.update.useMutation();
  const createDisbursement = trpc.disbursements.create.useMutation(); const updateDisbursement = trpc.disbursements.update.useMutation();
  const createTransfer = trpc.transfers.create.useMutation(); const updateTransfer = trpc.transfers.update.useMutation();
  const busy = createAddition.isPending || updateAddition.isPending || createDisbursement.isPending || updateDisbursement.isPending || createTransfer.isPending || updateTransfer.isPending;

  useEffect(() => { if (!editing) { setForm(blankMovement()); return; } setForm({ ...blankMovement(), ...editing, quantity: String(editing.quantity ?? ""), store: editing.store ?? "", purpose: editing.purpose ?? "", supplier: editing.supplier ?? "", category: editing.category ?? "", destination: editing.destination ?? "", notes: editing.notes ?? "", disburseType: editing.disburseType ?? "", fromStore: editing.fromStore ?? "", toStore: editing.toStore ?? "", transferType: editing.transferType ?? "transfer" }); }, [editing, open]);
  const meta = movementMeta(kind);
  const set = (key: keyof MovementForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(current => ({ ...current, [key]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (kind === "additions") { const payload = { date: form.date, eznNum: form.eznNum, itemCode: form.itemCode, quantity: Number(form.quantity), store: form.store || null, purpose: form.purpose || null, supplier: form.supplier || null, category: form.category || null }; if (editing) await updateAddition.mutateAsync({ id: editing.id, ...payload }); else await createAddition.mutateAsync(payload); }
      if (kind === "disbursements") { const payload = { date: form.date, eznNum: form.eznNum, itemCode: form.itemCode, quantity: Number(form.quantity), destination: form.destination || null, notes: form.notes || null, store: form.store || null, disburseType: form.disburseType || null }; if (editing) await updateDisbursement.mutateAsync({ id: editing.id, ...payload }); else await createDisbursement.mutateAsync(payload); }
      if (kind === "transfers") { const payload = { date: form.date, eznNum: form.eznNum, itemCode: form.itemCode, quantity: Number(form.quantity), fromStore: form.fromStore || null, toStore: form.toStore || null, notes: form.notes || null, transferType: form.transferType || null }; if (editing) await updateTransfer.mutateAsync({ id: editing.id, ...payload }); else await createTransfer.mutateAsync(payload); }
      await Promise.all([utils.dashboard.summary.invalidate(), utils.items.list.invalidate()]);
      toast.success(editing ? "تم تحديث الحركة" : "تم تسجيل الحركة"); onSaved(); onOpenChange(false);
    } catch (error: any) { toast.error(error?.message || "تعذر حفظ الحركة"); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl rounded-2xl" dir="rtl"><DialogHeader><DialogTitle className="text-xl font-black text-[#102a43]">{editing ? "تعديل الحركة" : meta.button}</DialogTitle><DialogDescription>تأكد من كود الصنف والكمية قبل الحفظ حتى يبقى الرصيد دقيقاً.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="التاريخ" required><Input type="date" value={form.date} onChange={set("date")} required /></Field><Field label="رقم الإذن" required><Input value={form.eznNum} onChange={set("eznNum")} placeholder="مثال: إذن-1024" required /></Field><Field label="كود الصنف" required><Input value={form.itemCode} onChange={set("itemCode")} placeholder="اكتب الكود كما هو" required /></Field><Field label="الكمية" required><Input type="number" min="0.001" step="0.001" value={form.quantity} onChange={set("quantity")} placeholder="0.000" required /></Field>{kind === "additions" && <><Field label="المخزن"><Input value={form.store} onChange={set("store")} placeholder="المخزن الرئيسي" /></Field><Field label="المورد"><Input value={form.supplier} onChange={set("supplier")} /></Field><Field label="الغرض"><Input value={form.purpose} onChange={set("purpose")} /></Field><Field label="التصنيف"><Input value={form.category} onChange={set("category")} /></Field></>}{kind === "disbursements" && <><Field label="الجهة المستلمة"><Input value={form.destination} onChange={set("destination")} /></Field><Field label="نوع الصرف"><Input value={form.disburseType} onChange={set("disburseType")} placeholder="تشغيلي، إنتاج..." /></Field><Field label="المخزن"><Input value={form.store} onChange={set("store")} /></Field><Field label="ملاحظات"><Textarea value={form.notes} onChange={set("notes")} className="min-h-10" /></Field></>}{kind === "transfers" && <><Field label="من مخزن"><Input value={form.fromStore} onChange={set("fromStore")} /></Field><Field label="إلى مخزن"><Input value={form.toStore} onChange={set("toStore")} /></Field><Field label="نوع الحركة"><Input value={form.transferType} onChange={set("transferType")} placeholder="transfer أو مرتجع" /></Field><Field label="ملاحظات"><Textarea value={form.notes} onChange={set("notes")} className="min-h-10" /></Field></>}</div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">إلغاء</Button><Button type="submit" disabled={busy} className="rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]">{busy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}{editing ? "حفظ التعديل" : "تسجيل الحركة"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

type MovementImportPreview = { type: "addition" | "disbursement" | "transfer"; date: string; eznNum: string; itemCode: string; quantity: number; store?: string | null; purpose?: string | null; supplier?: string | null; category?: string | null; destination?: string | null; notes?: string | null; disburseType?: string | null; fromStore?: string | null; toStore?: string | null; transferType?: string | null };

function MovementImportDialog({ kind, open, onOpenChange, onImported }: { kind: MovementKind; open: boolean; onOpenChange: (open: boolean) => void; onImported: () => void }) {
  const [rows, setRows] = useState<MovementImportPreview[]>([]);
  const [rejected, setRejected] = useState(0);
  const [duplicates, setDuplicates] = useState(0);
  const [previewIssues, setPreviewIssues] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [resultErrors, setResultErrors] = useState<Array<{ row: number; message: string }>>([]);
  const importMutation = trpc.items.importMovements.useMutation();
  const parseNumber = (value: unknown) => { const normalized = String(value ?? "0").replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[٬,]/g, "").replace("٫", ".").trim(); const numeric = Number(normalized); return Number.isFinite(numeric) && numeric > 0 ? numeric : 0; };
  const getCell = (row: Record<string, unknown>, labels: string[]) => Object.entries(row).find(([key]) => labels.includes(key.trim().toLowerCase()))?.[1] ?? "";
  const movementType = (value: unknown): MovementImportPreview["type"] => { const normalized = String(value ?? "").trim().toLowerCase(); if (["addition", "add", "إضافة", "اضافة", "وارد"].includes(normalized)) return "addition"; if (["disbursement", "send", "صرف", "منصرف"].includes(normalized)) return "disbursement"; return "transfer"; };
  const defaultType: MovementImportPreview["type"] = kind === "additions" ? "addition" : kind === "disbursements" ? "disbursement" : "transfer";
  async function readFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const XLSX = await import("xlsx"); const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" }); const sheet = workbook.Sheets[workbook.SheetNames[0]]; const source = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const accepted: MovementImportPreview[] = []; const issues: string[] = []; let rejectedRows = 0; const seen = new Set<string>(); let duplicateRows = 0;
      source.forEach((row, index) => { const type = movementType(getCell(row, ["type", "نوع الحركة", "الحركة"])); const date = String(getCell(row, ["date", "التاريخ"])).trim(); const eznNum = String(getCell(row, ["eznnum", "ezn num", "رقم الإذن", "رقم الاذن", "الإذن"])).trim(); const itemCode = String(getCell(row, ["itemcode", "item code", "كود الصنف", "الكود"])).trim(); const quantity = parseNumber(getCell(row, ["quantity", "الكمية", "كمية"])); if (!date || !eznNum || !itemCode || quantity <= 0) { rejectedRows += 1; issues.push(`الصف ${index + 2}: ${!date ? "التاريخ مفقود" : !eznNum ? "رقم الإذن مفقود" : !itemCode ? "كود الصنف مفقود" : "الكمية يجب أن تكون أكبر من صفر"}`); return; } const key = [type, date, eznNum, itemCode, quantity].join("|"); if (seen.has(key)) { duplicateRows += 1; issues.push(`الصف ${index + 2}: الحركة مكررة لنفس الإذن والكود والكمية`); } seen.add(key); accepted.push({ type: getCell(row, ["type", "نوع الحركة", "الحركة"]) ? type : defaultType, date, eznNum, itemCode, quantity, store: String(getCell(row, ["store", "المخزن"])).trim() || null, purpose: String(getCell(row, ["purpose", "الغرض", "لوازم"])).trim() || null, supplier: String(getCell(row, ["supplier", "المورد", "وارد من"])).trim() || null, category: String(getCell(row, ["category", "التصنيف", "نوع الصنف"])).trim() || null, destination: String(getCell(row, ["destination", "الجهة", "الجهة المستلمة"])).trim() || null, notes: String(getCell(row, ["notes", "ملاحظات"])).trim() || null, disburseType: String(getCell(row, ["disbursetype", "نوع الصرف"])).trim() || null, fromStore: String(getCell(row, ["fromstore", "من مخزن"])).trim() || null, toStore: String(getCell(row, ["tostore", "إلى مخزن"])).trim() || null, transferType: String(getCell(row, ["transfertype", "نوع التحويل", "نوع الحركة"])).trim() || null }); });
      setRows(accepted); setRejected(rejectedRows); setDuplicates(duplicateRows); setPreviewIssues(issues); setFileName(file.name); setResultErrors([]);
    } catch (error: any) { toast.error(error?.message || "تعذر قراءة ملف الحركات"); } finally { event.target.value = ""; }
  }
  async function submit() { if (!rows.length) return; try { const result = await importMutation.mutateAsync({ rows }); setResultErrors(result.errors); toast.success(`تم استيراد ${result.imported} حركة، وتعذر ${result.failed}`); onImported(); if (!result.failed) { onOpenChange(false); setRows([]); setFileName(""); } } catch (error: any) { toast.error(error?.message || "تعذر استيراد الحركات"); } }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-5xl rounded-2xl" dir="rtl"><DialogHeader><DialogTitle className="text-xl font-black text-[#102a43]">استيراد حركات المخزون</DialogTitle><DialogDescription>يُستخدم نوع الحركة الموجود في الملف، أو نوع الشاشة الحالية عند تركه فارغاً. سيتم رفض الحقول الأساسية الناقصة قبل الحفظ.</DialogDescription></DialogHeader><div className="space-y-5"><label className="flex cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#b9d4d9] bg-[#f7fbfc] px-6 py-8 text-center hover:border-[#0d4f62] hover:bg-[#eef7f7]"><input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={readFile} /><FileSpreadsheet className="h-7 w-7 text-[#0d806c]" /><span><span className="block font-black text-[#102a43]">{fileName || "اختر ملف Excel أو CSV"}</span><span className="mt-1 block text-xs text-slate-400">الحقول الأساسية: التاريخ، رقم الإذن، كود الصنف، الكمية</span></span><Upload className="h-5 w-5 text-[#0d4f62]" /></label>{rows.length || rejected || previewIssues.length ? <div className="overflow-hidden rounded-xl border border-[#e5eef1]"><div className="flex flex-wrap gap-3 border-b border-[#e5eef1] bg-[#fbfdff] px-4 py-3 text-xs font-bold"><span className="text-[#0d806c]">{rows.length} صف جاهز</span>{rejected ? <span className="text-[#bd5147]">{rejected} مرفوض</span> : null}{duplicates ? <span className="text-[#a96821]">{duplicates} مكرر سيُرفض</span> : null}</div>{previewIssues.length ? <div className="max-h-28 overflow-auto border-b border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800">{previewIssues.map((issue, index) => <div key={`${issue}-${index}`}>{issue}</div>)}</div> : null}<div className="max-h-64 overflow-auto"><table className="w-full min-w-[850px] text-right text-xs"><thead className="sticky top-0 bg-white text-slate-400"><tr><th className="px-4 py-3">النوع</th><th className="px-4 py-3">التاريخ</th><th className="px-4 py-3">رقم الإذن</th><th className="px-4 py-3">الكود</th><th className="px-4 py-3">الكمية</th><th className="px-4 py-3">المخزن / الجهة</th></tr></thead><tbody className="divide-y divide-[#f0f4f6]">{rows.slice(0, 30).map((row, index) => <tr key={`${row.eznNum}-${index}`}><td className="px-4 py-3 font-bold">{row.type === "addition" ? "إضافة" : row.type === "disbursement" ? "صرف" : "تحويل"}</td><td className="px-4 py-3">{row.date}</td><td className="px-4 py-3">{row.eznNum}</td><td className="px-4 py-3 font-mono">{row.itemCode}</td><td className="px-4 py-3">{formatQuantity(row.quantity)}</td><td className="px-4 py-3">{row.store || row.destination || row.toStore || "—"}</td></tr>)}</tbody></table></div>{rows.length > 30 ? <p className="border-t border-[#e5eef1] px-4 py-3 text-xs text-slate-400">تظهر أول 30 صفاً في المعاينة، وسيتم إرسال جميع الصفوف الجاهزة.</p> : null}</div> : <div className="rounded-xl border border-[#edf2f5] bg-[#fbfdff] px-5 py-6 text-center text-sm text-slate-400">لم يتم اختيار ملف بعد.</div>}{resultErrors.length ? <div className="max-h-32 overflow-auto rounded-xl border border-red-100 bg-red-50 p-4 text-xs leading-6 text-red-700">{resultErrors.map(error => <div key={`${error.row}-${error.message}`}>الصف {error.row}: {error.message}</div>)}</div> : null}</div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">إلغاء</Button><Button type="button" onClick={submit} disabled={!rows.length || importMutation.isPending} className="rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]">{importMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}استيراد {rows.length ? `${rows.length} حركة` : "الحركات"}</Button></DialogFooter></DialogContent></Dialog>;
}

function MovementPage({ kind }: { kind: MovementKind }) {
  const meta = movementMeta(kind); const Icon = meta.icon;
  const [dialogOpen, setDialogOpen] = useState(false); const [importOpen, setImportOpen] = useState(false); const [editing, setEditing] = useState<MovementRow>();
  const additions = trpc.additions.list.useQuery({ limit: 100 }, { enabled: kind === "additions" });
  const disbursements = trpc.disbursements.list.useQuery({ limit: 100 }, { enabled: kind === "disbursements" });
  const transfers = trpc.transfers.list.useQuery({ limit: 100 }, { enabled: kind === "transfers" });
  const utils = trpc.useUtils(); const deleteAddition = trpc.additions.delete.useMutation(); const deleteDisbursement = trpc.disbursements.delete.useMutation(); const deleteTransfer = trpc.transfers.delete.useMutation();
  const query = kind === "additions" ? additions : kind === "disbursements" ? disbursements : transfers;
  const rows = (query.data ?? []) as MovementRow[];
  async function remove(row: MovementRow) { if (!window.confirm("هل أنت متأكد من حذف هذه الحركة؟ سيتم عكس أثرها على الرصيد.")) return; try { if (kind === "additions") await deleteAddition.mutateAsync({ id: row.id }); if (kind === "disbursements") await deleteDisbursement.mutateAsync({ id: row.id }); if (kind === "transfers") await deleteTransfer.mutateAsync({ id: row.id }); await Promise.all([query.refetch(), utils.dashboard.summary.invalidate(), utils.items.list.invalidate()]); toast.success("تم حذف الحركة وعكس أثرها"); } catch (error: any) { toast.error(error?.message || "تعذر حذف الحركة"); } }
  return <DashboardLayout><div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-7"><PageHeader eyebrow={meta.eyebrow} title={meta.title} description={meta.description} action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setImportOpen(true)} className="h-11 rounded-xl border-[#b9d4d9] bg-white px-4 font-bold text-[#0d4f62] hover:bg-[#eef7f7]"><Upload className="ml-2 h-4 w-4" />استيراد حركات</Button><Button onClick={() => { setEditing(undefined); setDialogOpen(true); }} className="h-11 rounded-xl bg-[#0d4f62] px-5 font-bold text-white shadow-lg shadow-[#0d4f62]/15 hover:bg-[#0a4150]"><Plus className="ml-2 h-4 w-4" />{meta.button}</Button></div>} /><div className="grid gap-4 sm:grid-cols-3"><Card className="border-0 bg-white shadow-sm"><CardContent className="flex items-center gap-4 p-5"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8f1f2] text-[#0d4f62]"><Icon className="h-5 w-5" /></div><div><p className="text-xs font-bold text-slate-400">عدد السجلات المعروضة</p><p className="mt-1 text-2xl font-black text-[#102a43]">{rows.length}</p></div></CardContent></Card><Card className="border-0 bg-white shadow-sm"><CardContent className="flex items-center gap-4 p-5"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff4df] text-[#a96821]"><ArrowDownToLine className="h-5 w-5" /></div><div><p className="text-xs font-bold text-slate-400">إجمالي الكميات</p><p className="mt-1 text-2xl font-black text-[#102a43]">{formatQuantity(rows.reduce((sum, row) => sum + Number(row.quantity), 0))}</p></div></CardContent></Card><Card className="border-0 bg-white shadow-sm"><CardContent className="flex items-center gap-4 p-5"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e7f3f1] text-[#0d806c]"><Settings2 className="h-5 w-5" /></div><div><p className="text-xs font-bold text-slate-400">حالة التحقق</p><p className="mt-1 text-sm font-black text-[#0d806c]">متصلة بالرصيد المباشر</p></div></CardContent></Card></div><Card className="border-0 bg-white shadow-[0_10px_30px_rgba(18,44,84,0.055)]"><CardContent className="p-0">{query.isLoading ? <LoadingRows columns={7} /> : query.error ? <EmptyTable title="تعذر تحميل الحركات" description="راجع صلاحية الحساب واتصال قاعدة البيانات." icon={AlertTriangle} /> : !rows.length ? <EmptyTable title="لا توجد حركات بعد" description="ابدأ بتسجيل أول حركة باستخدام الزر أعلى الصفحة." icon={Icon} /> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-right"><thead><tr className="bg-[#fbfdff] text-[11px] font-black text-slate-400"><th className="px-6 py-4">التاريخ</th><th className="px-4 py-4">رقم الإذن</th><th className="px-4 py-4">الصنف</th><th className="px-4 py-4">الكود</th><th className="px-4 py-4">الكمية</th><th className="px-4 py-4">التفاصيل</th><th className="px-6 py-4">إجراء</th></tr></thead><tbody className="divide-y divide-[#f0f4f6]">{rows.map(row => <tr key={row.id} className="transition-colors hover:bg-[#fbfdff]"><td className="px-6 py-4 text-sm text-slate-500">{row.date}</td><td className="px-4 py-4 font-mono text-xs text-[#0d4f62]">{row.eznNum}</td><td className="px-4 py-4 font-bold text-[#102a43]">{row.itemName}</td><td className="px-4 py-4 font-mono text-xs text-slate-400">{row.itemCode}</td><td className="px-4 py-4 font-black" style={{ color: meta.accent }}>{formatQuantity(row.quantity)}</td><td className="max-w-[220px] px-4 py-4 text-xs text-slate-400">{kind === "additions" ? row.supplier || row.store || "—" : kind === "disbursements" ? row.destination || row.store || "—" : `${row.fromStore || "—"} ← ${row.toStore || "—"}`}</td><td className="px-6 py-4"><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => { setEditing(row); setDialogOpen(true); }} className="h-9 w-9 rounded-lg text-slate-400 hover:bg-[#e8f1f2] hover:text-[#0d4f62]"><Edit3 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => remove(row)} className="h-9 w-9 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div>}</CardContent></Card><MovementDialog kind={kind} open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={() => query.refetch()} /><MovementImportDialog kind={kind} open={importOpen} onOpenChange={setImportOpen} onImported={() => { void query.refetch(); void utils.dashboard.summary.invalidate(); void utils.items.list.invalidate(); }} /></div></DashboardLayout>;
}

export function AdditionsPage() { return <MovementPage kind="additions" />; }
export function DisbursementsPage() { return <MovementPage kind="disbursements" />; }
export function TransfersPage() { return <MovementPage kind="transfers" />; }

export function AlertsPage() {
  const summary = trpc.dashboard.summary.useQuery();
  return <DashboardLayout><div className="mx-auto max-w-[1500px] space-y-7"><PageHeader eyebrow="MONITORING / ALERTS" title="التنبيهات الذكية" description="قائمة حية للأصناف التي وصلت إلى نسبة التنبيه المحددة في الإعدادات." action={<Badge className="rounded-full bg-[#fff0ed] px-4 py-2 text-[#bd5147] hover:bg-[#fff0ed]">نسبة التنبيه: {summary.data?.thresholdPercentage ?? 20}%</Badge>} /><Card className="border-0 bg-white shadow-[0_10px_30px_rgba(18,44,84,0.055)]"><CardContent className="p-0">{summary.isLoading ? <LoadingRows columns={5} /> : !summary.data?.lowStock.length ? <EmptyTable title="كل شيء مستقر" description="لا توجد أصناف تحت مستوى التنبيه الحالي." icon={Package} /> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-right"><thead><tr className="bg-[#fffaf9] text-[11px] font-black text-slate-400"><th className="px-6 py-4">الصنف</th><th className="px-4 py-4">الكود</th><th className="px-4 py-4">الرصيد الحالي</th><th className="px-4 py-4">حد الطلب</th><th className="px-6 py-4">التوصية</th></tr></thead><tbody className="divide-y divide-[#f0f4f6]">{summary.data.lowStock.map(item => <tr key={item.id}><td className="px-6 py-5 font-bold text-[#102a43]">{item.name}</td><td className="px-4 py-5 font-mono text-xs text-slate-400">{item.code}</td><td className="px-4 py-5 font-black text-[#bd5147]">{formatQuantity(item.currentStock)}</td><td className="px-4 py-5 text-slate-500">{formatQuantity(item.reorderLevel)}</td><td className="px-6 py-5"><span className="inline-flex items-center gap-2 rounded-full bg-[#fff0ed] px-3 py-1.5 text-xs font-bold text-[#bd5147]"><AlertTriangle className="h-3.5 w-3.5" />يُفضّل إنشاء طلب توريد</span></td></tr>)}</tbody></table></div>}</CardContent></Card></div></DashboardLayout>;
}

export function SettingsPage() {
  const settings = trpc.settings.list.useQuery();
  const update = trpc.settings.updateThreshold.useMutation();
  const updateReports = trpc.settings.updateReportConfig.useMutation();
  const whatsappConfig = trpc.whatsapp.getConfig.useQuery();
  const saveWhatsAppPhone = trpc.whatsapp.savePhone.useMutation();
  const testWhatsApp = trpc.whatsapp.testMessage.useMutation();
  const [percentage, setPercentage] = useState("20");
  const [recipients, setRecipients] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  useEffect(() => {
    const rows = settings.data ?? [];
    const threshold = rows.find(item => item.key === "threshold_percentage");
    const recipientRow = rows.find(item => item.key === "report_recipients");
    const enabledRow = rows.find(item => item.key === "reports_enabled");
    if (threshold) setPercentage(threshold.value);
    if (recipientRow) setRecipients(recipientRow.value);
    if (enabledRow) setEnabled(enabledRow.value !== "false");
  }, [settings.data]);
  useEffect(() => {
    if (whatsappConfig.data?.phone) {
      setWhatsappPhone(whatsappConfig.data.phone);
    }
  }, [whatsappConfig.data]);
  async function saveThreshold(event: React.FormEvent) {
    event.preventDefault();
    try { await update.mutateAsync({ percentage: Number(percentage) }); await settings.refetch(); toast.success("تم حفظ نسبة التنبيه"); }
    catch (error: any) { toast.error(error?.message || "تعذر حفظ الإعداد"); }
  }
  async function saveReports(event: React.FormEvent) {
    event.preventDefault();
    try { await updateReports.mutateAsync({ recipients, enabled }); await settings.refetch(); toast.success("تم حفظ إعدادات التقارير"); }
    catch (error: any) { toast.error(error?.message || "تعذر حفظ إعدادات التقارير"); }
  }
  async function saveWhatsApp(event: React.FormEvent) {
    event.preventDefault();
    try {
      await saveWhatsAppPhone.mutateAsync({ phone: whatsappPhone });
      await whatsappConfig.refetch();
      toast.success("تم حفظ رقم واتساب بنجاح");
    } catch (error: any) {
      toast.error(error?.message || "تعذر حفظ رقم واتساب");
    }
  }
  async function sendTestWhatsApp() {
    try {
      const result = await testWhatsApp.mutateAsync({ phone: whatsappPhone });
      if (result.success) {
        toast.success("تم إرسال رسالة واتساب التجريبية بنجاح");
      } else {
        toast.error(result.error || "فشل إرسال رسالة واتساب التجريبية");
      }
    } catch (error: any) {
      toast.error(error?.message || "تعذر إرسال رسالة واتساب التجريبية");
    }
  }
  return <DashboardLayout><div className="mx-auto max-w-[1200px] space-y-7"><PageHeader eyebrow="SYSTEM / CONFIGURATION" title="إعدادات النظام" description="اضبط حساسية التنبيهات ومستلمي التقارير الدورية من مكان واحد. بيانات SMTP تظل سرية وتُضاف من إعدادات المشروع." /><div className="grid gap-6 lg:grid-cols-2"><Card className="border-0 bg-white shadow-[0_10px_30px_rgba(18,44,84,0.055)]"><CardContent className="p-6 md:p-8"><div className="mb-7 flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f1f2] text-[#0d4f62]"><Settings2 className="h-6 w-6" /></div><div><p className="text-lg font-black text-[#102a43]">نسبة تنبيه انخفاض المخزون</p><p className="mt-1 text-xs leading-6 text-slate-400">تُستخدم لحساب الأصناف التي تحتاج إلى متابعة في لوحة التحكم.</p></div></div><form onSubmit={saveThreshold} className="space-y-5"><Field label="النسبة المئوية" required><div className="relative max-w-xs"><Input type="number" min="0" max="100" step="1" value={percentage} onChange={event => setPercentage(event.target.value)} className="h-12 rounded-xl pl-12 text-lg font-black" required /><span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-[#d08a3b]">%</span></div></Field><div className="rounded-2xl border border-[#f5e4c8] bg-[#fffaf2] p-4 text-sm leading-7 text-[#8a632f]">مثال: عند ضبط النسبة على 20%، سيظهر الصنف في التنبيهات عندما يساوي رصيده الحالي 20% أو أقل من حد الطلب.</div><Button type="submit" disabled={update.isPending} className="h-11 rounded-xl bg-[#0d4f62] px-6 font-bold text-white hover:bg-[#0a4150]">{update.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ الإعداد</Button></form></CardContent></Card><Card className="border-0 bg-white shadow-[0_10px_30px_rgba(18,44,84,0.055)]"><CardContent className="p-6 md:p-8"><div className="mb-7 flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff5e7] text-[#a96821]"><BellIcon /></div><div><p className="text-lg font-black text-[#102a43]">التقارير والتنبيهات</p><p className="mt-1 text-xs leading-6 text-slate-400">اكتب بريد المدير أو أكثر من مستلم، مفصولين بفاصلة أو سطر جديد.</p></div></div><form onSubmit={saveReports} className="space-y-5"><Field label="مستلمو التقارير"><Textarea value={recipients} onChange={event => setRecipients(event.target.value)} placeholder="manager@example.com\nwarehouse@example.com" className="min-h-28 rounded-xl" /></Field><label className="flex cursor-pointer items-center justify-between rounded-2xl border border-[#e5eef1] bg-[#fbfdff] px-4 py-4"><span><span className="block font-bold text-[#102a43]">تفعيل التنبيهات الدورية</span><span className="mt-1 block text-xs text-slate-400">يشمل تنبيه النقص والتقارير اليومية والأسبوعية.</span></span><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} className="h-5 w-5 accent-[#0d4f62]" /></label><div className="rounded-2xl border border-[#dcebee] bg-[#f4fafb] p-4 text-xs leading-6 text-[#386672]">بعد إضافة بيانات SMTP في أسرار المشروع، سيرسل النظام البريد تلقائياً. قبل ذلك سيستخدم إشعار المالك كبديل آمن، ولن يفقد التقرير.</div><Button type="submit" disabled={updateReports.isPending} className="h-11 rounded-xl bg-[#0d4f62] px-6 font-bold text-white hover:bg-[#0a4150]">{updateReports.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ إعدادات التقارير</Button></form></CardContent></Card><Card className="border-0 bg-white shadow-[0_10px_30px_rgba(18,44,84,0.055)] lg:col-span-2"><CardContent className="p-6 md:p-8"><div className="mb-7 flex items-center justify-between"><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Phone className="h-6 w-6" /></div><div><p className="text-lg font-black text-[#102a43]">إشعارات WhatsApp الرسمية</p><p className="mt-1 text-xs leading-6 text-slate-400">ربط رقم الوظيفة أو المدير لإرسال تنبيهات النواقص والتقارير عبر Meta Cloud API.</p></div></div><Badge className={`rounded-full px-3 py-1 text-xs font-bold ${whatsappConfig.data?.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{whatsappConfig.data?.configured ? "مفاتيح Meta مفعّلة" : "في انتظار مفاتيح Access Token"}</Badge></div><form onSubmit={saveWhatsApp} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="رقم المستلم على واتساب (مع رمز الدولة)"><Input value={whatsappPhone} onChange={event => setWhatsappPhone(event.target.value)} placeholder="مثال: 201012345678+" /></Field><div className="flex items-end gap-3"><Button type="submit" disabled={saveWhatsAppPhone.isPending} className="h-11 flex-1 rounded-xl bg-[#0d4f62] px-6 font-bold text-white hover:bg-[#0a4150]">{saveWhatsAppPhone.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ الرقم</Button><Button type="button" variant="outline" onClick={sendTestWhatsApp} disabled={testWhatsApp.isPending} className="h-11 rounded-xl border-emerald-600 text-emerald-700 hover:bg-emerald-50">{testWhatsApp.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}تجربة إرسال</Button></div></div><div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 text-xs leading-7 text-emerald-900">للبدء الفعلي، أضف <code>WHATSAPP_ACCESS_TOKEN</code> و <code>WHATSAPP_PHONE_NUMBER_ID</code> في أسرار المشروع. يمكنك قراءة ملف <code>whatsapp-guide.md</code> في المشروع للاطلاع على طريقة الحصول عليها من لوحة مطوري Meta خطوة بخطوة.</div></form></CardContent></Card></div></div></DashboardLayout>;
}

function BellIcon() { return <AlertTriangle className="h-6 w-6 text-[#f5c27b]" />; }
