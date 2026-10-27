import { useEffect, useState } from "react";
import { Download, MessageCircle, RefreshCw, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openPwaInstallHelp, PWA_UPDATE_EVENT, PWA_VERSION_PATH } from "@/lib/pwa";

type UpdateDetail = { registration?: ServiceWorkerRegistration };
type VersionFile = { version?: string };

export default function PwaVersionCard({ collapsed = false }: { collapsed?: boolean }) {
  const [version, setVersion] = useState("1.0.0");
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updating, setUpdating] = useState(false);
  const [hidden, setHidden] = useState(() => window.localStorage.getItem("smart-inventory-pwa-card-hidden") === "1");

  useEffect(() => {
    let active = true;
    const readVersion = () => {
      void fetch(`${PWA_VERSION_PATH}?ts=${Date.now()}`, { cache: "no-store" })
        .then(response => response.ok ? response.json() as Promise<VersionFile> : null)
        .then(payload => { if (active && payload?.version) setVersion(payload.version); })
        .catch(() => undefined);
    };
    readVersion();
    const versionTimer = window.setInterval(readVersion, 60_000);
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<UpdateDetail>).detail;
      if (detail?.registration) setRegistration(detail.registration);
    };
    window.addEventListener(PWA_UPDATE_EVENT, onUpdate);
    return () => { active = false; window.clearInterval(versionTimer); window.removeEventListener(PWA_UPDATE_EVENT, onUpdate); };
  }, []);

  const shareMessage = "Smart Inventory — إدارة ذكية للمخزون، حركة أسهل، وتقارير أوضح. جرّب التطبيق الآن:";

  const shareOnWhatsApp = () => {
    const shareUrl = new URL("/", window.location.origin).toString();
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${shareMessage} ${shareUrl}`)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };


  const updateNow = async () => {
    if (updating) return;
    const confirmed = window.confirm("يتوفر تحديث جديد للتطبيق. احفظ أي بيانات غير محفوظة ثم اضغط موافق للتحديث. هل تريد المتابعة؟");
    if (!confirmed) return;
    setUpdating(true);
    const waiting = registration?.waiting;
    if (waiting) {
      const reload = () => window.location.reload();
      navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
      waiting.postMessage({ type: "SKIP_WAITING" });
      window.setTimeout(reload, 2500);
      return;
    }
    window.location.reload();
  };

  if (collapsed) {
    return <div className="flex justify-center border-t border-[#e7eef3] pt-3" title={`النسخة الحالية: ${version}`}><Tag className="h-4 w-4 text-[#0d7180]" aria-label={`النسخة الحالية ${version}`} /></div>;
  }

  if (hidden) {
    return <button type="button" onClick={() => { window.localStorage.removeItem("smart-inventory-pwa-card-hidden"); setHidden(false); }} className="mx-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-[#0d7180] hover:bg-white/60" title="إظهار بطاقة التطبيق"><Tag className="h-3.5 w-3.5" />إظهار بطاقة التطبيق</button>;
  }

  return <div className="mt-2 rounded-xl border border-[#dce7ee] bg-white/70 p-2 shadow-sm" dir="rtl">
    <div className="flex items-center gap-2">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#e8f1f2] text-[#0d4f62]"><Tag className="h-3 w-3" /></div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-black text-[#102a43]">النسخة الحالية</p>
        <p className="truncate text-[10px] font-bold text-slate-500" dir="ltr">{version}</p>
      </div>
      <Button type="button" size="sm" onClick={openPwaInstallHelp} variant="outline" className="h-6 rounded-lg border-[#b9d4d9] px-1.5 text-[9px] text-[#0d4f62] hover:bg-[#e8f7f6]" title="عرض طريقة تثبيت التطبيق على الهاتف"><Download className="ml-1 h-3 w-3" />تثبيت</Button>
      <Button type="button" size="sm" onClick={shareOnWhatsApp} variant="outline" className="h-6 rounded-lg border-[#b7dfc8] px-1.5 text-[9px] text-[#16834b] hover:bg-[#eaf8ef]" title="مشاركة الرابط عبر واتساب"><MessageCircle className="ml-1 h-3 w-3" />واتساب</Button>
      {registration?.waiting && <Button type="button" size="sm" onClick={() => void updateNow()} disabled={updating} loading={updating} className="h-6 rounded-lg bg-[#0d4f62] px-1.5 text-[9px] text-white hover:bg-[#0a4150]"><RefreshCw className={`ml-1 h-3 w-3 ${updating ? "animate-spin" : ""}`} />تحديث</Button>}
      <Button type="button" variant="ghost" size="icon" onClick={() => { window.localStorage.setItem("smart-inventory-pwa-card-hidden", "1"); setHidden(true); }} className="h-6 w-6 shrink-0 text-slate-400 hover:text-[#0d4f62]" aria-label="إخفاء بطاقة التطبيق" title="إخفاء بطاقة التطبيق"><X className="h-3.5 w-3.5" /></Button>
    </div>
  </div>;
}
