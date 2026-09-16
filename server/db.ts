import { and, asc, count, desc, eq, gt, gte, inArray, isNull, like, lt, lte, not, or, sql, sum } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import dns from "node:dns/promises";
import {
  additions,
  disbursements,
  InsertAddition,
  InsertDisbursement,
  InsertItem,
  InsertSetting,
  InsertTransfer,
  InsertUser,
  suppliers,
  customers,
  warehouses,
  itemWarehouseBalances,
  items,
  settings,
  userPreferences,
  userPermissions,
  transfers,
  auditLogs,
  loginAuditLogs,
  securityNotifications,
  notifications,
  chatConversations,
  chatMembers,
  chatMessages,
  chatMessageReceipts,
  revokedSessions,
  backupRecords,
  backupVerificationConfigs,
  backupVerificationRuns,
  User,
  userAbsences,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { storageGetSignedUrl, storagePut } from "./storage";
import { sendConfiguredEmail } from "./email";
import { DEFAULT_QUICK_ACTIONS, normalizeQuickActions, normalizeReportColumnOrder, parseQuickActions, type ReportColumnOrder } from "@shared/userPreferences";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: mysql.Pool | null = null;

export class InventoryError extends Error {
  constructor(
    public readonly kind: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST" | "UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "InventoryError";
  }
}

export async function getDb() {
  if (!_db && ENV.databaseUrl) {
    try {
      // Railway's public hostname may return an IPv6 record first. Render's
      // network cannot always route IPv6, so resolve an IPv4 address before
      // opening the pool instead of allowing mysql2 to choose an unreachable
      // AAAA record and fail with ENETUNREACH.
      const databaseUrl = new URL(ENV.databaseUrl);
      const ipv4 = await dns.lookup(databaseUrl.hostname, { family: 4 });
      const ssl = ENV.databaseSsl ? { ...ENV.databaseSsl, servername: databaseUrl.hostname } : undefined;
      _pool = mysql.createPool({
        host: ipv4.address,
        port: databaseUrl.port ? Number(databaseUrl.port) : 3306,
        user: decodeURIComponent(databaseUrl.username),
        password: decodeURIComponent(databaseUrl.password),
        database: decodeURIComponent(databaseUrl.pathname.replace(/^\//, "")),
        ssl,
        connectionLimit: 5,
        enableKeepAlive: true,
      });
      _db = drizzle(_pool as any);
      // Ensure this feature works even when the host skips Drizzle migrations.
      await _db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS user_absences (
        id int AUTO_INCREMENT NOT NULL, user_id int NOT NULL, start_date varchar(10) NOT NULL, days int NOT NULL,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id), KEY user_absences_user_date_idx (user_id, start_date)
      )`));
      await _db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS notifications (
        id int AUTO_INCREMENT NOT NULL, recipient_user_id int NULL, created_by int NULL,
        notification_type varchar(64) NOT NULL, title varchar(255) NOT NULL, message text NOT NULL,
        priority enum('low','normal','high','critical') NOT NULL DEFAULT 'normal', link varchar(500) NULL,
        help_status enum('new','in_progress','completed') NOT NULL DEFAULT 'new', is_read boolean NOT NULL DEFAULT false,
        read_at timestamp NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id), KEY notifications_recipient_idx (recipient_user_id), KEY notifications_created_at_idx (created_at)
      )`));
      try {
        await _db.execute(sql.raw(`ALTER TABLE user_permissions ADD COLUMN allowed_warehouses VARCHAR(2000) NOT NULL DEFAULT '[]'`));
      } catch (migrationError: any) {
        // A duplicate-column error is expected after the first successful boot.
        // Do not make authentication unavailable if an older MySQL variant rejects
        // the additive migration syntax; the application can still serve sessions.
        if (migrationError?.code === "ER_DUP_FIELDNAME") {
          try { await _db.execute(sql.raw(`ALTER TABLE user_permissions MODIFY COLUMN allowed_warehouses VARCHAR(2000) NOT NULL DEFAULT '[]'`)); } catch (upgradeError) { console.warn("[Database] Warehouse permission column upgrade deferred:", upgradeError); }
        } else {
          console.warn("[Database] Warehouse permission migration deferred:", migrationError?.message ?? migrationError);
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

async function requireDb() {
  const db = await getDb();
  if (!db) {
    throw new InventoryError("UNAVAILABLE", "قاعدة البيانات غير متاحة حالياً");
  }
  return db;
}

/** Store all inventory decimal values as scaled integers during calculations. */
export function toScaled(value: string | number | null | undefined): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    throw new InventoryError("BAD_REQUEST", "قيمة كمية غير صالحة");
  }
  return Math.round((numeric + Number.EPSILON) * 1000);
}

export function fromScaled(value: number): string {
  return (value / 1000).toFixed(3);
}

export function toMoneyScaled(value: string | number | null | undefined): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) throw new InventoryError("BAD_REQUEST", "قيمة سعر غير صالحة");
  return Math.round((numeric + Number.EPSILON) * 100);
}

export function fromMoneyScaled(value: number): string {
  return (value / 100).toFixed(2);
}

export function calculateTotalValue(unitPriceScaled: number, quantityScaled: number): number {
  return Math.round(unitPriceScaled * quantityScaled / 1000);
}

function resultInsertId(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  const insertId = Number((header as { insertId?: number })?.insertId ?? 0);
  if (!insertId) {
    throw new InventoryError("CONFLICT", "تعذر الحصول على رقم السجل الجديد");
  }
  return insertId;
}

async function getItemForUpdate(tx: any, code: string) {
  const rows = await tx.select().from(items).where(eq(items.code, code)).limit(1).for("update");
  const item = rows[0];
  if (!item) {
    throw new InventoryError("NOT_FOUND", `الصنف ذو الكود ${code} غير موجود`);
  }
  return item;
}

async function getItemByIdForUpdate(tx: any, id: number) {
  const rows = await tx.select().from(items).where(eq(items.id, id)).limit(1).for("update");
  const item = rows[0];
  if (!item) {
    throw new InventoryError("NOT_FOUND", "الصنف غير موجود");
  }
  return item;
}

export function calculateStockDelta(
  item: { code: string; incomingStock: string | number; outgoingStock: string | number; currentStock: string | number },
  deltas: { incoming: number; outgoing: number; current: number },
) {
  const nextIncoming = toScaled(item.incomingStock) + deltas.incoming;
  const nextOutgoing = toScaled(item.outgoingStock) + deltas.outgoing;
  const nextCurrent = toScaled(item.currentStock) + deltas.current;

  if (nextIncoming < 0 || nextOutgoing < 0) {
    throw new InventoryError("CONFLICT", "لا يمكن أن تصبح حركة المخزون سالبة");
  }
  if (nextCurrent < 0) {
    throw new InventoryError(
      "CONFLICT",
      `الرصيد الحالي للصنف ${item.code} لا يكفي لتنفيذ عملية الصرف`,
    );
  }
  return {
    incomingStock: fromScaled(nextIncoming),
    outgoingStock: fromScaled(nextOutgoing),
    currentStock: fromScaled(nextCurrent),
  };
}

async function applyStockDelta(
  tx: any,
  item: any,
  deltas: { incoming: number; outgoing: number; current: number },
) {
  const next = calculateStockDelta(item, deltas);
  await tx
    .update(items)
    .set(next)
    .where(eq(items.id, item.id));
}

function normalizeItemCode(code: string) {
  const normalized = code.trim();
  if (!normalized) throw new InventoryError("BAD_REQUEST", "كود الصنف مطلوب");
  return normalized;
}

export function normalizeItemName(name: string) {
  const normalized = name.trim();
  if (!normalized) throw new InventoryError("BAD_REQUEST", "اسم الصنف مطلوب");
  return normalized;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export function buildGoogleOpenId(googleId: string) {
  const normalized = googleId.trim();
  if (!normalized) throw new InventoryError("BAD_REQUEST", "معرّف Google غير صالح");
  return `google:${normalized}`;
}

export function resolveGoogleUserRole(email: string | null, existingRole?: User["role"], configuredAdminEmail = ENV.ownerEmail): User["role"] {
  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedAdminEmail = configuredAdminEmail.trim().toLowerCase();
  if (normalizedEmail && normalizedAdminEmail && normalizedEmail === normalizedAdminEmail) return "admin";
  return existingRole ?? "user";
}

export async function upsertGoogleUser(input: { googleId: string; name: string; email: string | null }): Promise<User> {
  const db = await requireDb();
  const openId = buildGoogleOpenId(input.googleId);
  const email = input.email?.trim().toLowerCase() || null;
  const existingByOpenId = (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
  if (existingByOpenId) {
    await db.update(users).set({ name: input.name || existingByOpenId.name, email: email ?? existingByOpenId.email, loginMethod: "google", role: resolveGoogleUserRole(email ?? existingByOpenId.email, existingByOpenId.role), lastSignedIn: new Date() }).where(eq(users.id, existingByOpenId.id));
    return (await db.select().from(users).where(eq(users.id, existingByOpenId.id)).limit(1))[0]!;
  }

  const existingByEmail = email ? (await db.select().from(users).where(eq(users.email, email)).limit(1))[0] : undefined;
  if (existingByEmail) {
    await db.update(users).set({ openId, name: input.name || existingByEmail.name, email, loginMethod: "google", role: resolveGoogleUserRole(email, existingByEmail.role), lastSignedIn: new Date() }).where(eq(users.id, existingByEmail.id));
    return (await db.select().from(users).where(eq(users.id, existingByEmail.id)).limit(1))[0]!;
  }

  const role = resolveGoogleUserRole(email);
  const result = await db.insert(users).values({ openId, name: input.name || "مستخدم Google", email, loginMethod: "google", role, lastSignedIn: new Date() });
  const id = resultInsertId(result);
  return (await db.select().from(users).where(eq(users.id, id)).limit(1))[0]!;
}

export async function listWarehouses() {
  const db = await requireDb();
  const rows = await db.select().from(warehouses).orderBy(warehouses.slot);
  return rows;
}
export async function listWarehousesForAccess(allowedWarehouseIds: number[] | null) {
  const rows = await listWarehouses();
  return allowedWarehouseIds?.length ? rows.filter(row => allowedWarehouseIds.includes(row.id)) : rows;
}

type WarehouseUsageCandidate = { id: number; slot: number; name: string };
type WarehouseUsageRow = { warehouseId: number | null; usageCount: unknown };

export function rankWarehousesByUsage<T extends WarehouseUsageCandidate>(warehouseRows: T[], usageRows: WarehouseUsageRow[]) {
  const usageByWarehouse = new Map<number, number>();
  for (const row of usageRows) {
    if (row.warehouseId === null) continue;
    usageByWarehouse.set(row.warehouseId, (usageByWarehouse.get(row.warehouseId) ?? 0) + Number(row.usageCount ?? 0));
  }
  return warehouseRows
    .map(warehouse => ({ ...warehouse, usageCount: usageByWarehouse.get(warehouse.id) ?? 0 }))
    .sort((left, right) => right.usageCount - left.usageCount || left.slot - right.slot);
}

export async function listWarehousesByUsage() {
  const db = await requireDb();
  const [warehouseRows, additionsUsage, disbursementsUsage, transferSourcesUsage, transferDestinationsUsage] = await Promise.all([
    db.select().from(warehouses).orderBy(warehouses.slot),
    db.select({ warehouseId: additions.warehouseId, usageCount: count() }).from(additions).where(not(isNull(additions.warehouseId))).groupBy(additions.warehouseId),
    db.select({ warehouseId: disbursements.warehouseId, usageCount: count() }).from(disbursements).where(not(isNull(disbursements.warehouseId))).groupBy(disbursements.warehouseId),
    db.select({ warehouseId: transfers.fromWarehouseId, usageCount: count() }).from(transfers).where(not(isNull(transfers.fromWarehouseId))).groupBy(transfers.fromWarehouseId),
    db.select({ warehouseId: transfers.toWarehouseId, usageCount: count() }).from(transfers).where(not(isNull(transfers.toWarehouseId))).groupBy(transfers.toWarehouseId),
  ]);
  return rankWarehousesByUsage(warehouseRows, [...additionsUsage, ...disbursementsUsage, ...transferSourcesUsage, ...transferDestinationsUsage]);
}
export async function listWarehousesByUsageForAccess(allowedWarehouseIds: number[] | null) {
  const rows = await listWarehousesByUsage();
  return allowedWarehouseIds?.length ? rows.filter(row => allowedWarehouseIds.includes(row.id)) : rows;
}

export async function listWarehouseBalanceSummaries() {
  const db = await requireDb();
  const [warehouseRows, balanceRows, incomingRows] = await Promise.all([
    db.select({ id: warehouses.id, slot: warehouses.slot, name: warehouses.name }).from(warehouses).orderBy(warehouses.slot),
    db.select({ warehouseId: itemWarehouseBalances.warehouseId, itemCount: count(itemWarehouseBalances.itemId), balance: sum(itemWarehouseBalances.currentStock) }).from(itemWarehouseBalances).groupBy(itemWarehouseBalances.warehouseId),
    db.select({ warehouseId: additions.warehouseId, incoming: sum(additions.quantity) }).from(additions).where(not(isNull(additions.warehouseId))).groupBy(additions.warehouseId),
  ]);
  const balancesByWarehouse = new Map(balanceRows.map(row => [row.warehouseId, { itemCount: Number(row.itemCount ?? 0), balance: Number(row.balance ?? 0) }]));
  const incomingByWarehouse = new Map(incomingRows.map(row => [row.warehouseId, Number(row.incoming ?? 0)]));
  return warehouseRows.map(warehouse => ({ ...warehouse, ...(balancesByWarehouse.get(warehouse.id) ?? { itemCount: 0, balance: 0 }), incoming: incomingByWarehouse.get(warehouse.id) ?? 0 }));
}

export async function updateWarehouse(input: { id: number; name: string }) {
  const db = await requireDb();
  const name = input.name.trim();
  if (!name) throw new InventoryError("BAD_REQUEST", "اسم المخزن مطلوب");
  try {
    await db.update(warehouses).set({ name }).where(eq(warehouses.id, input.id));
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") throw new InventoryError("CONFLICT", "اسم المخزن مستخدم بالفعل");
    throw error;
  }
  const rows = await db.select().from(warehouses).where(eq(warehouses.id, input.id)).limit(1);
  if (!rows[0]) throw new InventoryError("NOT_FOUND", "المخزن غير موجود");
  return rows[0];
}

async function resolveWarehouseId(tx: any, warehouseId?: number | null, warehouseName?: string | null) {
  const normalizedName = warehouseName?.trim();
  const rows = warehouseId
    ? await tx.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1).for("update")
    : normalizedName
      ? await tx.select().from(warehouses).where(eq(warehouses.name, normalizedName)).limit(1).for("update")
      : await tx.select().from(warehouses).where(eq(warehouses.slot, 1)).limit(1).for("update");
  const warehouse = rows[0];
  if (!warehouse) throw new InventoryError("NOT_FOUND", normalizedName ? `المخزن «${normalizedName}» غير موجود` : "المخزن الرئيسي غير موجود");
  return warehouse;
}

async function applyWarehouseBalanceDelta(tx: any, itemId: number, warehouseId: number, delta: number) {
  if (!delta) return;
  const rows = await tx.select().from(itemWarehouseBalances).where(and(eq(itemWarehouseBalances.itemId, itemId), eq(itemWarehouseBalances.warehouseId, warehouseId))).limit(1).for("update");
  const balance = rows[0];
  const next = toScaled(balance?.currentStock ?? 0) + delta;
  if (next < 0) throw new InventoryError("BAD_REQUEST", "لا يمكن أن يصبح رصيد المخزن سالباً");
  if (balance) {
    await tx.update(itemWarehouseBalances).set({ currentStock: fromScaled(next) }).where(eq(itemWarehouseBalances.id, balance.id));
  } else {
    await tx.insert(itemWarehouseBalances).values({ itemId, warehouseId, currentStock: fromScaled(next) });
  }
}

export async function listCustomers() {
  const db = await requireDb();
  return db.select().from(customers).orderBy(desc(customers.updatedAt));
}

export async function createCustomer(input: { name: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null }) {
  const db = await requireDb();
  const name = input.name.trim();
  if (!name) throw new InventoryError("BAD_REQUEST", "اسم العميل أو الجهة مطلوب");
  try {
    const result = await db.insert(customers).values({ name, phone: input.phone?.trim() || null, email: input.email?.trim() || null, address: input.address?.trim() || null, notes: input.notes?.trim() || null });
    const rows = await db.select().from(customers).where(eq(customers.id, resultInsertId(result))).limit(1);
    return rows[0];
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") throw new InventoryError("CONFLICT", `العميل أو الجهة ${name} موجود بالفعل`);
    throw error;
  }
}

export async function updateCustomer(input: { id: number; name?: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null }) {
  const db = await requireDb();
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) { const name = input.name.trim(); if (!name) throw new InventoryError("BAD_REQUEST", "اسم العميل أو الجهة مطلوب"); updates.name = name; }
  if (input.phone !== undefined) updates.phone = input.phone?.trim() || null;
  if (input.email !== undefined) updates.email = input.email?.trim() || null;
  if (input.address !== undefined) updates.address = input.address?.trim() || null;
  if (input.notes !== undefined) updates.notes = input.notes?.trim() || null;
  try { await db.update(customers).set(updates).where(eq(customers.id, input.id)); } catch (error: any) { if (error?.code === "ER_DUP_ENTRY") throw new InventoryError("CONFLICT", "اسم العميل أو الجهة مستخدم بالفعل"); throw error; }
  const rows = await db.select().from(customers).where(eq(customers.id, input.id)).limit(1);
  if (!rows[0]) throw new InventoryError("NOT_FOUND", "العميل أو الجهة غير موجود");
  return rows[0];
}

export async function listSuppliers() {
  const db = await requireDb();
  return db.select().from(suppliers).orderBy(desc(suppliers.updatedAt));
}

export async function createSupplier(input: { name: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null }) {
  const db = await requireDb();
  const name = input.name.trim();
  if (!name) throw new InventoryError("BAD_REQUEST", "اسم المورد مطلوب");
  try {
    const result = await db.insert(suppliers).values({ name, phone: input.phone?.trim() || null, email: input.email?.trim() || null, address: input.address?.trim() || null, notes: input.notes?.trim() || null });
    const id = resultInsertId(result);
    const rows = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
    return rows[0];
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") throw new InventoryError("CONFLICT", `المورد ${name} موجود بالفعل`);
    throw error;
  }
}

export async function updateSupplier(input: { id: number; name?: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null }) {
  const db = await requireDb();
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) { const name = input.name.trim(); if (!name) throw new InventoryError("BAD_REQUEST", "اسم المورد مطلوب"); updates.name = name; }
  if (input.phone !== undefined) updates.phone = input.phone?.trim() || null;
  if (input.email !== undefined) updates.email = input.email?.trim() || null;
  if (input.address !== undefined) updates.address = input.address?.trim() || null;
  if (input.notes !== undefined) updates.notes = input.notes?.trim() || null;
  try { await db.update(suppliers).set(updates).where(eq(suppliers.id, input.id)); } catch (error: any) { if (error?.code === "ER_DUP_ENTRY") throw new InventoryError("CONFLICT", "اسم المورد مستخدم بالفعل"); throw error; }
  const rows = await db.select().from(suppliers).where(eq(suppliers.id, input.id)).limit(1);
  if (!rows[0]) throw new InventoryError("NOT_FOUND", "المورد غير موجود");
  return rows[0];
}

export const MAIN_WAREHOUSE_SLOT = 1;
export const MAIN_WAREHOUSE_CODE_KEY = "item_code_sequence_warehouse_1";
export function formatAutoItemCode(sequence: number) { return `SI-${String(Math.max(1, Math.floor(sequence))).padStart(6, "0")}`; }
export function formatWarehouseItemCode(slot: number, sequence: number) { const safeSlot = Math.max(1, Math.floor(slot)); const safeSequence = Math.max(1, Math.floor(sequence)); return `${safeSlot}${String(safeSequence).padStart(4, "0")}`; }
export function selectNextAutoItemCode(sequence: number, existingCodes: Iterable<string>, formatter: (value: number) => string = formatAutoItemCode) { const existing = new Set(existingCodes); let current = Math.max(1, Math.floor(sequence)); let code = formatter(current); while (existing.has(code)) { current += 1; code = formatter(current); } return { code, nextSequence: current + 1 }; }

export async function suggestNextItemCode(_warehouseId?: number | null) {
  const db = await requireDb();
  const rows = await db.select().from(settings).where(eq(settings.key, MAIN_WAREHOUSE_CODE_KEY)).limit(1);
  const existingRows = await db.select({ code: items.code }).from(items);
  return selectNextAutoItemCode(1, existingRows.map(row => row.code), value => formatWarehouseItemCode(MAIN_WAREHOUSE_SLOT, value)).code;
}

