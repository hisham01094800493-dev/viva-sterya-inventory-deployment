/**
 * فحص قراءة فقط (Read-only) لحالة الترحيلات والبيانات قبل تشغيل Drizzle.
 * لا يكتب ولا يحذف أي شيء.
 *
 * الاستخدام:
 *   DATABASE_URL="mysql://..." node scripts/preflight-migrations.mjs
 *
 * exit codes:
 *   0 = لا توجد موانع بيانات معروفة
 *   1 = خطأ اتصال/تشغيل
 *   2 = مانع بيانات أو حالة لا تسمح بالاستمرار الآمن
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL مطلوب.");
  process.exit(1);
}

const needsSsl = /aivencloud\.com|ssl-mode=REQUIRED|ssl=true/i.test(url);

function stripSslParams(raw) {
  try {
    const parsed = new URL(raw);
    parsed.searchParams.delete("ssl-mode");
    parsed.searchParams.delete("ssl");
    return parsed.toString();
  } catch {
    return raw;
  }
}

let connection;
try {
  connection = await mysql.createConnection({
    uri: stripSslParams(url),
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    multipleStatements: false,
  });

  const log = line => console.log(line);

  async function tableExists(name) {
    const [rows] = await connection.query(
      "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
      [name]
    );
    return Number(rows[0]?.c ?? 0) > 0;
  }

  async function columns(table) {
    const [rows] = await connection.query(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position",
      [table]
    );
    return rows.map(row => row.name);
  }

  async function indexes(table) {
    if (!(await tableExists(table))) return [];
    const [rows] = await connection.query(
      "SELECT DISTINCT index_name AS name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ?",
      [table]
    );
    return rows.map(row => row.name);
  }

  log("=== 1) سجل ترحيلات Drizzle ===");
  let migrationRows = [];
  if (await tableExists("__drizzle_migrations")) {
    const [rows] = await connection.query(
      "SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at ASC"
    );
    migrationRows = rows;
    if (!rows.length) log("  (فارغ) — لم يُسجَّل أي ترحيل عبر Drizzle.");
    for (const row of rows) {
      const when = Number(row.created_at);
      const iso = Number.isFinite(when) ? new Date(when).toISOString() : String(row.created_at);
      log(`  #${row.id}  ${iso}  hash=${String(row.hash).slice(0, 12)}…`);
    }
    log(`  الإجمالي: ${rows.length}`);
  } else {
    log("  جدول __drizzle_migrations غير موجود — سيُعامل كترحيل أولي.");
  }

  log("");
  log("=== 2) الأعمدة الفعلية ===");
  const itemCols = await columns("items");
  const specCols = ["item_type", "size_length_cm", "size_width_cm", "tone", "thickness_cm", "spec_group_key"];
  const missingSpec = specCols.filter(column => !itemCols.includes(column));
  log(`  items: ${missingSpec.length === 0 ? "كل أعمدة 0039 موجودة ✅" : `ناقصة (0039): ${missingSpec.join(", ")} — ترحيل مطلوب`}`);

  const runCols = await columns("report_scheduler_runs");
  log(`  report_scheduler_runs.project_id: ${runCols.includes("project_id") ? "موجود ✅" : "غير موجود — ترحيل 0038 مطلوب"}`);

  const buildingCols = await columns("buildings");
  const hasProjectColumns = buildingCols.includes("project_id");
  log(`  buildings.project_id: ${hasProjectColumns ? "موجود ✅" : "غير موجود — ترحيل 0036 مطلوب"}`);

  log("");
  log("=== 3) الفهارس الفعلية ===");
  const buildingIdx = await indexes("buildings");
  log(`  buildings: ${buildingIdx.join(", ") || "لا توجد بيانات فهارس"}`);
  const hasLegacyBuildingUnique = buildingIdx.includes("buildings_name_unique");
  const hasProjectBuildingUnique = buildingIdx.includes("buildings_project_name_uq");
  log(`  0037: ${hasProjectBuildingUnique ? "مطبّق ✅" : hasLegacyBuildingUnique ? "غير مطبّق — القيد العام القديم ما زال قائمًا" : "حالة غير معروفة ⚠️"}`);

  const runIdx = await indexes("report_scheduler_runs");
  log(`  report_scheduler_runs: ${runIdx.join(", ") || "لا توجد بيانات فهارس"}`);
  log(`  0038: ${runIdx.includes("report_scheduler_runs_project_date_uq") ? "مطبّق ✅" : "غير مطبّق — سيطبقه Drizzle إذا كان مطلوبًا"}`);

  log("");
  log("=== 4) فحص مسبق للبيانات ===");
  const blockers = [];
  let dupName = [];
  let dupCode = [];
  let nullProjectCount = 0;

  if (hasProjectColumns) {
    const [nameRows] = await connection.query("SELECT project_id, name, COUNT(*) AS c FROM buildings GROUP BY project_id, name HAVING c > 1 LIMIT 10");
    const [codeRows] = await connection.query("SELECT project_id, code, COUNT(*) AS c FROM buildings GROUP BY project_id, code HAVING c > 1 LIMIT 10");
    const [nullRows] = await connection.query("SELECT COUNT(*) AS c FROM buildings WHERE project_id IS NULL");
    dupName = nameRows;
    dupCode = codeRows;
    nullProjectCount = Number(nullRows[0]?.c ?? 0);
    log(`  تكرار (project_id, name): ${dupName.length}`);
    for (const row of dupName) log(`    - project_id=${row.project_id} name="${row.name}" ×${row.c}`);
    log(`  تكرار (project_id, code): ${dupCode.length}`);
    for (const row of dupCode) log(`    - project_id=${row.project_id} code="${row.code}" ×${row.c}`);
    log(`  صفوف buildings بدون project_id: ${nullProjectCount}`);
    if (dupName.length) blockers.push("تكرار أسماء مبانٍ داخل نفس المشروع يمنع 0037");
    if (dupCode.length) blockers.push("تكرار أكواد مبانٍ داخل نفس المشروع يمنع 0037");
    if (nullProjectCount > 0) blockers.push("مبانٍ بدون project_id؛ العزل غير آمن حتى يتم ربطها بمشروع");
  } else {
    log("  لم يُنفذ 0036 بعد؛ سيتم تأجيل فحص project_id إلى ما بعد إنشاء الأعمدة ✅");
  }

  if (missingSpec.length === 0 && !hasProjectBuildingUnique) {
    log("  ⛔ أعمدة 0039 موجودة قبل قيد 0037 — يجب مراجعة ترتيب الترحيلات قبل الاستمرار.");
    blockers.push("ترتيب الترحيلات غير سليم: 0039 موجود قبل 0037");
  }

  log("");
  log("=== 5) الخلاصة ===");
  if (blockers.length) {
    log("  ⛔ لا يمكن متابعة الترحيل بأمان:");
    for (const blocker of blockers) log(`     - ${blocker}`);
    process.exitCode = 2;
  } else {
    log("  ✅ لا توجد موانع بيانات معروفة. يلزم أخذ Backup قبل migrate.");
  }

  await connection.end();
} catch (error) {
  console.error(`فشل الفحص المسبق: ${error instanceof Error ? error.message : String(error)}`);
  if (connection) await connection.end().catch(() => undefined);
  process.exitCode = 1;
}
