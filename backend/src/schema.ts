import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Items table (الأصناف)
 */
export const items = mysqlTable("items", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(), // كود الصنف
  name: text("name").notNull(), // بيان / اسم الصنف
  initialStock: decimal("initial_stock", { precision: 12, scale: 3 }).default("0").notNull(), // الرصيد الأولي
  incomingStock: decimal("incoming_stock", { precision: 12, scale: 3 }).default("0").notNull(), // الوارد
  outgoingStock: decimal("outgoing_stock", { precision: 12, scale: 3 }).default("0").notNull(), // المنصرف
  currentStock: decimal("current_stock", { precision: 12, scale: 3 }).default("0").notNull(), // الرصيد الحالي
  reorderLevel: decimal("reorder_level", { precision: 12, scale: 3 }).default("0").notNull(), // حد الطلب
  category: varchar("category", { length: 128 }), // نوع الصنف
  unit: varchar("unit", { length: 64 }), // وحدة القياس
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Item = typeof items.$inferSelect;
export type InsertItem = typeof items.$inferInsert;

/**
 * Additions table (الإضافات - add)
 */
export const additions = mysqlTable("additions", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 32 }).notNull(), // التاريخ
  eznNum: varchar("ezn_num", { length: 64 }).notNull(), // رقم الإذن
  itemCode: varchar("item_code", { length: 64 }).notNull(), // كود الصنف
  itemName: text("item_name"), // بيان الصنف
  store: varchar("store", { length: 128 }), // مخزن الإضافة
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(), // الكمية
  purpose: text("purpose"), // لزوم
  supplier: varchar("supplier", { length: 128 }), // وارد من / المورد
  category: varchar("category", { length: 128 }), // نوع الصنف
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Addition = typeof additions.$inferSelect;
export type InsertAddition = typeof additions.$inferInsert;

/**
 * Disbursements table (الصرف - send)
 */
export const disbursements = mysqlTable("disbursements", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 32 }).notNull(), // التاريخ
  eznNum: varchar("ezn_num", { length: 64 }).notNull(), // رقم إذن الصرف
  itemCode: varchar("item_code", { length: 64 }).notNull(), // كود الصنف
  itemName: text("item_name"), // بيان الصنف
  destination: varchar("destination", { length: 128 }), // الجهة / مخزن الصرف
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(), // الكمية
  notes: text("notes"), // ملاحظات
  store: varchar("store", { length: 128 }), // المخزن
  disburseType: varchar("disburse_type", { length: 128 }), // نوع الصرف
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Disbursement = typeof disbursements.$inferSelect;
export type InsertDisbursement = typeof disbursements.$inferInsert;

/**
 * Transfers table (التحويلات والمرتجعات - trans)
 */
export const transfers = mysqlTable("transfers", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 32 }).notNull(),
  eznNum: varchar("ezn_num", { length: 64 }).notNull(),
  itemCode: varchar("item_code", { length: 64 }).notNull(),
  itemName: text("itemName"),
  fromStore: varchar("from_store", { length: 128 }), // من مخزن
  toStore: varchar("to_store", { length: 128 }), // إلى مخزن
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
  notes: text("notes"),
  transferType: varchar("transfer_type", { length: 64 }), // تحويل أو مرتجع
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Transfer = typeof transfers.$inferSelect;
export type InsertTransfer = typeof transfers.$inferInsert;

/**
 * Settings table (الإعدادات - Setting!C14 etc)
 */
export const settings = mysqlTable("settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(), // مثلاً threshold_percentage
  value: text("value").notNull(), // القيمة (مثلاً 20 للـ 20%)
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = typeof settings.$inferInsert;
