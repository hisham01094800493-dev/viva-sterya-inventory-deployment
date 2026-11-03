// Read-only post-migration verification for Phase 2C (0036).
import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const q = async (sql) => (await conn.query(sql))[0];

const out = {};

out.ledger = await q("SELECT COUNT(*) AS n, MAX(created_at) AS last FROM __drizzle_migrations");
out.ledger0034 = await q(
  "SELECT COUNT(*) AS n FROM __drizzle_migrations WHERE hash = '8e5debf6d31102930c8062701f0d057fcea42434b5372f3649d848f5905009c0'",
);
out.projects = await q("SELECT id, code, name, status FROM projects ORDER BY id");

out.projectColumns = await q(
  `SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_TYPE
     FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND COLUMN_NAME IN ('project_id','allowed_projects','active_project_id')
    ORDER BY TABLE_NAME`,
);

out.indexes = await q(
  `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
     FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND INDEX_NAME IN ('items_code_unique','warehouses_slot_unique',
                         'items_project_code_uq','warehouses_project_slot_uq',
                         'items_project_id_idx','warehouses_project_id_idx')
    GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
    ORDER BY TABLE_NAME, INDEX_NAME`,
);

out.fingerprint = (await q(
  `SELECT COUNT(*) AS rows_,
          COALESCE(SUM(initial_stock),0)  AS sumInitial,
          COALESCE(SUM(incoming_stock),0) AS sumIncoming,
          COALESCE(SUM(outgoing_stock),0) AS sumOutgoing,
          COALESCE(SUM(current_stock),0)  AS sumCurrent,
          COALESCE(SUM(unit_price),0)     AS sumUnitPrice
     FROM items`,
))[0];

out.counts = {};
for (const t of [
  "items", "warehouses", "buildings", "additions", "disbursements", "transfers",
  "user_permissions", "user_preferences", "suppliers", "customers",
]) {
  out.counts[t] = (await q(`SELECT COUNT(*) AS n FROM \`${t}\``))[0].n;
}

out.nulls = (await q(
  `SELECT
     (SELECT COUNT(*) FROM items WHERE project_id IS NULL) AS items_null,
     (SELECT COUNT(*) FROM warehouses WHERE project_id IS NULL) AS warehouses_null,
     (SELECT COUNT(*) FROM buildings WHERE project_id IS NULL) AS buildings_null,
     (SELECT COUNT(*) FROM additions WHERE project_id IS NULL) AS additions_null,
     (SELECT COUNT(*) FROM disbursements WHERE project_id IS NULL) AS disbursements_null,
     (SELECT COUNT(*) FROM transfers WHERE project_id IS NULL) AS transfers_null`,
))[0];

out.perProject = {};
for (const t of ["items", "warehouses", "buildings", "additions", "disbursements", "transfers"]) {
  out.perProject[t] = await q(
    `SELECT project_id, COUNT(*) AS n FROM \`${t}\` GROUP BY project_id ORDER BY project_id`,
  );
}

out.perms = (await q(
  "SELECT COUNT(*) AS total, SUM(allowed_projects = '[]') AS empty_count FROM user_permissions",
))[0];

out.prefs = (await q(
  "SELECT COUNT(*) AS total, SUM(active_project_id IS NULL) AS null_active FROM user_preferences",
))[0];

console.log(JSON.stringify(out, null, 2));
await conn.end();