async function nextItemCode(tx: any, _warehouseId?: number | null) {
  const rows = await tx.select().from(settings).where(eq(settings.key, MAIN_WAREHOUSE_CODE_KEY)).limit(1).for("update");
  const existingRows = await tx.select({ code: items.code }).from(items);
  const selected = selectNextAutoItemCode(1, existingRows.map((row: { code: string }) => row.code), value => formatWarehouseItemCode(MAIN_WAREHOUSE_SLOT, value));
  if (rows[0]) await tx.update(settings).set({ value: String(selected.nextSequence) }).where(eq(settings.id, rows[0].id));
  else await tx.insert(settings).values({ key: MAIN_WAREHOUSE_CODE_KEY, value: String(selected.nextSequence), description: "عداد التكويد التلقائي للمخزن الرئيسي" });
  return selected.code;
}

export async function listItems(search?: string, warehouseId?: number) {
  const db = await requireDb();
  const normalizedSearch = search?.trim();
  if (!normalizedSearch) {
    return warehouseId ? db.select().from(items).where(eq(items.warehouseId, warehouseId)).orderBy(desc(items.updatedAt)) : db.select().from(items).orderBy(desc(items.updatedAt));
  }

  const pattern = `%${normalizedSearch}%`;
  return db
    .select()
    .from(items)
    .where(warehouseId ? and(eq(items.warehouseId, warehouseId), or(like(items.code, pattern), like(items.name, pattern))) : or(like(items.code, pattern), like(items.name, pattern)))
    .orderBy(desc(items.updatedAt));
}

export async function listWarehouseStockRows(warehouseId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ item: items, warehouseStock: itemWarehouseBalances.currentStock })
    .from(itemWarehouseBalances)
    .innerJoin(items, eq(items.id, itemWarehouseBalances.itemId))
    .where(eq(itemWarehouseBalances.warehouseId, warehouseId))
    .orderBy(desc(items.updatedAt));
  return rows.map(row => ({ ...row.item, currentStock: row.warehouseStock }));
}

export async function listWarehouseLowStockItems() {
  const db = await requireDb();
  const rows = await db
    .select({
      warehouseId: warehouses.id,
      itemId: items.id,
      code: items.code,
      name: items.name,
      unit: items.unit,
      currentStock: itemWarehouseBalances.currentStock,
      reorderLevel: items.reorderLevel,
    })
    .from(itemWarehouseBalances)
    .innerJoin(items, eq(items.id, itemWarehouseBalances.itemId))
    .innerJoin(warehouses, eq(warehouses.id, itemWarehouseBalances.warehouseId))
    .where(or(
      lte(itemWarehouseBalances.currentStock, "0"),
      and(gt(items.reorderLevel, "0"), lte(itemWarehouseBalances.currentStock, items.reorderLevel)),
    ))
    .orderBy(asc(warehouses.slot), asc(items.name));

  const grouped = new Map<number, Array<{ id: number; code: string; name: string; unit: string | null; currentStock: string; reorderLevel: string }>>();
  for (const row of rows) {
    const bucket = grouped.get(row.warehouseId) ?? [];
    bucket.push({ id: row.itemId, code: row.code, name: row.name, unit: row.unit, currentStock: row.currentStock, reorderLevel: row.reorderLevel });
    grouped.set(row.warehouseId, bucket);
  }
  return Array.from(grouped, ([warehouseId, lowItems]) => ({ warehouseId, lowItems }));
}

type CompanyInventoryAuditWarehouse = { id: number; slot: number; name: string };
type CompanyInventoryAuditSourceRow = { itemId: number; code: string; name: string; category: string | null; unit: string | null; reorderLevel: string; warehouseId: number | null; currentStock: string | null };

export function buildCompanyInventoryAuditReport(warehouseRows: CompanyInventoryAuditWarehouse[], sourceRows: CompanyInventoryAuditSourceRow[]) {
  const normalizedWarehouses = [...warehouseRows].sort((left, right) => left.slot - right.slot);
  const reportRows = new Map<number, { id: number; code: string; name: string; category: string | null; unit: string | null; reorderLevel: number; warehouseBalances: Array<{ warehouseId: number; slot: number; name: string; currentStock: number }>; totalCurrentStock: number }>();
  for (const row of sourceRows) {
    const current = reportRows.get(row.itemId) ?? {
      id: row.itemId,
      code: row.code,
      name: row.name,
      category: row.category,
      unit: row.unit,
      reorderLevel: Number(row.reorderLevel ?? 0),
      warehouseBalances: normalizedWarehouses.map(warehouse => ({ warehouseId: warehouse.id, slot: warehouse.slot, name: warehouse.name, currentStock: 0 })),
      totalCurrentStock: 0,
    };
    if (row.warehouseId !== null) {
      const balance = current.warehouseBalances.find(item => item.warehouseId === row.warehouseId);
      if (balance) balance.currentStock = Number(row.currentStock ?? 0);
    }
    current.totalCurrentStock = current.warehouseBalances.reduce((total, item) => total + item.currentStock, 0);
    reportRows.set(row.itemId, current);
  }
  const rows = Array.from(reportRows.values()).sort((left, right) => left.code.localeCompare(right.code, "en"));
  return { warehouses: normalizedWarehouses, rows, summary: { totalItems: rows.length, totalCompanyBalance: rows.reduce((total, item) => total + item.totalCurrentStock, 0) } };
}

export async function getCompanyInventoryAuditReport(allowedWarehouseIds: number[] = []) {
  const db = await requireDb();
  const warehouseWhere = allowedWarehouseIds.length ? inArray(warehouses.id, allowedWarehouseIds) : undefined;
  const balanceWhere = allowedWarehouseIds.length ? inArray(itemWarehouseBalances.warehouseId, allowedWarehouseIds) : undefined;
  const [warehouseRows, sourceRows] = await Promise.all([
    db.select({ id: warehouses.id, slot: warehouses.slot, name: warehouses.name }).from(warehouses).where(warehouseWhere).orderBy(asc(warehouses.slot)),
    db.select({ itemId: items.id, code: items.code, name: items.name, category: items.category, unit: items.unit, reorderLevel: items.reorderLevel, warehouseId: itemWarehouseBalances.warehouseId, currentStock: itemWarehouseBalances.currentStock }).from(items).leftJoin(itemWarehouseBalances, eq(itemWarehouseBalances.itemId, items.id)).where(balanceWhere).orderBy(asc(items.code)),
  ]);
  return buildCompanyInventoryAuditReport(warehouseRows, sourceRows);
}

