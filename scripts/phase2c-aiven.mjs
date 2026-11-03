#!/usr/bin/env node
/**
 * Phase 2C — Aiven migration runner for the projects system.
 *
 * SAFETY CONTRACT
 *  - Default mode is READ-ONLY (preflight). Nothing is written.
 *  - Writing requires an explicit `--apply` flag AND a fresh backup file
 *    passed via `--backup=<path>` that must exist and pass a gzip integrity test.
 *  - The only writes performed are:
 *      1. one INSERT into `__drizzle_migrations` for migration 0034 (ledger reconciliation)
 *      2. `drizzle-kit migrate` which applies 0035 + 0036 only
 *  - No stock column is ever modified. No row is ever deleted.
 *  - A financial fingerprint is captured before and after and compared byte-for-byte.
 *
 * USAGE
 *   node scripts/phase2c-aiven.mjs                       # preflight (read-only)
 *   node scripts/phase2c-aiven.mjs --apply --backup=path  # apply (guarded)
 */

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import mysql from "mysql2/promise";

const MIGRATION_0034_HASH =
  "8e5debf6d31102930c8062701f0d057fcea42434b5372f3649d848f5905009c0";
const MIGRATION_0034_WHEN = 1793278396000;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const backupArg = args.find(a => a.startsWith("--backup="));
const BACKUP_PATH = backupArg ? backupArg.slice("--backup=".length) : null;

function log(section, message) {
  console.log(`[${section}] ${message}`);
}

function fail(message) {
  console.error(`\n[ABORT] ${message}\n`);
  process.exit(1);
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is not set. Export the Aiven connection string first.");
  const connection = await mysql.createConnection({
    uri: url,
    ssl: { rejectUnauthorized: false },
    multipleStatements: false,
    connectTimeout: 20000,
  });
  const [rows] = await connection.query("SELECT DATABASE() AS db, VERSION() AS version");
  log("CONNECT", `database=${rows[0].db} mysql=${rows[0].version}`);
  return connection;
}

async function tableExists(conn, name) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    [name],
  );
  return rows[0].n > 0;
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
    [table, column],
  );
  return rows[0].n > 0;
}

async function indexExists(conn, table, index) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?",
    [table, index],
  );
  return rows[0].n > 0;
}

/** Financial + row-count fingerprint. Read-only. */
async function fingerprint(conn) {
  const [items] = await conn.query(
    `SELECT COUNT(*) AS rows_total,
            COALESCE(SUM(initial_stock),0)  AS sum_initial,
            COALESCE(SUM(incoming_stock),0) AS sum_incoming,
            COALESCE(SUM(outgoing_stock),0) AS sum_outgoing,
            COALESCE(SUM(current_stock),0)  AS sum_current,
            COALESCE(SUM(unit_price),0)     AS sum_unit_price
       FROM items`,
  );
  const tables = [
    "items",
    "warehouses",
    "buildings",
    "additions",
    "disbursements",
    "transfers",
    "user_permissions",
    "user_preferences",
    "suppliers",
    "customers",
  ];
  const counts = {};
  for (const t of tables) {
    if (!(await tableExists(conn, t))) {
      counts[t] = "MISSING";
      continue;
    }
    const [r] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
    counts[t] = Number(r[0].n);
  }
  return {
    items: {
      rows: Number(items[0].rows_total),
      sumInitial: String(items[0].sum_initial),
      sumIncoming: String(items[0].sum_incoming),
      sumOutgoing: String(items[0].sum_outgoing),
      sumCurrent: String(items[0].sum_current),
      sumUnitPrice: String(items[0].sum_unit_price),
    },
    counts,
  };
}

async function preflight(conn) {
  const report = { checks: [], ok: true };
  const add = (name, ok, detail) => {
    report.checks.push({ name, ok, detail });
    if (!ok) report.ok = false;
  };

  // --- ledger state -------------------------------------------------------
  const [ledger] = await conn.query(
    "SELECT COUNT(*) AS n FROM `__drizzle_migrations`",
  );
  const ledgerCount = Number(ledger[0].n);
  add("ledger row count", true, `${ledgerCount} rows (expected 35 before apply)`);

  const [has0034] = await conn.query(
    "SELECT COUNT(*) AS n FROM `__drizzle_migrations` WHERE hash = ?",
    [MIGRATION_0034_HASH],
  );
  const applied0034 = Number(has0034[0].n) > 0;
  add(
    "0034 ledger entry",
    true,
    applied0034 ? "already present" : "MISSING -> will be inserted (one row)",
  );

  // --- preconditions for 0036 --------------------------------------------
  const projectsTable = await tableExists(conn, "projects");
  add("projects table absent", !projectsTable, projectsTable ? "ALREADY EXISTS" : "absent (ok)");

  for (const [table, column] of [
    ["items", "project_id"],
    ["warehouses", "project_id"],
    ["buildings", "project_id"],
    ["additions", "project_id"],
    ["disbursements", "project_id"],
    ["transfers", "project_id"],
    ["user_permissions", "allowed_projects"],
    ["user_preferences", "active_project_id"],
  ]) {
    const exists = await columnExists(conn, table, column);
    add(`${table}.${column} absent`, !exists, exists ? "ALREADY EXISTS" : "absent (ok)");
  }

  // --- indexes 0036 will drop -------------------------------------------
  add(
    "items_code_unique present",
    await indexExists(conn, "items", "items_code_unique"),
    "0036 drops it",
  );
  add(
    "warehouses_slot_unique present",
    await indexExists(conn, "warehouses", "warehouses_slot_unique"),
    "0036 drops it",
  );

  // --- 0034 table must already exist (that is WHY the ledger entry is needed)
  add(
    "report_scheduler_runs exists",
    await tableExists(conn, "report_scheduler_runs"),
    "confirms 0034 was applied manually; ledger entry required",
  );

  // --- financial baseline ------------------------------------------------
  report.baseline = await fingerprint(conn);
  return report;
}

