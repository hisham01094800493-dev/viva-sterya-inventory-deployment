import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PWA_UPDATE_EVENT, PWA_VERSION_PATH } from "@/lib/pwa";

interface UpdateDetail {
  registration?: ServiceWorkerRegistration;
  version?: string;
}

const APP_VERSION_UPDATE_EVENT = "smart-inventory:app-version-update";
const INSTALLED_VERSION_KEY = "smart-inventory-installed-version";

type VersionFile = { version?: string };

function getInstalledVersion() {
  try { return window.localStorage.getItem(INSTALLED_VERSION_KEY); } catch { return null; }
}

function setInstalledVersion(version: string) {
  try { window.localStorage.setItem(INSTALLED_VERSION_KEY, version); } catch { /* storage is optional */ }
}

export default function PwaUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    const checkVersion = () => {
      void fetch(`${PWA_VERSION_PATH}?ts=${Date.now()}`, { cache: "no-store" })
        .then(response => response.ok ? response.json() as Promise<VersionFile> : null)
        .then(payload => {
          if (!active || !payload?.version) return;
          const nextVersion = payload.version;
          const installedVersion = getInstalledVersion();
          if (!installedVersion) {
            setInstalledVersion(nextVersion);
            return;
          }
          if (installedVersion !== nextVersion) {
            setLatestVersion(nextVersion);
            setDismissed(false);
          }
        })
        .catch(() => undefined);
    };
    checkVersion();
    const versionTimer = window.setInterval(checkVersion, 60_000);
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<UpdateDetail>).detail;
      if (detail?.registration) setRegistration(detail.registration);
      if (detail?.version) setLatestVersion(detail.version);
      if (detail?.registration || detail?.version) setDismissed(false);
    };
    window.addEventListener(PWA_UPDATE_EVENT, onUpdate);
    window.addEventListener(APP_VERSION_UPDATE_EVENT, onUpdate);
    return () => {
      active = false;
      window.clearInterval(versionTimer);
      window.removeEventListener(PWA_UPDATE_EVENT, onUpdate);
      window.removeEventListener(APP_VERSION_UPDATE_EVENT, onUpdate);
    };
  }, []);

  const reloadWithUpdate = async (clearCache: boolean) => {
    if (updating) return;
    const confirmed = window.confirm("سيتم تحديث التطبيق وإعادة تحميل الصفحة. احفظ أي بيانات غير محفوظة أولاً. هل تريد المتابعة؟");
    if (!confirmed) return;
    setUpdating(true);
    if (latestVersion) setInstalledVersion(latestVersion);
    if (clearCache && "caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }

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

  if ((!registration && !latestVersion) || dismissed) return null;

  return (
    <div className="fixed inset-x-3 top-3 z-[100] mx-auto max-w-3xl rounded-2xl border border-cyan-200 bg-white/95 p-3 shadow-2xl backdrop-blur dark:border-cyan-900 dark:bg-slate-950/95" dir="rtl" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
          <RefreshCw className={updating ? "h-5 w-5 animate-spin" : "h-5 w-5"} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-auto">
          <p className="font-semibold text-slate-900 dark:text-white">يتوفر تحديث جديد للتطبيق{latestVersion ? ` (${latestVersion})` : ""}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">حدّث النسخة الآن لتحصل على إصلاحات PDF والتحسينات الأخيرة.</p>
        </div>
        <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
          <Button type="button" size="sm" onClick={() => void reloadWithUpdate(false)} disabled={updating} loading={updating}>تحديث الآن</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void reloadWithUpdate(true)} disabled={updating}>تحديث الكاش</Button>
          <Button type="button" size="icon" variant="ghost" onClick={() => setDismissed(true)} disabled={updating} aria-label="تأجيل تحديث التطبيق"><X className="h-4 w-4" aria-hidden="true" /></Button>
        </div>
      </div>
    </div>
  );
}