export async function listItemsPaged(input: { search?: string; warehouseId?: number; category?: string; stockFilter?: "all" | "low" | "healthy"; sortBy?: "name" | "code" | "stock"; page?: number; pageSize?: number }, allowedWarehouseIds: number[] = []) {
  const db = await requireDb();
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(input.pageSize ?? 24)));
  const normalizedSearch = input.search?.trim();
  const conditions = [];
  if (normalizedSearch) { const pattern = `%${normalizedSearch}%`; conditions.push(or(like(items.code, pattern), like(items.name, pattern))); }
  if (input.warehouseId) conditions.push(eq(items.warehouseId, input.warehouseId));
  if (allowedWarehouseIds.length) conditions.push(inArray(items.warehouseId, allowedWarehouseIds));
  if (input.category) conditions.push(input.category === "بدون تصنيف" ? isNull(items.category) : eq(items.category, input.category));
  const lowCondition = or(and(gt(items.reorderLevel, "0"), lte(items.currentStock, items.reorderLevel)), and(lte(items.reorderLevel, "0"), lte(items.currentStock, "0")))!;
  if (input.stockFilter === "low") conditions.push(lowCondition);
  if (input.stockFilter === "healthy") conditions.push(not(lowCondition));
  const whereClause = conditions.length ? and(...conditions) : undefined;
  const orderBy = input.sortBy === "code" ? asc(items.code) : input.sortBy === "stock" ? desc(items.currentStock) : asc(items.name);
  const [rows, totalRows] = await Promise.all([
    db.select().from(items).where(whereClause).orderBy(orderBy, desc(items.updatedAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(items).where(whereClause),
  ]);
  const total = Number(totalRows[0]?.total ?? 0);
  return { items: rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function listItemCategories(allowedWarehouseIds: number[] = []) {
  const db = await requireDb();
  const rows = allowedWarehouseIds.length
    ? await db.selectDistinct({ category: items.category }).from(items).innerJoin(itemWarehouseBalances, eq(itemWarehouseBalances.itemId, items.id)).where(inArray(itemWarehouseBalances.warehouseId, allowedWarehouseIds)).orderBy(asc(items.category))
    : await db.selectDistinct({ category: items.category }).from(items).orderBy(asc(items.category));
  return rows.map(row => row.category || "بدون تصنيف");
}

export async function getItemById(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(items).where(eq(items.id, id)).limit(1);
  return rows[0];
}

export async function getItemCard(itemId: number, allowedWarehouseIds: number[] = []) {
  const db = await requireDb();
  const itemWhere = allowedWarehouseIds.length ? and(eq(items.id, itemId), inArray(items.warehouseId, allowedWarehouseIds)) : eq(items.id, itemId);
  const itemRows = await db.select().from(items).where(itemWhere).limit(1);
  const item = itemRows[0];
  if (!item) return undefined;
  const additionWhere = allowedWarehouseIds.length ? and(eq(additions.itemCode, item.code), inArray(additions.warehouseId, allowedWarehouseIds)) : eq(additions.itemCode, item.code);
  const disbursementWhere = allowedWarehouseIds.length ? and(eq(disbursements.itemCode, item.code), inArray(disbursements.warehouseId, allowedWarehouseIds)) : eq(disbursements.itemCode, item.code);
  const transferWhere = allowedWarehouseIds.length ? and(eq(transfers.itemCode, item.code), or(inArray(transfers.fromWarehouseId, allowedWarehouseIds), inArray(transfers.toWarehouseId, allowedWarehouseIds))) : eq(transfers.itemCode, item.code);
  const [additionRows, disbursementRows, transferRows] = await Promise.all([
    db.select().from(additions).where(additionWhere).orderBy(desc(additions.id)),
    db.select().from(disbursements).where(disbursementWhere).orderBy(desc(disbursements.id)),
    db.select().from(transfers).where(transferWhere).orderBy(desc(transfers.id)),
  ]);
  const returns = transferRows.filter(row => isReturnTransfer(row.transferType));
  return { item, additions: additionRows, disbursements: disbursementRows, returns, transfers: transferRows };
}

export async function getMainWarehouseItemCards(allowedWarehouseIds: number[] = []) {
  const db = await requireDb();
  const warehouseItems = await db.select().from(items).where(eq(items.warehouseId, 1)).orderBy(desc(items.updatedAt));
  return Promise.all(warehouseItems.map(item => getItemCard(item.id, allowedWarehouseIds)));
}

export async function getWarehouseItemCards(warehouseId: number, allowedWarehouseIds: number[] = []) {
  const db = await requireDb();
  const warehouseItems = await db
    .select({ item: items, warehouseStock: itemWarehouseBalances.currentStock })
    .from(itemWarehouseBalances)
    .innerJoin(items, eq(items.id, itemWarehouseBalances.itemId))
    .where(eq(itemWarehouseBalances.warehouseId, warehouseId))
    .orderBy(desc(items.updatedAt));
  return Promise.all(warehouseItems.map(async row => {
    const card = await getItemCard(row.item.id, allowedWarehouseIds);
    return card ? { ...card, item: { ...card.item, currentStock: row.warehouseStock } } : undefined;
  }));
}

export async function getItemByCode(code: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(items)
    .where(eq(items.code, normalizeItemCode(code)))
    .limit(1);
  return rows[0];
}

export async function createItem(input: {
  code?: string;
  warehouseId?: number | null;
  name: string;
  initialStock?: number;
  reorderLevel?: number;
  category?: string | null;
  unit?: string | null;
  unitPrice?: number;
  imageKey?: string | null;
  imageUrl?: string | null;
}) {
  const db = await requireDb();
  const name = normalizeItemName(input.name);
  const initial = toScaled(input.initialStock);
  const reorder = toScaled(input.reorderLevel);
  const unitPrice = toMoneyScaled(input.unitPrice);
  if (initial < 0 || reorder < 0 || unitPrice < 0) {
    throw new InventoryError("BAD_REQUEST", "لا يمكن أن تكون الكميات سالبة");
  }

  try {
    return await db.transaction(async (tx: any) => {
      const code = input.code?.trim() || await nextItemCode(tx, input.warehouseId);
      const warehouse = await resolveWarehouseId(tx, input.warehouseId);
      normalizeItemCode(code);
      const result = await tx.insert(items).values({
      code,
      warehouseId: warehouse.id,
      name,
      initialStock: fromScaled(initial),
      incomingStock: "0.000",
      outgoingStock: "0.000",
      currentStock: fromScaled(initial),
      reorderLevel: fromScaled(reorder),
      category: input.category?.trim() || null,
      unit: input.unit?.trim() || null,
      unitPrice: fromMoneyScaled(unitPrice),
      imageKey: input.imageKey?.trim() || null,
      imageUrl: input.imageUrl?.trim() || null,
      });
      const itemId = resultInsertId(result);
      if (initial) await applyWarehouseBalanceDelta(tx, itemId, warehouse.id, initial);
      else await tx.insert(itemWarehouseBalances).values({ itemId, warehouseId: warehouse.id, currentStock: "0.000" });
      const rows = await tx.select().from(items).where(eq(items.id, itemId)).limit(1);
      return rows[0];
    });
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") {
      throw new InventoryError("CONFLICT", `كود الصنف مستخدم بالفعل`);
    }
    throw error;
  }
}

export async function importItems(input: Array<{
  code: string;
  name: string;
  initialStock?: number;
  reorderLevel?: number;
  category?: string | null;
  unit?: string | null;
  unitPrice?: number;
}>) {
  const db = await requireDb();
  const seen = new Set<string>();
  const normalizedRows = input.map((row, index) => {
    const code = normalizeItemCode(row.code);
    const name = normalizeItemName(row.name);
    if (seen.has(code)) {
      throw new InventoryError("CONFLICT", `الكود ${code} مكرر داخل ملف الاستيراد في الصف ${index + 1}`);
    }
    seen.add(code);
    const initial = toScaled(row.initialStock);
    const reorder = toScaled(row.reorderLevel);
    const unitPrice = toMoneyScaled(row.unitPrice);
    if (initial < 0 || reorder < 0 || unitPrice < 0) {
      throw new InventoryError("BAD_REQUEST", `كميات سالبة في صف الاستيراد ${index + 1}`);
    }
    return { code, name, initial, reorder, unitPrice, category: row.category?.trim() || null, unit: row.unit?.trim() || null };
  });

  return db.transaction(async (tx: any) => {
    let created = 0;
    let updated = 0;
    for (const row of normalizedRows) {
      const existingRows = await tx.select().from(items).where(eq(items.code, row.code)).limit(1).for("update");
      const existing = existingRows[0];
      if (!existing) {
        await tx.insert(items).values({
          code: row.code,
          name: row.name,
          initialStock: fromScaled(row.initial),
          incomingStock: "0.000",
          outgoingStock: "0.000",
          currentStock: fromScaled(row.initial),
          reorderLevel: fromScaled(row.reorder),
          category: row.category,
          unit: row.unit,
          unitPrice: fromMoneyScaled(row.unitPrice),
        });
        created += 1;
        continue;
      }

      // لا نغيّر أرصدة صنف لديه حركات؛ الاستيراد يحدّث الدليل فقط حتى لا تتكرر الحركات.
      await tx.update(items).set({
        name: row.name,
        reorderLevel: fromScaled(row.reorder),
        category: row.category,
        unit: row.unit,
        unitPrice: fromMoneyScaled(row.unitPrice),
      }).where(eq(items.id, existing.id));
      updated += 1;
    }
    return { created, updated, total: normalizedRows.length };
  });
}

export async function updateItem(input: {
  id: number;
  code?: string;
  warehouseId?: number | null;
  name?: string;
  initialStock?: number;
  reorderLevel?: number;
  category?: string | null;
  unit?: string | null;
  unitPrice?: number;
  imageKey?: string | null;
  imageUrl?: string | null;
}) {
  const db = await requireDb();
  return db.transaction(async (tx: any) => {
    const current = await getItemByIdForUpdate(tx, input.id);
    const updates: Record<string, unknown> = {};
    const currentWarehouse = await resolveWarehouseId(tx, current.warehouseId);
    let stockWarehouse = currentWarehouse;

    if (input.code !== undefined) updates.code = normalizeItemCode(input.code);
    if (input.name !== undefined) updates.name = normalizeItemName(input.name);
    if (input.warehouseId !== undefined) {
      const nextWarehouse = await resolveWarehouseId(tx, input.warehouseId);
      if (nextWarehouse.id !== currentWarehouse.id && toScaled(current.currentStock) > 0) {
        throw new InventoryError("CONFLICT", "لا يمكن تغيير مخزن صنف له رصيد. استخدم تحويل المخزون لنقل الكمية بين المخازن.");
      }
      updates.warehouseId = nextWarehouse.id;
      stockWarehouse = nextWarehouse;
    }
    if (input.reorderLevel !== undefined) {
      const reorder = toScaled(input.reorderLevel);
      if (reorder < 0) throw new InventoryError("BAD_REQUEST", "حد الطلب لا يمكن أن يكون سالباً");
      updates.reorderLevel = fromScaled(reorder);
    }
    if (input.category !== undefined) updates.category = input.category?.trim() || null;
    if (input.unit !== undefined) updates.unit = input.unit?.trim() || null;
    if (input.unitPrice !== undefined) {
      const unitPrice = toMoneyScaled(input.unitPrice);
      if (unitPrice < 0) throw new InventoryError("BAD_REQUEST", "سعر الوحدة لا يمكن أن يكون سالباً");
      updates.unitPrice = fromMoneyScaled(unitPrice);
    }
    if (input.imageKey !== undefined) updates.imageKey = input.imageKey?.trim() || null;
    if (input.imageUrl !== undefined) updates.imageUrl = input.imageUrl?.trim() || null;

    if (input.initialStock !== undefined) {
      const nextInitial = toScaled(input.initialStock);
      const delta = nextInitial - toScaled(current.initialStock);
      const nextCurrent = toScaled(current.currentStock) + delta;
      if (nextInitial < 0 || nextCurrent < 0) {
        throw new InventoryError("CONFLICT", "تعديل الرصيد الأولي سينتج عنه رصيد سالب");
      }
      updates.initialStock = fromScaled(nextInitial);
      updates.currentStock = fromScaled(nextCurrent);
      await applyWarehouseBalanceDelta(tx, current.id, stockWarehouse.id, delta);
    }

    if (stockWarehouse.id !== currentWarehouse.id && input.initialStock === undefined) {
      const balanceRows = await tx.select().from(itemWarehouseBalances).where(and(eq(itemWarehouseBalances.itemId, current.id), eq(itemWarehouseBalances.warehouseId, stockWarehouse.id))).limit(1).for("update");
      if (!balanceRows[0]) await tx.insert(itemWarehouseBalances).values({ itemId: current.id, warehouseId: stockWarehouse.id, currentStock: "0.000" });
    }

    if (Object.keys(updates).length > 0) {
      try {
        await tx.update(items).set(updates).where(eq(items.id, input.id));
      } catch (error: any) {
        if (error?.code === "ER_DUP_ENTRY") {
          throw new InventoryError("CONFLICT", "كود الصنف مستخدم بالفعل");
        }
        throw error;
      }
    }
    const rows = await tx.select().from(items).where(eq(items.id, input.id)).limit(1);
    return rows[0];
  });
}

export async function updateItemImage(id: number, imageKey: string, imageUrl: string) {
  const db = await requireDb();
  await db.update(items).set({ imageKey, imageUrl }).where(eq(items.id, id));
  return getItemById(id);
}

export async function updateAdditionDocumentImage(id: number, imageKey: string, imageUrl: string) {
  const db = await requireDb();
  const rows = await db.select({ id: additions.id }).from(additions).where(eq(additions.id, id)).limit(1);
  if (!rows[0]) throw new InventoryError("NOT_FOUND", "سجل الإضافة غير موجود");
  await db.update(additions).set({ documentImageKey: imageKey, documentImageUrl: imageUrl }).where(eq(additions.id, id));
  return { id, documentImageKey: imageKey, documentImageUrl: imageUrl };
}

export async function updateDisbursementDocumentImage(id: number, imageKey: string, imageUrl: string) {
  const db = await requireDb();
  const rows = await db.select({ id: disbursements.id }).from(disbursements).where(eq(disbursements.id, id)).limit(1);
  if (!rows[0]) throw new InventoryError("NOT_FOUND", "سجل الصرف غير موجود");
  await db.update(disbursements).set({ documentImageKey: imageKey, documentImageUrl: imageUrl }).where(eq(disbursements.id, id));
  return { id, documentImageKey: imageKey, documentImageUrl: imageUrl };
}

export async function updateTransferDocumentImage(id: number, imageKey: string, imageUrl: string) {
  const db = await requireDb();
  const rows = await db.select({ id: transfers.id }).from(transfers).where(eq(transfers.id, id)).limit(1);
  if (!rows[0]) throw new InventoryError("NOT_FOUND", "سجل المرتجع غير موجود");
  await db.update(transfers).set({ documentImageKey: imageKey, documentImageUrl: imageUrl }).where(eq(transfers.id, id));
  return { id, documentImageKey: imageKey, documentImageUrl: imageUrl };
}
export type MovementDocumentType = "addition" | "disbursement" | "transfer";
export async function clearMovementDocumentImage(type: MovementDocumentType, id: number) {
  const db = await requireDb();
  const table = type === "addition" ? additions : type === "disbursement" ? disbursements : transfers;
  const rows = await db.select({ id: table.id, imageKey: table.documentImageKey }).from(table).where(eq(table.id, id)).limit(1);
  if (!rows[0]) throw new InventoryError("NOT_FOUND", type === "addition" ? "سجل الإضافة غير موجود" : type === "disbursement" ? "سجل الصرف غير موجود" : "سجل التحويل غير موجود");
  await db.update(table).set({ documentImageKey: null, documentImageUrl: null }).where(eq(table.id, id));
  return { id, imageKey: rows[0].imageKey ?? null, cleared: true };
}
export async function deleteItem(id: number) {
  const db = await requireDb();
  return db.transaction(async (tx: any) => {
    const current = await getItemByIdForUpdate(tx, id);
    if (
      toScaled(current.incomingStock) !== 0 ||
      toScaled(current.outgoingStock) !== 0 ||
      toScaled(current.currentStock) !== toScaled(current.initialStock)
    ) {
      throw new InventoryError("CONFLICT", "لا يمكن حذف صنف لديه حركات مخزون مسجلة");
    }
    await tx.delete(items).where(eq(items.id, id));
    return { id };
  });
}

export async function listAdditions(limit = 100, allowedWarehouseIds: number[] = []) {
  const db = await requireDb();
  const where = allowedWarehouseIds.length ? inArray(additions.warehouseId, allowedWarehouseIds) : undefined;
  return db.select().from(additions).where(where).orderBy(desc(additions.id)).limit(limit);
}

export async function getMovementWarehouseIds(type: "addition" | "disbursement" | "transfer", id: number) {
  const db = await requireDb();
  if (type === "addition") {
    const rows = await db.select({ warehouseId: additions.warehouseId }).from(additions).where(eq(additions.id, id)).limit(1);
    return rows[0] ? [rows[0].warehouseId] : [];
  }
  if (type === "disbursement") {
    const rows = await db.select({ warehouseId: disbursements.warehouseId }).from(disbursements).where(eq(disbursements.id, id)).limit(1);
    return rows[0] ? [rows[0].warehouseId] : [];
  }
  const rows = await db.select({ fromWarehouseId: transfers.fromWarehouseId, toWarehouseId: transfers.toWarehouseId }).from(transfers).where(eq(transfers.id, id)).limit(1);
  return rows[0] ? [rows[0].fromWarehouseId, rows[0].toWarehouseId] : [];
}

export type MovementPageInput = { page?: number; pageSize?: number; itemSearch?: string; permitSearch?: string; purposeSearch?: string; fromDate?: string; toDate?: string; supplierId?: number };

export function normalizeMovementPageInput(input: MovementPageInput) {
  return { page: Math.max(1, Math.floor(input.page ?? 1)), pageSize: Math.min(100, Math.max(10, Math.floor(input.pageSize ?? 50))) };
}

export function normalizeMovementPageTotals(row: { total?: unknown; totalQuantity?: unknown; totalValue?: unknown } | undefined) {
  return { total: Number(row?.total ?? 0), totalQuantity: Number(row?.totalQuantity ?? 0), totalValue: Number(row?.totalValue ?? 0) };
}

export async function listAdditionsPaged(input: MovementPageInput, allowedWarehouseIds: number[] = []) {
  const db = await requireDb();
  const { page, pageSize } = normalizeMovementPageInput(input);
  const conditions: any[] = [];
  const itemSearch = input.itemSearch?.trim(); const permitSearch = input.permitSearch?.trim(); const purposeSearch = input.purposeSearch?.trim();
  if (itemSearch) { const pattern = `%${itemSearch}%`; conditions.push(or(like(additions.itemCode, pattern), like(additions.itemName, pattern))); }
  if (permitSearch) conditions.push(like(additions.eznNum, `%${permitSearch}%`));
  if (purposeSearch) conditions.push(like(additions.purpose, `%${purposeSearch}%`));
  if (input.supplierId) conditions.push(eq(additions.supplierId, input.supplierId));
  if (input.fromDate) conditions.push(gte(additions.date, input.fromDate));
  if (input.toDate) conditions.push(lte(additions.date, input.toDate));
  if (allowedWarehouseIds.length) conditions.push(inArray(additions.warehouseId, allowedWarehouseIds));
  const whereClause = conditions.length ? and(...conditions) : undefined;
  const [rows, totalRows] = await Promise.all([db.select().from(additions).where(whereClause).orderBy(desc(additions.id)).limit(pageSize).offset((page - 1) * pageSize), db.select({ total: count(), totalQuantity: sum(additions.quantity), totalValue: sum(additions.totalValue) }).from(additions).where(whereClause)]);
  const totals = normalizeMovementPageTotals(totalRows[0]);
  return { rows, ...totals, page, pageSize, pageCount: Math.max(1, Math.ceil(totals.total / pageSize)) };
}

export async function listSupplierAccount(supplierId: number, allowedWarehouseIds: number[] = []) {
  const db = await requireDb();
  const where = allowedWarehouseIds.length ? and(eq(additions.supplierId, supplierId), inArray(additions.warehouseId, allowedWarehouseIds)) : eq(additions.supplierId, supplierId);
  return db.select().from(additions).where(where).orderBy(desc(additions.id));
}
export async function listCustomerAccount(customerId: number, allowedWarehouseIds: number[] = []) {
  const db = await requireDb();
  const where = allowedWarehouseIds.length ? and(eq(disbursements.customerId, customerId), inArray(disbursements.warehouseId, allowedWarehouseIds)) : eq(disbursements.customerId, customerId);
  return db.select().from(disbursements).where(where).orderBy(desc(disbursements.id));
}

export async function createAddition(input: {
  date: string;
  eznNum: string;
  itemCode: string;
  store?: string | null;
  warehouseId?: number | null;
  quantity: number;
  purpose?: string | null;
  supplier?: string | null;
  supplierId?: number | null;
  category?: string | null;
  unitPrice?: number;
  clientRequestId?: string | null;
}) {
  const db = await requireDb();
  const quantity = toScaled(input.quantity);
  if (quantity <= 0) throw new InventoryError("BAD_REQUEST", "كمية الإضافة يجب أن تكون أكبر من صفر");
  const clientRequestId = input.clientRequestId?.trim() || null;

  return db.transaction(async (tx: any) => {
    if (clientRequestId) {
      const existing = await tx.select().from(additions).where(eq(additions.clientRequestId, clientRequestId)).limit(1).for("update");
      if (existing[0]) return existing[0];
    }
    const item = await getItemForUpdate(tx, normalizeItemCode(input.itemCode));
    const unitPrice = toMoneyScaled(input.unitPrice ?? item.unitPrice);
    const totalValue = calculateTotalValue(unitPrice, quantity);
    const warehouse = await resolveWarehouseId(tx, input.warehouseId, input.store);
    await applyStockDelta(tx, item, { incoming: quantity, outgoing: 0, current: quantity });
    await applyWarehouseBalanceDelta(tx, item.id, warehouse.id, quantity);
    const result = await tx.insert(additions).values({
      date: input.date.trim(),
      eznNum: input.eznNum.trim(),
      itemCode: item.code,
      itemName: item.name,
      store: input.store?.trim() || null,
      warehouseId: warehouse.id,
      quantity: fromScaled(quantity),
      unitPrice: fromMoneyScaled(unitPrice),
      totalValue: fromMoneyScaled(totalValue),
      purpose: input.purpose?.trim() || null,
      supplier: input.supplier?.trim() || null,
      supplierId: input.supplierId ?? null,
      category: input.category?.trim() || item.category || null,
      clientRequestId,
    });
    const id = resultInsertId(result);
    const rows = await tx.select().from(additions).where(eq(additions.id, id)).limit(1);
    return rows[0];
  });
}

export async function updateAddition(input: {
  id: number;
  date?: string;
  eznNum?: string;
  itemCode?: string;
  store?: string | null;
  warehouseId?: number | null;
  quantity?: number;
  purpose?: string | null;
  supplier?: string | null;
  supplierId?: number | null;
  category?: string | null;
  unitPrice?: number;
}) {
  const db = await requireDb();
  return db.transaction(async (tx: any) => {
    const oldRows = await tx.select().from(additions).where(eq(additions.id, input.id)).limit(1).for("update");
    const old = oldRows[0];
    if (!old) throw new InventoryError("NOT_FOUND", "سجل الإضافة غير موجود");

    const oldCode = old.itemCode;
    const nextCode = normalizeItemCode(input.itemCode ?? oldCode);
    const oldQuantity = toScaled(old.quantity);
    const nextQuantity = input.quantity === undefined ? oldQuantity : toScaled(input.quantity);
    if (nextQuantity <= 0) throw new InventoryError("BAD_REQUEST", "كمية الإضافة يجب أن تكون أكبر من صفر");

    const codes = Array.from(new Set([oldCode, nextCode])).sort();
    const lockedItems = new Map<string, any>();
    for (const code of codes) lockedItems.set(code, await getItemForUpdate(tx, code));
    const oldWarehouse = await resolveWarehouseId(tx, old.warehouseId, old.store);
    const nextWarehouse = await resolveWarehouseId(tx, input.warehouseId ?? old.warehouseId, input.store === undefined ? old.store : input.store);

    if (oldCode === nextCode) {
      await applyStockDelta(tx, lockedItems.get(oldCode), {
        incoming: nextQuantity - oldQuantity,
        outgoing: 0,
        current: nextQuantity - oldQuantity,
      });
    } else {
      await applyStockDelta(tx, lockedItems.get(oldCode), {
        incoming: -oldQuantity,
        outgoing: 0,
        current: -oldQuantity,
      });
      await applyStockDelta(tx, lockedItems.get(nextCode), {
        incoming: nextQuantity,
        outgoing: 0,
        current: nextQuantity,
      });
    }

    await applyWarehouseBalanceDelta(tx, lockedItems.get(oldCode).id, oldWarehouse.id, -oldQuantity);
    await applyWarehouseBalanceDelta(tx, lockedItems.get(nextCode).id, nextWarehouse.id, nextQuantity);

    const nextItem = lockedItems.get(nextCode);
    const unitPrice = toMoneyScaled(input.unitPrice ?? old.unitPrice);
    const totalValue = calculateTotalValue(unitPrice, nextQuantity);
    const updates: Partial<InsertAddition> = {
      date: input.date?.trim() ?? old.date,
      eznNum: input.eznNum?.trim() ?? old.eznNum,
      itemCode: nextCode,
      itemName: nextItem.name,
      store: input.store === undefined ? old.store : input.store?.trim() || null,
      warehouseId: nextWarehouse.id,
      quantity: fromScaled(nextQuantity),
      unitPrice: fromMoneyScaled(unitPrice),
      totalValue: fromMoneyScaled(totalValue),
      purpose: input.purpose === undefined ? old.purpose : input.purpose?.trim() || null,
      supplier: input.supplier === undefined ? old.supplier : input.supplier?.trim() || null,
      supplierId: input.supplierId === undefined ? old.supplierId : input.supplierId ?? null,
      category: input.category === undefined ? old.category : input.category?.trim() || null,
    };
    await tx.update(additions).set(updates).where(eq(additions.id, input.id));
    const rows = await tx.select().from(additions).where(eq(additions.id, input.id)).limit(1);
    return rows[0];
  });
}

export async function deleteAddition(id: number) {
  const db = await requireDb();
  return db.transaction(async (tx: any) => {
    const rows = await tx.select().from(additions).where(eq(additions.id, id)).limit(1).for("update");
    const addition = rows[0];
    if (!addition) throw new InventoryError("NOT_FOUND", "سجل الإضافة غير موجود");
    const item = await getItemForUpdate(tx, addition.itemCode);
    const warehouse = await resolveWarehouseId(tx, addition.warehouseId, addition.store);
    await applyStockDelta(tx, item, {
      incoming: -toScaled(addition.quantity),
      outgoing: 0,
      current: -toScaled(addition.quantity),
    });
    await applyWarehouseBalanceDelta(tx, item.id, warehouse.id, -toScaled(addition.quantity));
    await tx.delete(additions).where(eq(additions.id, id));
    return { id };
  });
}

export async function listDisbursements(limit = 500, allowedWarehouseIds: number[] = []) {
  const db = await requireDb();
  const where = allowedWarehouseIds.length ? inArray(disbursements.warehouseId, allowedWarehouseIds) : undefined;
  return db.select().from(disbursements).where(where).orderBy(desc(disbursements.id)).limit(limit);
}

export async function listDisbursementsPaged(input: Omit<MovementPageInput, "supplierId"> & { customerId?: number }, allowedWarehouseIds: number[] = []) {
  const db = await requireDb();
  const { page, pageSize } = normalizeMovementPageInput(input);
  const conditions: any[] = [];
  const itemSearch = input.itemSearch?.trim(); const permitSearch = input.permitSearch?.trim(); const purposeSearch = input.purposeSearch?.trim()?.replace(/^مبنى\s+/, "").trim();
  if (itemSearch) { const pattern = `%${itemSearch}%`; conditions.push(or(like(disbursements.itemCode, pattern), like(disbursements.itemName, pattern))); }
  if (permitSearch) conditions.push(like(disbursements.eznNum, `%${permitSearch}%`));
  if (purposeSearch) conditions.push(like(disbursements.disburseType, `%${purposeSearch}%`));
  if (input.customerId) conditions.push(eq(disbursements.customerId, input.customerId));
  if (input.fromDate) conditions.push(gte(disbursements.date, input.fromDate));
  if (input.toDate) conditions.push(lte(disbursements.date, input.toDate));
  if (allowedWarehouseIds.length) conditions.push(inArray(disbursements.warehouseId, allowedWarehouseIds));
  const whereClause = conditions.length ? and(...conditions) : undefined;
  const [rows, totalRows] = await Promise.all([db.select().from(disbursements).where(whereClause).orderBy(desc(disbursements.id)).limit(pageSize).offset((page - 1) * pageSize), db.select({ total: count(), totalQuantity: sum(disbursements.quantity), totalValue: sum(disbursements.totalValue) }).from(disbursements).where(whereClause)]);
  const totals = normalizeMovementPageTotals(totalRows[0]);
  return { rows, ...totals, page, pageSize, pageCount: Math.max(1, Math.ceil(totals.total / pageSize)) };
}

export async function createDisbursement(input: {
  date: string;
  eznNum: string;
  itemCode: string;
  destination?: string | null;
  customerId?: number | null;
  quantity: number;
  notes?: string | null;
  store?: string | null;
  warehouseId?: number | null;
  disburseType?: string | null;
  unitPrice?: number;
  clientRequestId?: string | null;
}) {
  const db = await requireDb();
  const quantity = toScaled(input.quantity);
  if (quantity <= 0) throw new InventoryError("BAD_REQUEST", "كمية الصرف يجب أن تكون أكبر من صفر");
  const clientRequestId = input.clientRequestId?.trim() || null;

  return db.transaction(async (tx: any) => {
    if (clientRequestId) {
      const existing = await tx.select().from(disbursements).where(eq(disbursements.clientRequestId, clientRequestId)).limit(1).for("update");
      if (existing[0]) return existing[0];
    }
    const item = await getItemForUpdate(tx, normalizeItemCode(input.itemCode));
    const unitPrice = toMoneyScaled(input.unitPrice ?? item.unitPrice);
    const totalValue = calculateTotalValue(unitPrice, quantity);
    const warehouse = await resolveWarehouseId(tx, input.warehouseId, input.store);
    await applyStockDelta(tx, item, { incoming: 0, outgoing: quantity, current: -quantity });
    await applyWarehouseBalanceDelta(tx, item.id, warehouse.id, -quantity);
    const result = await tx.insert(disbursements).values({
      date: input.date.trim(),
      eznNum: input.eznNum.trim(),
      itemCode: item.code,
      itemName: item.name,
      destination: input.destination?.trim() || null,
      customerId: input.customerId ?? null,
      quantity: fromScaled(quantity),
      unitPrice: fromMoneyScaled(unitPrice),
      totalValue: fromMoneyScaled(totalValue),
      notes: input.notes?.trim() || null,
      store: input.store?.trim() || null,
      warehouseId: warehouse.id,
      disburseType: input.disburseType?.trim() || null,
      clientRequestId,
    });
    const id = resultInsertId(result);
    const rows = await tx.select().from(disbursements).where(eq(disbursements.id, id)).limit(1);
    return rows[0];
  });
}

export async function updateDisbursement(input: {
  id: number;
  date?: string;
  eznNum?: string;
  itemCode?: string;
  destination?: string | null;
  customerId?: number | null;
  quantity?: number;
  notes?: string | null;
  store?: string | null;
  warehouseId?: number | null;
  disburseType?: string | null;
  unitPrice?: number;
}) {
  const db = await requireDb();
  return db.transaction(async (tx: any) => {
    const oldRows = await tx.select().from(disbursements).where(eq(disbursements.id, input.id)).limit(1).for("update");
    const old = oldRows[0];
    if (!old) throw new InventoryError("NOT_FOUND", "سجل الصرف غير موجود");

    const oldCode = old.itemCode;
    const nextCode = normalizeItemCode(input.itemCode ?? oldCode);
    const oldQuantity = toScaled(old.quantity);
    const nextQuantity = input.quantity === undefined ? oldQuantity : toScaled(input.quantity);
    if (nextQuantity <= 0) throw new InventoryError("BAD_REQUEST", "كمية الصرف يجب أن تكون أكبر من صفر");

    const codes = Array.from(new Set([oldCode, nextCode])).sort();
    const lockedItems = new Map<string, any>();
    for (const code of codes) lockedItems.set(code, await getItemForUpdate(tx, code));
    const oldWarehouse = await resolveWarehouseId(tx, old.warehouseId, old.store);
    const nextWarehouse = await resolveWarehouseId(tx, input.warehouseId ?? old.warehouseId, input.store === undefined ? old.store : input.store);

    if (oldCode === nextCode) {
      await applyStockDelta(tx, lockedItems.get(oldCode), {
        incoming: 0,
        outgoing: nextQuantity - oldQuantity,
        current: oldQuantity - nextQuantity,
      });
    } else {
      await applyStockDelta(tx, lockedItems.get(oldCode), {
        incoming: 0,
        outgoing: -oldQuantity,
        current: oldQuantity,
      });
      await applyStockDelta(tx, lockedItems.get(nextCode), {
        incoming: 0,
        outgoing: nextQuantity,
        current: -nextQuantity,
      });
    }

    await applyWarehouseBalanceDelta(tx, lockedItems.get(oldCode).id, oldWarehouse.id, oldQuantity);
    await applyWarehouseBalanceDelta(tx, lockedItems.get(nextCode).id, nextWarehouse.id, -nextQuantity);

    const nextItem = lockedItems.get(nextCode);
    const unitPrice = toMoneyScaled(input.unitPrice ?? old.unitPrice);
    const totalValue = calculateTotalValue(unitPrice, nextQuantity);
    const updates: Partial<InsertDisbursement> = {
      date: input.date?.trim() ?? old.date,
      eznNum: input.eznNum?.trim() ?? old.eznNum,
      itemCode: nextCode,
      itemName: nextItem.name,
      destination: input.destination === undefined ? old.destination : input.destination?.trim() || null,
      customerId: input.customerId === undefined ? old.customerId : input.customerId ?? null,
      quantity: fromScaled(nextQuantity),
      unitPrice: fromMoneyScaled(unitPrice),
      totalValue: fromMoneyScaled(totalValue),
      notes: input.notes === undefined ? old.notes : input.notes?.trim() || null,
      store: input.store === undefined ? old.store : input.store?.trim() || null,
      warehouseId: nextWarehouse.id,
      disburseType: input.disburseType === undefined ? old.disburseType : input.disburseType?.trim() || null,
    };
    await tx.update(disbursements).set(updates).where(eq(disbursements.id, input.id));
    const rows = await tx.select().from(disbursements).where(eq(disbursements.id, input.id)).limit(1);
    return rows[0];
  });
}

export async function deleteDisbursement(id: number) {
  const db = await requireDb();
  return db.transaction(async (tx: any) => {
    const rows = await tx.select().from(disbursements).where(eq(disbursements.id, id)).limit(1).for("update");
    const disbursement = rows[0];
    if (!disbursement) throw new InventoryError("NOT_FOUND", "سجل الصرف غير موجود");
    const item = await getItemForUpdate(tx, disbursement.itemCode);
    const quantity = toScaled(disbursement.quantity);
    const warehouse = await resolveWarehouseId(tx, disbursement.warehouseId, disbursement.store);
    await applyStockDelta(tx, item, { incoming: 0, outgoing: -quantity, current: quantity });
    await applyWarehouseBalanceDelta(tx, item.id, warehouse.id, quantity);
    await tx.delete(disbursements).where(eq(disbursements.id, id));
    return { id };
  });
}

export async function listTransfers(limit = 100, allowedWarehouseIds: number[] = []) {
  const db = await requireDb();
  const where = allowedWarehouseIds.length ? or(inArray(transfers.fromWarehouseId, allowedWarehouseIds), inArray(transfers.toWarehouseId, allowedWarehouseIds)) : undefined;
  return db.select().from(transfers).where(where).orderBy(desc(transfers.id)).limit(limit);
}

export async function listTransfersPaged(input: Omit<MovementPageInput, "supplierId">, allowedWarehouseIds: number[] = []) {
  const db = await requireDb();
  const { page, pageSize } = normalizeMovementPageInput(input);
  const conditions: any[] = [];
  const itemSearch = input.itemSearch?.trim(); const permitSearch = input.permitSearch?.trim(); const purposeSearch = input.purposeSearch?.trim();
  if (itemSearch) { const pattern = `%${itemSearch}%`; conditions.push(or(like(transfers.itemCode, pattern), like(transfers.itemName, pattern))); }
  if (permitSearch) conditions.push(like(transfers.eznNum, `%${permitSearch}%`));
  if (purposeSearch) conditions.push(like(transfers.notes, `%${purposeSearch}%`));
  if (input.fromDate) conditions.push(gte(transfers.date, input.fromDate));
  if (input.toDate) conditions.push(lte(transfers.date, input.toDate));
  if (allowedWarehouseIds.length) conditions.push(or(inArray(transfers.fromWarehouseId, allowedWarehouseIds), inArray(transfers.toWarehouseId, allowedWarehouseIds)));
  const whereClause = conditions.length ? and(...conditions) : undefined;
  const [rows, totalRows] = await Promise.all([db.select().from(transfers).where(whereClause).orderBy(desc(transfers.id)).limit(pageSize).offset((page - 1) * pageSize), db.select({ total: count(), totalQuantity: sum(transfers.quantity), totalValue: sum(transfers.totalValue) }).from(transfers).where(whereClause)]);
  const totals = normalizeMovementPageTotals(totalRows[0]);
  return { rows, ...totals, page, pageSize, pageCount: Math.max(1, Math.ceil(totals.total / pageSize)) };
}

export type ReportDatasetInput = {
  includeRows?: boolean;
  fromDate?: string;
  toDate?: string;
  permitSearch?: string;
  incomingFromSearch?: string;
  outgoingToSearch?: string;
  additionPurposeSearch?: string;
  disbursementPurposeSearch?: string;
  returnPurposeSearch?: string;
};

type ReportAggregate = { count: number; quantity: number; value: number };
const reportReturnTypes = ["return", "مرتجع", "استلام مرتجع", "مرتجع من عميل", "مرتجع للمخزن"];

function normalizeReportAggregate(row: { count?: unknown; quantity?: unknown; value?: unknown } | undefined): ReportAggregate {
  return { count: Number(row?.count ?? 0), quantity: Number(row?.quantity ?? 0), value: Number(row?.value ?? 0) };
}

function reportWhereConditions(input: ReportDatasetInput, allowedWarehouseIds: number[] = []) {
  const permit = input.permitSearch?.trim();
  const incoming = input.incomingFromSearch?.trim();
  const outgoing = input.outgoingToSearch?.trim();
  const additionPurpose = input.additionPurposeSearch?.trim();
  const disbursementPurpose = input.disbursementPurposeSearch?.trim();
  const returnPurpose = input.returnPurposeSearch?.trim();
  const purposeFilters = [additionPurpose, disbursementPurpose, returnPurpose].filter(Boolean).length;
  const additionsConditions: any[] = [];
  const disbursementsConditions: any[] = [];
  const transfersConditions: any[] = [];
  if (allowedWarehouseIds.length) {
    additionsConditions.push(inArray(additions.warehouseId, allowedWarehouseIds));
    disbursementsConditions.push(inArray(disbursements.warehouseId, allowedWarehouseIds));
    transfersConditions.push(or(inArray(transfers.fromWarehouseId, allowedWarehouseIds), inArray(transfers.toWarehouseId, allowedWarehouseIds)));
  }
  if (permit) {
    additionsConditions.push(like(additions.eznNum, `%${permit}%`));
    disbursementsConditions.push(like(disbursements.eznNum, `%${permit}%`));
    transfersConditions.push(like(transfers.eznNum, `%${permit}%`));
  }
  if (input.fromDate) {
    additionsConditions.push(gte(additions.date, input.fromDate));
    disbursementsConditions.push(gte(disbursements.date, input.fromDate));
    transfersConditions.push(gte(transfers.date, input.fromDate));
  }
  if (input.toDate) {
    additionsConditions.push(lte(additions.date, input.toDate));
    disbursementsConditions.push(lte(disbursements.date, input.toDate));
    transfersConditions.push(lte(transfers.date, input.toDate));
  }
  if (incoming) additionsConditions.push(or(like(additions.supplier, `%${incoming}%`), like(additions.store, `%${incoming}%`)));
  if (outgoing) {
    disbursementsConditions.push(or(like(disbursements.destination, `%${outgoing}%`), like(disbursements.store, `%${outgoing}%`)));
    transfersConditions.push(or(like(transfers.fromStore, `%${outgoing}%`), like(transfers.toStore, `%${outgoing}%`), like(transfers.notes, `%${outgoing}%`)));
  }
  if (incoming && !outgoing) {
    disbursementsConditions.push(eq(disbursements.id, -1));
    transfersConditions.push(eq(transfers.id, -1));
  }
  if (outgoing && !incoming) additionsConditions.push(eq(additions.id, -1));
  if (purposeFilters > 1) {
    additionsConditions.push(eq(additions.id, -1));
    disbursementsConditions.push(eq(disbursements.id, -1));
    transfersConditions.push(eq(transfers.id, -1));
  } else if (additionPurpose) {
    additionsConditions.push(like(additions.purpose, `%${additionPurpose}%`));
    disbursementsConditions.push(eq(disbursements.id, -1));
    transfersConditions.push(eq(transfers.id, -1));
  } else if (disbursementPurpose) {
    additionsConditions.push(eq(additions.id, -1));
    disbursementsConditions.push(like(disbursements.disburseType, `%${disbursementPurpose.replace(/^مبنى\s+/, "").trim()}%`));
    transfersConditions.push(eq(transfers.id, -1));
  } else if (returnPurpose) {
    additionsConditions.push(eq(additions.id, -1));
    disbursementsConditions.push(eq(disbursements.id, -1));
    transfersConditions.push(and(inArray(transfers.transferType, reportReturnTypes), like(transfers.notes, `%${returnPurpose}%`)));
  }
  return {
    additionsWhere: additionsConditions.length ? and(...additionsConditions) : undefined,
    disbursementsWhere: disbursementsConditions.length ? and(...disbursementsConditions) : undefined,
    transfersWhere: transfersConditions.length ? and(...transfersConditions) : undefined,
  };
}

export async function getReportDataset(input: ReportDatasetInput, allowedWarehouseIds: number[] = []) {
  const db = await requireDb();
  const { additionsWhere, disbursementsWhere, transfersWhere } = reportWhereConditions(input, allowedWarehouseIds);
  const returnWhere = transfersWhere ? and(transfersWhere, inArray(transfers.transferType, reportReturnTypes)) : inArray(transfers.transferType, reportReturnTypes);
  const additionRowsPromise = input.includeRows ? db.select().from(additions).where(additionsWhere).orderBy(desc(additions.id)) : Promise.resolve([] as any[]);
  const disbursementRowsPromise = input.includeRows ? db.select().from(disbursements).where(disbursementsWhere).orderBy(desc(disbursements.id)) : Promise.resolve([] as any[]);
  const transferRowsPromise = input.includeRows ? db.select().from(transfers).where(transfersWhere).orderBy(desc(transfers.id)) : Promise.resolve([] as any[]);
  const [additionRows, disbursementRows, transferRows, additionTotals, disbursementTotals, transferTotals, returnTotals, supplierGroups, customerGroups, supplierRows, customerRows, allItems, allAdditionGroups, allDisbursementGroups, allReturnGroups] = await Promise.all([
    additionRowsPromise,
    disbursementRowsPromise,
    transferRowsPromise,
    db.select({ count: count(), quantity: sum(additions.quantity), value: sum(additions.totalValue) }).from(additions).where(additionsWhere),
    db.select({ count: count(), quantity: sum(disbursements.quantity), value: sum(disbursements.totalValue) }).from(disbursements).where(disbursementsWhere),
    db.select({ count: count(), quantity: sum(transfers.quantity), value: sum(transfers.totalValue) }).from(transfers).where(transfersWhere),
    db.select({ count: count(), quantity: sum(transfers.quantity), value: sum(transfers.totalValue) }).from(transfers).where(returnWhere),
    db.select({ partyId: additions.supplierId, fallbackName: additions.supplier, count: count(), quantity: sum(additions.quantity), value: sum(additions.totalValue) }).from(additions).where(additionsWhere).groupBy(additions.supplierId, additions.supplier),
    db.select({ partyId: disbursements.customerId, fallbackName: disbursements.destination, count: count(), quantity: sum(disbursements.quantity), value: sum(disbursements.totalValue) }).from(disbursements).where(disbursementsWhere).groupBy(disbursements.customerId, disbursements.destination),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers),
    db.select({ id: customers.id, name: customers.name }).from(customers),
    allowedWarehouseIds.length
      ? db.selectDistinct({ code: items.code, name: items.name, initialStock: items.initialStock, currentStock: items.currentStock, unitPrice: items.unitPrice }).from(items).innerJoin(itemWarehouseBalances, eq(itemWarehouseBalances.itemId, items.id)).where(inArray(itemWarehouseBalances.warehouseId, allowedWarehouseIds))
      : db.select({ code: items.code, name: items.name, initialStock: items.initialStock, currentStock: items.currentStock, unitPrice: items.unitPrice }).from(items),
    db.select({ itemCode: additions.itemCode, quantity: sum(additions.quantity) }).from(additions).where(allowedWarehouseIds.length ? inArray(additions.warehouseId, allowedWarehouseIds) : undefined).groupBy(additions.itemCode),
    db.select({ itemCode: disbursements.itemCode, quantity: sum(disbursements.quantity) }).from(disbursements).where(allowedWarehouseIds.length ? inArray(disbursements.warehouseId, allowedWarehouseIds) : undefined).groupBy(disbursements.itemCode),
    db.select({ itemCode: transfers.itemCode, quantity: sum(transfers.quantity) }).from(transfers).where(allowedWarehouseIds.length ? and(inArray(transfers.transferType, reportReturnTypes), or(inArray(transfers.fromWarehouseId, allowedWarehouseIds), inArray(transfers.toWarehouseId, allowedWarehouseIds))) : inArray(transfers.transferType, reportReturnTypes)).groupBy(transfers.itemCode),
  ]);
  const optionInput = { ...input, additionPurposeSearch: undefined, disbursementPurposeSearch: undefined, returnPurposeSearch: undefined };
  const optionWhere = reportWhereConditions(optionInput, allowedWarehouseIds);
  const optionReturnWhere = optionWhere.transfersWhere ? and(optionWhere.transfersWhere, inArray(transfers.transferType, reportReturnTypes)) : inArray(transfers.transferType, reportReturnTypes);
  const [additionPurposeGroups, disbursementPurposeGroups, returnPurposeGroups] = await Promise.all([
    db.select({ value: additions.purpose, count: count() }).from(additions).where(optionWhere.additionsWhere).groupBy(additions.purpose),
    db.select({ value: disbursements.disburseType, count: count() }).from(disbursements).where(optionWhere.disbursementsWhere).groupBy(disbursements.disburseType),
    db.select({ value: transfers.notes, count: count() }).from(transfers).where(optionReturnWhere).groupBy(transfers.notes),
  ]);
  const additionsSummary = normalizeReportAggregate(additionTotals[0]);
  const disbursementsSummary = normalizeReportAggregate(disbursementTotals[0]);
  const transfersSummary = normalizeReportAggregate(transferTotals[0]);
  const returnsSummary = normalizeReportAggregate(returnTotals[0]);
  const suppliersById = new Map(supplierRows.map(row => [row.id, row.name]));
  const customersById = new Map(customerRows.map(row => [row.id, row.name]));
  const toAccountRow = (row: { partyId: number | null; fallbackName: string | null; count: unknown; quantity: unknown; value: unknown }, names: Map<number, string>) => ({ name: names.get(row.partyId ?? 0) ?? row.fallbackName ?? "—", movements: Number(row.count ?? 0), quantity: Number(row.quantity ?? 0), value: Number(row.value ?? 0) });
  const additionsByCode = new Map(allAdditionGroups.map(row => [row.itemCode, Number(row.quantity ?? 0)]));
  const disbursementsByCode = new Map(allDisbursementGroups.map(row => [row.itemCode, Number(row.quantity ?? 0)]));
  const returnsByCode = new Map(allReturnGroups.map(row => [row.itemCode, Number(row.quantity ?? 0)]));
  const varianceRows = allItems.map(item => {
    const initialStock = Number(item.initialStock ?? 0);
    const additionsTotal = additionsByCode.get(item.code) ?? 0;
    const disbursementsTotal = disbursementsByCode.get(item.code) ?? 0;
    const returnsTotal = returnsByCode.get(item.code) ?? 0;
    const expectedStock = initialStock + additionsTotal + returnsTotal - disbursementsTotal;
    const recordedStock = Number(item.currentStock ?? 0);
    const variance = expectedStock - recordedStock;
    return { code: item.code, name: item.name, initialStock, additions: additionsTotal, disbursements: disbursementsTotal, returns: returnsTotal, net: expectedStock, recordedStock, expectedStock, variance, unitPrice: Number(item.unitPrice ?? 0), status: Math.abs(variance) <= 0.001 ? "متطابق" as const : variance > 0 ? "فرق موجب" as const : "فرق سالب" as const };
  });
  const varianceSummary = { total: varianceRows.length, matched: varianceRows.filter(row => row.status === "متطابق").length, positive: varianceRows.filter(row => row.status === "فرق موجب").length, negative: varianceRows.filter(row => row.status === "فرق سالب").length, totalVariance: varianceRows.reduce((total, row) => total + row.variance, 0) };
  return {
    additions: additionRows,
    disbursements: disbursementRows,
    transfers: transferRows,
    summary: { additions: additionsSummary, disbursements: disbursementsSummary, transfers: transfersSummary, returns: returnsSummary, all: { count: additionsSummary.count + disbursementsSummary.count + transfersSummary.count, quantity: additionsSummary.quantity + disbursementsSummary.quantity + transfersSummary.quantity, value: additionsSummary.value + disbursementsSummary.value + transfersSummary.value } },
    accounts: { suppliers: supplierGroups.map(row => toAccountRow(row, suppliersById)).sort((left, right) => right.value - left.value), customers: customerGroups.map(row => toAccountRow(row, customersById)).sort((left, right) => right.value - left.value) },
    purposeOptions: {
      additions: additionPurposeGroups.filter(row => Boolean(row.value?.trim())).map(row => ({ value: row.value!, count: Number(row.count ?? 0) })).sort((left, right) => left.value.localeCompare(right.value, "ar-EG")),
      disbursements: disbursementPurposeGroups.filter(row => Boolean(row.value?.trim())).map(row => ({ value: row.value!, count: Number(row.count ?? 0) })).sort((left, right) => left.value.localeCompare(right.value, "ar-EG")),
      returns: returnPurposeGroups.filter(row => Boolean(row.value?.trim())).map(row => ({ value: row.value!, count: Number(row.count ?? 0) })).sort((left, right) => left.value.localeCompare(right.value, "ar-EG")),
    },
    varianceRows,
    varianceSummary,
  };
}

export function isReturnTransfer(type: string | null | undefined) {
  return ["return", "مرتجع", "استلام مرتجع", "مرتجع من عميل", "مرتجع للمخزن"].includes((type ?? "").trim().toLowerCase());
}

export function isInternalTransfer(type: string | null | undefined) {
  return ["transfer", "تحويل", "تحويل داخلي"].includes((type ?? "").trim().toLowerCase());
}

/** Returns replenish available stock but are not new procurement/incoming supply. */
export function getCustomerReturnStockDelta(quantity: number) {
  return { incoming: 0, outgoing: 0, current: quantity };
}

async function applyTransferWarehouseEffect(tx: any, item: any, input: { transferType?: string | null; fromWarehouseId?: number | null; toWarehouseId?: number | null; fromStore?: string | null; toStore?: string | null; quantity: number }) {
  if (isInternalTransfer(input.transferType)) {
    const source = await resolveWarehouseId(tx, input.fromWarehouseId, input.fromStore);
    const destination = await resolveWarehouseId(tx, input.toWarehouseId, input.toStore);
    if (source.id === destination.id) throw new InventoryError("BAD_REQUEST", "يجب أن يختلف مخزن المصدر عن مخزن الوجهة");
    await applyWarehouseBalanceDelta(tx, item.id, source.id, -input.quantity);
    await applyWarehouseBalanceDelta(tx, item.id, destination.id, input.quantity);
    return { fromWarehouseId: source.id, toWarehouseId: destination.id };
  }
  if (isReturnTransfer(input.transferType)) {
    const destination = await resolveWarehouseId(tx, input.toWarehouseId, input.toStore);
    await applyStockDelta(tx, item, getCustomerReturnStockDelta(input.quantity));
    await applyWarehouseBalanceDelta(tx, item.id, destination.id, input.quantity);
    return { fromWarehouseId: input.fromWarehouseId ?? null, toWarehouseId: destination.id };
  }
  return { fromWarehouseId: input.fromWarehouseId ?? null, toWarehouseId: input.toWarehouseId ?? null };
}

export async function createTransfer(input: {
  date: string;
  eznNum: string;
  itemCode: string;
  fromStore?: string | null;
  toStore?: string | null;
  fromWarehouseId?: number | null;
  toWarehouseId?: number | null;
  quantity: number;
  notes?: string | null;
  transferType?: string | null;
  unitPrice?: number;
  clientRequestId?: string | null;
}) {
  const db = await requireDb();
  const quantity = toScaled(input.quantity);
  if (quantity <= 0) throw new InventoryError("BAD_REQUEST", "كمية التحويل يجب أن تكون أكبر من صفر");
  const clientRequestId = input.clientRequestId?.trim() || null;

  return db.transaction(async (tx: any) => {
    if (clientRequestId) {
      const existing = await tx.select().from(transfers).where(eq(transfers.clientRequestId, clientRequestId)).limit(1).for("update");
      if (existing[0]) return existing[0];
    }
    const item = await getItemForUpdate(tx, normalizeItemCode(input.itemCode));
    const unitPrice = toMoneyScaled(input.unitPrice ?? item.unitPrice);
    const totalValue = calculateTotalValue(unitPrice, quantity);
    const warehouseLinks = await applyTransferWarehouseEffect(tx, item, { transferType: input.transferType, fromWarehouseId: input.fromWarehouseId, toWarehouseId: input.toWarehouseId, fromStore: input.fromStore, toStore: input.toStore, quantity });
    const result = await tx.insert(transfers).values({
      date: input.date.trim(),
      eznNum: input.eznNum.trim(),
      itemCode: item.code,
      itemName: item.name,
      fromStore: input.fromStore?.trim() || null,
      toStore: input.toStore?.trim() || null,
      fromWarehouseId: warehouseLinks.fromWarehouseId,
      toWarehouseId: warehouseLinks.toWarehouseId,
      quantity: fromScaled(quantity),
      unitPrice: fromMoneyScaled(unitPrice),
      totalValue: fromMoneyScaled(totalValue),
      notes: input.notes?.trim() || null,
      transferType: input.transferType?.trim() || "transfer",
      clientRequestId,
    });
    const id = resultInsertId(result);
    const rows = await tx.select().from(transfers).where(eq(transfers.id, id)).limit(1);
    return rows[0];
  });
}

export async function updateTransfer(input: {
  id: number;
  date?: string;
  eznNum?: string;
  itemCode?: string;
  fromStore?: string | null;
  toStore?: string | null;
  fromWarehouseId?: number | null;
  toWarehouseId?: number | null;
  quantity?: number;
  notes?: string | null;
  transferType?: string | null;
  unitPrice?: number;
}) {
  const db = await requireDb();
  return db.transaction(async (tx: any) => {
    const oldRows = await tx.select().from(transfers).where(eq(transfers.id, input.id)).limit(1).for("update");
    const old = oldRows[0];
    if (!old) throw new InventoryError("NOT_FOUND", "سجل التحويل غير موجود");

    const oldCode = old.itemCode;
    const nextCode = normalizeItemCode(input.itemCode ?? oldCode);
    const oldQuantity = toScaled(old.quantity);
    const nextQuantity = input.quantity === undefined ? oldQuantity : toScaled(input.quantity);
    if (nextQuantity <= 0) throw new InventoryError("BAD_REQUEST", "كمية التحويل يجب أن تكون أكبر من صفر");

    const nextTransferType = input.transferType === undefined ? old.transferType : input.transferType;
    const nextFromWarehouseId = input.fromWarehouseId === undefined ? old.fromWarehouseId : input.fromWarehouseId;
    const nextToWarehouseId = input.toWarehouseId === undefined ? old.toWarehouseId : input.toWarehouseId;
    const codes = Array.from(new Set([oldCode, nextCode])).sort();
    const lockedItems = new Map<string, any>();
    for (const code of codes) lockedItems.set(code, await getItemForUpdate(tx, code));

    if (old.fromWarehouseId || old.toWarehouseId) {
      await applyTransferWarehouseEffect(tx, lockedItems.get(oldCode), { transferType: old.transferType, fromWarehouseId: old.fromWarehouseId, toWarehouseId: old.toWarehouseId, quantity: -oldQuantity });
    }
    if (nextFromWarehouseId || nextToWarehouseId) {
      await applyTransferWarehouseEffect(tx, lockedItems.get(nextCode), { transferType: nextTransferType, fromWarehouseId: nextFromWarehouseId, toWarehouseId: nextToWarehouseId, quantity: nextQuantity });
    }

    const nextItem = lockedItems.get(nextCode);
    const unitPrice = toMoneyScaled(input.unitPrice ?? old.unitPrice);
    const totalValue = calculateTotalValue(unitPrice, nextQuantity);
    await tx
      .update(transfers)
      .set({
        date: input.date?.trim() ?? old.date,
        eznNum: input.eznNum?.trim() ?? old.eznNum,
        itemCode: nextCode,
        itemName: nextItem.name,
        fromStore: input.fromStore === undefined ? old.fromStore : input.fromStore?.trim() || null,
        toStore: input.toStore === undefined ? old.toStore : input.toStore?.trim() || null,
        fromWarehouseId: nextFromWarehouseId ?? null,
        toWarehouseId: nextToWarehouseId ?? null,
        quantity: fromScaled(nextQuantity),
        unitPrice: fromMoneyScaled(unitPrice),
        totalValue: fromMoneyScaled(totalValue),
        notes: input.notes === undefined ? old.notes : input.notes?.trim() || null,
        transferType: nextTransferType?.trim() || "transfer",
      })
      .where(eq(transfers.id, input.id));

    const rows = await tx.select().from(transfers).where(eq(transfers.id, input.id)).limit(1);
    return rows[0];
  });
}

export async function deleteTransfer(id: number) {
  const db = await requireDb();
  return db.transaction(async (tx: any) => {
    const rows = await tx.select().from(transfers).where(eq(transfers.id, id)).limit(1).for("update");
    const transfer = rows[0];
    if (!transfer) throw new InventoryError("NOT_FOUND", "سجل التحويل غير موجود");
    if (transfer.fromWarehouseId || transfer.toWarehouseId) {
      const item = await getItemForUpdate(tx, transfer.itemCode);
      const quantity = toScaled(transfer.quantity);
      await applyTransferWarehouseEffect(tx, item, { transferType: transfer.transferType, fromWarehouseId: transfer.fromWarehouseId, toWarehouseId: transfer.toWarehouseId, quantity: -quantity });
    }
    await tx.delete(transfers).where(eq(transfers.id, id));
    return { id };
  });
}

export type MovementImportRow = {
  type: "addition" | "disbursement" | "transfer";
  date: string;
  eznNum: string;
  itemCode: string;
  quantity: number;
  store?: string | null;
  purpose?: string | null;
  supplier?: string | null;
  category?: string | null;
  destination?: string | null;
  notes?: string | null;
  disburseType?: string | null;
  fromStore?: string | null;
  toStore?: string | null;
  transferType?: string | null;
  unitPrice?: number;
};

export function buildMovementDuplicateKey(row: MovementImportRow) {
  return [row.type, row.date.trim(), row.eznNum.trim(), row.itemCode.trim(), row.quantity, row.store ?? "", row.supplier ?? "", row.destination ?? "", row.notes ?? "", row.disburseType ?? "", row.fromStore ?? "", row.toStore ?? "", row.transferType ?? ""].map(value => String(value).trim()).join("|");
}

export async function importMovements(rows: MovementImportRow[]) {
  const seen = new Set<string>();
  const errors: Array<{ row: number; message: string }> = [];
  let imported = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 2;
    const duplicateKey = buildMovementDuplicateKey(row);
    if (seen.has(duplicateKey)) {
      errors.push({ row: rowNumber, message: "صف مكرر داخل الملف" });
      continue;
    }
    seen.add(duplicateKey);
    try {
      if (!row.date.trim() || !row.eznNum.trim() || !row.itemCode.trim()) throw new InventoryError("BAD_REQUEST", "التاريخ ورقم الإذن وكود الصنف حقول مطلوبة");
      if (row.type === "addition") await createAddition(row);
      else if (row.type === "disbursement") await createDisbursement(row);
      else await createTransfer(row);
      imported += 1;
    } catch (error) {
      errors.push({ row: rowNumber, message: error instanceof Error ? error.message : "تعذر استيراد الصف" });
    }
  }
  return { imported, failed: errors.length, errors };
}

