import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, PackagePlus, Plus, Trash2, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type PreviousDisbursement = {
  itemCode?: string;
  warehouseId?: number | string | null;
  quantity?: unknown;
};

type BatchLine = { itemCode: string; quantity: string };

function localToday() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function formatQty(value: number) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 3 }).format(value)
    : "0";
}

export function DisbursementBalancePreview({
  itemCode,
  warehouseId,
  quantity,
  previous,
  unit,
}: {
  itemCode: string;
  warehouseId: string;
  quantity: string;
  previous?: PreviousDisbursement;
  unit?: string | null;
}) {
  const id = Number(warehouseId);
  const query = trpc.items.warehouseStocks.useQuery(
    { warehouseId: id },
    { enabled: id > 0 && itemCode.trim().length > 0 },
  );
  if (!itemCode.trim() || id <= 0) return null;
  if (query.isLoading) return <p className="mt-2 text-xs text-slate-500">جارٍ جلب رصيد المخزن لمعاينة الحركة…</p>;
  if (query.error) return <p className="mt-2 text-xs font-semibold text-red-600">تعذر جلب رصيد المخزن؛ لن تُحفظ الحركة قبل التحقق.</p>;
  const row = query.data?.find(item => item.code === itemCode.trim());
  const current = Number(row?.currentStock ?? 0);
  const sameBalance = previous?.itemCode === itemCode.trim() && Number(previous?.warehouseId) === id;
  const before = current + (sameBalance ? Number(previous?.quantity ?? 0) : 0);
  const after = before - Number(quantity || 0);
  const displayUnit = unit || row?.unit || "وحدة";
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-[#b9d4d9] bg-[#f4fbfb] p-3 text-xs">
      <div><span className="block text-slate-500">الرصيد قبل الحركة</span><strong className="mt-1 inline-block text-sm text-[#0d4f62]">{formatQty(before)} {displayUnit}</strong></div>
      <div><span className="block text-slate-500">الرصيد بعد الحركة</span><strong className={`mt-1 inline-block text-sm ${after < 0 ? "text-red-600" : "text-emerald-700"}`}>{formatQty(after)} {displayUnit}</strong></div>
      {Number(quantity) < 0 ? <p className="col-span-2 leading-5 text-[#0d4f62]">هذا تصحيح صرف سالب: يزيد رصيد المخزن بمقدار {formatQty(Math.abs(Number(quantity)))} {displayUnit} ويظهر بالسالب في حساب العميل.</p> : null}
    </div>
  );
}

