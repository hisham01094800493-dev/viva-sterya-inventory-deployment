import { chmod, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rawUrl = process.env.DATABASE_URL;
const outputFile = process.argv[2];

if (!rawUrl || !outputFile) {
  console.error("الاستخدام: DATABASE_URL=... node scripts/backup-mysql.mjs /path/backup.sql");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(rawUrl);
} catch {
  console.error("DATABASE_URL غير صالح.");
  process.exit(1);
}

if (!/^mysql(?:s)?:$/.test(parsed.protocol)) {
  console.error("DATABASE_URL يجب أن يبدأ بـ mysql:// أو mysqls://.");
  process.exit(1);
}

const escapeOptionValue = value => String(value).replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
const tempDir = await mkdtemp(join(tmpdir(), "smart-inventory-mysqldump-"));
const optionFile = join(tempDir, "client.cnf");
const options = [
  "[client]",
  `host=${escapeOptionValue(parsed.hostname)}`,
  `port=${parsed.port || "3306"}`,
  `user=${escapeOptionValue(decodeURIComponent(parsed.username))}`,
  `password=${escapeOptionValue(decodeURIComponent(parsed.password))}`,
  `database=${escapeOptionValue(decodeURIComponent(parsed.pathname.replace(/^\//, "")))}`,
  ...(parsed.hostname.endsWith("aivencloud.com") ? ["ssl-mode=REQUIRED"] : []),
  "",
].join("\n");

try {
  await writeFile(optionFile, options, { mode: 0o600 });
  await chmod(optionFile, 0o600);
  await execFileAsync("mysqldump", [
    `--defaults-extra-file=${optionFile}`,
    "--single-transaction",
    "--quick",
    "--routines",
    "--triggers",
    "--set-gtid-purged=OFF",
    "--no-tablespaces",
    `--result-file=${outputFile}`,
  ], { maxBuffer: 1024 * 1024 * 4 });
  const backupStats = await stat(outputFile);
  if (backupStats.size < 128) throw new Error("تم إنشاء ملف Backup فارغ أو غير مكتمل");
  console.log(`✅ تم إنشاء النسخة الاحتياطية: ${outputFile}`);
} catch (error) {
  const message = error?.stderr || error?.message || String(error);
  console.error(`❌ فشل إنشاء النسخة الاحتياطية: ${message.replace(/password=[^\s&]+/gi, "password=***")}`);
  process.exitCode = 1;
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