export async function createAuditLog(input: { userId?: number | null; userName?: string | null; action: string; entity: string; entityId?: string | number | null; details?: Record<string, unknown> | string | null }) {
  const db = await requireDb();
  await db.insert(auditLogs).values({ userId: input.userId ?? null, userName: input.userName ?? null, action: input.action, entity: input.entity, entityId: input.entityId == null ? null : String(input.entityId), details: input.details == null ? null : typeof input.details === "string" ? input.details : JSON.stringify(input.details) });
}

export async function listAuditLogs(limit = 200) {
  const db = await requireDb();
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(Math.min(500, Math.max(1, limit)));
}

export async function listShareActivity(limit = 200) {
  const db = await requireDb();
  return db.select().from(auditLogs).where(eq(auditLogs.action, "share_report")).orderBy(desc(auditLogs.createdAt)).limit(Math.min(500, Math.max(1, limit)));
}

export async function clearShareActivity() {
  const db = await requireDb();
  const result = await db.delete(auditLogs).where(eq(auditLogs.action, "share_report"));
  return { deleted: Number(result[0]?.affectedRows ?? 0) };
}

export async function clearLoginActivity() {
  const db = await requireDb();
  const result = await db.delete(loginAuditLogs);
  return { deleted: Number(result[0]?.affectedRows ?? 0) };
}

