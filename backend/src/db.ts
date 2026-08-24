import { desc, eq, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  additions,
  disbursements,
  InsertAddition,
  InsertDisbursement,
  InsertItem,
  InsertSetting,
  InsertTransfer,
  InsertUser,
  items,
  settings,
  transfers,
  User,
  users,
} from "./schema.js";

let _db: ReturnType<typeof drizzle> | null = null;

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
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
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

function normalizeName(name: string) {
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
    } else if (process.env.ADMIN_EMAIL && user.email?.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase()) {
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

export async function listItems(search?: string) {
  const db = await requireDb();
  const normalizedSearch = search?.trim();
  if (!normalizedSearch) {
    return db.select().from(items).orderBy(desc(items.updatedAt));
  }

  const pattern = `%${normalizedSearch}%`;
  return db
    .select()
    .from(items)
    .where(or(like(items.code, pattern), like(items.name, pattern)))
    .orderBy(desc(items.updatedAt));
}

export async function getItemById(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(items).where(eq(items.id, id)).limit(1);
  return rows[0];
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
  code: string;
  name: string;
  initialStock?: number;
  reorderLevel?: number;
  category?: string | null;
  unit?: string | null;
}) {
  const db = await requireDb();
  const code = normalizeItemCode(input.code);
  const name = normalizeName(input.name);
  const initial = toScaled(input.initialStock);
  const reorder = toScaled(input.reorderLevel);
  if (initial < 0 || reorder < 0) {
    throw new InventoryError("BAD_REQUEST", "لا يمكن أن تكون الكميات سالبة");
  }

  try {
    const result = await db.insert(items).values({
      code,
      name,
      initialStock: fromScaled(initial),
      incomingStock: "0.000",
      outgoingStock: "0.000",
      currentStock: fromScaled(initial),
      reorderLevel: fromScaled(reorder),
      category: input.category?.trim() || null,
      unit: input.unit?.trim() || null,
    });
    return getItemById(resultInsertId(result));
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") {
      throw new InventoryError("CONFLICT", `كود الصنف ${code} مستخدم بالفعل`);
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
}>) {
  const db = await requireDb();
  const seen = new Set<string>();
  const normalizedRows = input.map((row, index) => {
    const code = normalizeItemCode(row.code);
    const name = normalizeName(row.name);
    if (seen.has(code)) {
      throw new InventoryError("CONFLICT", `الكود ${code} مكرر داخل ملف الاستيراد في الصف ${index + 1}`);
    }
    seen.add(code);
    const initial = toScaled(row.initialStock);
    const reorder = toScaled(row.reorderLevel);
    if (initial < 0 || reorder < 0) {
      throw new InventoryError("BAD_REQUEST", `كميات سالبة في صف الاستيراد ${index + 1}`);
    }
    return { code, name, initial, reorder, category: row.category?.trim() || null, unit: row.unit?.trim() || null };
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
      }).where(eq(items.id, existing.id));
      updated += 1;
    }
    return { created, updated, total: normalizedRows.length };
  });
}

