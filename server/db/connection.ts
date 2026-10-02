import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import dns from "node:dns/promises";
import { ENV } from "../_core/env";
import { InventoryError } from "./errors";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: mysql.Pool | null = null;

export async function getDb() {
  if (!_db && ENV.databaseUrl) {
    try {
      // Railway's public hostname may return an IPv6 record first. Render's
      // network cannot always route IPv6, so resolve an IPv4 address before
      // opening the pool instead of allowing mysql2 to choose an unreachable
      // AAAA record and fail with ENETUNREACH.
      const databaseUrl = new URL(ENV.databaseUrl);
      const ipv4 = await dns.lookup(databaseUrl.hostname, { family: 4 });
      const ssl = ENV.databaseSsl
        ? { ...ENV.databaseSsl, servername: databaseUrl.hostname }
        : undefined;
      _pool = mysql.createPool({
        host: ipv4.address,
        port: databaseUrl.port ? Number(databaseUrl.port) : 3306,
        user: decodeURIComponent(databaseUrl.username),
        password: decodeURIComponent(databaseUrl.password),
        database: decodeURIComponent(databaseUrl.pathname.replace(/^\//, "")),
        ssl,
        connectionLimit: 3,
        enableKeepAlive: true,
      });
      _db = drizzle(_pool as any);
      // Ensure this feature works even when the host skips Drizzle migrations.
      await _db.execute(
        sql.raw(`CREATE TABLE IF NOT EXISTS user_absences (
        id int AUTO_INCREMENT NOT NULL, user_id int NOT NULL, start_date varchar(10) NOT NULL, days int NOT NULL,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id), KEY user_absences_user_date_idx (user_id, start_date)
      )`)
      );
      await _db.execute(
        sql.raw(`CREATE TABLE IF NOT EXISTS notifications (
        id int AUTO_INCREMENT NOT NULL, recipient_user_id int NULL, created_by int NULL,
        notification_type varchar(64) NOT NULL, title varchar(255) NOT NULL, message text NOT NULL,
        priority enum('low','normal','high','critical') NOT NULL DEFAULT 'normal', link varchar(500) NULL,
        help_status enum('new','in_progress','completed') NOT NULL DEFAULT 'new', is_read boolean NOT NULL DEFAULT false,
        read_at timestamp NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id), KEY notifications_recipient_idx (recipient_user_id), KEY notifications_created_at_idx (created_at)
      )`)
      );
      try {
        await _db.execute(
          sql.raw(
            `ALTER TABLE user_permissions ADD COLUMN allowed_warehouses VARCHAR(2000) NOT NULL DEFAULT '[]'`
          )
        );
      } catch (migrationError: any) {
        // A duplicate-column error is expected after the first successful boot.
        // Do not make authentication unavailable if an older MySQL variant rejects
        // the additive migration syntax; the application can still serve sessions.
        if (migrationError?.code === "ER_DUP_FIELDNAME") {
          try {
            await _db.execute(
              sql.raw(
                `ALTER TABLE user_permissions MODIFY COLUMN allowed_warehouses VARCHAR(2000) NOT NULL DEFAULT '[]'`
              )
            );
          } catch (upgradeError) {
            console.warn(
              "[Database] Warehouse permission column upgrade deferred:",
              upgradeError
            );
          }
        } else {
          console.warn(
            "[Database] Warehouse permission migration deferred:",
            migrationError?.message ?? migrationError
          );
        }
      }
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function checkDatabaseReadiness() {
  const db = await getDb();
  if (!db || !_pool) return false;
  await _pool.query("SELECT 1");
  return true;
}

export async function closeDatabasePool() {
  const pool = _pool;
  _pool = null;
  _db = null;
  if (pool) await pool.end();
}

export async function requireDb() {
  const db = await getDb();
  if (!db) {
    throw new InventoryError("UNAVAILABLE", "قاعدة البيانات غير متاحة حالياً");
  }
  return db;
}

export async function getPool() {
  await getDb();
  if (!_pool) {
    throw new InventoryError("UNAVAILABLE", "اتصال قاعدة البيانات غير متاح");
  }
  return _pool;
}
