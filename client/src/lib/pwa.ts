export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export const PWA_UPDATE_EVENT = "smart-inventory:pwa-update";
export const PWA_INSTALL_HELP_EVENT = "smart-inventory:pwa-install-help";
export const PWA_VERSION_PATH = "/app-version.json";

type PwaUpdateDetail = { registration: ServiceWorkerRegistration };

export function getPwaInstallInstructions(userAgent: string) {
  if (/iphone|ipad|ipod/i.test(userAgent)) return "في Safari اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية».";
  if (/android/i.test(userAgent)) return "في Chrome اضغط قائمة ⋮ ثم «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».";
  return "افتح الرابط في Chrome أو Edge، ثم استخدم خيار تثبيت التطبيق من قائمة المتصفح.";
}

export function openPwaInstallHelp() {
  window.dispatchEvent(new Event(PWA_INSTALL_HELP_EVENT));
}

function announcePwaUpdate(registration: ServiceWorkerRegistration) {
  window.dispatchEvent(new CustomEvent<PwaUpdateDetail>(PWA_UPDATE_EVENT, {
    detail: { registration },
  }));
}

function watchForPwaUpdate(registration: ServiceWorkerRegistration) {
  if (registration.waiting) announcePwaUpdate(registration);
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        announcePwaUpdate(registration);
      }
    });
  });
  void registration.update().catch(() => undefined);
}

export function registerPwaServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .then(watchForPwaUpdate)
      .catch(error => {
        console.warn("[PWA] Service Worker registration failed", error);
      });
  }, { once: true });
}
