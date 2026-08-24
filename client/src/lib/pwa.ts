export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export const PWA_UPDATE_EVENT = "smart-inventory:pwa-update";

type PwaUpdateDetail = { registration: ServiceWorkerRegistration };

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