export async function updateItem(input: {
  id: number;
  code?: string;
  name?: string;
  initialStock?: number;
  reorderLevel?: number;
  category?: string | null;
  unit?: string | null;
}) {
  const db = await requireDb();
  return db.transaction(async (tx: any) => {
    const current = await getItemByIdForUpdate(tx, input.id);
    const updates: Record<string, unknown> = {};

    if (input.code !== undefined) updates.code = normalizeItemCode(input.code);
    if (input.name !== undefined) updates.name = normalizeName(input.name);
    if (input.reorderLevel !== undefined) {
      const reorder = toScaled(input.reorderLevel);
      if (reorder < 0) throw new InventoryError("BAD_REQUEST", "حد الطلب لا يمكن أن يكون سالباً");
      updates.reorderLevel = fromScaled(reorder);
    }
    if (input.category !== undefined) updates.category = input.category?.trim() || null;
    if (input.unit !== undefined) updates.unit = input.unit?.trim() || null;

    if (input.initialStock !== undefined) {
      const nextInitial = toScaled(input.initialStock);
      const delta = nextInitial - toScaled(current.initialStock);
      const nextCurrent = toScaled(current.currentStock) + delta;
      if (nextInitial < 0 || nextCurrent < 0) {
        throw new InventoryError("CONFLICT", "تعديل الرصيد الأولي سينتج عنه رصيد سالب");
      }
      updates.initialStock = fromScaled(nextInitial);
      updates.currentStock = fromScaled(nextCurrent);
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

export async function listAdditions(limit = 100) {
  const db = await requireDb();
  return db.select().from(additions).orderBy(desc(additions.id)).limit(limit);
}

export async function createAddition(input: {
  date: string;
  eznNum: string;
  itemCode: string;
  store?: string | null;
  quantity: number;
  purpose?: string | null;
  supplier?: string | null;
  category?: string | null;
}) {
  const db = await requireDb();
  const quantity = toScaled(input.quantity);
  if (quantity <= 0) throw new InventoryError("BAD_REQUEST", "كمية الإضافة يجب أن تكون أكبر من صفر");

  return db.transaction(async (tx: any) => {
    const item = await getItemForUpdate(tx, normalizeItemCode(input.itemCode));
    await applyStockDelta(tx, item, { incoming: quantity, outgoing: 0, current: quantity });
    const result = await tx.insert(additions).values({
      date: input.date.trim(),
      eznNum: input.eznNum.trim(),
      itemCode: item.code,
      itemName: item.name,
      store: input.store?.trim() || null,
      quantity: fromScaled(quantity),
      purpose: input.purpose?.trim() || null,
      supplier: input.supplier?.trim() || null,
      category: input.category?.trim() || item.category || null,
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
  quantity?: number;
  purpose?: string | null;
  supplier?: string | null;
  category?: string | null;
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

    const nextItem = lockedItems.get(nextCode);
    const updates: Partial<InsertAddition> = {
      date: input.date?.trim() ?? old.date,
      eznNum: input.eznNum?.trim() ?? old.eznNum,
      itemCode: nextCode,
      itemName: nextItem.name,
      store: input.store === undefined ? old.store : input.store?.trim() || null,
      quantity: fromScaled(nextQuantity),
      purpose: input.purpose === undefined ? old.purpose : input.purpose?.trim() || null,
      supplier: input.supplier === undefined ? old.supplier : input.supplier?.trim() || null,
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
    await applyStockDelta(tx, item, {
      incoming: -toScaled(addition.quantity),
      outgoing: 0,
      current: -toScaled(addition.quantity),
    });
    await tx.delete(additions).where(eq(additions.id, id));
    return { id };
  });
}

export async function listDisbursements(limit = 100) {
  const db = await requireDb();
  return db.select().from(disbursements).orderBy(desc(disbursements.id)).limit(limit);
}

export async function createDisbursement(input: {
  date: string;
  eznNum: string;
  itemCode: string;
  destination?: string | null;
  quantity: number;
  notes?: string | null;
  store?: string | null;
  disburseType?: string | null;
}) {
  const db = await requireDb();
  const quantity = toScaled(input.quantity);
  if (quantity <= 0) throw new InventoryError("BAD_REQUEST", "كمية الصرف يجب أن تكون أكبر من صفر");

  return db.transaction(async (tx: any) => {
    const item = await getItemForUpdate(tx, normalizeItemCode(input.itemCode));
    await applyStockDelta(tx, item, { incoming: 0, outgoing: quantity, current: -quantity });
    const result = await tx.insert(disbursements).values({
      date: input.date.trim(),
      eznNum: input.eznNum.trim(),
      itemCode: item.code,
      itemName: item.name,
      destination: input.destination?.trim() || null,
      quantity: fromScaled(quantity),
      notes: input.notes?.trim() || null,
      store: input.store?.trim() || null,
      disburseType: input.disburseType?.trim() || null,
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
  quantity?: number;
  notes?: string | null;
  store?: string | null;
  disburseType?: string | null;
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

    const nextItem = lockedItems.get(nextCode);
    const updates: Partial<InsertDisbursement> = {
      date: input.date?.trim() ?? old.date,
      eznNum: input.eznNum?.trim() ?? old.eznNum,
      itemCode: nextCode,
      itemName: nextItem.name,
      destination: input.destination === undefined ? old.destination : input.destination?.trim() || null,
      quantity: fromScaled(nextQuantity),
      notes: input.notes === undefined ? old.notes : input.notes?.trim() || null,
      store: input.store === undefined ? old.store : input.store?.trim() || null,
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
    await applyStockDelta(tx, item, { incoming: 0, outgoing: -quantity, current: quantity });
    await tx.delete(disbursements).where(eq(disbursements.id, id));
    return { id };
  });
}

export async function listTransfers(limit = 100) {
  const db = await requireDb();
  return db.select().from(transfers).orderBy(desc(transfers.id)).limit(limit);
}

function isReturnTransfer(type: string | null | undefined) {
  return ["return", "مرتجع", "استلام مرتجع"].includes((type ?? "").trim().toLowerCase());
}

export async function createTransfer(input: {
  date: string;
  eznNum: string;
  itemCode: string;
  fromStore?: string | null;
  toStore?: string | null;
  quantity: number;
  notes?: string | null;
  transferType?: string | null;
}) {
  const db = await requireDb();
  const quantity = toScaled(input.quantity);
  if (quantity <= 0) throw new InventoryError("BAD_REQUEST", "كمية التحويل يجب أن تكون أكبر من صفر");

  return db.transaction(async (tx: any) => {
    const item = await getItemForUpdate(tx, normalizeItemCode(input.itemCode));
    if (isReturnTransfer(input.transferType)) {
      await applyStockDelta(tx, item, { incoming: quantity, outgoing: 0, current: quantity });
    }
    const result = await tx.insert(transfers).values({
      date: input.date.trim(),
      eznNum: input.eznNum.trim(),
      itemCode: item.code,
      itemName: item.name,
      fromStore: input.fromStore?.trim() || null,
      toStore: input.toStore?.trim() || null,
      quantity: fromScaled(quantity),
      notes: input.notes?.trim() || null,
      transferType: input.transferType?.trim() || "transfer",
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
  quantity?: number;
  notes?: string | null;
  transferType?: string | null;
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

    const oldIsReturn = isReturnTransfer(old.transferType);
    const nextTransferType = input.transferType === undefined ? old.transferType : input.transferType;
    const nextIsReturn = isReturnTransfer(nextTransferType);
    const codes = Array.from(new Set([oldCode, nextCode])).sort();
    const lockedItems = new Map<string, any>();
    for (const code of codes) lockedItems.set(code, await getItemForUpdate(tx, code));

    if (oldIsReturn) {
      await applyStockDelta(tx, lockedItems.get(oldCode), {
        incoming: -oldQuantity,
        outgoing: 0,
        current: -oldQuantity,
      });
    }
    if (nextIsReturn) {
      await applyStockDelta(tx, lockedItems.get(nextCode), {
        incoming: nextQuantity,
        outgoing: 0,
        current: nextQuantity,
      });
    }

    const nextItem = lockedItems.get(nextCode);
    await tx
      .update(transfers)
      .set({
        date: input.date?.trim() ?? old.date,
        eznNum: input.eznNum?.trim() ?? old.eznNum,
        itemCode: nextCode,
        itemName: nextItem.name,
        fromStore: input.fromStore === undefined ? old.fromStore : input.fromStore?.trim() || null,
        toStore: input.toStore === undefined ? old.toStore : input.toStore?.trim() || null,
        quantity: fromScaled(nextQuantity),
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
    if (isReturnTransfer(transfer.transferType)) {
      const item = await getItemForUpdate(tx, transfer.itemCode);
      const quantity = toScaled(transfer.quantity);
      await applyStockDelta(tx, item, { incoming: -quantity, outgoing: 0, current: -quantity });
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
};

export async function importMovements(rows: MovementImportRow[]) {
  const seen = new Set<string>();
  const errors: Array<{ row: number; message: string }> = [];
  let imported = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 2;
    const duplicateKey = [row.type, row.date.trim(), row.eznNum.trim(), row.itemCode.trim(), row.quantity].join("|");
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

export async function getInventoryRows() {
  const db = await requireDb();
  return db.select().from(items).orderBy(desc(items.updatedAt));
}

export async function getRecentMovements(limit = 10) {
  const db = await requireDb();
  const [additionRows, disbursementRows, transferRows] = await Promise.all([
    db.select().from(additions).orderBy(desc(additions.id)).limit(limit),
    db.select().from(disbursements).orderBy(desc(disbursements.id)).limit(limit),
    db.select().from(transfers).orderBy(desc(transfers.id)).limit(limit),
  ]);
  return {
    additions: additionRows,
    disbursements: disbursementRows,
    transfers: transferRows,
  };
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

export async function getMovementAnalytics(
  inventoryRows: Array<{ currentStock: string | number | null; reorderLevel: string | number | null }>,
  thresholdPercentage: number,
) {
  const db = await requireDb();
  const [additionRows, disbursementRows, transferRows] = await Promise.all([
    db.select({ date: additions.date, quantity: additions.quantity }).from(additions),
    db.select({ date: disbursements.date, quantity: disbursements.quantity }).from(disbursements),
    db.select({ date: transfers.date, quantity: transfers.quantity }).from(transfers),
  ]);

  const buckets = new Map<string, { date: string; additions: number; disbursements: number; transfers: number }>();
  const ensureBucket = (date: string) => {
    const key = movementDateKey(date);
    const existing = buckets.get(key);
    if (existing) return existing;
    const created = { date: key, additions: 0, disbursements: 0, transfers: 0 };
    buckets.set(key, created);
    return created;
  };

  additionRows.forEach(row => { ensureBucket(row.date).additions += Number(row.quantity ?? 0); });
  disbursementRows.forEach(row => { ensureBucket(row.date).disbursements += Number(row.quantity ?? 0); });
  transferRows.forEach(row => { ensureBucket(row.date).transfers += Number(row.quantity ?? 0); });

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
      additions: additionRows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
      disbursements: disbursementRows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
      transfers: transferRows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
    },
  };
}

// Kept exported for future CSV/Excel import services.
export type InventoryDbInput = {
  item: InsertItem;
  addition?: InsertAddition;
  disbursement?: InsertDisbursement;
  transfer?: InsertTransfer;
};