export async function hasLoginFingerprint(input: { userId: number; userAgent: string; deviceType: string }) {
  const db = await requireDb();
  const rows = await db.select({ id: loginAuditLogs.id }).from(loginAuditLogs).where(and(eq(loginAuditLogs.userId, input.userId), eq(loginAuditLogs.userAgent, input.userAgent), eq(loginAuditLogs.deviceType, input.deviceType))).limit(1);
  return Boolean(rows[0]);
}

export async function createLoginAuditLog(input: {
  userId: number;
  sessionId?: string | null;
  userName?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  userAgent?: string | null;
  deviceType?: string | null;
  ipAddress?: string | null;
}) {
  const db = await requireDb();
  const result = await db.insert(loginAuditLogs).values({
    userId: input.userId,
    sessionId: input.sessionId ?? null,
    userName: input.userName ?? null,
    email: input.email ?? null,
    loginMethod: input.loginMethod ?? null,
    userAgent: input.userAgent ?? null,
    deviceType: input.deviceType ?? null,
    ipAddress: input.ipAddress ?? null,
  });
  return resultInsertId(result);
}

export async function isSessionRevoked(sessionId: string) {
  const db = await requireDb();
  const rows = await db.select({ sessionId: revokedSessions.sessionId }).from(revokedSessions).where(eq(revokedSessions.sessionId, sessionId)).limit(1);
  return Boolean(rows[0]);
}

export async function revokeSession(input: { sessionId: string; userId: number; revokedBy: number }) {
  const db = await requireDb();
  await db.insert(revokedSessions).values(input).onDuplicateKeyUpdate({ set: { revokedAt: new Date(), revokedBy: input.revokedBy } });
  return { revoked: true };
}

export async function revokeLoginSession(input: { loginLogId: number; revokedBy: number }) {
  const db = await requireDb();
  const rows = await db.select({ sessionId: loginAuditLogs.sessionId, userId: loginAuditLogs.userId }).from(loginAuditLogs).where(eq(loginAuditLogs.id, input.loginLogId)).limit(1);
  const login = rows[0];
  if (!login) throw new InventoryError("NOT_FOUND", "سجل الدخول غير موجود");
  if (!login.sessionId) throw new InventoryError("BAD_REQUEST", "هذا السجل قديم ولا يحتوي على جلسة قابلة للإلغاء");
  await revokeSession({ sessionId: login.sessionId, userId: login.userId, revokedBy: input.revokedBy });
  return { revoked: true, loginLogId: input.loginLogId };
}

export async function createSecurityNotification(input: { notificationType: string; title: string; message: string; loginLogId?: number | null }) {
  const db = await requireDb();
  await db.insert(securityNotifications).values({ notificationType: input.notificationType, title: input.title, message: input.message, loginLogId: input.loginLogId ?? null });
}

export async function createNotification(input: { recipientUserId?: number | null; createdBy?: number | null; notificationType: string; title: string; message: string; priority?: "low" | "normal" | "high" | "critical"; link?: string | null }) {
  const db = await requireDb();
  const result = await db.insert(notifications).values({ recipientUserId: input.recipientUserId ?? null, createdBy: input.createdBy ?? null, notificationType: input.notificationType, title: input.title, message: input.message, priority: input.priority ?? "normal", link: input.link ?? null });
  return { id: resultInsertId(result) };
}

export async function listNotificationsForUser(userId: number, limit = 100) {
  const db = await requireDb();
  return db.select().from(notifications).where(or(eq(notifications.recipientUserId, userId), eq(notifications.recipientUserId, 0))).orderBy(desc(notifications.createdAt)).limit(Math.min(300, Math.max(1, limit)));
}

export async function markNotificationRead(input: { id: number; userId: number }) {
  const db = await requireDb();
  await db.update(notifications).set({ isRead: true, readAt: new Date() }).where(and(eq(notifications.id, input.id), eq(notifications.recipientUserId, input.userId)));
  return { updated: true };
}

export async function markAllNotificationsRead(userId: number) {
  const db = await requireDb();
  await db.update(notifications).set({ isRead: true, readAt: new Date() }).where(eq(notifications.recipientUserId, userId));
  return { updated: true };
}
export async function clearReadNotifications(userId: number) {
  const db = await requireDb();
  const result = await db.delete(notifications).where(and(eq(notifications.isRead, true), or(eq(notifications.recipientUserId, userId), eq(notifications.recipientUserId, 0))));
  return { deleted: Number(result[0]?.affectedRows ?? 0) };
}
export async function listNotificationsCreatedBy(userId: number, limit = 300) {
  const db = await requireDb();
  return db.select({ notification: notifications, recipientName: users.name, recipientEmail: users.email }).from(notifications).leftJoin(users, eq(notifications.recipientUserId, users.id)).where(eq(notifications.createdBy, userId)).orderBy(desc(notifications.createdAt)).limit(Math.min(500, Math.max(1, limit)));
}
export function selectHelpRequestOwner(configuredOwner: { id: number } | undefined, administrators: Array<{ id: number }>) {
  return configuredOwner ?? administrators[0];
}

export async function createHelpRequest(input: { senderUserId: number; title: string; message: string; priority?: "low" | "normal" | "high" | "critical" }) {
  const db = await requireDb();
  const configuredOwner = ENV.ownerOpenId
    ? (await db.select({ id: users.id }).from(users).where(and(eq(users.openId, ENV.ownerOpenId), eq(users.role, "admin"))).limit(1))[0]
    : undefined;
  const administrators = configuredOwner
    ? []
    : await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).orderBy(asc(users.id)).limit(1);
  const owner = selectHelpRequestOwner(configuredOwner, administrators);
  if (!owner) throw new InventoryError("UNAVAILABLE", "لم يتم العثور على حساب المدير العام");
  const title = input.title.trim();
  const message = input.message.trim();
  if (title.length < 3) throw new InventoryError("BAD_REQUEST", "عنوان طلب المساعدة قصير جداً");
  if (message.length < 5) throw new InventoryError("BAD_REQUEST", "تفاصيل طلب المساعدة قصيرة جداً");
  return createNotification({ recipientUserId: owner.id, createdBy: input.senderUserId, notificationType: "help_request", title: `طلب مساعدة: ${title}`, message, priority: input.priority ?? "normal" });
}
export async function listHelpRequests(limit = 300) {
  const db = await requireDb();
  return db.select({ notification: notifications, senderName: users.name, senderEmail: users.email }).from(notifications).leftJoin(users, eq(notifications.createdBy, users.id)).where(eq(notifications.notificationType, "help_request")).orderBy(desc(notifications.createdAt)).limit(Math.min(500, Math.max(1, limit)));
}
export async function listHelpRequestsForUser(userId: number, limit = 100) {
  const db = await requireDb();
  return db.select().from(notifications).where(and(eq(notifications.notificationType, "help_request"), eq(notifications.createdBy, userId))).orderBy(desc(notifications.createdAt)).limit(Math.min(200, Math.max(1, limit)));
}
export async function updateHelpRequestStatus(input: { id: number; ownerUserId: number; status: "new" | "in_progress" | "completed" }) {
  const db = await requireDb();
  await db.update(notifications).set({ helpStatus: input.status }).where(and(eq(notifications.id, input.id), eq(notifications.notificationType, "help_request"), eq(notifications.recipientUserId, input.ownerUserId)));
  return { updated: true, status: input.status };
}
export async function markHelpRequestRead(input: { id: number; ownerUserId: number }) {
  const db = await requireDb();
  await db.update(notifications).set({ isRead: true, readAt: new Date() }).where(and(eq(notifications.id, input.id), eq(notifications.notificationType, "help_request"), eq(notifications.recipientUserId, input.ownerUserId)));
  return { updated: true };
}

export async function listSecurityNotifications(limit = 100) {
  const db = await requireDb();
  return db.select().from(securityNotifications).orderBy(desc(securityNotifications.createdAt)).limit(Math.min(300, Math.max(1, limit)));
}

export async function markSecurityNotificationsRead() {
  const db = await requireDb();
  await db.update(securityNotifications).set({ isRead: true }).where(eq(securityNotifications.isRead, false));
  return { updated: true };
}

export async function listLoginAuditLogs(limit = 200) {
  const db = await requireDb();
  return db.select().from(loginAuditLogs).orderBy(desc(loginAuditLogs.loggedInAt)).limit(Math.min(500, Math.max(1, limit)));
}

export async function listUsersForManagement() {
  const db = await requireDb();
  return db.select({ id: users.id, openId: users.openId, name: users.name, email: users.email, role: users.role, lastSignedIn: users.lastSignedIn, createdAt: users.createdAt }).from(users).orderBy(desc(users.lastSignedIn));
}

export async function updateManagedUserRole(input: { id: number; role: "user" | "admin" | "manager" | "operator" | "reviewer" | "reports" | "viewer" }) {
  const db = await requireDb();
  await db.update(users).set({ role: input.role }).where(eq(users.id, input.id));
  const rows = await db.select({ id: users.id, openId: users.openId, name: users.name, email: users.email, role: users.role, lastSignedIn: users.lastSignedIn, createdAt: users.createdAt }).from(users).where(eq(users.id, input.id)).limit(1);
  if (!rows[0]) throw new InventoryError("NOT_FOUND", "المستخدم غير موجود");
  return rows[0];
}

type BackupAssetReference = {
  type: "item_image" | "addition_document" | "disbursement_document" | "transfer_document" | "chat_attachment";
  table: string;
  rowId: number | null;
  key: string | null;
  url: string | null;
};

export function collectBackupAssetReferences(tables: Record<string, unknown>): BackupAssetReference[] {
  const sources = [
    { table: "items", type: "item_image" as const, key: "imageKey", url: "imageUrl" },
    { table: "additions", type: "addition_document" as const, key: "documentImageKey", url: "documentImageUrl" },
    { table: "disbursements", type: "disbursement_document" as const, key: "documentImageKey", url: "documentImageUrl" },
    { table: "transfers", type: "transfer_document" as const, key: "documentImageKey", url: "documentImageUrl" },
    { table: "chatMessages", type: "chat_attachment" as const, key: "attachmentKey", url: "attachmentUrl" },
  ];
  const references = new Map<string, BackupAssetReference>();

  for (const source of sources) {
    const rows = tables[source.table];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const value = row as Record<string, unknown>;
      const keyValue = value[source.key];
      const urlValue = value[source.url];
      const key = typeof keyValue === "string" && keyValue ? keyValue : null;
      const url = typeof urlValue === "string" && urlValue ? urlValue : null;
      if (!key && !url) continue;
      const rowId = typeof value.id === "number" ? value.id : null;
      const reference: BackupAssetReference = { type: source.type, table: source.table, rowId, key, url };
      references.set(`${reference.table}:${reference.rowId ?? "unknown"}:${reference.key ?? reference.url}`, reference);
    }
  }

  return Array.from(references.values());
}

export async function exportBackupSnapshot() {
  const db = await requireDb();
  const [usersRows, warehouseRows, supplierRows, customerRows, itemRows, itemWarehouseBalanceRows, additionRows, disbursementRows, transferRows, settingsRows, preferenceRows, permissionRows, auditRows, loginRows, securityNotificationRows, notificationRows, chatConversationRows, chatMemberRows, chatMessageRows, chatReceiptRows, revokedSessionRows] = await Promise.all([
    db.select().from(users), db.select().from(warehouses), db.select().from(suppliers), db.select().from(customers), db.select().from(items), db.select().from(itemWarehouseBalances), db.select().from(additions), db.select().from(disbursements), db.select().from(transfers), db.select().from(settings), db.select().from(userPreferences), db.select().from(userPermissions), db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(5000), db.select().from(loginAuditLogs).orderBy(desc(loginAuditLogs.loggedInAt)).limit(5000), db.select().from(securityNotifications).orderBy(desc(securityNotifications.createdAt)).limit(5000), db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(5000), db.select().from(chatConversations), db.select().from(chatMembers), db.select().from(chatMessages), db.select().from(chatMessageReceipts), db.select().from(revokedSessions).orderBy(desc(revokedSessions.revokedAt)).limit(5000),
  ]);
  const tables = { users: usersRows, warehouses: warehouseRows, suppliers: supplierRows, customers: customerRows, items: itemRows, itemWarehouseBalances: itemWarehouseBalanceRows, additions: additionRows, disbursements: disbursementRows, transfers: transferRows, settings: settingsRows, userPreferences: preferenceRows, userPermissions: permissionRows, auditLogs: auditRows, loginAuditLogs: loginRows, securityNotifications: securityNotificationRows, notifications: notificationRows, chatConversations: chatConversationRows, chatMembers: chatMemberRows, chatMessages: chatMessageRows, chatMessageReceipts: chatReceiptRows, revokedSessions: revokedSessionRows };
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), tables, assets: collectBackupAssetReferences(tables) };
}

