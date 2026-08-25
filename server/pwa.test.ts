import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicDir = resolve(process.cwd(), "client/public");

describe("Smart Inventory PWA shell", () => {
  it("defines an installable Arabic standalone manifest", () => {
    const manifest = JSON.parse(readFileSync(resolve(publicDir, "manifest.webmanifest"), "utf8")) as Record<string, unknown>;
    expect(manifest.name).toBe("Smart Inventory");
    expect(manifest.display).toBe("standalone");
    expect(manifest.id).toBe("/");
    expect(manifest.display_override).toEqual(["standalone", "minimal-ui"]);
    expect(manifest.orientation).toBeUndefined();
    expect(manifest.dir).toBe("rtl");
    expect(manifest.start_url).toBe("/");
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/icons/smart-inventory-192.png", sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ src: "/icons/smart-inventory-512.png", sizes: "512x512", purpose: "any maskable" }),
      expect.objectContaining({ src: "/icons/smart-inventory-180.png", sizes: "180x180", purpose: "any" }),
    ]));
  });

  it("keeps API requests out of the shell cache", () => {
    const serviceWorker = readFileSync(resolve(publicDir, "sw.js"), "utf8");
    expect(serviceWorker).toContain("url.pathname.startsWith(\"/api/\")");
    expect(serviceWorker).toContain('"script"');
    expect(serviceWorker).toContain('"style"');
    expect(serviceWorker).not.toContain("caches.match(request.url)");
  });

  it("waits for user confirmation before activating a new cache version", () => {
    const serviceWorker = readFileSync(resolve(publicDir, "sw.js"), "utf8");
    expect(serviceWorker).toContain('const CACHE_NAME = "smart-inventory-shell-v7"');
    expect(serviceWorker).toContain('event.data?.type === "SKIP_WAITING"');
    expect(serviceWorker).toContain('const APP_SHELL = ["/", "/index.html"');
    expect(serviceWorker).toContain('request.destination === "document"');
    expect(serviceWorker).toContain('caches.match("/index.html")');
    expect(serviceWorker).not.toMatch(/install[\s\S]{0,180}self\.skipWaiting\(\)/);
  });

  it("checks the deployment version independently and only advances the installed marker after confirmation", () => {
    const prompt = readFileSync(resolve(process.cwd(), "client/src/components/PwaUpdatePrompt.tsx"), "utf8");
    expect(prompt).toContain("PWA_VERSION_PATH");
    expect(prompt).not.toContain("__manus__/version.json");
    expect(prompt).toContain('cache: "no-store"');
    expect(prompt).toContain('const INSTALLED_VERSION_KEY = "smart-inventory-installed-version"');
    expect(prompt).toContain("if (latestVersion) setInstalledVersion(latestVersion);");
    expect(prompt).not.toContain("setInstalledVersion(nextVersion);\n            setLatestVersion(nextVersion);");
  });

  it("shares the current application link directly through WhatsApp", () => {
    const card = readFileSync(resolve(process.cwd(), "client/src/components/PwaVersionCard.tsx"), "utf8");
    expect(card).toContain("واتساب");
    expect(card).toContain("https://wa.me/?text=");
    expect(card).toContain('new URL("/", window.location.origin)');
    expect(card).toContain("إدارة ذكية للمخزون، حركة أسهل، وتقارير أوضح");
    expect(card).not.toContain("navigator.share");
  });

  it("keeps the sidebar version card as a display and service-worker control", () => {
    const card = readFileSync(resolve(process.cwd(), "client/src/components/PwaVersionCard.tsx"), "utf8");
    expect(card).toContain("PWA_VERSION_PATH");
    expect(card).not.toContain("__manus__/version.json");
    expect(card).toContain('cache: "no-store"');
    expect(card).not.toContain("smart-inventory:app-version-update");
  });

  it("ships local Railway brand assets instead of relying on unavailable Manus storage paths", () => {
    const assets = readFileSync(resolve(process.cwd(), "client/src/lib/brandAssets.ts"), "utf8");
    expect(assets).toContain('DEFAULT_COMPANY_LOGO_URL = "/icons/smart-inventory-app-512.png"');
    expect(assets).toContain('url: "/icons/smart-inventory-gold-512.png"');
    expect(assets).toContain('url.startsWith("/manus-storage/")');
  });

  it("generates a Railway deployment version instead of relying on Manus metadata", () => {
    const writer = readFileSync(resolve(process.cwd(), "scripts/write-app-version.mjs"), "utf8");
    expect(writer).toContain('client/public/app-version.json');
    expect(writer).toContain("RAILWAY_GIT_COMMIT_SHA");
    expect(writer).toContain("Date.now().toString(36)");
  });
});
