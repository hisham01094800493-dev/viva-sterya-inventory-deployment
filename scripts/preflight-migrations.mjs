/**
 * فحص قراءة فقط (Read-only) لحالة الترحيلات على قاعدة البيانات.
 * لا يكتب ولا يحذف أي شيء. الهدف: معرفة ما هو مطبّق فعليًا قبل تشغيل drizzle-kit migrate.
 *
 * الاستخدام:
 *   DATABASE_URL="mysql://..." node scripts/preflight-migrations.mjs
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

const connection = await mysql.createConnection({
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
  return rows[0].c > 0;
}

async function columns(table) {
  const [rows] = await connection.query(
    "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position",
    [table]
  );
  return rows.map(r => r.name);
}

async function indexes(table) {
  const [rows] = await connection.query(
    "SELECT DISTINCT index_name AS name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ?",
    [table]
  );
  return rows.map(r => r.name);
}

log("=== 1) سجل ترحيلات Drizzle ===");
if (await tableExists("__drizzle_migrations")) {
  const [rows] = await connection.query(
    "SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at ASC"
  );
  if (!rows.length) log("  (فارغ) — لم يُسجَّل أي ترحيل عبر Drizzle.");
  for (const row of rows) {
    const when = Number(row.created_at);
    const iso = Number.isFinite(when) ? new Date(when).toISOString() : String(row.created_at);
    log(`  #${row.id}  ${iso}  hash=${String(row.hash).slice(0, 12)}…`);
  }
  log(`  الإجمالي: ${rows.length}`);
} else {
  log("  جدول __drizzle_migrations غير موجود (لم يُشغَّل Drizzle migrate من قبل).");
}

log("");
log("=== 2) الأعمدة الفعلية ===");
const itemCols = await columns("items");
const specCols = ["item_type", "size_length_cm", "size_width_cm", "tone", "thickness_cm", "spec_group_key"];
const missingSpec = specCols.filter(c => !itemCols.includes(c));
log(`  items: ${missingSpec.length === 0 ? "كل أعمدة 0039 موجودة ✅" : `ناقصة (0039): ${missingSpec.join(", ")} ❌`}`);

const runCols = await columns("report_scheduler_runs");
log(
  `  report_scheduler_runs.project_id: ${runCols.includes("project_id") ? "موجود ✅" : "غير موجود (0038 غير مطبّق) ❌"}`
);

log("");
log("=== 3) الفهارس الفعلية ===");
const buildingIdx = await indexes("buildings");
log(`  buildings: ${buildingIdx.join(", ")}`);
const hasLegacyBuildingUnique = buildingIdx.includes("buildings_name_unique");
const hasProjectBuildingUnique = buildingIdx.includes("buildings_project_name_uq");
log(
  `  0037: ${hasProjectBuildingUnique ? "مطبّق ✅" : hasLegacyBuildingUnique ? "غير مطبّق ❌ (القيد العام القديم ما زال قائمًا)" : "حالة غير معروفة ⚠️"}`
);

const runIdx = await indexes("report_scheduler_runs");
log(`  report_scheduler_runs: ${runIdx.join(", ")}`);
log(
  `  0038: ${runIdx.includes("report_scheduler_runs_project_date_uq") ? "مطبّق ✅" : "غير مطبّق ❌"}`
);

log("");
log("=== 4) فحص مسبق للبيانات (0037) ===");
const [dupName] = await connection.query(
  "SELECT project_id, name, COUNT(*) AS c FROM buildings GROUP BY project_id, name HAVING c > 1 LIMIT 10"
);
const [dupCode] = await connection.query(
  "SELECT project_id, code, COUNT(*) AS c FROM buildings GROUP BY project_id, code HAVING c > 1 LIMIT 10"
);
const [nullProject] = await connection.query(
  "SELECT COUNT(*) AS c FROM buildings WHERE project_id IS NULL"
);
log(`  تكرار (project_id, name): ${dupName.length}`);
for (const r of dupName) log(`    - project_id=${r.project_id} name="${r.name}" ×${r.c}`);
log(`  تكرار (project_id, code): ${dupCode.length}`);
for (const r of dupCode) log(`    - project_id=${r.project_id} code="${r.code}" ×${r.c}`);
log(`  صفوف buildings بدون project_id: ${nullProject[0].c}`);

log("");
log("=== 5) الخلاصة ===");
const blockers = [];
if (dupName.length) blockers.push("تكرار أسماء مبانٍ داخل نفس المشروع يمنع 0037");
if (dupCode.length) blockers.push("تكرار أكواد مبانٍ داخل نفس المشروع يمنع 0037");
if (Number(nullProject[0].c) > 0) blockers.push("وجود مبانٍ بدون project_id يمنع 0037");
if (!missingSpec.length && !hasProjectBuildingUnique) {
  log("  ⚠️ 0039 يبدو مطبّقًا قبل 0037: الترتيب غير سليم.");
}
if (blockers.length) {
  log("  ⛔ لا يمكن تطبيق 0037 الآن:");
  for (const b of blockers) log(`     - ${b}`);
} else {
  log("  ✅ لا موانع بيانات لتطبيق 0037 ثم 0038 ثم 0039.");
}

await connection.end();