export async function createBackupRecord(input: { userId?: number; userName?: string | null; backupType?: string }) {
  const snapshot = await exportBackupSnapshot();
  const payload = JSON.stringify(snapshot);
  const payloadSha256 = createHash("sha256").update(payload, "utf8").digest("hex");
  const fileName = `smart-inventory-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const uploaded = await storagePut(`smart-inventory/backups/${fileName}`, Buffer.from(payload, "utf8"), "application/json");
  const db = await requireDb();
  const summary = { items: snapshot.tables.items.length, additions: snapshot.tables.additions.length, disbursements: snapshot.tables.disbursements.length, transfers: snapshot.tables.transfers.length, suppliers: snapshot.tables.suppliers.length, customers: snapshot.tables.customers.length, assets: snapshot.assets.length, payloadSha256 };
  const result = await db.insert(backupRecords).values({ fileKey: uploaded.key, fileUrl: uploaded.url, fileName, fileSize: Buffer.byteLength(payload), backupType: input.backupType ?? "manual", summary: JSON.stringify(summary), createdBy: input.userId ?? null, createdByName: input.userName ?? null });
  const id = resultInsertId(result);
  await cleanupExpiredBackupRecords({ retentionDays: 30 });
  return { record: { id, fileKey: uploaded.key, fileUrl: uploaded.url, fileName, fileSize: Buffer.byteLength(payload), backupType: input.backupType ?? "manual", summary: JSON.stringify(summary), createdBy: input.userId ?? null, createdByName: input.userName ?? null }, snapshot };
}

export async function listBackupRecords(limit = 100) {
  const db = await requireDb();
  return db.select().from(backupRecords).orderBy(desc(backupRecords.createdAt)).limit(Math.min(100, Math.max(1, limit)));
}

export function getExpiredBackupRecordIds(records: Array<{ id: number; createdAt: Date }>, retentionDays = 30, now = new Date()) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new InventoryError("BAD_REQUEST", "مدة الاحتفاظ بالنسخ غير صالحة");
  if (records.length < 2) return [];
  const latest = records.reduce((newest, record) => record.createdAt > newest.createdAt ? record : newest);
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  return records.filter(record => record.id !== latest.id && record.createdAt < cutoff).map(record => record.id);
}

export async function cleanupExpiredBackupRecords(input: { retentionDays?: number; dryRun?: boolean } = {}) {
  const db = await requireDb();
  const retentionDays = input.retentionDays ?? 30;
  const records = await db.select({ id: backupRecords.id, createdAt: backupRecords.createdAt }).from(backupRecords).orderBy(desc(backupRecords.createdAt));
  const expiredIds = getExpiredBackupRecordIds(records, retentionDays);
  if (!input.dryRun && expiredIds.length > 0) await db.delete(backupRecords).where(inArray(backupRecords.id, expiredIds));
  return { retentionDays, expiredIds, deleted: input.dryRun ? 0 : expiredIds.length, keptLatest: records.length ? records[0].id : null };
}

type BackupVerificationRunType = "manual" | "scheduled";

function backupVerificationSucceeded(result: any) {
  return result?.dryRun === true
    && result?.validation?.isValid === true
    && Array.isArray(result?.coverage?.skippedBackupTables)
    && result.coverage.skippedBackupTables.length === 0;
}

async function updateBackupVerificationStatus(input: { runId: number; status: "passed" | "failed" | "skipped"; completedAt: Date; backupRecordId?: number | null; attemptedRows?: unknown; coverage?: unknown; validation?: unknown; errorMessage?: string | null }) {
  const db = await requireDb();
  await db.update(backupVerificationRuns).set({
    status: input.status,
    completedAt: input.completedAt,
    attemptedRows: input.attemptedRows ? JSON.stringify(input.attemptedRows) : null,
    coverage: input.coverage ? JSON.stringify(input.coverage) : null,
    validation: input.validation ? JSON.stringify(input.validation) : null,
    errorMessage: input.errorMessage ?? null,
  }).where(eq(backupVerificationRuns.id, input.runId));
  const config = (await db.select().from(backupVerificationConfigs).limit(1))[0];
  if (config) {
    await db.update(backupVerificationConfigs).set({ lastRunId: input.runId, lastRunAt: input.completedAt, lastStatus: input.status }).where(eq(backupVerificationConfigs.id, config.id));
  }
}

export function buildBackupVerificationFailureNotification(input: { backupRecordId: number; message: string }) {
  return {
    notificationType: "backup_verification_failed" as const,
    title: "فشل اختبار استعادة النسخة الاحتياطية",
    message: `فشل الاختبار الآمن للنسخة #${input.backupRecordId}. ${input.message}`.slice(0, 5000),
    priority: "critical" as const,
    link: "/governance?tab=backup-center",
  };
}

export function buildScheduledBackupFailureEmail(input: { backupRecordId: number; failedAt: Date; message: string }) {
  const failedAt = input.failedAt.toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "medium" });
  const message = input.message.replace(/[<>&"']/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
  return {
    subject: "تنبيه حرج: فشل اختبار الاستعادة الدوري — Smart Inventory",
    html: `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#102a43"><div style="max-width:680px;margin:0 auto;padding:24px"><div style="background:#b91c1c;color:#fff;padding:24px;border-radius:16px"><div style="font-size:11px;letter-spacing:2px;color:#fee2e2">SMART INVENTORY</div><h1 style="margin:10px 0 0;font-size:22px">فشل اختبار الاستعادة الدوري</h1></div><div style="background:#fff;margin-top:16px;padding:22px;border-radius:16px"><p style="margin-top:0">لم يكتمل اختبار الاستعادة المجدول، ولم تُسجّل أي تغييرات دائمة على بيانات الإنتاج.</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:10px;background:#f8fafc;font-weight:700">وقت الفشل</td><td style="padding:10px">${failedAt}</td></tr><tr><td style="padding:10px;background:#f8fafc;font-weight:700">رقم النسخة</td><td style="padding:10px">#${input.backupRecordId}</td></tr><tr><td style="padding:10px;background:#f8fafc;font-weight:700">السبب</td><td style="padding:10px">${message}</td></tr></table><p style="margin:18px 0 0;color:#475569">يرجى مراجعة مركز النسخ الاحتياطي في Smart Inventory للتفاصيل وسجل الاختبارات.</p></div></div></body></html>`,
  };
}

async function notifyBackupVerificationFailure(input: { backupRecordId: number; message: string; failedAt: Date; scheduled?: boolean }) {
  try {
    const db = await requireDb();
    const administrators = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
    if (administrators.length === 0) return { notified: 0 };
    const notification = buildBackupVerificationFailureNotification(input);
    await Promise.all(administrators.map(administrator => db.insert(notifications).values({
      recipientUserId: administrator.id,
      createdBy: null,
      ...notification,
    })));
    if (input.scheduled) {
      const configuredOwner = ENV.ownerOpenId
        ? (await db.select({ email: users.email }).from(users).where(and(eq(users.openId, ENV.ownerOpenId), eq(users.role, "admin"))).limit(1))[0]
        : undefined;
      const fallbackAdministrator = configuredOwner?.email ? undefined : (await db.select({ email: users.email }).from(users).where(and(eq(users.role, "admin"), not(isNull(users.email)))).limit(1))[0];
      const recipient = configuredOwner?.email || fallbackAdministrator?.email;
      if (recipient) {
        const email = buildScheduledBackupFailureEmail(input);
        const sent = await sendConfiguredEmail({ ...email, recipients: [recipient] });
        if (!sent) console.warn("[BackupVerification] SMTP is not configured; scheduled failure email was not sent");
      } else {
        console.warn("[BackupVerification] No administrator email is available for scheduled failure email");
      }
    }
    return { notified: administrators.length };
  } catch (error) {
    console.error("[BackupVerification] Failed to notify administrators", error);
    return { notified: 0 };
  }
}

export function buildBackupEmailTestMessage(sentAt: Date) {
  const time = sentAt.toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "medium" });
  return {
    subject: "اختبار إعداد البريد — Smart Inventory",
    html: `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#102a43"><div style="max-width:680px;margin:0 auto;padding:24px"><div style="background:#0d7180;color:#fff;padding:24px;border-radius:16px"><div style="font-size:11px;letter-spacing:2px;color:#dceff2">SMART INVENTORY</div><h1 style="margin:10px 0 0;font-size:22px">نجح اختبار إعداد البريد</h1></div><div style="background:#fff;margin-top:16px;padding:22px;border-radius:16px"><p style="margin-top:0">هذه رسالة اختبار يدوية للتأكد من أن Smart Inventory يستطيع إرسال التنبيهات إلى المدير.</p><p><b>وقت الإرسال:</b> ${time}</p><p style="margin:18px 0 0;color:#475569">عند وصول هذه الرسالة، سيصل تنبيه بريد فوري أيضًا إذا فشل اختبار الاستعادة الدوري.</p></div></div></body></html>`,
  };
}

export async function sendBackupEmailTest() {
  const db = await requireDb();
  const configuredOwner = ENV.ownerOpenId
    ? (await db.select({ email: users.email }).from(users).where(and(eq(users.openId, ENV.ownerOpenId), eq(users.role, "admin"))).limit(1))[0]
    : undefined;
  const fallbackAdministrator = configuredOwner?.email ? undefined : (await db.select({ email: users.email }).from(users).where(and(eq(users.role, "admin"), not(isNull(users.email)))).limit(1))[0];
  const recipient = configuredOwner?.email || fallbackAdministrator?.email;
  if (!recipient) throw new InventoryError("UNAVAILABLE", "لم يتم العثور على بريد إلكتروني للمسؤول");
  const message = buildBackupEmailTestMessage(new Date());
  const sent = await sendConfiguredEmail({ ...message, recipients: [recipient] });
  if (!sent) throw new InventoryError("UNAVAILABLE", "إعدادات SMTP غير مكتملة ولا يمكن إرسال بريد الاختبار");
  return { sent: true, recipient };
}

export async function runLatestBackupVerification(runType: BackupVerificationRunType) {
  const db = await requireDb();
  const latestBackup = (await db.select().from(backupRecords).orderBy(desc(backupRecords.createdAt)).limit(1))[0];
  const startedAt = new Date();
  const runId = resultInsertId(await db.insert(backupVerificationRuns).values({
    backupRecordId: latestBackup?.id ?? null,
    runType,
    status: "running",
    sampleRowsPerTable: 3,
    startedAt,
  }));

  if (!latestBackup) {
    const completedAt = new Date();
    await updateBackupVerificationStatus({ runId, status: "skipped", completedAt, errorMessage: "لا توجد نسخة احتياطية متاحة لاختبارها" });
    return { runId, status: "skipped" as const, message: "لا توجد نسخة احتياطية متاحة لاختبارها" };
  }

  try {
    const { snapshot } = await getBackupSnapshotFromRecord(latestBackup.id);
    const result = await restoreBackupSnapshot(snapshot, { dryRun: true, maxRowsPerTable: 3 });
    const status = backupVerificationSucceeded(result) ? "passed" as const : "failed" as const;
    const completedAt = new Date();
    await updateBackupVerificationStatus({
      runId,
      status,
      completedAt,
      backupRecordId: latestBackup.id,
      attemptedRows: result.attemptedRows,
      coverage: result.coverage,
      validation: result.validation,
      errorMessage: status === "failed" ? "لم يكتمل التحقق الآمن للنسخة الاحتياطية" : null,
    });
    if (status === "failed") await notifyBackupVerificationFailure({ backupRecordId: latestBackup.id, message: "لم يكتمل التحقق الآمن للنسخة الاحتياطية", failedAt: completedAt, scheduled: runType === "scheduled" });
    return { runId, status, backupRecordId: latestBackup.id, result };
  } catch (error: any) {
    const completedAt = new Date();
    const errorMessage = error?.message || "تعذر تنفيذ اختبار الاستعادة الآمن";
    await updateBackupVerificationStatus({ runId, status: "failed", completedAt, backupRecordId: latestBackup.id, errorMessage });
    await notifyBackupVerificationFailure({ backupRecordId: latestBackup.id, message: errorMessage, failedAt: completedAt, scheduled: runType === "scheduled" });
    throw new InventoryError("UNAVAILABLE", errorMessage);
  }
}

export async function listBackupVerificationRuns(limit = 30) {
  const db = await requireDb();
  return db.select().from(backupVerificationRuns).orderBy(desc(backupVerificationRuns.startedAt)).limit(Math.min(100, Math.max(1, limit)));
}

export async function getBackupVerificationConfig() {
  const db = await requireDb();
  return (await db.select().from(backupVerificationConfigs).limit(1))[0] ?? null;
}

export async function isBackupVerificationScheduleTask(taskUid: string) {
  const db = await requireDb();
  const config = (await db.select().from(backupVerificationConfigs).where(eq(backupVerificationConfigs.scheduleCronTaskUid, taskUid)).limit(1))[0];
  return Boolean(config?.isEnabled);
}

export async function saveBackupVerificationSchedule(input: { taskUid: string; cronExpression: string; nextExecutionAt?: Date | null; enabled: boolean }) {
  const db = await requireDb();
  const existing = (await db.select().from(backupVerificationConfigs).limit(1))[0];
  if (existing) {
    await db.update(backupVerificationConfigs).set({ scheduleCronTaskUid: input.taskUid, cronExpression: input.cronExpression, nextExecutionAt: input.nextExecutionAt ?? null, isEnabled: input.enabled }).where(eq(backupVerificationConfigs.id, existing.id));
    return { ...existing, scheduleCronTaskUid: input.taskUid, cronExpression: input.cronExpression, nextExecutionAt: input.nextExecutionAt ?? null, isEnabled: input.enabled };
  }
  const id = resultInsertId(await db.insert(backupVerificationConfigs).values({ scheduleCronTaskUid: input.taskUid, cronExpression: input.cronExpression, nextExecutionAt: input.nextExecutionAt ?? null, isEnabled: input.enabled }));
  return (await db.select().from(backupVerificationConfigs).where(eq(backupVerificationConfigs.id, id)).limit(1))[0];
}

export function getNextWeeklyBackupExecution(from = new Date()) {
  const next = new Date(from);
  next.setUTCHours(2, 0, 0, 0);
  const daysUntilSunday = (7 - next.getUTCDay()) % 7;
  next.setUTCDate(next.getUTCDate() + daysUntilSunday);
  if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 7);
  return next;
}

export async function runScheduledBackupVerification() {
  await requireDb();
  if (!_pool) throw new InventoryError("UNAVAILABLE", "اتصال قاعدة البيانات غير متاح");
  const [rows] = await _pool.query("SELECT GET_LOCK('smart_inventory_backup_verification', 0) AS acquired") as any;
  if (Number(rows?.[0]?.acquired ?? 0) !== 1) return { status: "skipped" as const, message: "يوجد اختبار نسخ احتياطي قيد التنفيذ بالفعل" };
  try {
    const backup = await createBackupRecord({ backupType: "scheduled" });
    const result = await runIsolatedFullBackupRestore();
    return { ...result, backupRecordId: backup.record.id };
  } finally {
    await _pool.query("SELECT RELEASE_LOCK('smart_inventory_backup_verification')");
  }
}

export async function runDueLocalBackupVerification() {
  const config = await getBackupVerificationConfig();
  if (!config?.isEnabled || !config.nextExecutionAt || config.nextExecutionAt.getTime() > Date.now()) return { ran: false };
  const db = await requireDb();
  try {
    const result = await runScheduledBackupVerification();
    return { ran: true, result };
  } finally {
    await db.update(backupVerificationConfigs).set({ nextExecutionAt: getNextWeeklyBackupExecution() }).where(eq(backupVerificationConfigs.id, config.id));
  }
}

export async function getBackupSnapshotFromRecord(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(backupRecords).where(eq(backupRecords.id, id)).limit(1);
  const record = rows[0];
  if (!record) throw new InventoryError("NOT_FOUND", "النسخة الاحتياطية غير موجودة");
  const signedUrl = await storageGetSignedUrl(record.fileKey);
  const response = await fetch(signedUrl);
  if (!response.ok) throw new InventoryError("UNAVAILABLE", "تعذر قراءة ملف النسخة الاحتياطية");
  const snapshot = await response.json();
  let expectedSha256: unknown = null;
  try { expectedSha256 = record.summary ? JSON.parse(record.summary).payloadSha256 : null; } catch { expectedSha256 = null; }
  if (typeof expectedSha256 === "string") {
    const actualSha256 = createHash("sha256").update(JSON.stringify(snapshot), "utf8").digest("hex");
    if (actualSha256 !== expectedSha256) throw new InventoryError("CONFLICT", "فشل التحقق من سلامة ملف النسخة الاحتياطية");
  }
  return { record, snapshot };
}

export async function resetOperationalData(input: { userId?: number; userName?: string | null } = {}) {
  const db = await requireDb();
  const saved = await createBackupRecord({ userId: input.userId, userName: input.userName, backupType: "pre_reset" });
  const snapshot = saved.snapshot;
  const counts = {
    additions: (snapshot.tables.additions ?? []).length,
    disbursements: (snapshot.tables.disbursements ?? []).length,
    transfers: (snapshot.tables.transfers ?? []).length,
    items: (snapshot.tables.items ?? []).length,
    suppliers: (snapshot.tables.suppliers ?? []).length,
    customers: (snapshot.tables.customers ?? []).length,
  };

  await db.transaction(async (tx: any) => {
    await tx.delete(additions);
    await tx.delete(disbursements);
    await tx.delete(transfers);
    await tx.delete(items);
    await tx.delete(suppliers);
    await tx.delete(customers);
  });

  return { snapshot, counts };
}

const RESTORABLE_BACKUP_TABLES = ["users", "warehouses", "suppliers", "customers", "items", "itemWarehouseBalances", "additions", "disbursements", "transfers", "settings", "userPreferences", "userPermissions", "auditLogs", "loginAuditLogs", "securityNotifications", "notifications", "chatConversations", "chatMembers", "chatMessages", "chatMessageReceipts", "revokedSessions"] as const;

const BACKUP_TIMESTAMP_FIELDS: Record<typeof RESTORABLE_BACKUP_TABLES[number], readonly string[]> = {
  users: ["createdAt", "updatedAt", "lastSignedIn"],
  warehouses: ["createdAt", "updatedAt"],
  suppliers: ["createdAt", "updatedAt"],
  customers: ["createdAt", "updatedAt"],
  items: ["createdAt", "updatedAt"],
  itemWarehouseBalances: ["createdAt", "updatedAt"],
  additions: ["createdAt"],
  disbursements: ["createdAt"],
  transfers: ["createdAt"],
  settings: ["updatedAt"],
  userPreferences: ["updatedAt"],
  userPermissions: ["updatedAt"],
  auditLogs: ["createdAt"],
  loginAuditLogs: ["loggedInAt"],
  securityNotifications: ["createdAt"],
  notifications: ["readAt", "createdAt"],
  chatConversations: ["createdAt", "updatedAt"],
  chatMembers: ["lastReadAt", "joinedAt"],
  chatMessages: ["createdAt", "updatedAt"],
  chatMessageReceipts: ["deliveredAt", "readAt"],
  revokedSessions: ["revokedAt"],
};

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function normalizeBackupRow(tableName: typeof RESTORABLE_BACKUP_TABLES[number], row: Record<string, unknown>) {
  const normalized = { ...row };
  for (const field of BACKUP_TIMESTAMP_FIELDS[tableName]) {
    const value = normalized[field];
    if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) normalized[field] = parsed;
  }
  return normalized;
}

export function validateBackupSnapshot(snapshot: any) {
  const tables = snapshot?.tables ?? {};
  const malformedTables: string[] = [];
  const missingRestorableTables: string[] = [];
  const invalidTimestampFields: Array<{ table: string; field: string; count: number }> = [];
  const rowCounts: Record<string, number> = {};

  for (const tableName of RESTORABLE_BACKUP_TABLES) {
    const rows = tables[tableName];
    if (rows === undefined) {
      missingRestorableTables.push(tableName);
      continue;
    }
    if (!Array.isArray(rows)) {
      malformedTables.push(tableName);
      continue;
    }
    rowCounts[tableName] = rows.length;
    for (const field of BACKUP_TIMESTAMP_FIELDS[tableName]) {
      const invalidCount = rows.filter((row: unknown) => {
        if (!row || typeof row !== "object") return false;
        const value = (row as Record<string, unknown>)[field];
        return value !== null && value !== undefined && !(value instanceof Date) && (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value) || Number.isNaN(new Date(value).getTime()));
      }).length;
      if (invalidCount > 0) invalidTimestampFields.push({ table: tableName, field, count: invalidCount });
    }
  }

  return {
    isValid: malformedTables.length === 0 && invalidTimestampFields.length === 0,
    malformedTables,
    missingRestorableTables,
    invalidTimestampFields,
    rowCounts,
  };
}

