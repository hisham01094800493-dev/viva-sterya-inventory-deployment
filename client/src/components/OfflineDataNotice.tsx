import { DatabaseBackup, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

export function getOfflineDataNoticeMessage(resource: string, hasCachedData: boolean) {
  return hasCachedData
    ? `يتم عرض ${resource} من آخر نسخة محفوظة على هذا الجهاز. قد لا تتضمن أحدث التغييرات حتى عودة الإنترنت.`
    : `لا توجد نسخة محلية محفوظة من ${resource}. اتصل بالإنترنت وافتح هذه الشاشة مرة واحدة لحفظها للاستخدام دون اتصال.`;
}

export default function OfflineDataNotice({ resource, hasCachedData }: { resource: string; hasCachedData: boolean }) {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    const showOffline = () => setOffline(true);
    const showOnline = () => setOffline(false);
    window.addEventListener("offline", showOffline);
    window.addEventListener("online", showOnline);
    return () => { window.removeEventListener("offline", showOffline); window.removeEventListener("online", showOnline); };
  }, []);

  if (!offline) return null;
  return <div role="status" className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-6 ${hasCachedData ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100" : "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"}`}>
    {hasCachedData ? <DatabaseBackup className="mt-0.5 h-5 w-5 shrink-0" /> : <WifiOff className="mt-0.5 h-5 w-5 shrink-0" />}
    <span>{getOfflineDataNoticeMessage(resource, hasCachedData)}</span>
  </div>;
}
