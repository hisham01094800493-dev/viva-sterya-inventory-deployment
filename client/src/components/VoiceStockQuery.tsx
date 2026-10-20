import { useEffect, useMemo, useState } from "react";
import { Mic, Search, Volume2, VolumeX, Warehouse, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { VoiceInputButton } from "./VoiceInputButton";

function formatQuantity(value: string | number, unit?: string | null) {
  const number = Number(value ?? 0);
  return `${number.toLocaleString("ar-EG", { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}`;
}

export function VoiceStockQuery() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [speakResults, setSpeakResults] = useState(true);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const query = trpc.items.voiceStockQuery.useQuery({ query: submitted || "رصيد" }, { enabled: open && Boolean(submitted), retry: false });
  const result = query.data;
  const selected = result?.matches?.find(match => match.id === selectedMatchId) ?? (result?.ambiguous ? undefined : result?.matches?.[0]);
  const canRecord = online;
  const normalizedForButton = useMemo(() => draft.trim(), [draft]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  useEffect(() => {
    if (!open || !result || !selected || !speakResults || (result.ambiguous && selectedMatchId === null)) return;
    const parts = [`${selected.name}: الرصيد الإجمالي ${formatQuantity(selected.totalCurrentStock, selected.unit)}`];
    selected.warehouseBalances.forEach(balance => parts.push(`${balance.name} ${formatQuantity(balance.currentStock, selected.unit)}`));
    const utterance = new SpeechSynthesisUtterance(parts.join("، "));
    utterance.lang = "ar-EG";
    window.speechSynthesis?.cancel();
    window.speechSynthesis?.speak(utterance);
    return () => window.speechSynthesis?.cancel();
  }, [open, result, selected, selectedMatchId, speakResults]);

  function submit(value = draft) {
    const next = value.trim();
    if (!next) { toast.error("اكتب سؤالاً مثل: كام رصيد الأسمنت؟"); return; }
    setDraft(next);
    setSelectedMatchId(null);
    setSubmitted(next);
  }

  function close() {
    window.speechSynthesis?.cancel();
    setOpen(false);
  }

  return <>
    <Button type="button" onClick={() => setOpen(true)} aria-label="استعلام صوتي عن الرصيد" title="استعلام صوتي عن الرصيد" className="fixed bottom-24 right-4 z-[55] h-14 w-14 rounded-full bg-[#0d7180] p-0 text-white shadow-[0_12px_30px_rgba(13,113,128,0.35)] hover:bg-[#095b66] md:bottom-8 md:right-8">
      <Mic className="h-6 w-6" />
    </Button>
    <Dialog open={open} onOpenChange={value => value ? setOpen(true) : close()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-3xl p-0" dir="rtl">
        <DialogHeader className="border-b border-[#dce7ee] bg-gradient-to-l from-[#e8f8f8] to-[#fffaf0] px-5 py-5 dark:border-[#4f7077] dark:from-[#203d47] dark:to-[#182934]">
          <DialogTitle className="flex items-center gap-2 text-xl font-black text-[#102a43] dark:text-[#f1fbfc]"><Mic className="h-5 w-5 text-[#0d7180] dark:text-[#8ed3d1]" />استعلام صوتي عن الرصيد</DialogTitle>
          <DialogDescription className="dark:text-[#c7dadd]">قل اسم الصنف أو الكود، ويمكنك ذكر اسم المخزن.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Input value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") submit(); }} placeholder="مثال: كام رصيد الأسمنت في المخزن الرئيسي؟" className="h-12 rounded-xl text-base" aria-label="نص استعلام الرصيد" />
            <Button type="button" onClick={() => submit()} disabled={!normalizedForButton} className="h-12 shrink-0 rounded-xl bg-[#0d4f62] px-4 text-white"><Search className="ml-2 h-4 w-4" />بحث</Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dce7ee] bg-[#f7fbfc] p-3 dark:border-[#4f7077] dark:bg-[#203d47]">
            <div className="flex items-center gap-2 text-sm font-bold text-[#102a43] dark:text-[#f1fbfc]">
              <VoiceInputButton onText={text => { setDraft(text); setSubmitted(text); }} disabled={!canRecord} label="تحدث عن الصنف" className="h-12 w-12 rounded-full border-[#0d7180] bg-white text-[#0d7180] dark:bg-[#182934] dark:text-[#8ed3d1]" />
              <span>{canRecord ? "اضغط الميكروفون وتحدث" : "التسجيل غير متاح دون إنترنت"}</span>
            </div>
            <Button type="button" variant="outline" onClick={() => setSpeakResults(value => !value)} className="rounded-xl" aria-pressed={speakResults}>{speakResults ? <Volume2 className="ml-2 h-4 w-4" /> : <VolumeX className="ml-2 h-4 w-4" />}{speakResults ? "النطق مفعّل" : "النطق متوقف"}</Button>
          </div>
          {query.isFetching ? <div className="rounded-2xl border border-[#dce7ee] p-5 text-center text-sm font-bold text-slate-500">جارٍ البحث في الأرصدة المسموحة...</div> : null}
          {result && !query.isFetching && result.ambiguous ? <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-black text-amber-900">اختر الصنف المقصود — تظهر الأرصدة أسفل كل اختيار:</p>{result.matches.length ? result.matches.map(match => <button key={match.id} type="button" onClick={() => { setSelectedMatchId(match.id); setDraft(`رصيد ${match.name}`); }} className={`block w-full rounded-xl border px-4 py-3 text-right hover:bg-amber-100 ${selectedMatchId === match.id ? "border-[#0d7180] bg-[#e8f8f8]" : "border-amber-200 bg-white"}`}><span className="font-black text-[#102a43]">{match.name}</span> <span className="text-xs text-slate-500">({match.code})</span><span className="mt-1 block text-sm font-black text-[#0d7180]">الإجمالي: {formatQuantity(match.totalCurrentStock, match.unit)}</span><span className="mt-1 block text-xs text-slate-500">{match.warehouseBalances.map(balance => `${balance.name}: ${formatQuantity(balance.currentStock, match.unit)}`).join(" • ") || "لا يوجد رصيد مسجل"}</span></button>) : <p className="text-sm text-amber-800">لم أجد صنفاً مطابقاً. جرّب الاسم أو الكود بشكل أوضح.</p>}</div> : null}
          {selected ? <div className="space-y-4 rounded-2xl border border-[#8bc5c9] bg-[#eef8f7] p-5 dark:border-[#5b7e84] dark:bg-[#203d47]">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#0d7180] dark:text-[#8ed3d1]">الصنف المطابق</p><h3 className="mt-1 text-xl font-black text-[#102a43] dark:text-[#f1fbfc]">{selected.name}</h3><p className="text-xs text-slate-500 dark:text-[#c7dadd]">الكود: {selected.code}</p></div><Warehouse className="h-7 w-7 text-[#0d7180]" /></div>
            <div className="rounded-xl bg-[#0d4f62] p-4 text-white"><p className="text-sm font-bold text-white/80">الرصيد الإجمالي</p><p className="mt-1 text-3xl font-black">{formatQuantity(selected.totalCurrentStock, selected.unit)}</p></div>
            <div className="grid gap-2 sm:grid-cols-2">{selected.warehouseBalances.map(balance => <div key={balance.warehouseId} className="rounded-xl border border-[#b9d4d9] bg-white p-3 dark:border-[#5b7e84] dark:bg-[#182934]"><p className="text-sm font-bold text-[#102a43] dark:text-[#f1fbfc]">{balance.name}</p><p className="mt-1 text-lg font-black text-[#0d7180] dark:text-[#8ed3d1]">{formatQuantity(balance.currentStock, selected.unit)}</p></div>)}</div>
          </div> : null}
          {query.error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">تعذر تنفيذ الاستعلام. تحقق من الصلاحية والاتصال.</p> : null}
          <Button type="button" variant="outline" onClick={close} className="w-full rounded-xl"><X className="ml-2 h-4 w-4" />إغلاق</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