export function getBackupRestoreCoverage(snapshot: any) {
  const backupTables = Object.keys(snapshot?.tables ?? {});
  const restoredTables = RESTORABLE_BACKUP_TABLES.filter(table => Object.prototype.hasOwnProperty.call(snapshot?.tables ?? {}, table));
  return {
    backupTables,
    restoredTables,
    skippedBackupTables: backupTables.filter(table => !RESTORABLE_BACKUP_TABLES.includes(table as typeof RESTORABLE_BACKUP_TABLES[number])),
  };
}

class BackupDryRunRollback extends Error {
  constructor(readonly report: Record<string, unknown>) {
    super("backup-dry-run-rollback");
  }
}

async function restoreBackupSnapshotIntoDatabase(db: any, snapshot: any, options: { dryRun?: boolean; maxRowsPerTable?: number; insertOnly?: boolean; batchSize?: number } = {}) {
  if (!snapshot || snapshot.schemaVersion !== 1 || !snapshot.tables) throw new InventoryError("BAD_REQUEST", "ملف النسخة الاحتياطية غير صالح أو غير مدعوم");
  if (options.maxRowsPerTable !== undefined && (!Number.isInteger(options.maxRowsPerTable) || options.maxRowsPerTable < 1)) throw new InventoryError("BAD_REQUEST", "حجم عينة الاستعادة يجب أن يكون عددًا صحيحًا موجبًا");
  const tables = snapshot.tables;
  const coverage = getBackupRestoreCoverage(snapshot);
  const validation = validateBackupSnapshot(snapshot);
  if (!validation.isValid) throw new InventoryError("BAD_REQUEST", "ملف النسخة الاحتياطية يحتوي على بنية جداول أو حقول توقيت غير صالحة");
  const attemptedRows: Record<string, number> = {};
  try {
    await db.transaction(async (tx: any) => {
      const merge = async (name: typeof RESTORABLE_BACKUP_TABLES[number], table: any, rows: unknown[]) => {
        const validRows = (rows ?? []).filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
        const sampleRows = options.maxRowsPerTable === undefined ? validRows : validRows.slice(0, options.maxRowsPerTable);
        attemptedRows[name] = sampleRows.length;
        if (options.insertOnly) {
          const batchSize = Math.max(1, options.batchSize ?? 100);
          for (let index = 0; index < sampleRows.length; index += batchSize) {
            const batch = sampleRows.slice(index, index + batchSize).map(row => normalizeBackupRow(name, row));
            await tx.insert(table).values(batch as any);
          }
          return;
        }
        for (const row of sampleRows) {
          const normalizedRow = normalizeBackupRow(name, row);
          await tx.insert(table).values(normalizedRow as any).onDuplicateKeyUpdate({ set: normalizedRow as any });
        }
      };
      await merge("users", users, tables.users); await merge("warehouses", warehouses, tables.warehouses); await merge("suppliers", suppliers, tables.suppliers); await merge("customers", customers, tables.customers); await merge("items", items, tables.items); await merge("itemWarehouseBalances", itemWarehouseBalances, tables.itemWarehouseBalances); await merge("additions", additions, tables.additions); await merge("disbursements", disbursements, tables.disbursements); await merge("transfers", transfers, tables.transfers); await merge("settings", settings, tables.settings); await merge("userPreferences", userPreferences, tables.userPreferences); await merge("userPermissions", userPermissions, tables.userPermissions); await merge("auditLogs", auditLogs, tables.auditLogs); await merge("loginAuditLogs", loginAuditLogs, tables.loginAuditLogs); await merge("securityNotifications", securityNotifications, tables.securityNotifications); await merge("notifications", notifications, tables.notifications); await merge("chatConversations", chatConversations, tables.chatConversations); await merge("chatMembers", chatMembers, tables.chatMembers); await merge("chatMessages", chatMessages, tables.chatMessages); await merge("chatMessageReceipts", chatMessageReceipts, tables.chatMessageReceipts); await merge("revokedSessions", revokedSessions, tables.revokedSessions);
      if (options.dryRun) throw new BackupDryRunRollback({ coverage, validation, attemptedRows, maxRowsPerTable: options.maxRowsPerTable ?? null });
    });
  } catch (error) {
    if (error instanceof BackupDryRunRollback) return { restored: false, dryRun: true, ...error.report };
    throw error;
  }
  return { restored: true, dryRun: false, coverage, validation, attemptedRows, maxRowsPerTable: options.maxRowsPerTable ?? null };
}

export async function restoreBackupSnapshot(snapshot: any, options: { dryRun?: boolean; maxRowsPerTable?: number } = {}) {
  return restoreBackupSnapshotIntoDatabase(await requireDb(), snapshot, options);
}

const RESTORE_TEST_DATABASE_SUFFIX = "_restore_test";
const BACKUP_SQL_TABLE_NAMES: Record<typeof RESTORABLE_BACKUP_TABLES[number], string> = {
  users: "users",
  warehouses: "warehouses",
  suppliers: "suppliers",
  customers: "customers",
  items: "items",
  itemWarehouseBalances: "item_warehouse_balances",
  additions: "additions",
  disbursements: "disbursements",
  transfers: "transfers",
  settings: "settings",
  userPreferences: "user_preferences",
  userPermissions: "user_permissions",
  auditLogs: "audit_logs",
  loginAuditLogs: "login_audit_logs",
  securityNotifications: "security_notifications",
  notifications: "notifications",
  chatConversations: "chat_conversations",
  chatMembers: "chat_members",
  chatMessages: "chat_messages",
  chatMessageReceipts: "chat_message_receipts",
  revokedSessions: "revoked_sessions",
};

export function getRestoreTestDatabaseName(sourceDatabase: string) {
  const source = sourceDatabase.trim();
  if (!/^[A-Za-z0-9_]+$/.test(source)) throw new InventoryError("BAD_REQUEST", "اسم قاعدة بيانات الإنتاج غير صالح لإنشاء قاعدة اختبار");
  return `${source}${RESTORE_TEST_DATABASE_SUFFIX}`;
}

function safeDatabaseIdentifier(name: string) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new InventoryError("BAD_REQUEST", "اسم قاعدة بيانات الاختبار غير صالح");
  return `\`${name}\``;
}

function getDatabaseConnectionOptions(database?: string) {
  if (!ENV.databaseUrl) throw new InventoryError("UNAVAILABLE", "رابط قاعدة البيانات غير مهيأ");
  const url = new URL(ENV.databaseUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ssl: ENV.databaseSsl ? { ...ENV.databaseSsl, servername: url.hostname } : undefined,
    multipleStatements: true,
  };
}