async function applyMigration(conn, baseline) {
  if (!BACKUP_PATH) fail("--apply requires --backup=<path> to a verified dump.");
  if (!existsSync(BACKUP_PATH)) fail(`Backup file not found: ${BACKUP_PATH}`);
  try {
    execFileSync("gzip", ["-t", BACKUP_PATH], { stdio: "pipe" });
  } catch {
    fail(`Backup file failed gzip integrity test: ${BACKUP_PATH}`);
  }
  log("BACKUP", `verified gzip integrity: ${BACKUP_PATH}`);
  log("BACKUP", `sha256: ${sha256File(BACKUP_PATH)}`);

  // 1) ledger reconciliation
  const [existing] = await conn.query(
    "SELECT COUNT(*) AS n FROM `__drizzle_migrations` WHERE hash = ?",
    [MIGRATION_0034_HASH],
  );
  if (Number(existing[0].n) === 0) {
    await conn.query(
      "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
      [MIGRATION_0034_HASH, MIGRATION_0034_WHEN],
    );
    log("LEDGER", "inserted 0034 ledger row");
  } else {
    log("LEDGER", "0034 already recorded, skipping insert");
  }

  // 2) drizzle migrate (applies 0035 + 0036 only)
  log("MIGRATE", "running drizzle-kit migrate ...");
  execFileSync("npx", ["drizzle-kit", "migrate"], {
    stdio: "inherit",
    env: process.env,
  });
  log("MIGRATE", "drizzle-kit migrate finished");

  // 3) post verification
  const after = await fingerprint(conn);
  const before = baseline;
  const diffs = [];
  for (const key of Object.keys(before.items)) {
    if (String(before.items[key]) !== String(after.items[key])) {
      diffs.push(`items.${key}: ${before.items[key]} -> ${after.items[key]}`);
    }
  }
  for (const table of Object.keys(before.counts)) {
    if (String(before.counts[table]) !== String(after.counts[table])) {
      diffs.push(`${table} rows: ${before.counts[table]} -> ${after.counts[table]}`);
    }
  }
  if (diffs.length) {
    console.error("\n[FAIL] DATA CHANGED — investigate immediately:\n" + diffs.join("\n"));
    process.exit(2);
  }
  log("VERIFY", "financial fingerprint identical before/after (no stock touched)");
  log("VERIFY", "all row counts identical (no data deleted)");

  // 4) structural verification
  const [proj] = await conn.query("SELECT id, code, name, status FROM projects");
  log("VERIFY", `projects rows: ${proj.length} -> ${JSON.stringify(proj)}`);
  const [nulls] = await conn.query(
    `SELECT
       (SELECT COUNT(*) FROM items WHERE project_id IS NULL) AS items_null,
       (SELECT COUNT(*) FROM warehouses WHERE project_id IS NULL) AS warehouses_null,
       (SELECT COUNT(*) FROM buildings WHERE project_id IS NULL) AS buildings_null,
       (SELECT COUNT(*) FROM additions WHERE project_id IS NULL) AS additions_null,
       (SELECT COUNT(*) FROM disbursements WHERE project_id IS NULL) AS disbursements_null,
       (SELECT COUNT(*) FROM transfers WHERE project_id IS NULL) AS transfers_null`,
  );
  log("VERIFY", `null project_id counts: ${JSON.stringify(nulls[0])}`);
  const [perm] = await conn.query(
    "SELECT COUNT(*) AS total, SUM(allowed_projects = '[]') AS empty_count FROM user_permissions",
  );
  log("VERIFY", `user_permissions: ${JSON.stringify(perm[0])}`);
}

async function main() {
  const conn = await connect();
  try {
    const report = await preflight(conn);
    console.log("\n=== PREFLIGHT REPORT ===");
    for (const c of report.checks) {
      console.log(`  ${c.ok ? "OK  " : "FAIL"}  ${c.name}  (${c.detail})`);
    }
    console.log("\n=== FINANCIAL BASELINE ===");
    console.log(JSON.stringify(report.baseline, null, 2));

    if (!report.ok) {
      fail("Preflight checks failed. Migration NOT started. Review the FAIL lines above.");
    }

    if (!APPLY) {
      console.log("\n[DRY-RUN] Preflight passed. Nothing was written.");
      console.log("[DRY-RUN] Re-run with --apply --backup=<verified dump> to migrate.");
      return;
    }

    await applyMigration(conn, report.baseline);
    console.log("\n[DONE] Phase 2C migration completed and verified.");
  } finally {
    await conn.end();
  }
}

main().catch(error => {
  console.error("\n[ERROR]", error.message);
  process.exit(1);
});
