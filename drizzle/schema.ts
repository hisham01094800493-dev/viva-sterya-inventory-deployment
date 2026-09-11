import { index, int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, uniqueIndex } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "manager", "operator", "reviewer", "reports", "viewer"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const userAbsences = mysqlTable("user_absences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  startDate: varchar("start_date", { length: 10 }).notNull(),
  days: int("days").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => ({ userDateIdx: index("user_absences_user_date_idx").on(table.userId, table.startDate) }));

export type UserAbsence = typeof userAbsences.$inferSelect;
export type InsertUserAbsence = typeof userAbsences.$inferInsert;

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id"),
  userName: varchar("user_name", { length: 255 }),
  action: varchar("action", { length: 64 }).notNull(),
  entity: varchar("entity", { length: 64 }).notNull(),
  entityId: varchar("entity_id", { length: 128 }),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

export const loginAuditLogs = mysqlTable("login_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  sessionId: varchar("session_id", { length: 64 }),
  userName: varchar("user_name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }),
  userAgent: text("user_agent"),
  deviceType: varchar("device_type", { length: 32 }),
  ipAddress: varchar("ip_address", { length: 128 }),
  loggedInAt: timestamp("logged_in_at").defaultNow().notNull(),
});

export type LoginAuditLog = typeof loginAuditLogs.$inferSelect;
export type InsertLoginAuditLog = typeof loginAuditLogs.$inferInsert;

