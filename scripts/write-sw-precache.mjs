import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const output = resolve(process.cwd(), "dist/public/sw.js");
const assetsDirectory = resolve(process.cwd(), "dist/public/assets");
const staticAssets = readdirSync(assetsDirectory, { recursive: true })
  .filter(entry => typeof entry === "string" && /\.(?:css|js|mjs|png|webp|svg|woff2?)$/i.test(entry))
  .map(entry => `/assets/${entry.replaceAll("\\", "/")}`)
  .sort();
const applicationShell = ["/", "/index.html", "/manifest.webmanifest", "/app-version.json", "/icons/smart-inventory-180.png", "/icons/smart-inventory-192.png", "/icons/smart-inventory-512.png", ...staticAssets];
const source = readFileSync(output, "utf8");
const updated = source.replace("const APP_SHELL = __OFFLINE_PRECACHE_ASSETS__;", `const APP_SHELL = ${JSON.stringify(applicationShell)};`);

if (updated === source) throw new Error("لم يتم العثور على موضع قائمة التخزين المسبق داخل Service Worker");
writeFileSync(output, updated, "utf8");
