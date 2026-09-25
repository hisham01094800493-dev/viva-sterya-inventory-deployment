import { useRef, useState } from "react";
import { ArrowRight, CheckCircle2, FileArchive, ShieldCheck, Upload, XCircle } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MigrationImportPage() {
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const submit = async () => {
    if (!file) {
      setResult({ ok: false, message: "اختر ملف حزمة الترحيل أولًا." });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/migration/import", {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: file,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "تعذر استيراد حزمة الترحيل");
      setResult({ ok: true, message: `تم الاستيراد بنجاح. الملفات المرفوعة: ${body.uploadedFiles ?? 0}` });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : "تعذر استيراد حزمة الترحيل" });
    } finally {
      setBusy(false);
    }
  };

  return <div className="mx-auto max-w-4xl space-y-6" dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#d08a3b]">ADMIN / MIGRATION</p>
        <h1 className="mt-2 text-3xl font-black text-[#102a43]">استيراد حزمة الترحيل</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">انقل نسخة النظام وملفاتها إلى قاعدة البيانات الجديدة مع التحقق من سلامة كل ملف قبل الدمج.</p>
      </div>
      <Button type="button" variant="outline" onClick={() => setLocation("/settings")} className="rounded-xl border-[#b9d4d9] text-[#0d4f62]"><ArrowRight className="ml-2 h-4 w-4" />العودة للإعدادات</Button>
    </div>

    <div className="grid gap-4 md:grid-cols-3">
      {[{ icon: ShieldCheck, title: "تحقق كامل", text: "تتم مطابقة البصمة والحجم قبل الحفظ." }, { icon: FileArchive, title: "ملف ZIP واحد", text: "ارفع الحزمة التي تحتوي snapshot.json والملفات." }, { icon: CheckCircle2, title: "دمج آمن", text: "لا تبدأ العملية إلا على قاعدة جديدة وفارغة." }].map(({ icon: Icon, title, text }) => <div key={title} className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-sm backdrop-blur"><Icon className="h-5 w-5 text-[#0d7180]" /><p className="mt-3 font-black text-[#102a43]">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>)}
    </div>

    <Card className="overflow-hidden rounded-[2rem] border-white/80 bg-white/85 shadow-[0_22px_60px_rgba(13,79,98,0.10)]">
      <CardHeader className="border-b border-[#e4eef0] bg-gradient-to-l from-[#edfafa] to-[#fffaf0] p-6"><CardTitle className="flex items-center gap-3 text-xl font-black text-[#102a43]"><Upload className="h-6 w-6 text-[#0d7180]" />رفع حزمة الترحيل</CardTitle></CardHeader>
      <CardContent className="space-y-5 p-6">
        <button type="button" onClick={() => inputRef.current?.click()} className="group flex min-h-44 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#9bcfd1] bg-[#f6fcfc] px-6 text-center transition hover:border-[#0d7180] hover:bg-[#eefafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7180]">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#0d7180] shadow-sm transition group-hover:-translate-y-1"><FileArchive className="h-7 w-7" /></span>
          <span className="mt-4 font-black text-[#102a43]">{file ? file.name : "اختر ملف smart-inventory-railway-migration.zip"}</span>
          <span className="mt-2 text-xs text-slate-500">الحد الأقصى 80MB — ملفات ZIP فقط</span>
        </button>
        <input ref={inputRef} type="file" accept=".zip,application/zip" className="hidden" onChange={event => { setFile(event.target.files?.[0] ?? null); setResult(null); }} />
        {result && <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm font-bold ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{result.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0" />}<span>{result.message}</span></div>}
        <div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="outline" onClick={() => { setFile(null); setResult(null); if (inputRef.current) inputRef.current.value = ""; }} disabled={busy || !file} className="rounded-xl">مسح الاختيار</Button><Button type="button" onClick={() => void submit()} disabled={busy || !file} className="rounded-xl bg-[#0d4f62] px-6 text-white hover:bg-[#0a4150]">{busy ? "جارٍ التحقق والاستيراد..." : "بدء الاستيراد"}</Button></div>
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold leading-6 text-amber-800">تنبيه: نفّذ الاستيراد مرة واحدة فقط على قاعدة البيانات الجديدة الفارغة، ولا تغلق الصفحة أثناء رفع الملفات.</p>
      </CardContent>
    </Card>
  </div>;
}
