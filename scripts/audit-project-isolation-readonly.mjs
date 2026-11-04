#!/usr/bin/env node
/**
 * تدقيق عزل المشاريع — قراءة فقط (READ-ONLY AUDIT)
 * =================================================
 *
 * الغرض:
 *   1) تقرير تكرارات المباني الذي يمنع تنفيذ drizzle/0037_project_building_uniques.sql
 *   2) تقرير الصفوف اليتيمة في additions.warehouse_id
 *   3) لقطة عن القيود والفهارس الفعلية على جدولي buildings و report_scheduler_runs
 *
 * نموذج الأمان (SAFETY MODEL)
 * ---------------------------
 * - لا ينفّذ أي أمر غير SELECT / SHOW / DESCRIBE / WITH.
 * - يفتح الجلسة بـ SET SESSION TRANSACTION READ ONLY قبل أي استعلام.
 * - يرفض أي استعلام لا يبدأ بأحد الأوامر المسموحة (حاجز مزدوج).
 * - لا يحذف ولا يعدّل ولا يُدرج أي صف. صفر كتابة.
 * - لا يطبع كلمة مرور الاتصال في أي مخرج.
 * - لا يحتاج أي صلاحية كتابة على قاعدة البيانات.
 *
 * الاستخدام:
 *   node scripts/audit-project-isolation-readonly.mjs --database-url="mysql://..."
 *   AUDIT_DB_URL="mysql://..." node scripts/audit-project-isolation-readonly.mjs
 *
 * المخرجات:
 *   - ملخص عربي على الشاشة
 *   - ملف JSON كامل في outputs/audit-project-isolation-<timestamp>.json
 *
 * رمز الخروج:
 *   0 = نجح التدقيق (سواء وُجدت تكرارات أم لا)
 *   2 = لم يُمرَّر رابط قاعدة بيانات (لم يُنفّذ شيء)
 *   3 = فشل الاتصال
 */

import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const args = process.argv.slice(2);

function argValue(name) {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

const url = argValue("database-url") || process.env.AUDIT_DB_URL || process.env.DATABASE_URL;

if (!url) {
  console.error(
    "لم يُنفَّذ شيء.\n" +
      "مرّر رابط قاعدة البيانات:\n" +
      '  node scripts/audit-project-isolation-readonly.mjs --database-url="mysql://..."\n' +
      "أو عبر متغير البيئة:\n" +
      '  AUDIT_DB_URL="mysql://..." node scripts/audit-project-isolation-readonly.mjs'
  );
  process.exit(2);
}

/** إخفاء كلمة المرور من أي نص قبل الطباعة. */
function redact(text) {
  if (typeof text !== "string") return text;
  return text.replace(/(mysql(?:s)?:\/\/[^:/@]+:)[^@]*@/gi, "$1***@");
}

const ALLOWED_PREFIXES = ["SELECT", "SHOW", "DESCRIBE", "DESC", "WITH", "EXPLAIN"];

/**
 * حاجز أمان مزدوج: يرفض أي استعلام ليس للقراءة فقط.
 * يُستدعى قبل كل استعلام بلا استثناء.
 */
function assertReadOnly(sql) {
  const normalized = sql.replace(/^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)+/g, "").trim();
  const firstWord = normalized.split(/\s+/)[0]?.toUpperCase() ?? "";
  if (!ALLOWED_PREFIXES.includes(firstWord)) {
    throw new Error(`REFUSED: استعلام غير مسموح في وضع القراءة فقط: ${firstWord}`);
  }
  const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REPLACE|GRANT|REVOKE|RENAME|CALL|LOAD\s+DATA)\b/i;
  if (forbidden.test(normalized)) {
    throw new Error("REFUSED: الاستعلام يحتوي على كلمة كتابة ممنوعة.");
  }
  return sql;
}

const results = {
  generatedAt: new Date().toISOString(),
  mode: "READ_ONLY",
  server: null,
  database: null,
  checks: {},
  summary: {},
};

let conn;

async function q(label, sql, params = []) {
  assertReadOnly(sql);
  const [rows] = await conn.query(sql, params);
  results.checks[label] = rows;
  return rows;
}

