import { Download, RefreshCw, Wifi, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getPwaInstallInstructions, InstallPromptEvent, PWA_INSTALL_HELP_EVENT } from "@/lib/pwa";
import { getOfflineQueueSummary, requestOfflineSync, subscribeOfflineQueue } from "@/lib/offlineQueue";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("smart-inventory-pwa-dismissed") === "1");
  const [iosHint, setIosHint] = useState(false);
  const [manualHelp, setManualHelp] = useState(false);
  const [queueSummary, setQueueSummary] = useState({ total: 0, pending: 0, failed: 0 });

  useEffect(() => {
    setIsInstalled(isStandalone());
    const refreshQueue = () => void getOfflineQueueSummary().then(setQueueSummary).catch(() => undefined);
    refreshQueue();
    return subscribeOfflineQueue(refreshQueue);
  }, []);

  useEffect(() => {
    setIsInstalled(isStandalone());
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallEvent(null);
    };
    const handleManualHelp = () => {
      setDismissed(false);
      setManualHelp(true);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener(PWA_INSTALL_HELP_EVENT, handleManualHelp);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener(PWA_INSTALL_HELP_EVENT, handleManualHelp);
    };
  }, []);

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const canShowInstall = !isInstalled && !dismissed && Boolean(installEvent || isIos || manualHelp);
  const installHelp = iosHint || !installEvent ? getPwaInstallInstructions(navigator.userAgent) : "افتح النظام بسرعة من أيقونة مستقلة.";

  async function install() {
    if (!installEvent) {
      setManualHelp(true);
      setIosHint(true);
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setIsInstalled(true);
    setInstallEvent(null);
  }

  function dismiss() {
    sessionStorage.setItem("smart-inventory-pwa-dismissed", "1");
    setDismissed(true);
    setManualHelp(false);
  }

  return <>
    {queueSummary.total > 0 && !canShowInstall && <div className="fixed inset-x-3 bottom-3 z-[68] mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-[#b9d4d9] bg-white/95 p-3 text-right shadow-lg backdrop-blur-md" dir="rtl"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fff4df] text-[#a96821]"><RefreshCw className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-xs font-black text-[#102a43]">عمليات بانتظار المزامنة: {queueSummary.total}</p><p className="mt-1 text-[11px] text-slate-500">{queueSummary.failed ? `${queueSummary.failed} عملية فشلت وتحتاج إعادة المحاولة` : "ستُرسل تلقائياً عند عودة الاتصال"}</p></div><Button type="button" onClick={requestOfflineSync} size="sm" variant="outline" className="shrink-0 rounded-xl border-[#b9d4d9] text-[#0d4f62]"><RefreshCw className="ml-1 h-3.5 w-3.5" />مزامنة</Button></div>}

    {canShowInstall && <div className="fixed inset-x-3 bottom-24 z-[69] sm:bottom-3 mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-[#b9d4d9] bg-white/95 p-3 text-right shadow-[0_16px_44px_rgba(13,79,98,0.18)] backdrop-blur-md" dir="rtl"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8f1f2] text-[#0d4f62]"><Download className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-sm font-black text-[#102a43]">ثبّت Smart Inventory على هاتفك</p><p className="mt-0.5 text-[11px] leading-5 text-slate-500">{installHelp}</p></div><Button type="button" onClick={() => void install()} size="sm" className="shrink-0 rounded-xl bg-[#0d4f62] text-white hover:bg-[#0a4150]">{installEvent ? "تثبيت" : "الطريقة"}</Button><Button type="button" onClick={dismiss} variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-slate-400" aria-label="إخفاء تنبيه التثبيت"><X className="h-4 w-4" /></Button></div>}
    {isInstalled && online && <div className="sr-only" role="status"><Wifi className="inline h-4 w-4" /> Smart Inventory مثبت ويعمل باتصال.</div>}
  </>;
}