export const securityNotifications = mysqlTable("security_notifications", {
  id: int("id").autoincrement().primaryKey(),
  notificationType: varchar("notification_type", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  loginLogId: int("login_log_id"),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SecurityNotification = typeof securityNotifications.$inferSelect;
export type InsertSecurityNotification = typeof securityNotifications.$inferInsert;

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  recipientUserId: int("recipient_user_id"),
  createdBy: int("created_by"),
  notificationType: varchar("notification_type", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  priority: mysqlEnum("priority", ["low", "normal", "high", "critical"]).default("normal").notNull(),
  link: varchar("link", { length: 500 }),
  helpStatus: mysqlEnum("help_status", ["new", "in_progress", "completed"]).default("new").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

export const chatConversations = mysqlTable("chat_conversations", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["general", "private"]).default("general").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  createdBy: int("created_by").notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ChatConversation = typeof chatConversations.$inferSelect;
export type InsertChatConversation = typeof chatConversations.$inferInsert;

export const chatMembers = mysqlTable("chat_members", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversation_id").notNull(),
  userId: int("user_id").notNull(),
  lastReadAt: timestamp("last_read_at"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export type ChatMember = typeof chatMembers.$inferSelect;
export type InsertChatMember = typeof chatMembers.$inferInsert;

export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversation_id").notNull(),
  senderId: int("sender_id").notNull(),
  body: text("body").notNull(),
  attachmentUrl: varchar("attachment_url", { length: 700 }),
  attachmentKey: varchar("attachment_key", { length: 500 }),
  attachmentName: varchar("attachment_name", { length: 255 }),
  attachmentMime: varchar("attachment_mime", { length: 100 }),
  attachmentSize: int("attachment_size"),
  isDeleted: boolean("is_deleted").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

export const chatMessageReceipts = mysqlTable("chat_message_receipts", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("message_id").notNull(),
  userId: int("user_id").notNull(),
  deliveredAt: timestamp("delivered_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
});

export type ChatMessageReceipt = typeof chatMessageReceipts.$inferSelect;
export type InsertChatMessageReceipt = typeof chatMessageReceipts.$inferInsert;

export const revokedSessions = mysqlTable("revoked_sessions", {
  sessionId: varchar("session_id", { length: 64 }).primaryKey(),
  userId: int("user_id").notNull(),
  revokedBy: int("revoked_by").notNull(),
  revokedAt: timestamp("revoked_at").defaultNow().notNull(),
});

export type RevokedSession = typeof revokedSessions.$inferSelect;
export type InsertRevokedSession = typeof revokedSessions.$inferInsert;

export const backupRecords = mysqlTable("backup_records", {
  id: int("id").autoincrement().primaryKey(),
  fileKey: varchar("file_key", { length: 500 }).notNull().unique(),
  fileUrl: varchar("file_url", { length: 500 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: int("file_size").default(0).notNull(),
  backupType: varchar("backup_type", { length: 64 }).default("manual").notNull(),
  summary: text("summary"),
  createdBy: int("created_by"),
  createdByName: varchar("created_by_name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BackupRecord = typeof backupRecords.$inferSelect;
export type InsertBackupRecord = typeof backupRecords.$inferInsert;

export const backupVerificationConfigs = mysqlTable("backup_verification_configs", {
  id: int("id").autoincrement().primaryKey(),
  scheduleCronTaskUid: varchar("schedule_cron_task_uid", { length: 65 }),
  cronExpression: varchar("cron_expression", { length: 64 }).notNull().default("0 0 2 * * 0"),
  isEnabled: boolean("is_enabled").default(false).notNull(),
  lastRunId: int("last_run_id"),
  lastRunAt: timestamp("last_run_at"),
  lastStatus: varchar("last_status", { length: 32 }),
  nextExecutionAt: timestamp("next_execution_at"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => [index("backup_verification_configs_task_uid_idx").on(table.scheduleCronTaskUid)]);

export type BackupVerificationConfig = typeof backupVerificationConfigs.$inferSelect;

export const backupVerificationRuns = mysqlTable("backup_verification_runs", {
  id: int("id").autoincrement().primaryKey(),
  backupRecordId: int("backup_record_id"),
  runType: mysqlEnum("run_type", ["manual", "scheduled", "isolated_full"]).notNull(),
  status: mysqlEnum("status", ["running", "passed", "failed", "skipped"]).notNull(),
  sampleRowsPerTable: int("sample_rows_per_table").default(3).notNull(),
  attemptedRows: text("attempted_rows"),
  coverage: text("coverage"),
  validation: text("validation"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, table => [index("backup_verification_runs_backup_record_idx").on(table.backupRecordId), index("backup_verification_runs_started_at_idx").on(table.startedAt)]);

export type BackupVerificationRun = typeof backupVerificationRuns.$inferSelect;

/**
 * Items table (الأصناف)
 */
export const warehouses = mysqlTable("warehouses", {
  id: int("id").autoincrement().primaryKey(),
  slot: int("slot").notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Warehouse = typeof warehouses.$inferSelect;
export type InsertWarehouse = typeof warehouses.$inferInsert;

export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 180 }).notNull().unique(),
  phone: varchar("phone", { length: 64 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = typeof suppliers.$inferInsert;

export const items = mysqlTable("items", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(), // كود الصنف
  warehouseId: int("warehouse_id"), // المخزن الأساسي للصنف
  name: text("name").notNull(), // بيان / اسم الصنف
  initialStock: decimal("initial_stock", { precision: 12, scale: 3 }).default("0").notNull(), // الرصيد الأولي
  incomingStock: decimal("incoming_stock", { precision: 12, scale: 3 }).default("0").notNull(), // الوارد
  outgoingStock: decimal("outgoing_stock", { precision: 12, scale: 3 }).default("0").notNull(), // المنصرف
  currentStock: decimal("current_stock", { precision: 12, scale: 3 }).default("0").notNull(), // الرصيد الحالي
  reorderLevel: decimal("reorder_level", { precision: 12, scale: 3 }).default("0").notNull(), // حد الطلب
  category: varchar("category", { length: 128 }), // نوع الصنف
  unit: varchar("unit", { length: 64 }), // وحدة القياس
  imageKey: varchar("image_key", { length: 255 }), // مفتاح الصورة في التخزين
  imageUrl: varchar("image_url", { length: 500 }), // رابط الصورة
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).default("0").notNull(), // سعر الوحدة
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("items_warehouse_id_idx").on(table.warehouseId)]);

export type Item = typeof items.$inferSelect;
export type InsertItem = typeof items.$inferInsert;

/**
 * Physical balance of an item inside a particular warehouse.
 * Existing aggregate item balances remain untouched and continue to represent
 * company-wide totals; this table supports future warehouse-level movements.
 */
export const itemWarehouseBalances = mysqlTable("item_warehouse_balances", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("item_id").notNull(),
  warehouseId: int("warehouse_id").notNull(),
  currentStock: decimal("current_stock", { precision: 12, scale: 3 }).default("0").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("item_warehouse_balances_item_warehouse_uq").on(table.itemId, table.warehouseId),
  index("item_warehouse_balances_warehouse_idx").on(table.warehouseId),
]);

export type ItemWarehouseBalance = typeof itemWarehouseBalances.$inferSelect;
export type InsertItemWarehouseBalance = typeof itemWarehouseBalances.$inferInsert;

/**
 * Additions table (الإضافات - add)
 */
export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 180 }).notNull().unique(),
  phone: varchar("phone", { length: 64 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

export const additions = mysqlTable("additions", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 32 }).notNull(), // التاريخ
  eznNum: varchar("ezn_num", { length: 64 }).notNull(), // رقم الإذن
  itemCode: varchar("item_code", { length: 64 }).notNull(), // كود الصنف
  itemName: text("item_name"), // بيان الصنف
  store: varchar("store", { length: 128 }), // مخزن الإضافة
  warehouseId: int("warehouse_id"), // المخزن المستلم للحركات المستقبلية
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(), // الكمية
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).default("0").notNull(), // سعر الوحدة وقت الإضافة
  totalValue: decimal("total_value", { precision: 14, scale: 2 }).default("0").notNull(), // إجمالي قيمة الإضافة
  purpose: text("purpose"), // لزوم
  supplier: varchar("supplier", { length: 128 }), // وارد من / المورد
  supplierId: int("supplier_id"), // مرجع المورد من الدليل
  category: varchar("category", { length: 128 }), // نوع الصنف
  documentImageKey: varchar("document_image_key", { length: 255 }), // صورة إذن الإضافة الورقي
  documentImageUrl: varchar("document_image_url", { length: 500 }),
  clientRequestId: varchar("client_request_id", { length: 64 }).unique(), // مفتاح idempotency للمزامنة Offline
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("additions_item_code_idx").on(table.itemCode), index("additions_ezn_num_idx").on(table.eznNum)]);

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
  customerId: int("customer_id"), // العميل أو الجهة المستلمة
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(), // الكمية
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).default("0").notNull(), // سعر الوحدة وقت الصرف
  totalValue: decimal("total_value", { precision: 14, scale: 2 }).default("0").notNull(), // إجمالي قيمة الصرف
  notes: text("notes"), // ملاحظات
  store: varchar("store", { length: 128 }), // المخزن
  warehouseId: int("warehouse_id"), // المخزن المصدر للحركات المستقبلية
  disburseType: varchar("disburse_type", { length: 128 }), // نوع الصرف
  documentImageKey: varchar("document_image_key", { length: 255 }), // صورة إذن الصرف الورقي
  documentImageUrl: varchar("document_image_url", { length: 500 }),
  clientRequestId: varchar("client_request_id", { length: 64 }).unique(), // مفتاح idempotency للمزامنة Offline
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("disbursements_item_code_idx").on(table.itemCode), index("disbursements_ezn_num_idx").on(table.eznNum)]);

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
  fromWarehouseId: int("from_warehouse_id"), // مخزن المصدر للتحويل الداخلي
  toWarehouseId: int("to_warehouse_id"), // مخزن الوجهة للتحويل أو المرتجع
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).default("0").notNull(), // سعر الوحدة وقت التحويل أو المرتجع
  totalValue: decimal("total_value", { precision: 14, scale: 2 }).default("0").notNull(), // إجمالي القيمة
  notes: text("notes"),
  transferType: varchar("transfer_type", { length: 64 }), // تحويل أو مرتجع
  documentImageKey: varchar("document_image_key", { length: 255 }), // صورة إذن المرتجع الورقي
  documentImageUrl: varchar("document_image_url", { length: 500 }),
  clientRequestId: varchar("client_request_id", { length: 64 }).unique(), // مفتاح idempotency للمزامنة Offline
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("transfers_item_code_idx").on(table.itemCode), index("transfers_ezn_num_idx").on(table.eznNum)]);

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

export const userPreferences = mysqlTable("user_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().unique(),
  quickActions: text("quick_actions").notNull(),
  hapticEnabled: boolean("haptic_enabled").default(true).notNull(),
  reportColumnOrder: text("report_column_order"),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserPreference = typeof userPreferences.$inferSelect;
export type InsertUserPreference = typeof userPreferences.$inferInsert;

export const userPermissions = mysqlTable("user_permissions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().unique(),
  allowedScreens: text("allowed_screens").notNull(),
  allowedReports: text("allowed_reports").notNull(),
  allowedWarehouses: varchar("allowed_warehouses", { length: 2000 }).notNull().default("[]"),
  readOnly: boolean("read_only").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserPermission = typeof userPermissions.$inferSelect;
export type InsertUserPermission = typeof userPermissions.$inferInsert;
