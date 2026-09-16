import "dotenv/config";
import mysql from "mysql2/promise";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ENV } from "../server/_core/env";

const DATABASE_NAME_PATTERN = /^[A-Za-z0-9_]+$/;
const TEST_SUFFIX = "_restore_test";

function fail(message: string): never {
  throw new Error(`[isolated-restore-prepare] ${message}`);
}

function databaseFromUrl(rawUrl: string) {
  if (!rawUrl) fail("DATABASE_URL is not configured");
  const url = new URL(rawUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database || !DATABASE_NAME_PATTERN.test(database))
    fail("production database name is invalid");
  return { url, database };
}

function quoteIdentifier(name: string) {
  if (!DATABASE_NAME_PATTERN.test(name)) fail("test database name is invalid");
  return `\`${name}\``;
}

function connectionOptions(url: URL, database?: string) {
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ssl: ENV.databaseSsl
      ? { ...ENV.databaseSsl, servername: url.hostname }
      : undefined,
    multipleStatements: false,
  };
}

async function migrationFiles() {
  const directories = [
    path.resolve(process.cwd(), "drizzle"),
    path.resolve(process.cwd(), "drizzle/migrations"),
  ];
  const files: string[] = [];
  for (const directory of directories) {
    for (const file of await readdir(directory)) {
      if (/^\d+_.*\.sql$/.test(file)) files.push(path.join(directory, file));
    }
  }
  return files.sort((a, b) =>
    path
      .basename(a)
      .localeCompare(path.basename(b), undefined, { numeric: true })
  );
}

const { url: productionUrl, database: productionDatabase } = databaseFromUrl(
  ENV.databaseUrl
);
const configuredTestDatabase = ENV.backupRestoreTestDatabase;
if (!configuredTestDatabase)
  fail("BACKUP_RESTORE_TEST_DATABASE is not configured");
if (!DATABASE_NAME_PATTERN.test(configuredTestDatabase))
  fail("BACKUP_RESTORE_TEST_DATABASE contains unsafe characters");
if (configuredTestDatabase === productionDatabase)
  fail("refusing to touch the production database");
if (!configuredTestDatabase.endsWith(TEST_SUFFIX))
  fail(`test database must end with ${TEST_SUFFIX}`);

const testIdentifier = quoteIdentifier(configuredTestDatabase);
const admin = await mysql.createConnection(connectionOptions(productionUrl));
let testPool: mysql.Pool | undefined;
try {
  console.log(
    JSON.stringify({
      productionDatabase,
      testDatabase: configuredTestDatabase,
      action: "recreate_test_database_only",
    })
  );
  await admin.query(`DROP DATABASE IF EXISTS ${testIdentifier}`);
  await admin.query(`CREATE DATABASE ${testIdentifier}`);
} finally {
  await admin.end();
}

try {
  testPool = mysql.createPool({
    ...connectionOptions(productionUrl, configuredTestDatabase),
    connectionLimit: 2,
  });
  const files = await migrationFiles();
  if (files.length === 0) fail("no migration files found");
  for (const file of files) {
    const sql = await readFile(file, "utf8");
    const statements = sql
      .replace(/--> statement-breakpoint\s*/g, "\n")
      .split(/;\s*(?=(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|REPLACE)\b)/i)
      .map(statement => statement.trim())
      .filter(Boolean);
    for (const statement of statements) await testPool.query(statement);
    console.log(`applied ${path.relative(process.cwd(), file)}`);
  }
  await testPool.query(
    "ALTER TABLE `user_permissions` ADD COLUMN `allowed_warehouses` VARCHAR(2000) NOT NULL DEFAULT '[]'"
  );
  console.log(
    "applied runtime schema upgrade user_permissions.allowed_warehouses"
  );
  const [rows] = await testPool.query<{ total: number }[]>(
    "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = ?",
    [configuredTestDatabase]
  );
  console.log(
    JSON.stringify({
      status: "ready",
      testDatabase: configuredTestDatabase,
      migrationFiles: files.length,
      tableCount: Number(rows[0]?.total ?? 0),
    })
  );
} catch (error) {
  const cleanup = await mysql.createConnection(
    connectionOptions(productionUrl)
  );
  try {
    await cleanup.query(`DROP DATABASE IF EXISTS ${testIdentifier}`);
  } finally {
    await cleanup.end();
  }
  throw error;
} finally {
  await testPool?.end();
}
