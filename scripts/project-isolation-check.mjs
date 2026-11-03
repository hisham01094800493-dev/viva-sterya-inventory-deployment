#!/usr/bin/env node
/**
 * 12-step project isolation check.
 *
 * SAFETY MODEL
 * ------------
 * - Runs ONLY against an explicit --database-url (or ISOLATION_DB_URL).
 * - Wraps every write in a single transaction that is ALWAYS rolled back.
 * - Never touches production rows: nothing is committed, ever.
 * - Refuses to run against the URI stored in /workspace/.aiven_uri unless
 *   --allow-same-db is passed (still rolled back).
 * - Never prints the password.
 *
 * Usage:
 *   node scripts/project-isolation-check.mjs --database-url="mysql://..."
 *   ISOLATION_DB_URL="mysql://..." node scripts/project-isolation-check.mjs
 */
import fs from "node:fs";
import mysql from "mysql2/promise";

const args = process.argv.slice(2);
function argValue(name) {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

const url = argValue("database-url") || process.env.ISOLATION_DB_URL;
if (!url) {
  console.error("REFUSED: pass --database-url=... or set ISOLATION_DB_URL. Nothing was run.");
  process.exit(2);
}

let productionUri = null;
try {
  productionUri = fs.readFileSync("/workspace/.aiven_uri", "utf8").trim();
} catch {
  /* no stored uri */
}
if (productionUri && url.trim() === productionUri && !args.includes("--allow-same-db")) {
  console.error("REFUSED: this is the stored production URI. Pass --allow-same-db to run the rollback-only check anyway.");
  process.exit(2);
}

const mask = u => u.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@");
console.log(`[ISOLATION] target: ${mask(url)}`);
console.log("[ISOLATION] mode: single transaction, ALWAYS ROLLBACK (no data is persisted)");

const conn = await mysql.createConnection({ uri: url, multipleStatements: false });
const results = [];
function step(n, name, ok, detail) {
  results.push({ n, name, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] step ${n}: ${name}${detail ? ` — ${detail}` : ""}`);
}

const stamp = Date.now();
const code = `ISO-${stamp}`;
const projectCode = `ISO-TEST-${stamp}`;
let isoProjectId = null;

try {
  await conn.beginTransaction();

  // 1. MAIN project must exist
  const [mainRows] = await conn.query("SELECT id, code FROM projects WHERE code = 'MAIN' LIMIT 1");
  const main = mainRows[0];
  step(1, "MAIN project exists", !!main, main ? `id=${main.id}` : "missing");
  if (!main) throw new Error("MAIN project missing — aborting");

  // 2. Create a temporary second project (rolled back later)
  const [projIns] = await conn.query(
    "INSERT INTO projects (name, code, status) VALUES (?, ?, 'active')",
    [`Isolation Test ${stamp}`, projectCode]
  );
  isoProjectId = projIns.insertId;
  step(2, "second project created", !!isoProjectId, `id=${isoProjectId}`);

  // 3. Warehouse in MAIN (high slot to avoid collisions)
  const [whMain] = await conn.query(
    "INSERT INTO warehouses (project_id, slot, name) VALUES (?, ?, ?)",
    [main.id, 990001, `ISO-WH-MAIN-${stamp}`]
  );
  step(3, "warehouse created in MAIN", !!whMain.insertId, `id=${whMain.insertId}`);

  // 4. Warehouse in second project with the SAME slot (composite unique must allow it)
  const [whIso] = await conn.query(
    "INSERT INTO warehouses (project_id, slot, name) VALUES (?, ?, ?)",
    [isoProjectId, 990001, `ISO-WH-ISO-${stamp}`]
  );
  step(4, "same warehouse slot allowed in another project", !!whIso.insertId, `id=${whIso.insertId}`);

  // 5. Item in MAIN
  const [itMain] = await conn.query(
    "INSERT INTO items (code, project_id, warehouse_id, name, initial_stock, incoming_stock, outgoing_stock, current_stock, reorder_level, unit_price) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0)",
    [code, main.id, whMain.insertId, `ISO Item MAIN ${stamp}`]
  );
  step(5, "item created in MAIN", !!itMain.insertId, `id=${itMain.insertId}`);

  // 6. Item with the SAME code in the second project (composite unique must allow it)
  const [itIso] = await conn.query(
    "INSERT INTO items (code, project_id, warehouse_id, name, initial_stock, incoming_stock, outgoing_stock, current_stock, reorder_level, unit_price) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0)",
    [code, isoProjectId, whIso.insertId, `ISO Item ISO ${stamp}`]
  );
  step(6, "same item code allowed in another project", !!itIso.insertId, `id=${itIso.insertId}`);

  // 7. Addition in MAIN
  await conn.query(
    "INSERT INTO additions (project_id, date, ezn_num, item_code, item_name, warehouse_id, quantity, unit_price, total_value) VALUES (?, '2026-01-01', ?, ?, ?, ?, 5, 10, 50)",
    [main.id, `ISO-EZN-M-${stamp}`, code, `ISO Item MAIN ${stamp}`, whMain.insertId]
  );
  // 8. Addition in second project
  await conn.query(
    "INSERT INTO additions (project_id, date, ezn_num, item_code, item_name, warehouse_id, quantity, unit_price, total_value) VALUES (?, '2026-01-01', ?, ?, ?, ?, 7, 10, 70)",
    [isoProjectId, `ISO-EZN-I-${stamp}`, code, `ISO Item ISO ${stamp}`, whIso.insertId]
  );
  step(7, "movement rows created in both projects", true, "1 addition each");

  // 9. MAIN-scoped item read sees only MAIN item
  const [mainItems] = await conn.query(
    "SELECT id, project_id FROM items WHERE project_id = ? AND code = ?",
    [main.id, code]
  );
  step(9, "MAIN item query isolated", mainItems.length === 1 && mainItems[0].project_id === main.id, `rows=${mainItems.length}`);

  // 10. Second-project item read sees only its own item
  const [isoItems] = await conn.query(
    "SELECT id, project_id FROM items WHERE project_id = ? AND code = ?",
    [isoProjectId, code]
  );
  step(10, "second-project item query isolated", isoItems.length === 1 && isoItems[0].project_id === isoProjectId, `rows=${isoItems.length}`);

  // 11. Duplicate code within the SAME project must be rejected
  let dupRejected = false;
  try {
    await conn.query(
      "INSERT INTO items (code, project_id, warehouse_id, name, initial_stock, incoming_stock, outgoing_stock, current_stock, reorder_level, unit_price) VALUES (?, ?, ?, 'dup', 0, 0, 0, 0, 0, 0)",
      [code, main.id, whMain.insertId]
    );
  } catch (e) {
    dupRejected = e && (e.code === "ER_DUP_ENTRY" || /Duplicate entry/i.test(e.message));
  }
  step(11, "duplicate item code rejected inside same project", dupRejected, dupRejected ? "ER_DUP_ENTRY" : "NOT rejected");

  // 12. Movement totals are isolated per project
  const [mainAdd] = await conn.query(
    "SELECT COALESCE(SUM(quantity),0) AS q FROM additions WHERE project_id = ? AND item_code = ?",
    [main.id, code]
  );
  const [isoAdd] = await conn.query(
    "SELECT COALESCE(SUM(quantity),0) AS q FROM additions WHERE project_id = ? AND item_code = ?",
    [isoProjectId, code]
  );
  const mainQty = Number(mainAdd[0].q);
  const isoQty = Number(isoAdd[0].q);
  step(12, "movement totals isolated per project", mainQty === 5 && isoQty === 7, `MAIN=${mainQty}, ISO=${isoQty}`);
} catch (error) {
  console.error("[ISOLATION] aborted:", error.message);
} finally {
  await conn.rollback();
  console.log("[ISOLATION] transaction rolled back — no data persisted");

  // Post-rollback proof: temp project must not exist
  const [residue] = await conn.query("SELECT COUNT(*) AS c FROM projects WHERE code = ?", [projectCode]);
  const leftover = Number(residue[0].c);
  step(13, "no residue after rollback", leftover === 0, `rows=${leftover}`);
  await conn.end();
}

const failed = results.filter(r => !r.ok);
console.log(`\n[ISOLATION] ${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
