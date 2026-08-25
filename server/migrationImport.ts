import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import type { Express, Request } from "express";
import express from "express";
import { restoreBackupSnapshot, validateBackupSnapshot } from "./db";
import { storagePutAtKey } from "./storage";
import { sdk } from "./_core/sdk";
import type { User } from "../drizzle/schema";

type MigrationManifestFile = {
  key: string | null;
  localPath: string;
  bytes: number;
  sha256: string;
};

type MigrationManifest = {
  expectedAssets: number;
  downloadedAssets: number;
  failures: unknown[];
  files: MigrationManifestFile[];
};

function isAdminRequest(req: Request) {
  return sdk.authenticateRequest(req).then(user => {
    if (user.role !== "admin") throw new Error("admin-only");
    return user;
  });
}

function safeArchivePath(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some(part => part === ".." || part === ".")) throw new Error("invalid archive path");
  return normalized;
}

function detectContentType(key: string) {
  const extension = key.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "pdf") return "application/pdf";
  if (extension === "ttf") return "font/ttf";
  if (extension === "webm") return "audio/webm";
  if (extension === "mp3") return "audio/mpeg";
  return "application/octet-stream";
}

function parseJsonEntry<T>(zip: AdmZip, path: string): T {
  const entry = zip.getEntry(path);
  if (!entry) throw new Error(`missing archive entry: ${path}`);
  return JSON.parse(entry.getData().toString("utf8")) as T;
}

function prepareSnapshotForBootstrapAdmin(snapshot: unknown, bootstrapAdmin: User) {
  const cloned = JSON.parse(JSON.stringify(snapshot)) as { tables?: { users?: Array<Record<string, unknown>> } };
  const users = cloned.tables?.users;
  if (!Array.isArray(users)) throw new Error("حزمة الترحيل لا تحتوي على المستخدمين");
  const email = bootstrapAdmin.email?.trim().toLowerCase();
  const sourceAdmin = users.find(user => typeof user.email === "string" && user.email.trim().toLowerCase() === email)
    ?? users.find(user => user.role === "admin");
  if (!sourceAdmin || sourceAdmin.id !== bootstrapAdmin.id) {
    throw new Error("يجب أن يطابق ADMIN_EMAIL حساب المدير في النسخة المصدر قبل استيراد البيانات");
  }
  sourceAdmin.openId = bootstrapAdmin.openId;
  sourceAdmin.name = bootstrapAdmin.name;
  sourceAdmin.email = bootstrapAdmin.email;
  sourceAdmin.loginMethod = "google";
  sourceAdmin.role = "admin";
  sourceAdmin.lastSignedIn = new Date().toISOString();
  return cloned;
}

export function registerMigrationImportRoutes(app: Express) {
  app.get("/migration-import", async (req, res) => {
    try {
      await isAdminRequest(req);
      res.type("html").send(`<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>استيراد بيانات Smart Inventory</title>
    <style>
      body { margin: 0; background: #f7f8fa; color: #172033; font-family: Tahoma, Arial, sans-serif; }
      main { max-width: 680px; margin: 52px auto; padding: 32px; background: #fff; border: 1px solid #dde3eb; border-radius: 16px; }
      h1 { margin-top: 0; color: #183e66; } p { line-height: 1.8; }
      input { display: block; width: 100%; box-sizing: border-box; margin: 24px 0 16px; padding: 12px; border: 1px solid #b6c2d1; border-radius: 8px; }
      button { background: #176b52; color: #fff; border: 0; border-radius: 8px; padding: 12px 20px; font-size: 16px; cursor: pointer; }
      button:disabled { opacity: .6; cursor: wait; } #status { margin-top: 20px; white-space: pre-wrap; } .notice { color: #6a4c00; }
    </style>
  </head>
  <body><main>
    <h1>استيراد حزمة ترحيل النظام</h1>
    <p>ارفع ملف <strong>smart-inventory-railway-migration.zip</strong> الذي تم تجهيزه للنقل. ستتحقق الخدمة من البيانات وبصمة كل ملف قبل الاستيراد.</p>
    <p class="notice">نفّذ الاستيراد مرة واحدة فقط على قاعدة البيانات الجديدة الفارغة.</p>
    <input id="archive" type="file" accept="application/zip,.zip" />
    <button id="submit" type="button">بدء الاستيراد</button>
    <div id="status" role="status"></div>
    <script>
      const archive = document.getElementById('archive');
      const submit = document.getElementById('submit');
      const status = document.getElementById('status');
      submit.addEventListener('click', async () => {
        const file = archive.files && archive.files[0];
        if (!file) { status.textContent = 'اختر ملف حزمة الترحيل أولًا.'; return; }
        submit.disabled = true; status.textContent = 'جارٍ التحقق ورفع الملفات... لا تغلق هذه الصفحة.';
        try {
          const response = await fetch('/api/migration/import', { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: file });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || 'فشل الاستيراد');
          status.textContent = 'تم الاستيراد بنجاح. الملفات المرفوعة: ' + body.uploadedFiles + '\\nيمكنك الآن العودة إلى الصفحة الرئيسية ومراجعة الأرصدة.';
        } catch (error) { status.textContent = 'تعذر الاستيراد: ' + (error instanceof Error ? error.message : 'خطأ غير معروف'); }
        finally { submit.disabled = false; }
      });
    </script>
  </main></body>
</html>`);
    } catch {
      res.redirect("/?login=required");
    }
  });

  app.post("/api/migration/import", express.raw({ type: "application/zip", limit: "80mb" }), async (req, res) => {
    try {
      const bootstrapAdmin = await isAdminRequest(req);
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "حزمة الترحيل مطلوبة" });
      const zip = new AdmZip(req.body);
      const snapshot = prepareSnapshotForBootstrapAdmin(parseJsonEntry<unknown>(zip, "snapshot.json"), bootstrapAdmin);
      const manifest = parseJsonEntry<MigrationManifest>(zip, "assets/manifest.json");
      const validation = validateBackupSnapshot(snapshot);
      if (!validation.isValid || validation.missingRestorableTables.length > 0 || manifest.failures.length > 0 || manifest.expectedAssets !== manifest.downloadedAssets || manifest.files.length !== manifest.downloadedAssets) {
        return res.status(400).json({ error: "حزمة الترحيل غير مكتملة أو غير صالحة", validation });
      }

      let uploadedFiles = 0;
      for (const file of manifest.files) {
        if (!file.key) throw new Error("ملف بلا مفتاح تخزين");
        const archivePath = `assets/files/${safeArchivePath(file.localPath)}`;
        const entry = zip.getEntry(archivePath);
        if (!entry) throw new Error(`ملف مفقود: ${file.localPath}`);
        const data = entry.getData();
        const actualHash = createHash("sha256").update(data).digest("hex");
        if (data.length !== file.bytes || actualHash !== file.sha256) throw new Error(`فشل التحقق من الملف: ${file.localPath}`);
        await storagePutAtKey(file.key, data, detectContentType(file.key));
        uploadedFiles += 1;
      }

      const restore = await restoreBackupSnapshot(snapshot);
      res.status(201).json({ ok: true, uploadedFiles, restore, validation });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر استيراد حزمة الترحيل";
      const status = message === "admin-only" || message.includes("Invalid session") ? 403 : 400;
      console.error("[MigrationImport] failed", error);
      res.status(status).json({ error: message });
    }
  });
}