async function createIsolatedRestoreDatabase(databaseName: string) {
  const sourceUrl = new URL(ENV.databaseUrl!);
  const ipv4 = await dns.lookup(sourceUrl.hostname, { family: 4 });
  const admin = await mysql.createConnection({ ...getDatabaseConnectionOptions(), host: ipv4.address });
  const identifier = safeDatabaseIdentifier(databaseName);
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${identifier}`);
    await admin.query(`CREATE DATABASE ${identifier}`);
  } finally {
    await admin.end();
  }
  const pool = mysql.createPool({ ...getDatabaseConnectionOptions(databaseName), host: ipv4.address, connectionLimit: 2 });
  const migrationDirectory = path.resolve(process.cwd(), "drizzle");
  const migrationFiles = (await fs.readdir(migrationDirectory)).filter(file => /^\d+_.*\.sql$/.test(file)).sort();
  if (!migrationFiles.length) {
    await pool.end();
    throw new InventoryError("UNAVAILABLE", "لم يتم العثور على migrations لإنشاء قاعدة الاستعادة");
  }
  try {
    for (const file of migrationFiles) {
      const sqlText = await fs.readFile(path.join(migrationDirectory, file), "utf8");
      for (const statement of sqlText.split(/--> statement-breakpoint\s*/).map(part => part.trim()).filter(Boolean)) await pool.query(statement);
    }
  } catch (error) {
    await pool.end();
    const cleanup = await mysql.createConnection({ ...getDatabaseConnectionOptions(), host: ipv4.address });
    try { await cleanup.query(`DROP DATABASE IF EXISTS ${identifier}`); } finally { await cleanup.end(); }
    throw error;
  }
  return { db: drizzle(pool) as any, pool };
}

export async function runIsolatedFullBackupRestore() {
  const db = await requireDb();
  const latestBackup = (await db.select().from(backupRecords).orderBy(desc(backupRecords.createdAt)).limit(1))[0];
  const startedAt = new Date();
  const runId = resultInsertId(await db.insert(backupVerificationRuns).values({ backupRecordId: latestBackup?.id ?? null, runType: "isolated_full", status: "running", sampleRowsPerTable: 0, startedAt }));
  if (!latestBackup) {
    const completedAt = new Date();
    await updateBackupVerificationStatus({ runId, status: "skipped", completedAt, errorMessage: "لا توجد نسخة احتياطية متاحة لاختبارها" });
    return { runId, status: "skipped" as const, message: "لا توجد نسخة احتياطية متاحة لاختبارها" };
  }

  try {
    const { snapshot } = await getBackupSnapshotFromRecord(latestBackup.id);
    if (!ENV.databaseUrl) throw new InventoryError("UNAVAILABLE", "رابط قاعدة البيانات غير مهيأ لاختبار الاستعادة");
    const sourceDatabase = decodeURIComponent(new URL(ENV.databaseUrl).pathname.replace(/^\//, ""));
    const testDatabase = getRestoreTestDatabaseName(sourceDatabase);
    const isolated = await createIsolatedRestoreDatabase(testDatabase);
    let result: any;
    let restoredTableCounts: Record<string, number> = {};
    try {
      result = await restoreBackupSnapshotIntoDatabase(isolated.db, snapshot);
      const restoreTables: Record<string, any> = { users, warehouses, suppliers, customers, items, itemWarehouseBalances, additions, disbursements, transfers, settings, userPreferences, userPermissions, auditLogs, loginAuditLogs, securityNotifications, notifications, chatConversations, chatMembers, chatMessages, chatMessageReceipts, revokedSessions };
      for (const tableName of RESTORABLE_BACKUP_TABLES) {
        const rows = await isolated.db.select({ total: count() }).from(restoreTables[tableName]);
        restoredTableCounts[tableName] = Number(rows[0]?.total ?? 0);
      }
    } finally {
      await isolated.pool.end();
      const sourceUrl = new URL(ENV.databaseUrl);
      const ipv4 = await dns.lookup(sourceUrl.hostname, { family: 4 });
      const admin = await mysql.createConnection({ ...getDatabaseConnectionOptions(), host: ipv4.address });
      try { await admin.query(`DROP DATABASE IF EXISTS ${safeDatabaseIdentifier(testDatabase)}`); } finally { await admin.end(); }
    }
    const expectedTableCounts = result.validation?.rowCounts ?? validateBackupSnapshot(snapshot).rowCounts;
    const mismatches = Object.entries(expectedTableCounts).filter(([tableName, expected]) => restoredTableCounts[tableName] !== expected).map(([tableName, expected]) => ({ tableName, expected, actual: restoredTableCounts[tableName] ?? 0 }));
    const status = mismatches.length === 0 && result.validation?.isValid === true ? "passed" as const : "failed" as const;
    const completedAt = new Date();
    const errorMessage = status === "failed" ? "فشلت مطابقة صفوف النسخة أثناء الاستعادة الكاملة الآمنة" : null;
    await updateBackupVerificationStatus({ runId, status, completedAt, backupRecordId: latestBackup.id, attemptedRows: restoredTableCounts, coverage: { ...result.coverage, restoredTableCounts, mismatches, restoreMode: "isolated_database" }, validation: result.validation, errorMessage });
    if (status === "failed") await notifyBackupVerificationFailure({ backupRecordId: latestBackup.id, message: errorMessage!, failedAt: completedAt });
    return { runId, status, backupRecordId: latestBackup.id, restoredTableCounts, expectedTableCounts, mismatches, testDatabase };
  } catch (error: any) {
    const completedAt = new Date();
    const errorMessage = error?.message || "تعذرت الاستعادة الكاملة في قاعدة الاختبار المعزولة";
    await updateBackupVerificationStatus({ runId, status: "failed", completedAt, backupRecordId: latestBackup.id, errorMessage });
    await notifyBackupVerificationFailure({ backupRecordId: latestBackup.id, message: errorMessage, failedAt: completedAt });
    throw new InventoryError("UNAVAILABLE", errorMessage);
  }
}

export const PERMISSION_SCREENS = ["dashboard", "inventory", "additions", "disbursements", "transfers", "suppliers", "customers", "reports", "alerts", "chat", "stock-adjustments", "settings"] as const;
export const PERMISSION_REPORTS = ["inventory-summary", "movement-reports", "item-card", "supplier-account", "customer-account", "adjustments", "warehouse-financial-details", "item-create", "item-create-disabled"] as const;
const OPERATIONAL_REPORTS = PERMISSION_REPORTS.filter(report => report !== "warehouse-financial-details");
const READ_ONLY_DEFAULT_SCREENS = ["dashboard", "inventory", "reports", "alerts", "chat"];
const READ_ONLY_DEFAULT_REPORTS = ["inventory-summary", "movement-reports", "item-card", "supplier-account", "customer-account"];

function parsePermissionList(value: string | null | undefined, fallback: readonly string[]) {
  try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") : [...fallback]; } catch { return [...fallback]; }
}
function parseWarehouseIds(value: string | null | undefined) {
  try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed.filter(item => Number.isInteger(item) && item > 0) as number[] : []; } catch { return []; }
}

export async function getUserPermissionSettings(userId: number, role: string) {
  const db = await requireDb();
  const rows = await db.select().from(userPermissions).where(eq(userPermissions.userId, userId)).limit(1);
  if (rows[0]) return { userId, allowedScreens: parsePermissionList(rows[0].allowedScreens, READ_ONLY_DEFAULT_SCREENS), allowedReports: parsePermissionList(rows[0].allowedReports, READ_ONLY_DEFAULT_REPORTS), allowedWarehouseIds: parseWarehouseIds(rows[0].allowedWarehouses), readOnly: rows[0].readOnly };
  const isReadOnly = ["viewer", "reviewer", "reports"].includes(role);
  return { userId, allowedScreens: isReadOnly ? READ_ONLY_DEFAULT_SCREENS : [...PERMISSION_SCREENS], allowedReports: isReadOnly ? READ_ONLY_DEFAULT_REPORTS : role === "admin" ? [...PERMISSION_REPORTS] : [...OPERATIONAL_REPORTS], allowedWarehouseIds: [], readOnly: isReadOnly };
}

export async function listManagedUserPermissions() {
  const db = await requireDb();
  return db.select({ userId: userPermissions.userId, allowedScreens: userPermissions.allowedScreens, allowedReports: userPermissions.allowedReports, allowedWarehouseIds: userPermissions.allowedWarehouses, readOnly: userPermissions.readOnly }).from(userPermissions);
}

export async function upsertUserPermissionSettings(input: { userId: number; allowedScreens: string[]; allowedReports: string[]; allowedWarehouseIds: number[]; readOnly: boolean }) {
  const db = await requireDb();
  await db.insert(userPermissions).values({ userId: input.userId, allowedScreens: JSON.stringify(input.allowedScreens), allowedReports: JSON.stringify(input.allowedReports), allowedWarehouses: JSON.stringify(input.allowedWarehouseIds), readOnly: input.readOnly }).onDuplicateKeyUpdate({ set: { allowedScreens: JSON.stringify(input.allowedScreens), allowedReports: JSON.stringify(input.allowedReports), allowedWarehouses: JSON.stringify(input.allowedWarehouseIds), readOnly: input.readOnly } });
  return getUserPermissionSettings(input.userId, input.readOnly ? "viewer" : "user");
}

export async function getUserPreferences(userId: number) {
  const db = await requireDb();
  const rows = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  const row = rows[0];
  if (!row) return { quickActions: [...DEFAULT_QUICK_ACTIONS], hapticEnabled: true, reportColumnOrder: {} as Record<string, string[]>, onboardingCompleted: false };
  let reportColumnOrder: ReportColumnOrder = {};
  try { reportColumnOrder = normalizeReportColumnOrder(JSON.parse(row.reportColumnOrder ?? "{}")); } catch { reportColumnOrder = {}; }
  try {
    return { quickActions: parseQuickActions(row.quickActions), hapticEnabled: row.hapticEnabled, reportColumnOrder, onboardingCompleted: row.onboardingCompleted };
  } catch {
    return { quickActions: [...DEFAULT_QUICK_ACTIONS], hapticEnabled: row.hapticEnabled, reportColumnOrder, onboardingCompleted: row.onboardingCompleted };
  }
}

export async function upsertUserPreferences(input: { userId: number; quickActions: string[]; hapticEnabled: boolean; reportColumnOrder?: ReportColumnOrder }) {
  const db = await requireDb();
  const quickActions = JSON.stringify(normalizeQuickActions(input.quickActions));
  const reportColumnOrder = JSON.stringify(normalizeReportColumnOrder(input.reportColumnOrder));
  await db.insert(userPreferences).values({ userId: input.userId, quickActions, hapticEnabled: input.hapticEnabled, reportColumnOrder }).onDuplicateKeyUpdate({ set: { quickActions, hapticEnabled: input.hapticEnabled, reportColumnOrder } });
  return getUserPreferences(input.userId);
}

export async function setUserOnboardingCompleted(userId: number, onboardingCompleted: boolean) {
  const db = await requireDb();
  const existing = (await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1))[0];
  if (existing) {
    await db.update(userPreferences).set({ onboardingCompleted }).where(eq(userPreferences.userId, userId));
  } else {
    await db.insert(userPreferences).values({ userId, quickActions: JSON.stringify(DEFAULT_QUICK_ACTIONS), hapticEnabled: true, reportColumnOrder: "{}", onboardingCompleted });
  }
  return getUserPreferences(userId);
}

export async function listSettings() {
  const db = await requireDb();
  return db.select().from(settings);
}

export async function getSettingValue(key: string, fallback: string) {
  const db = await requireDb();
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return rows[0]?.value ?? fallback;
}

export async function upsertSetting(input: { key: string; value: string; description?: string | null; allowEmpty?: boolean }) {
  const db = await requireDb();
  const key = input.key.trim();
  const value = input.value.trim();
  if (!key || (!value && !input.allowEmpty)) throw new InventoryError("BAD_REQUEST", "مفتاح وقيمة الإعداد مطلوبان");
  const values: InsertSetting = {
    key,
    value,
    description: input.description?.trim() || null,
  };
  await db.insert(settings).values(values).onDuplicateKeyUpdate({
    set: { value, description: values.description },
  });
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return rows[0];
}

export async function getInventoryRows(allowedWarehouseIds: number[] = []) {
  const db = await requireDb();
  if (!allowedWarehouseIds.length) return db.select().from(items).orderBy(desc(items.updatedAt));
  return db.select().from(items).where(inArray(items.warehouseId, allowedWarehouseIds)).orderBy(desc(items.updatedAt));
}

export async function getRecentMovements(limit = 10, allowedWarehouseIds: number[] = []) {
  const db = await requireDb();
  const additionWhere = allowedWarehouseIds.length ? inArray(additions.warehouseId, allowedWarehouseIds) : undefined;
  const disbursementWhere = allowedWarehouseIds.length ? inArray(disbursements.warehouseId, allowedWarehouseIds) : undefined;
  const transferWhere = allowedWarehouseIds.length ? or(inArray(transfers.fromWarehouseId, allowedWarehouseIds), inArray(transfers.toWarehouseId, allowedWarehouseIds)) : undefined;
  const [additionRows, disbursementRows, transferRows] = await Promise.all([
    db.select().from(additions).where(additionWhere).orderBy(desc(additions.id)).limit(limit),
    db.select().from(disbursements).where(disbursementWhere).orderBy(desc(disbursements.id)).limit(limit),
    db.select().from(transfers).where(transferWhere).orderBy(desc(transfers.id)).limit(limit),
  ]);
  return {
    additions: additionRows,
    disbursements: disbursementRows,
    transfers: transferRows,
  };
}

/** Returns the latest permit of each requested movement type by its business date.
 * The id provides a stable tie-breaker when multiple rows belong to the same permit date. */
export async function getLatestPermitSummaries(allowedWarehouseIds: number[] = []) {
  const db = await requireDb();
  const additionWhere = allowedWarehouseIds.length ? inArray(additions.warehouseId, allowedWarehouseIds) : undefined;
  const disbursementWhere = allowedWarehouseIds.length ? inArray(disbursements.warehouseId, allowedWarehouseIds) : undefined;
  const [additionRows, disbursementRows] = await Promise.all([
    db.select({ id: additions.id, eznNum: additions.eznNum, date: additions.date }).from(additions).where(additionWhere).orderBy(desc(additions.date), desc(additions.id)).limit(1),
    db.select({ id: disbursements.id, eznNum: disbursements.eznNum, date: disbursements.date }).from(disbursements).where(disbursementWhere).orderBy(desc(disbursements.date), desc(disbursements.id)).limit(1),
  ]);
  return { addition: additionRows[0] ?? null, disbursement: disbursementRows[0] ?? null };
}

function movementDateKey(value: string) {
  const raw = value.trim();
  const isoMatch = raw.match(/^(\\d{4})[-/](\\d{1,2})[-/](\\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

type MovementAnalyticsRow = { date: string; quantity: string | number | null };
type MovementAnalyticsInventoryRow = { currentStock: string | number | null; reorderLevel: string | number | null };

export function buildMovementAnalytics(
  movements: { additions: MovementAnalyticsRow[]; disbursements: MovementAnalyticsRow[]; transfers: MovementAnalyticsRow[] },
  inventoryRows: MovementAnalyticsInventoryRow[],
  thresholdPercentage: number,
) {
  const buckets = new Map<string, { date: string; additions: number; disbursements: number; transfers: number }>();
  const ensureBucket = (date: string) => {
    const key = movementDateKey(date);
    const existing = buckets.get(key);
    if (existing) return existing;
    const created = { date: key, additions: 0, disbursements: 0, transfers: 0 };
    buckets.set(key, created);
    return created;
  };

  movements.additions.forEach(row => { ensureBucket(row.date).additions += Number(row.quantity ?? 0); });
  movements.disbursements.forEach(row => { ensureBucket(row.date).disbursements += Number(row.quantity ?? 0); });
  movements.transfers.forEach(row => { ensureBucket(row.date).transfers += Number(row.quantity ?? 0); });

  const status = { safe: 0, watch: 0, low: 0, empty: 0 };
  inventoryRows.forEach(row => {
    const current = Number(row.currentStock ?? 0);
    const reorder = Number(row.reorderLevel ?? 0);
    if (current <= 0) status.empty += 1;
    else if (reorder > 0 && current <= reorder * (thresholdPercentage / 100)) status.low += 1;
    else if (reorder > 0 && current <= reorder) status.watch += 1;
    else status.safe += 1;
  });

  return {
    series: Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-90),
    status,
    totals: {
      additions: movements.additions.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
      disbursements: movements.disbursements.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
      transfers: movements.transfers.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
    },
  };
}

export async function getMovementAnalytics(
  inventoryRows: Array<{ currentStock: string | number | null; reorderLevel: string | number | null }>,
  thresholdPercentage: number,
  warehouseId: number | null = null,
  allowedWarehouseIds: number[] = [],
) {
  const db = await requireDb();
  const additionCondition = warehouseId === null && allowedWarehouseIds.length ? inArray(additions.warehouseId, allowedWarehouseIds) : warehouseId === null ? undefined : eq(additions.warehouseId, warehouseId);
  const disbursementCondition = warehouseId === null && allowedWarehouseIds.length ? inArray(disbursements.warehouseId, allowedWarehouseIds) : warehouseId === null ? undefined : eq(disbursements.warehouseId, warehouseId);
  const transferCondition = warehouseId === null && allowedWarehouseIds.length ? or(inArray(transfers.fromWarehouseId, allowedWarehouseIds), inArray(transfers.toWarehouseId, allowedWarehouseIds)) : warehouseId === null ? undefined : or(eq(transfers.fromWarehouseId, warehouseId), eq(transfers.toWarehouseId, warehouseId));
  const [additionRows, disbursementRows, transferRows] = await Promise.all([
    db.select({ date: additions.date, quantity: additions.quantity }).from(additions).where(additionCondition),
    db.select({ date: disbursements.date, quantity: disbursements.quantity }).from(disbursements).where(disbursementCondition),
    db.select({ date: transfers.date, quantity: transfers.quantity }).from(transfers).where(transferCondition),
  ]);

  return buildMovementAnalytics({ additions: additionRows, disbursements: disbursementRows, transfers: transferRows }, inventoryRows, thresholdPercentage);
}

// Kept exported for future CSV/Excel import services.
export type InventoryDbInput = {
  item: InsertItem;
  addition?: InsertAddition;
  disbursement?: InsertDisbursement;
  transfer?: InsertTransfer;
};


export async function ensureGeneralConversation(userId: number) {
  const db = await requireDb();
  let rows = await db.select().from(chatConversations).where(eq(chatConversations.type, "general")).limit(1);
  let conversation = rows[0];
  if (!conversation) {
    const result = await db.insert(chatConversations).values({ type: "general", title: "المحادثة العامة", createdBy: userId });
    const id = resultInsertId(result);
    rows = await db.select().from(chatConversations).where(eq(chatConversations.id, id)).limit(1);
    conversation = rows[0];
  }
  if (!conversation) throw new InventoryError("UNAVAILABLE", "تعذر إنشاء المحادثة العامة");
  const member = await db.select({ id: chatMembers.id }).from(chatMembers).where(and(eq(chatMembers.conversationId, conversation.id), eq(chatMembers.userId, userId))).limit(1);
  if (!member[0]) await db.insert(chatMembers).values({ conversationId: conversation.id, userId });
  return conversation;
}

async function getChatConversationAccess(userId: number, conversationId: number) {
  const db = await requireDb();
  const rows = await db.select({ conversation: chatConversations, member: chatMembers }).from(chatConversations).leftJoin(chatMembers, and(eq(chatMembers.conversationId, chatConversations.id), eq(chatMembers.userId, userId))).where(eq(chatConversations.id, conversationId)).limit(1);
  const row = rows[0];
  if (!row || row.conversation.isArchived || (row.conversation.type === "private" && !row.member)) throw new InventoryError("NOT_FOUND", "المحادثة غير متاحة لهذا الحساب");
  return row.conversation;
}

export async function listChatConversations(userId: number) {
  const db = await requireDb();
  await ensureGeneralConversation(userId);
  const rows = await db.select({ conversation: chatConversations, member: chatMembers }).from(chatConversations).leftJoin(chatMembers, and(eq(chatMembers.conversationId, chatConversations.id), eq(chatMembers.userId, userId))).where(and(eq(chatConversations.isArchived, false), or(eq(chatConversations.type, "general"), eq(chatMembers.userId, userId)))).orderBy(desc(chatConversations.updatedAt));
  return Promise.all(rows.map(async row => {
    const unreadRows = await db.select({ total: count(chatMessages.id) }).from(chatMessages).where(and(eq(chatMessages.conversationId, row.conversation.id), eq(chatMessages.isDeleted, false), row.member?.lastReadAt ? gt(chatMessages.createdAt, row.member.lastReadAt) : undefined));
    const latestRows = await db.select({ message: chatMessages, senderName: users.name }).from(chatMessages).leftJoin(users, eq(chatMessages.senderId, users.id)).where(and(eq(chatMessages.conversationId, row.conversation.id), eq(chatMessages.isDeleted, false))).orderBy(desc(chatMessages.id)).limit(1);
    const latest = latestRows[0];
    return { ...row.conversation, lastReadAt: row.member?.lastReadAt ?? null, unreadCount: Number(unreadRows[0]?.total ?? 0), latestMessage: latest ? { id: latest.message.id, body: latest.message.body, senderName: latest.senderName, attachmentName: latest.message.attachmentName, attachmentMime: latest.message.attachmentMime } : null };
  }));
}

export async function listChatMessages(input: { userId: number; conversationId: number; limit?: number; beforeId?: number }) {
  const db = await requireDb();
  await getChatConversationAccess(input.userId, input.conversationId);
  const limit = Math.min(100, Math.max(1, input.limit ?? 40));
  const rows = await db.select({ message: chatMessages, senderName: users.name, senderEmail: users.email }).from(chatMessages).leftJoin(users, eq(chatMessages.senderId, users.id)).where(and(eq(chatMessages.conversationId, input.conversationId), input.beforeId ? lt(chatMessages.id, input.beforeId) : undefined)).orderBy(desc(chatMessages.id)).limit(limit);
  const messages = rows.reverse();
  const incomingIds = messages.filter(row => row.message.senderId !== input.userId).map(row => row.message.id);
  if (incomingIds.length) {
    const existing = await db.select({ messageId: chatMessageReceipts.messageId }).from(chatMessageReceipts).where(and(eq(chatMessageReceipts.userId, input.userId), or(...incomingIds.map(id => eq(chatMessageReceipts.messageId, id)))));
    const known = new Set(existing.map(row => row.messageId));
    const missing = incomingIds.filter(id => !known.has(id));
    if (missing.length) await db.insert(chatMessageReceipts).values(missing.map(messageId => ({ messageId, userId: input.userId })));
  }
  return Promise.all(messages.map(async row => {
    if (row.message.senderId !== input.userId) return { ...row, receipt: null };
    const receiptRows = await db.select({ deliveredAt: chatMessageReceipts.deliveredAt, readAt: chatMessageReceipts.readAt }).from(chatMessageReceipts).where(eq(chatMessageReceipts.messageId, row.message.id));
    return { ...row, receipt: { deliveredCount: receiptRows.filter(receipt => receipt.deliveredAt).length, readCount: receiptRows.filter(receipt => receipt.readAt).length } };
  }));
}

export async function createPrivateConversation(input: { userId: number; participantUserIds: number[]; title?: string | null }) {
  const db = await requireDb();
  const participantIds = Array.from(new Set([input.userId, ...input.participantUserIds])).slice(0, 50);
  if (participantIds.length < 2) throw new InventoryError("BAD_REQUEST", "اختر مستخدماً آخر للمحادثة الخاصة");
  const members = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(or(...participantIds.map(id => eq(users.id, id))));
  if (members.length !== participantIds.length) throw new InventoryError("BAD_REQUEST", "أحد المشاركين غير موجود");
  const title = input.title?.trim() || members.filter(member => member.id !== input.userId).map(member => member.name || member.email || `مستخدم ${member.id}`).join("، ");
  const result = await db.insert(chatConversations).values({ type: "private", title: title.slice(0, 255), createdBy: input.userId });
  const conversationId = resultInsertId(result);
  await db.insert(chatMembers).values(participantIds.map(userId => ({ conversationId, userId })));
  return { id: conversationId, type: "private" as const, title };
}

export async function sendChatMessage(input: { userId: number; conversationId: number; body: string; attachment?: { dataBase64: string; name: string; mime: string; size: number } }) {
  const db = await requireDb();
  await getChatConversationAccess(input.userId, input.conversationId);
  const body = input.body.trim();
  const attachment = input.attachment;
  if (body.length > 5000) throw new InventoryError("BAD_REQUEST", "الرسالة يجب ألا تتجاوز 5000 حرف");
  if (!body && !attachment) throw new InventoryError("BAD_REQUEST", "اكتب رسالة أو أرفق ملفاً");
  let attachmentData: { url: string; key: string; name: string; mime: string; size: number } | undefined;
  if (attachment) {
    const allowedMime = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"]);
    if (!allowedMime.has(attachment.mime)) throw new InventoryError("BAD_REQUEST", "يسمح بإرفاق صور JPG أو PNG أو WEBP وملفات PDF أو تسجيلات صوتية فقط");
    if (!Number.isFinite(attachment.size) || attachment.size < 1 || attachment.size > 8 * 1024 * 1024) throw new InventoryError("BAD_REQUEST", "حجم المرفق يجب ألا يتجاوز 8 ميجابايت");
    const buffer = Buffer.from(attachment.dataBase64.replace(/^data:[^;]+;base64,/, ""), "base64");
    if (buffer.length < 1 || buffer.length > 8 * 1024 * 1024) throw new InventoryError("BAD_REQUEST", "تعذر قراءة المرفق أو تجاوز الحجم المسموح");
    const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "attachment";
    const uploaded = await storagePut(`smart-inventory/chat/${input.conversationId}/${input.userId}-${Date.now()}-${safeName}`, buffer, attachment.mime);
    attachmentData = { url: uploaded.url, key: uploaded.key, name: safeName, mime: attachment.mime, size: buffer.length };
  }
  const result = await db.insert(chatMessages).values({ conversationId: input.conversationId, senderId: input.userId, body: body || attachmentData?.name || "مرفق", attachmentUrl: attachmentData?.url ?? null, attachmentKey: attachmentData?.key ?? null, attachmentName: attachmentData?.name ?? null, attachmentMime: attachmentData?.mime ?? null, attachmentSize: attachmentData?.size ?? null });
  const messageId = resultInsertId(result);
  const conversation = await db.select({ type: chatConversations.type }).from(chatConversations).where(eq(chatConversations.id, input.conversationId)).limit(1);
  const recipientRows = conversation[0]?.type === "general"
    ? await db.select({ userId: users.id }).from(users).where(not(eq(users.id, input.userId)))
    : await db.select({ userId: chatMembers.userId }).from(chatMembers).where(and(eq(chatMembers.conversationId, input.conversationId), not(eq(chatMembers.userId, input.userId))));
  if (recipientRows.length) await db.insert(chatMessageReceipts).values(recipientRows.map(recipient => ({ messageId, userId: recipient.userId })));
  await db.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, input.conversationId));
  return { id: messageId, conversationId: input.conversationId, senderId: input.userId, body, attachment: attachmentData ?? null };
}

export async function markChatConversationRead(input: { userId: number; conversationId: number }) {
  const db = await requireDb();
  await getChatConversationAccess(input.userId, input.conversationId);
  const now = new Date();
  const existing = await db.select({ id: chatMembers.id }).from(chatMembers).where(and(eq(chatMembers.conversationId, input.conversationId), eq(chatMembers.userId, input.userId))).limit(1);
  if (existing[0]) await db.update(chatMembers).set({ lastReadAt: now }).where(eq(chatMembers.id, existing[0].id));
  else await db.insert(chatMembers).values({ conversationId: input.conversationId, userId: input.userId, lastReadAt: now });
  const unreadMessages = await db.select({ id: chatMessages.id }).from(chatMessages).where(and(eq(chatMessages.conversationId, input.conversationId), not(eq(chatMessages.senderId, input.userId)), or(isNull(chatMessages.isDeleted), eq(chatMessages.isDeleted, false))));
  for (const message of unreadMessages) {
    const receipt = await db.select({ id: chatMessageReceipts.id }).from(chatMessageReceipts).where(and(eq(chatMessageReceipts.messageId, message.id), eq(chatMessageReceipts.userId, input.userId))).limit(1);
    if (receipt[0]) await db.update(chatMessageReceipts).set({ readAt: now }).where(eq(chatMessageReceipts.id, receipt[0].id));
    else await db.insert(chatMessageReceipts).values({ messageId: message.id, userId: input.userId, deliveredAt: now, readAt: now });
  }
  return { updated: true };
}

export async function deleteChatMessage(input: { messageId: number; adminUserId: number }) {
  const db = await requireDb();
  await db.update(chatMessages).set({ isDeleted: true, body: "تم حذف هذه الرسالة بواسطة المدير" }).where(eq(chatMessages.id, input.messageId));
  return { deleted: true };
}

export async function deleteAllChatMessages(input: { adminUserId: number }) {
  const db = await requireDb();
  const messageRows = await db.select({ id: chatMessages.id }).from(chatMessages);
  if (!messageRows.length) return { deletedMessages: 0, deletedReceipts: 0 };
  const messageIds = messageRows.map(row => row.id);
  const receiptRows = await db.select({ id: chatMessageReceipts.id }).from(chatMessageReceipts).where(inArray(chatMessageReceipts.messageId, messageIds));
  await db.delete(chatMessageReceipts).where(inArray(chatMessageReceipts.messageId, messageIds));
  await db.delete(chatMessages).where(inArray(chatMessages.id, messageIds));
  return { deletedMessages: messageIds.length, deletedReceipts: receiptRows.length };
}

export async function cleanupOldChatMessages(input: { adminUserId: number; olderThanDays?: number }) {
  const db = await requireDb();
  const olderThanDays = Math.max(30, Math.floor(input.olderThanDays ?? 30));
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const oldRows = await db.select({ id: chatMessages.id }).from(chatMessages).where(lte(chatMessages.createdAt, cutoff));
  if (!oldRows.length) return { deletedMessages: 0, deletedReceipts: 0, cutoff };
  const messageIds = oldRows.map(row => row.id);
  const receiptRows = await db.select({ id: chatMessageReceipts.id }).from(chatMessageReceipts).where(inArray(chatMessageReceipts.messageId, messageIds));
  await db.delete(chatMessageReceipts).where(inArray(chatMessageReceipts.messageId, messageIds));
  await db.delete(chatMessages).where(inArray(chatMessages.id, messageIds));
  return { deletedMessages: messageIds.length, deletedReceipts: receiptRows.length, cutoff };
}


export async function deleteUserNotifications(userId: number) {
  const db = await requireDb();
  const result = await db.delete(notifications).where(eq(notifications.recipientUserId, userId));
  return { deleted: Number(result[0]?.affectedRows ?? 0) };
}

export async function listChatUsers(currentUserId: number) {
  const db = await requireDb();
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).where(not(eq(users.id, currentUserId))).orderBy(asc(users.name));
}


export async function listUserAbsences(userId?: number) {
  const db = await getDb();
  if (!db) return [];
  return userId ? db.select().from(userAbsences).where(eq(userAbsences.userId, userId)).orderBy(asc(userAbsences.startDate)) : db.select().from(userAbsences).orderBy(asc(userAbsences.startDate));
}

export async function createUserAbsence(input: { userId: number; startDate: string; days: number }) {
  const db = await getDb();
  if (!db) throw new Error("ÙØ§Ø¹Ø¯Ø© Ø§ÙØ¨ÙØ§ÙØ§Øª ØºÙØ± ÙØªØ§Ø­Ø©");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || Number.isNaN(new Date(input.startDate + "T00:00:00Z").getTime())) throw new Error("ØªØ§Ø±ÙØ® Ø¨Ø¯Ø§ÙØ© Ø§ÙØºÙØ§Ø¨ ØºÙØ± ØµØ§ÙØ­");
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 366) throw new Error("Ø¹Ø¯Ø¯ Ø£ÙØ§Ù Ø§ÙØºÙØ§Ø¨ ÙØ¬Ø¨ Ø£Ù ÙÙÙÙ Ø¨ÙÙ 1 Ù366");
  const existing = await listUserAbsences(input.userId);
  const start = new Date(input.startDate + "T00:00:00Z").getTime(); const end = start + (input.days - 1) * 86400000;
  if (existing.some(row => { const otherStart = new Date(row.startDate + "T00:00:00Z").getTime(); const otherEnd = otherStart + (row.days - 1) * 86400000; return start <= otherEnd && end >= otherStart; })) throw new Error("ÙØªØ±Ø© Ø§ÙØºÙØ§Ø¨ ØªØªØ¯Ø§Ø®Ù ÙØ¹ ÙØªØ±Ø© ÙØ³Ø¬ÙØ© ÙØ³Ø¨ÙØ§Ù");
  const result = await db.insert(userAbsences).values({ userId: input.userId, startDate: input.startDate, days: input.days });
  return { id: Number((result as any).insertId), userId: input.userId, startDate: input.startDate, days: input.days };
}

export async function updateUserAbsence(input: { id: number; startDate: string; days: number }) {
  const db = await getDb(); if (!db) throw new Error("ÙØ§Ø¹Ø¯Ø© Ø§ÙØ¨ÙØ§ÙØ§Øª ØºÙØ± ÙØªØ§Ø­Ø©");
  const current = (await db.select().from(userAbsences).where(eq(userAbsences.id, input.id)))[0]; if (!current) throw new Error("ÙØªØ±Ø© Ø§ÙØºÙØ§Ø¨ ØºÙØ± ÙÙØ¬ÙØ¯Ø©");
  await db.delete(userAbsences).where(eq(userAbsences.id, input.id));
  try { const updated = await createUserAbsence({ userId: current.userId, startDate: input.startDate, days: input.days }); return { ...updated, id: input.id }; } catch (error) { await db.insert(userAbsences).values({ userId: current.userId, startDate: current.startDate, days: current.days }); throw error; }
}

export async function deleteUserAbsence(id: number) { const db = await getDb(); if (!db) throw new Error("ÙØ§Ø¹Ø¯Ø© Ø§ÙØ¨ÙØ§ÙØ§Øª ØºÙØ± ÙØªØ§Ø­Ø©"); await db.delete(userAbsences).where(eq(userAbsences.id, id)); return { id }; }

export async function getUserAbsenceTotals(userId?: number) { const rows = await listUserAbsences(userId); return rows.reduce((total, row) => { total[row.userId] = (total[row.userId] || 0) + row.days; return total; }, {} as Record<number, number>); }