export function DisbursementBatchDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(localToday);
  const [eznNum, setEznNum] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<BatchLine[]>([{ itemCode: "", quantity: "" }]);
  const [mobileStep, setMobileStep] = useState<0 | 1>(0);
  const requestIdRef = useRef("");
  const utils = trpc.useUtils();
  const warehouses = trpc.warehouses.listByUsage.useQuery(undefined, { enabled: open });
  const buildings = trpc.buildings.list.useQuery(undefined, { enabled: open });
  const customers = trpc.customers.list.useQuery(undefined, { enabled: open });
  const numericWarehouseId = Number(warehouseId);
  const stockQuery = trpc.items.warehouseStocks.useQuery(
    { warehouseId: numericWarehouseId },
    { enabled: open && numericWarehouseId > 0 },
  );
  const createBatch = trpc.disbursements.batch.useMutation();
  const stockByCode = useMemo(() => new Map((stockQuery.data ?? []).map(item => [item.code, item])), [stockQuery.data]);
  const selectedCodes = lines.map(line => line.itemCode).filter(Boolean);
  const hasDuplicateCode = new Set(selectedCodes).size !== selectedCodes.length;
  const invalidLines = lines.some(line => !line.itemCode || !(Number(line.quantity) > 0) || !stockByCode.has(line.itemCode));
  const hasInsufficientStock = lines.some(line => {
    const stock = Number(stockByCode.get(line.itemCode)?.currentStock ?? 0);
    return line.itemCode && Number(line.quantity) > stock;
  });

  useEffect(() => {
    if (!open) return;
    setMobileStep(0);
    setDate(localToday());
    setEznNum("");
    setWarehouseId("");
    setBuildingId("");
    setCustomerId("");
    setDestination("");
    setNotes("");
    setLines([{ itemCode: "", quantity: "" }]);
    requestIdRef.current = `batch-${globalThis.crypto?.randomUUID?.().replaceAll("-", "") ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;
  }, [open]);

  useEffect(() => {
    if (!warehouseId && warehouses.data?.length) setWarehouseId(String(warehouses.data[0].id));
  }, [warehouseId, warehouses.data]);

  function advanceMobileStep() {
    if (!date || !eznNum.trim() || !warehouseId || !buildingId) {
      toast.error("أدخل التاريخ ورقم الإذن واختر المخزن والمبنى أولاً");
      return;
    }
    setMobileStep(1);
  }

  function updateLine(index: number, patch: Partial<BatchLine>) {
    setLines(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!navigator.onLine) { toast.error("إذن الصرف متعدد الأصناف يحتاج إلى اتصال مباشر لحفظه ذرياً."); return; }
    if (!date || !eznNum.trim() || !warehouseId || !buildingId || invalidLines || hasDuplicateCode || hasInsufficientStock) {
      if (!date || !eznNum.trim() || !warehouseId || !buildingId) setMobileStep(0);
      toast.error(hasDuplicateCode ? "الصنف مكرر؛ اجمع كميته في بند واحد." : "راجع التاريخ ورقم الإذن والمخزن والمبنى والأصناف والأرصدة.");
      return;
    }
    try {
      const result = await createBatch.mutateAsync({
        date,
        eznNum: eznNum.trim(),
        warehouseId: numericWarehouseId,
        buildingId: Number(buildingId),
        customerId: customerId ? Number(customerId) : null,
        destination: destination || null,
        notes: notes || null,
        disburseType: "صرف",
        clientRequestId: requestIdRef.current,
        lines: lines.map(line => ({ itemCode: line.itemCode, quantity: Number(line.quantity) })),
      });
      toast.success(result.idempotent ? "الإذن محفوظ مسبقاً؛ لم تُكرر أي حركة." : `تم تسجيل إذن ${eznNum} بعدد ${result.count} أصناف في معاملة واحدة.`);
      await Promise.all([utils.dashboard.summary.invalidate(), utils.items.list.invalidate(), utils.items.warehouseStocks.invalidate()]);
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message || "تعذر حفظ الإذن؛ لم يتم اعتماد أي بند من الإذن.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto rounded-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-black text-[#102a43]"><PackagePlus className="h-5 w-5 text-[#0d7180]" />إذن صرف متعدد الأصناف</DialogTitle>
          <DialogDescription>كل البنود تُحفظ أو تُرفض معاً. تظهر أرصدة المخزن قبل الصرف وبعده لكل صنف، ولا تُجمع وحدات قياس مختلفة في إجمالي مضلل.</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="space-y-4">
          <div className="rounded-xl border border-[#b9d4d9] bg-[#f4fbfb] p-3 md:hidden" aria-live="polite"><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-black text-[#0d4f62]">الخطوة {mobileStep + 1} من 2</p><p className="mt-1 text-sm font-black text-[#102a43]">{mobileStep === 0 ? "بيانات الإذن" : "بنود الصرف"}</p></div><span className="text-xs font-bold text-slate-500">{mobileStep === 0 ? "50%" : "100%"}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white"><div className={`h-full rounded-full bg-[#0d7180] transition-all duration-300 ${mobileStep === 0 ? "w-1/2" : "w-full"}`} /></div></div>
          <div className={`grid gap-3 sm:grid-cols-2 ${mobileStep === 1 ? "hidden md:grid" : ""}`}>
            <label className="space-y-1.5 text-sm font-bold text-slate-700">التاريخ<Input type="date" value={date} onChange={event => setDate(event.target.value)} required /></label>
            <label className="space-y-1.5 text-sm font-bold text-slate-700">رقم الإذن<Input value={eznNum} onChange={event => setEznNum(event.target.value)} placeholder="مثال: 5229" required /></label>
            <label className="space-y-1.5 text-sm font-bold text-slate-700"><span className="flex items-center gap-1"><Warehouse className="h-4 w-4" />المخزن المصدر</span><select value={warehouseId} onChange={event => setWarehouseId(event.target.value)} required disabled={!warehouses.data?.length} className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"><option value="">اختر المخزن</option>{warehouses.data?.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
            <label className="space-y-1.5 text-sm font-bold text-slate-700">المبنى / الجهة المستفيدة<select value={buildingId} onChange={event => { const id = event.target.value; setBuildingId(id); setDestination(buildings.data?.find(building => String(building.id) === id)?.name ?? ""); }} required className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"><option value="">اختر المبنى أو الجهة</option>{buildings.data?.map(building => <option key={building.id} value={building.id}>{building.name}</option>)}</select></label>
            <label className="space-y-1.5 text-sm font-bold text-slate-700">العميل (اختياري)<select value={customerId} onChange={event => { const id = event.target.value; setCustomerId(id); if (id) setDestination(customers.data?.find(customer => String(customer.id) === id)?.name ?? destination); }} className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"><option value="">اختر العميل عند الحاجة</option>{customers.data?.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
            <label className="space-y-1.5 text-sm font-bold text-slate-700 sm:col-span-2">ملاحظات مشتركة (اختياري)<Textarea value={notes} onChange={event => setNotes(event.target.value)} maxLength={1000} className="min-h-16" /></label>
          </div>

          <section className={`space-y-3 rounded-2xl border border-[#dce7ee] bg-[#fbfdff] p-3 sm:p-4 ${mobileStep === 0 ? "hidden md:block" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-black text-[#102a43]">بنود الصرف</h3><p className="text-xs text-slate-500">اختر الصنف من رصيد المخزن ثم أدخل كمية موجبة.</p></div><Button type="button" variant="outline" onClick={() => setLines(current => [...current, { itemCode: "", quantity: "" }])} disabled={lines.length >= 50} className="rounded-xl"><Plus className="ml-1 h-4 w-4" />إضافة صنف</Button></div>
            {stockQuery.isLoading ? <div className="flex items-center gap-2 rounded-xl bg-white p-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />جاري تحميل رصيد المخزن…</div> : stockQuery.error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">تعذر تحميل أرصدة هذا المخزن.</p> : !stockQuery.data?.length ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">لا توجد أرصدة أصناف مسجلة لهذا المخزن.</p> : null}
            <div className="space-y-3">
              {lines.map((line, index) => {
                const item = stockByCode.get(line.itemCode);
                const before = Number(item?.currentStock ?? 0);
                const after = before - Number(line.quantity || 0);
                return (
                  <div key={index} className="grid gap-2 rounded-xl border border-[#e5eef1] bg-white p-3 sm:grid-cols-[minmax(0,1fr)_150px_40px] sm:items-end">
                    <label className="space-y-1.5 text-xs font-bold text-slate-600">الصنف<select value={line.itemCode} onChange={event => updateLine(index, { itemCode: event.target.value })} required className="flex h-10 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-sm"><option value="">اختر الصنف</option>{(stockQuery.data ?? []).map(stockItem => <option key={stockItem.id} value={stockItem.code}>{stockItem.code} — {stockItem.name} (المتاح {formatQty(Number(stockItem.currentStock))} {stockItem.unit || "وحدة"})</option>)}</select></label>
                    <label className="space-y-1.5 text-xs font-bold text-slate-600">الكمية ({item?.unit || "وحدة"})<Input type="number" min="0.001" step="0.001" value={line.quantity} onChange={event => updateLine(index, { quantity: event.target.value })} placeholder="0.000" required /></label>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setLines(current => current.length === 1 ? [{ itemCode: "", quantity: "" }] : current.filter((_, lineIndex) => lineIndex !== index))} aria-label="حذف بند من المسودة" className="h-10 w-10 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></Button>
                    {item ? <div className="sm:col-span-2 flex flex-wrap gap-x-5 gap-y-1 rounded-lg bg-[#f4fbfb] px-3 py-2 text-xs"><span className="text-slate-500">قبل: <strong className="text-[#0d4f62]">{formatQty(before)} {item.unit || "وحدة"}</strong></span><span className="text-slate-500">بعد: <strong className={after < 0 ? "text-red-600" : "text-emerald-700"}>{formatQty(after)} {item.unit || "وحدة"}</strong></span></div> : null}
                  </div>
                );
              })}
            </div>
            {hasDuplicateCode ? <p className="flex items-start gap-2 text-xs font-bold text-red-600"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />الصنف مكرر في أكثر من بند؛ اجمع الكمية في بند واحد.</p> : null}
            {hasInsufficientStock ? <p className="flex items-start gap-2 text-xs font-bold text-red-600"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />يوجد بند أكبر من الرصيد المتاح؛ لن يُسجّل الإذن بهذا الوضع.</p> : null}
          </section>
          <div className="flex items-center justify-between gap-2 md:hidden"><Button type="button" variant="outline" onClick={() => setMobileStep(0)} disabled={mobileStep === 0} className="rounded-xl">السابق</Button><Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">إلغاء</Button>{mobileStep === 0 ? <Button type="button" onClick={advanceMobileStep} className="rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]">التالي</Button> : <Button type="submit" disabled={createBatch.isPending || !warehouseId || !buildingId || invalidLines || hasDuplicateCode || hasInsufficientStock || stockQuery.isLoading} className="rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]">{createBatch.isPending ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />جاري الحفظ…</> : "حفظ إذن الصرف"}</Button>}</div>
          <DialogFooter className="hidden gap-2 md:flex md:justify-start">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">إلغاء</Button>
            <Button type="submit" disabled={createBatch.isPending || !warehouseId || !buildingId || invalidLines || hasDuplicateCode || hasInsufficientStock || stockQuery.isLoading} className="rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]">{createBatch.isPending ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />جاري حفظ البنود معاً…</> : "حفظ إذن الصرف"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