/** يعيد true إذا كان الجدول موجودًا. */
async function tableExists(name) {
  const rows = await q(
    `table_exists_${name}`,
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [name]
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function columnExists(table, column) {
  const rows = await q(
    `column_exists_${table}_${column}`,
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  conn = await mysql.createConnection({
    uri: url,
    multipleStatements: false,
    dateStrings: true,
  });

  // حاجز أمان أول: الجلسة نفسها للقراءة فقط على مستوى الخادم.
  await conn.query("SET SESSION TRANSACTION READ ONLY");

  const [[meta]] = await conn.query(
    "SELECT DATABASE() AS db, VERSION() AS version, @@hostname AS host"
  );
  results.database = meta?.db ?? null;
  results.server = { version: meta?.version ?? null, host: meta?.host ?? null };

  // ── 1) المباني: هل يوجد تكرار يمنع تنفيذ 0037؟ ─────────────────────────
  const buildingsExists = await tableExists("buildings");
  const hasBuildingProjectId = buildingsExists
    ? await columnExists("buildings", "project_id")
    : false;

  if (buildingsExists) {
    // القيود والفهارس الفعلية الآن على جدول المباني
    await q("buildings_indexes", "SHOW INDEX FROM `buildings`");

    // أسماء المباني المكرّرة عبر أكثر من مشروع
    await q(
      "duplicate_building_names_across_projects",
      `SELECT \`name\` AS building_name,
              COUNT(*) AS total_rows,
              COUNT(DISTINCT \`project_id\`) AS project_count,
              GROUP_CONCAT(DISTINCT \`project_id\` ORDER BY \`project_id\`) AS project_ids
         FROM \`buildings\`
        GROUP BY \`name\`
       HAVING COUNT(DISTINCT \`project_id\`) > 1
        ORDER BY total_rows DESC
        LIMIT 200`
    );

    // أكواد المباني المكرّرة عبر أكثر من مشروع
    await q(
      "duplicate_building_codes_across_projects",
      `SELECT \`code\` AS building_code,
              COUNT(*) AS total_rows,
              COUNT(DISTINCT \`project_id\`) AS project_count,
              GROUP_CONCAT(DISTINCT \`project_id\` ORDER BY \`project_id\`) AS project_ids
         FROM \`buildings\`
        GROUP BY \`code\`
       HAVING COUNT(DISTINCT \`project_id\`) > 1
        ORDER BY total_rows DESC
        LIMIT 200`
    );

    // تكرار داخل نفس المشروع (يمنع القيد المركّب أيضًا)
    await q(
      "duplicate_building_names_within_project",
      `SELECT \`project_id\`, \`name\` AS building_name, COUNT(*) AS total_rows
         FROM \`buildings\`
        GROUP BY \`project_id\`, \`name\`
       HAVING COUNT(*) > 1
        ORDER BY total_rows DESC
        LIMIT 200`
    );

    await q(
      "duplicate_building_codes_within_project",
      `SELECT \`project_id\`, \`code\` AS building_code, COUNT(*) AS total_rows
         FROM \`buildings\`
        GROUP BY \`project_id\`, \`code\`
       HAVING COUNT(*) > 1
        ORDER BY total_rows DESC
        LIMIT 200`
    );

    if (hasBuildingProjectId) {
      await q(
        "buildings_without_project",
        `SELECT COUNT(*) AS rows_without_project FROM \`buildings\` WHERE \`project_id\` IS NULL`
      );
    }
  }

  // ── 2) الصفوف اليتيمة في additions.warehouse_id ────────────────────────
  const additionsExists = await tableExists("additions");
  if (additionsExists) {
    const hasWarehouseId = await columnExists("additions", "warehouse_id");
    if (hasWarehouseId) {
      await q(
        "orphan_additions_count",
        `SELECT COUNT(*) AS orphan_rows
           FROM \`additions\` a
           LEFT JOIN \`warehouses\` w ON w.\`id\` = a.\`warehouse_id\`
          WHERE a.\`warehouse_id\` IS NOT NULL AND w.\`id\` IS NULL`
      );

      await q(
        "orphan_additions_null_warehouse",
        `SELECT COUNT(*) AS null_warehouse_rows FROM \`additions\` WHERE \`warehouse_id\` IS NULL`
      );

      await q(
        "orphan_additions_sample",
        `SELECT a.\`id\`, a.\`warehouse_id\`, a.\`item_id\`, a.\`quantity\`, a.\`created_at\`
           FROM \`additions\` a
           LEFT JOIN \`warehouses\` w ON w.\`id\` = a.\`warehouse_id\`
          WHERE a.\`warehouse_id\` IS NOT NULL AND w.\`id\` IS NULL
          ORDER BY a.\`id\`
          LIMIT 50`
      );

      // هل الصفوف اليتيمة مرتبطة بمشروع معروف؟
      const hasAdditionProjectId = await columnExists("additions", "project_id");
      if (hasAdditionProjectId) {
        await q(
          "orphan_additions_by_project",
          `SELECT a.\`project_id\`, COUNT(*) AS orphan_rows
             FROM \`additions\` a
             LEFT JOIN \`warehouses\` w ON w.\`id\` = a.\`warehouse_id\`
            WHERE a.\`warehouse_id\` IS NOT NULL AND w.\`id\` IS NULL
            GROUP BY a.\`project_id\`
            ORDER BY orphan_rows DESC`
        );
      }
    }
  }

  // ── 3) جدولة التقارير: هل عمود العزل موجود فعلًا؟ ──────────────────────
  if (await tableExists("report_scheduler_runs")) {
    await q("report_scheduler_runs_indexes", "SHOW INDEX FROM `report_scheduler_runs`");
    await q(
      "report_scheduler_runs_columns",
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_scheduler_runs'
        ORDER BY ORDINAL_POSITION`
    );
  }

  // ── 4) المشاريع: لقطة عامة ─────────────────────────────────────────────
  if (await tableExists("projects")) {
    await q(
      "projects_overview",
      `SELECT \`id\`, \`name\`, \`code\`, \`is_active\`
         FROM \`projects\`
        ORDER BY \`id\``
    );
  }

  // ── الخلاصة ────────────────────────────────────────────────────────────
  const dupNames = results.checks.duplicate_building_names_across_projects ?? [];
  const dupCodes = results.checks.duplicate_building_codes_across_projects ?? [];
  const dupNamesIn = results.checks.duplicate_building_names_within_project ?? [];
  const dupCodesIn = results.checks.duplicate_building_codes_within_project ?? [];
  const orphan = Number(results.checks.orphan_additions_count?.[0]?.orphan_rows ?? 0);
  const buildingsNoProject = Number(
    results.checks.buildings_without_project?.[0]?.rows_without_project ?? 0
  );

  results.summary = {
    duplicate_building_names_across_projects: dupNames.length,
    duplicate_building_codes_across_projects: dupCodes.length,
    duplicate_building_names_within_project: dupNamesIn.length,
    duplicate_building_codes_within_project: dupCodesIn.length,
    buildings_without_project: buildingsNoProject,
    orphan_additions: orphan,
    migration_0037_blocked_by:
      dupNames.length + dupCodes.length + dupNamesIn.length + dupCodesIn.length > 0
        ? "نعم — توجد تكرارات يجب حلّها قبل تنفيذ 0037"
        : "لا — لا توجد تكرارات تمنع تنفيذ 0037",
  };

  // ── كتابة الملف ────────────────────────────────────────────────────────
  const outDir = path.join(process.cwd(), "outputs");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `audit-project-isolation-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2), "utf8");

  // ── الطباعة ────────────────────────────────────────────────────────────
  const line = "─".repeat(64);
  console.log(line);
  console.log("تدقيق عزل المشاريع — قراءة فقط (لم يُعدَّل أي صف)");
  console.log(line);
  console.log(`قاعدة البيانات : ${results.database}`);
  console.log(`إصدار الخادم   : ${results.server.version}`);
  console.log(line);
  console.log(`تكرار أسماء المباني بين مشاريع مختلفة : ${dupNames.length}`);
  console.log(`تكرار أكواد المباني بين مشاريع مختلفة : ${dupCodes.length}`);
  console.log(`تكرار أسماء داخل نفس المشروع          : ${dupNamesIn.length}`);
  console.log(`تكرار أكواد داخل نفس المشروع          : ${dupCodesIn.length}`);
  console.log(`مبانٍ بلا مشروع                        : ${buildingsNoProject}`);
  console.log(`صفوف إضافات يتيمة (warehouse_id)       : ${orphan}`);
  console.log(line);
  console.log(`حالة 0037: ${results.summary.migration_0037_blocked_by}`);
  console.log(line);

  if (dupNames.length > 0) {
    console.log("\nأمثلة على أسماء مبنية مكرّرة بين المشاريع:");
    for (const r of dupNames.slice(0, 10)) {
      console.log(`  • "${r.building_name}" → مشاريع: [${r.project_ids}] (${r.total_rows} صف)`);
    }
  }
  if (dupCodes.length > 0) {
    console.log("\nأمثلة على أكواد مبنية مكرّرة بين المشاريع:");
    for (const r of dupCodes.slice(0, 10)) {
      console.log(`  • "${r.building_code}" → مشاريع: [${r.project_ids}] (${r.total_rows} صف)`);
    }
  }
  if (orphan > 0) {
    console.log("\nالصفوف اليتيمة موزّعة على المشاريع:");
    for (const r of results.checks.orphan_additions_by_project ?? []) {
      console.log(`  • مشروع ${r.project_id ?? "بدون"}: ${r.orphan_rows} صف`);
    }
  }

  console.log(`\nالتقرير الكامل: ${path.relative(process.cwd(), outFile)}`);
}

main()
  .catch(err => {
    const message = redact(err?.message ?? String(err));
    if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|Access denied|ER_ACCESS_DENIED/i.test(message)) {
      console.error("فشل الاتصال بقاعدة البيانات:", message);
      process.exit(3);
    }
    console.error("فشل التدقيق:", message);
    process.exit(1);
  })
  .finally(async () => {
    if (conn) await conn.end().catch(() => {});
  });
