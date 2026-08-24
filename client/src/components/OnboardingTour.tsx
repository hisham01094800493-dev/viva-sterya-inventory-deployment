import { ArrowLeft, ArrowRight, BellRing, CheckCircle2, FileBarChart, LayoutDashboard, Menu, MessageCircle, MonitorSmartphone, Package, ShieldCheck, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export const ONBOARDING_TOUR_STEPS = [
  { icon: LayoutDashboard, eyebrow: "مرحبًا بك في Smart Inventory", title: "جولة سريعة قبل البدء", description: "سنعرض لك أهم أجزاء النظام في أقل من دقيقة، ثم يمكنك البدء في استخدامه بصورة طبيعية.", accent: "bg-[#e8f1f2] text-[#0d4f62]" },
  { icon: Menu, eyebrow: "التنقل داخل النظام", title: "القائمة والأصناف والمخازن", description: "من القائمة الجانبية تنتقل إلى الأصناف والمخازن والتقارير. راجع رصيد كل صنف ومخزنه قبل المتابعة، وتظهر لك الأقسام التي تسمح بها صلاحياتك فقط.", accent: "bg-[#fff4df] text-[#a96821]" },
  { icon: Package, eyebrow: "تسجيل الحركات", title: "مسؤوليات حسب الصلاحية", description: "الإضافة والصرف والتحويل مخصصة للمستخدم المسؤول عنها فقط. عند حصولك على الصلاحية، سجّل رقم الإذن والتاريخ والكمية والجهة ليُحدَّث الرصيد تلقائيًا.", accent: "bg-[#e8f7f6] text-[#0d806c]" },
  { icon: MessageCircle, eyebrow: "التواصل داخل الفريق", title: "المحادثات والإشعارات", description: "استخدم المحادثات للتنسيق مع الفريق، وتابع جرس الإشعارات لمعرفة التنبيهات الجديدة وحالة المخزون أو الرسائل التي تحتاج إلى اهتمامك.", accent: "bg-[#eef3ff] text-[#3e5a9b]" },
  { icon: ShieldCheck, eyebrow: "حماية البيانات", title: "النسخ الاحتياطي والاستعادة", description: "المسؤول يستطيع إنشاء نسخة احتياطية ومراجعة اختبار الاستعادة من قسم الحماية والنسخ الاحتياطي، حتى تبقى بيانات المخزون قابلة للاسترجاع عند الحاجة.", accent: "bg-[#fff0ed] text-[#bd5147]" },
  { icon: WifiOff, eyebrow: "استمرار العمل", title: "العمل دون إنترنت", description: "عند انقطاع الإنترنت، احتفظ بالحركات التي تُسجَّل على الجهاز ثم اسمح للتطبيق بمزامنتها تلقائيًا عند عودة الاتصال. راقب حالة الاتصال أسفل الشاشة.", accent: "bg-[#f2edff] text-[#6d4ca0]" },
  { icon: MonitorSmartphone, eyebrow: "مرونة الاستخدام", title: "الموبايل والكمبيوتر", description: "افتح Smart Inventory على الموبايل أو الكمبيوتر باستخدام حسابك نفسه. تظهر لك البيانات والأقسام والصلاحيات المسموح بها لحسابك على أيٍّ من الجهازين.", accent: "bg-[#eef8ff] text-[#197da7]" },
  { icon: FileBarChart, eyebrow: "المتابعة والاستفادة", title: "التقارير والتنبيهات", description: "استخدم التقارير لمراجعة الحركات والأرصدة، واتبع التنبيهات لمعرفة الأصناف التي تحتاج إلى متابعة أو توريد.", accent: "bg-[#eef8f8] text-[#0d7180]" },
] as const;

export function OnboardingTour({ show, onComplete }: { show: boolean; onComplete: () => Promise<void> }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const step = ONBOARDING_TOUR_STEPS[stepIndex];
  const Icon = step.icon;
  const isLastStep = stepIndex === ONBOARDING_TOUR_STEPS.length - 1;

  useEffect(() => { if (show) setStepIndex(0); }, [show]);
  if (!show) return null;

  const finish = async () => {
    setIsSaving(true);
    try { await onComplete(); }
    finally { setIsSaving(false); }
  };

  return <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#071f2a]/55 p-3 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" dir="rtl">
    <section className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-[0_28px_90px_rgba(5,29,43,0.35)]">
      <div className="h-1.5 bg-[#e8f1f2]"><div className="h-full bg-gradient-to-l from-[#0d4f62] to-[#1c9da4] transition-all duration-200 motion-reduce:transition-none" style={{ width: `${((stepIndex + 1) / ONBOARDING_TOUR_STEPS.length) * 100}%` }} /></div>
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4"><div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${step.accent}`}><Icon className="h-7 w-7" /></div><span className="rounded-full bg-[#f4fafb] px-3 py-1.5 text-xs font-black text-[#0d7180]">{stepIndex + 1} من {ONBOARDING_TOUR_STEPS.length}</span></div>
        <p className="mt-7 text-xs font-black uppercase tracking-[0.16em] text-[#d08a3b]">{step.eyebrow}</p>
        <h2 id="onboarding-title" className="mt-2 text-2xl font-black text-[#102a43] sm:text-3xl">{step.title}</h2>
        <p className="mt-4 min-h-20 text-sm leading-8 text-slate-600 sm:text-base">{step.description}</p>
        <div className="mt-6 flex items-center justify-center gap-2" aria-label="تقدم الجولة">{ONBOARDING_TOUR_STEPS.map((item, index) => <span key={item.title} className={`h-2 rounded-full transition-all duration-200 motion-reduce:transition-none ${index === stepIndex ? "w-7 bg-[#0d7180]" : index < stepIndex ? "w-2 bg-[#8fd1d0]" : "w-2 bg-[#dce7ee]"}`} />)}</div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#eef3f5] pt-5"><Button type="button" variant="ghost" onClick={() => void finish()} disabled={isSaving} className="rounded-xl text-slate-500 hover:bg-slate-100">تخطي الشرح</Button><div className="flex items-center gap-2">{stepIndex > 0 && <Button type="button" variant="outline" onClick={() => setStepIndex(index => Math.max(0, index - 1))} disabled={isSaving} className="gap-2 rounded-xl border-[#b9d4d9] text-[#0d4f62]"><ArrowRight className="h-4 w-4" />السابق</Button>}<Button type="button" onClick={() => isLastStep ? void finish() : setStepIndex(index => index + 1)} disabled={isSaving} className="gap-2 rounded-xl bg-[#0d4f62] px-5 text-white hover:bg-[#0a4150]">{isSaving ? "جارٍ الحفظ..." : isLastStep ? <><CheckCircle2 className="h-4 w-4" />ابدأ الاستخدام</> : <>التالي<ArrowLeft className="h-4 w-4" /></>}</Button></div></div>
      </div>
    </section>
  </div>;
}
