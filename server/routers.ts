import { TRPCError } from "@trpc/server";
import { parse as parseCookie } from "cookie";
import { z } from "zod";
import { buildActivityCleanupAuditDetails } from "./activityCleanup";
import {
  createAddition,
  createDisbursement,
  createItem,
  importItems,
  importMovements,
  createTransfer,
  deleteAddition,
  deleteDisbursement,
  deleteItem,
  deleteTransfer,
  getInventoryRows,
  getItemByCode,
  getItemCard,
  getMainWarehouseItemCards,
  getWarehouseItemCards,
  listWarehouseBalanceSummaries,
  suggestNextItemCode,
  getItemById,
  getLatestPermitSummaries,
  getRecentMovements,
  getMovementAnalytics,
  getReportDataset,
  getCompanyInventoryAuditReport,
  getSettingValue,
  getUserPreferences,
  upsertUserPreferences,
  setUserOnboardingCompleted,
  InventoryError,
  listAdditions,
  listAdditionsPaged,
  listSupplierAccount,
  listCustomerAccount,
  listDisbursements,
  listDisbursementsPaged,
  listItems,
  listWarehouseStockRows,
  listWarehouseLowStockItems,
  listItemsPaged,
  listItemCategories,
  listSettings,
  listTransfers,
  listTransfersPaged,
  listWarehouses,
  listWarehousesForAccess,
  listWarehousesByUsage,
  listWarehousesByUsageForAccess,
  updateWarehouse,
  listSuppliers,
  createSupplier,
  updateSupplier,
  listCustomers,
  createCustomer,
  updateCustomer,
  updateAddition,
  updateDisbursement,
  updateItem,
  updateItemImage,
  updateAdditionDocumentImage,
  updateDisbursementDocumentImage,
  updateTransfer,
  clearMovementDocumentImage,
  upsertSetting,
  createAuditLog,
  listAuditLogs,
  listShareActivity,
  clearShareActivity,
  clearLoginActivity,
  listLoginAuditLogs,
  listSecurityNotifications,
  markSecurityNotificationsRead,
  createNotification,
  listNotificationsCreatedBy,
  listNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
  clearReadNotifications,
  deleteUserNotifications,
  createHelpRequest,
  listHelpRequests,
  listHelpRequestsForUser,
  markHelpRequestRead,
  updateHelpRequestStatus,
  revokeLoginSession,
  listUsersForManagement,
  updateManagedUserRole,
  listUserAbsences,
  createUserAbsence,
  updateUserAbsence,
  deleteUserAbsence,
  getUserAbsenceTotals,
  getUserPermissionSettings,
  getMovementWarehouseIds,
  listManagedUserPermissions,
  upsertUserPermissionSettings,
  exportBackupSnapshot,
  restoreBackupSnapshot,
  resetOperationalData,
  createBackupRecord,
  listBackupRecords,
  listChatConversations,
  listChatUsers,
  listChatMessages,
  createPrivateConversation,
  sendChatMessage,
  markChatConversationRead,
  deleteChatMessage,
  cleanupOldChatMessages,
  deleteAllChatMessages,
  getBackupSnapshotFromRecord,
  getBackupVerificationConfig,
  listBackupVerificationRuns,
  runLatestBackupVerification,
  runIsolatedFullBackupRestore,
  getNextWeeklyBackupExecution,
  saveBackupVerificationSchedule,
  cleanupExpiredBackupRecords,
  sendBackupEmailTest,
} from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { whatsappRouter } from "./whatsappRouter";
import { adminProcedure, managementProcedure, entryProcedure, writePermissionProcedure, itemCreateProcedure, reviewProcedure, permissionProcedure, reportPermissionProcedure, protectedProcedure, publicProcedure, router, canAccessWarehouses } from "./_core/trpc";
import { COOKIE_NAME } from "@shared/const";
import { uploadItemImage } from "./itemImageUpload";
import { uploadCompanyLogo } from "./companyLogoUpload";
import { uploadDocumentImage } from "./documentImageUpload";
import { storageDelete } from "./storage";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import { transcribeAudio } from "./_core/voiceTranscription";

const DEFAULT_GOOGLE_SEARCH_ENGINE_ID = "01b5a823a6a9140c6";

function rethrowInventoryError(error: unknown): never {
  if (error instanceof InventoryError) {
    const code =
      error.kind === "NOT_FOUND"
        ? "NOT_FOUND"
        : error.kind === "CONFLICT"
          ? "CONFLICT"
          : error.kind === "UNAVAILABLE"
            ? "INTERNAL_SERVER_ERROR"
            : "BAD_REQUEST";
    throw new TRPCError({ code, message: error.message });
  }
  throw error;
}

async function safe<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    rethrowInventoryError(error);
  }
}
function canViewWarehouse(allowedWarehouseIds: number[], warehouseId: number | null | undefined) {
  return !allowedWarehouseIds.length || (warehouseId != null && allowedWarehouseIds.includes(warehouseId));
}

function assertWarehouseAccess(permissions: { allowedWarehouseIds: number[] }, warehouseIds: Array<number | null | undefined>) {
  if (!canAccessWarehouses(permissions.allowedWarehouseIds, warehouseIds)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الوصول إلى هذا المخزن" });
  }
}

async function assertExistingMovementAccess(type: "addition" | "disbursement" | "transfer", id: number, permissions: { allowedWarehouseIds: number[] }) {
  const warehouseIds = await safe(() => getMovementWarehouseIds(type, id));
  if (!warehouseIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "سجل الحركة غير موجود" });
  assertWarehouseAccess(permissions, warehouseIds);
  return warehouseIds;
}

const itemInput = z.object({
  code: z.string().trim().max(64).optional(),
  warehouseId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1, "اسم الصنف مطلوب").max(500),
  initialStock: z.coerce.number().min(0).default(0),
  reorderLevel: z.coerce.number().min(0).default(0),
  category: z.string().trim().max(128).nullable().optional(),
  unit: z.string().trim().max(64).nullable().optional(),
  unitPrice: z.coerce.number().min(0).default(0),
});

const importItemInput = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(500),
  initialStock: z.coerce.number().min(0).default(0),
  reorderLevel: z.coerce.number().min(0).default(0),
  category: z.string().trim().max(128).nullable().optional(),
  unit: z.string().trim().max(64).nullable().optional(),
  unitPrice: z.coerce.number().min(0).optional(),
});

const warehouseUpdateInput = z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(128) });
const supplierInput = z.object({ name: z.string().trim().min(1).max(180), phone: z.string().trim().max(64).nullable().optional(), email: z.string().trim().email().max(320).nullable().optional(), address: z.string().trim().max(1000).nullable().optional(), notes: z.string().trim().max(2000).nullable().optional() });
const supplierUpdateInput = supplierInput.partial().extend({ id: z.number().int().positive() });
const customerInput = z.object({ name: z.string().trim().min(1).max(180), phone: z.string().trim().max(64).nullable().optional(), email: z.string().trim().email().max(320).nullable().optional(), address: z.string().trim().max(1000).nullable().optional(), notes: z.string().trim().max(2000).nullable().optional() });
const customerUpdateInput = customerInput.partial().extend({ id: z.number().int().positive() });
const additionInput = z.object({
  date: z.string().trim().min(1, "التاريخ مطلوب").max(32),
  eznNum: z.string().trim().min(1, "رقم الإذن مطلوب").max(64),
  itemCode: z.string().trim().min(1, "كود الصنف مطلوب").max(64),
  store: z.string().trim().max(128).nullable().optional(),
  warehouseId: z.number().int().positive().nullable().optional(),
  quantity: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر"),
  purpose: z.string().trim().max(500).nullable().optional(),
  supplier: z.string().trim().max(128).nullable().optional(),
  supplierId: z.number().int().positive().nullable().optional(),
  category: z.string().trim().max(128).nullable().optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  clientRequestId: z.string().trim().min(16).max(64).nullable().optional(),
});

const disbursementInput = z.object({
  date: z.string().trim().min(1, "التاريخ مطلوب").max(32),
  eznNum: z.string().trim().min(1, "رقم الإذن مطلوب").max(64),
  itemCode: z.string().trim().min(1, "كود الصنف مطلوب").max(64),
  destination: z.string().trim().max(128).nullable().optional(),
  customerId: z.number().int().positive().nullable().optional(),
  quantity: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر"),
  notes: z.string().trim().max(1000).nullable().optional(),
  store: z.string().trim().max(128).nullable().optional(),
  warehouseId: z.number().int().positive().nullable().optional(),
  disburseType: z.string().trim().max(128).nullable().optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  clientRequestId: z.string().trim().min(16).max(64).nullable().optional(),
});

const movementImportRow = z.object({
  type: z.enum(["addition", "disbursement", "transfer"]),
  date: z.string().trim().min(1).max(32),
  eznNum: z.string().trim().min(1).max(64),
  itemCode: z.string().trim().min(1).max(64),
  quantity: z.coerce.number().positive(),
  store: z.string().trim().max(128).nullable().optional(),
  purpose: z.string().trim().max(500).nullable().optional(),
  supplier: z.string().trim().max(128).nullable().optional(),
  category: z.string().trim().max(128).nullable().optional(),
  destination: z.string().trim().max(128).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  disburseType: z.string().trim().max(128).nullable().optional(),
  fromStore: z.string().trim().max(128).nullable().optional(),
  toStore: z.string().trim().max(128).nullable().optional(),
  transferType: z.string().trim().max(64).nullable().optional(),
  unitPrice: z.coerce.number().min(0).optional(),
});

const transferInput = z.object({
  date: z.string().trim().min(1, "التاريخ مطلوب").max(32),
  eznNum: z.string().trim().min(1, "رقم الإذن مطلوب").max(64),
  itemCode: z.string().trim().min(1, "كود الصنف مطلوب").max(64),
  fromStore: z.string().trim().max(128).nullable().optional(),
  toStore: z.string().trim().max(128).nullable().optional(),
  fromWarehouseId: z.number().int().positive().nullable().optional(),
  toWarehouseId: z.number().int().positive().nullable().optional(),
  quantity: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر"),
  notes: z.string().trim().max(1000).nullable().optional(),
  transferType: z.string().trim().max(64).nullable().optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  clientRequestId: z.string().trim().min(16).max(64).nullable().optional(),
});

export const appRouter = router({
  system: systemRouter,
  whatsapp: whatsappRouter,
  voice: router({
    transcribe: protectedProcedure.input(z.object({ audioDataBase64: z.string().min(20).max(12_000_000), mimeType: z.string().trim().min(3).max(100), language: z.string().trim().max(20).optional() })).mutation(async ({ input }) => {
      const result = await transcribeAudio({ audioUrl: `data:${input.mimeType};base64,${input.audioDataBase64}`, language: input.language ?? "ar" });
      if ("error" in result) throw new TRPCError({ code: "BAD_REQUEST", message: result.error, cause: result });
      return { text: result.text, language: result.language };
    }),
  }),

  warehouses: router({
    list: protectedProcedure.query(async ({ ctx }) => { const permissions = await safe(() => getUserPermissionSettings(ctx.user.id, ctx.user.role)); return safe(() => listWarehousesForAccess(permissions.allowedWarehouseIds)); }),
    listByUsage: protectedProcedure.query(async ({ ctx }) => { const permissions = await safe(() => getUserPermissionSettings(ctx.user.id, ctx.user.role)); return safe(() => listWarehousesByUsageForAccess(permissions.allowedWarehouseIds)); }),
    update: adminProcedure.input(warehouseUpdateInput).mutation(({ input }) => safe(() => updateWarehouse(input))),
  }),
  suppliers: router({
    list: protectedProcedure.query(() => safe(() => listSuppliers())),
    create: protectedProcedure.input(supplierInput).mutation(({ input }) => safe(() => createSupplier(input))),
    update: protectedProcedure.input(supplierUpdateInput).mutation(({ input }) => safe(() => updateSupplier(input))),
  }),
  customers: router({
    list: protectedProcedure.query(() => safe(() => listCustomers())),
    create: protectedProcedure.input(customerInput).mutation(({ input }) => safe(() => createCustomer(input))),
    update: protectedProcedure.input(customerUpdateInput).mutation(({ input }) => safe(() => updateCustomer(input))),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  items: router({
    list: permissionProcedure("inventory")
      .input(z.object({ search: z.string().optional(), warehouseId: z.number().int().positive().optional() }).optional())
      .query(async ({ ctx, input }) => { const permissions = await safe(() => getUserPermissionSettings(ctx.user.id, ctx.user.role)); if (input?.warehouseId && !canViewWarehouse(permissions.allowedWarehouseIds, input.warehouseId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية رؤية هذا المخزن" }); const rows = await safe(() => input?.warehouseId ? listItems(input.search, input.warehouseId) : listItems(input?.search)); return permissions.allowedWarehouseIds.length ? rows.filter(row => canViewWarehouse(permissions.allowedWarehouseIds, row.warehouseId)) : rows; }),
    warehouseStocks: permissionProcedure("inventory")
      .input(z.object({ warehouseId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const permissions = await safe(() => getUserPermissionSettings(ctx.user.id, ctx.user.role));
        if (!canViewWarehouse(permissions.allowedWarehouseIds, input.warehouseId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية رؤية هذا المخزن" });
        const rows = await safe(() => listWarehouseStockRows(input.warehouseId));
        const canViewFinancialDetails = permissions.allowedReports.includes("warehouse-financial-details");
        return canViewFinancialDetails ? rows : rows.map(({ unitPrice: _unitPrice, ...row }) => row);
      }),
    warehouseLowStock: permissionProcedure("inventory").query(async ({ ctx }) => { const permissions = await safe(() => getUserPermissionSettings(ctx.user.id, ctx.user.role)); const rows = await safe(() => listWarehouseLowStockItems()); return permissions.allowedWarehouseIds.length ? rows.filter(row => canViewWarehouse(permissions.allowedWarehouseIds, row.warehouseId)) : rows; }),
    warehouseBalanceSummaries: permissionProcedure("inventory").query(async ({ ctx }) => { const permissions = await safe(() => getUserPermissionSettings(ctx.user.id, ctx.user.role)); const rows = await safe(() => listWarehouseBalanceSummaries()); return permissions.allowedWarehouseIds.length ? rows.filter(row => permissions.allowedWarehouseIds.includes(row.id)) : rows; }),
    listPaged: permissionProcedure("inventory")
      .input(z.object({ search: z.string().optional(), warehouseId: z.number().int().positive().optional(), category: z.string().optional(), stockFilter: z.enum(["all", "low", "healthy"]).default("all"), sortBy: z.enum(["name", "code", "stock"]).default("name"), page: z.number().int().positive().default(1), pageSize: z.number().int().min(10).max(100).default(24) }))
      .query(async ({ ctx, input }) => {
        const permissions = await safe(() => getUserPermissionSettings(ctx.user.id, ctx.user.role));
        if (input.warehouseId && !canViewWarehouse(permissions.allowedWarehouseIds, input.warehouseId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية رؤية هذا المخزن" });
        const result = await safe(() => listItemsPaged(input, permissions.allowedWarehouseIds));
        const canViewFinancialDetails = permissions.allowedReports.includes("warehouse-financial-details");
        return canViewFinancialDetails ? result : { ...result, items: result.items.map(({ unitPrice: _unitPrice, ...item }) => item) };
      }),
    categories: permissionProcedure("inventory").query(({ ctx }) => safe(() => listItemCategories(ctx.permissions.allowedWarehouseIds))),
    getById: permissionProcedure("inventory").input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => { const permissions = await safe(() => getUserPermissionSettings(ctx.user.id, ctx.user.role)); const item = await safe(() => getItemById(input.id)); if (item && !canViewWarehouse(permissions.allowedWarehouseIds, item.warehouseId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية رؤية هذا الصنف" }); return item; }),
    getByCode: permissionProcedure("inventory").input(z.object({ code: z.string().trim().min(1) })).query(async ({ ctx, input }) => { const permissions = await safe(() => getUserPermissionSettings(ctx.user.id, ctx.user.role)); const item = await safe(() => getItemByCode(input.code)); if (item && !canViewWarehouse(permissions.allowedWarehouseIds, item.warehouseId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية رؤية هذا الصنف" }); return item; }),
    card: reportPermissionProcedure("item-card").input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => { const permissions = ctx.permissions; const item = await safe(() => getItemById(input.id)); if (item && !canViewWarehouse(permissions.allowedWarehouseIds, item.warehouseId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية رؤية هذا الصنف" }); return safe(() => getItemCard(input.id, permissions.allowedWarehouseIds)); }),
    mainWarehouseCards: permissionProcedure("inventory").query(async ({ ctx }) => { const permissions = ctx.permissions; if (permissions.allowedWarehouseIds.length && !permissions.allowedWarehouseIds.includes(1)) return []; return safe(() => getMainWarehouseItemCards(permissions.allowedWarehouseIds)); }),
    warehouseCards: permissionProcedure("inventory")
      .input(z.object({ warehouseId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => { const permissions = ctx.permissions; if (!canViewWarehouse(permissions.allowedWarehouseIds, input.warehouseId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية رؤية هذا المخزن" }); return safe(() => getWarehouseItemCards(input.warehouseId, permissions.allowedWarehouseIds)); }),
    nextCode: protectedProcedure.input(z.object({ warehouseId: z.number().int().positive().nullable().optional() }).optional()).query(async ({ ctx, input }) => {
      const permissions = await safe(() => getUserPermissionSettings(ctx.user.id, ctx.user.role));
      assertWarehouseAccess(permissions, [input?.warehouseId]);
      return safe(() => suggestNextItemCode(input?.warehouseId));
    }),
    uploadImage: writePermissionProcedure("inventory")
      .input(z.object({
        itemId: z.number().int().positive(),
        fileName: z.string().trim().min(1).max(128),
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        dataBase64: z.string().min(20).max(7_000_000),
      }))
      .mutation(async ({ input, ctx }) => { const item = await safe(() => getItemById(input.itemId)); if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "الصنف غير موجود" }); assertWarehouseAccess(ctx.permissions, [item.warehouseId]); return safe(() => uploadItemImage(input)); }),
    clearImage: writePermissionProcedure("inventory")
      .input(z.object({ itemId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => { const item = await safe(() => getItemById(input.itemId)); if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "الصنف غير موجود" }); assertWarehouseAccess(ctx.permissions, [item.warehouseId]); return safe(() => updateItemImage(input.itemId, null, null)); }),
    create: itemCreateProcedure.input(itemInput).mutation(async ({ input, ctx }) => { assertWarehouseAccess(ctx.permissions, [input.warehouseId]); const result = await safe(() => createItem(input)); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "create", entity: "item", entityId: result?.id, details: { code: result?.code, name: result?.name } }); return result; }),
    importBulk: itemCreateProcedure
      .input(z.object({ rows: z.array(importItemInput).min(1).max(5000) }))
      .mutation(({ input, ctx }) => { if (ctx.permissions.allowedWarehouseIds.length) throw new TRPCError({ code: "FORBIDDEN", message: "الاستيراد الجماعي يتطلب صلاحية إدارة جميع المخازن" }); return safe(() => importItems(input.rows)); }),
    importMovements: protectedProcedure
      .input(z.object({ rows: z.array(movementImportRow).min(1).max(5000) }))
      .mutation(async ({ input, ctx }) => { const permissions = await safe(() => getUserPermissionSettings(ctx.user.id, ctx.user.role)); if (permissions.allowedWarehouseIds.length || permissions.readOnly) throw new TRPCError({ code: "FORBIDDEN", message: "استيراد الحركات يتطلب صلاحية إدارة جميع المخازن" }); return safe(() => importMovements(input.rows)); }),
    update: writePermissionProcedure("inventory")
      .input(itemInput.partial().extend({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => { const existing = await safe(() => getItemById(input.id)); if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "الصنف غير موجود" }); assertWarehouseAccess(ctx.permissions, [existing.warehouseId, input.warehouseId]); const result = await safe(() => updateItem(input)); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "update", entity: "item", entityId: input.id, details: input }); return result; }),
    delete: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => { const result = await safe(() => deleteItem(input.id)); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "delete", entity: "item", entityId: input.id }); return result; }),
  }),

  additions: router({
    list: permissionProcedure("additions")
      .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
      .query(({ input, ctx }) => safe(() => listAdditions(input?.limit ?? 100, ctx.permissions.allowedWarehouseIds))),
    listPaged: permissionProcedure("additions").input(z.object({ page: z.number().int().positive().default(1), pageSize: z.number().int().min(10).max(100).default(50), itemSearch: z.string().trim().optional(), permitSearch: z.string().trim().optional(), purposeSearch: z.string().trim().optional(), fromDate: z.string().trim().optional(), toDate: z.string().trim().optional(), supplierId: z.number().int().positive().optional() })).query(({ input, ctx }) => safe(() => listAdditionsPaged(input, ctx.permissions.allowedWarehouseIds))),
    account: reportPermissionProcedure("supplier-account").input(z.object({ supplierId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const permissions = await safe(() => getUserPermissionSettings(ctx.user.id, ctx.user.role));
      const rows = await safe(() => listSupplierAccount(input.supplierId, permissions.allowedWarehouseIds));
      const canViewFinancialDetails = permissions.allowedReports.includes("warehouse-financial-details");
      return canViewFinancialDetails ? rows : rows.map(({ unitPrice: _unitPrice, totalValue: _totalValue, ...row }) => row);
    }),
    create: writePermissionProcedure("additions").input(additionInput).mutation(async ({ input, ctx }) => { assertWarehouseAccess(ctx.permissions, [input.warehouseId]); const result = await safe(() => createAddition(input)); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "create", entity: "addition", entityId: result?.id, details: { itemCode: input.itemCode, quantity: input.quantity } }); return result; }),
    update: writePermissionProcedure("additions")
      .input(additionInput.partial().extend({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => { const existing = await assertExistingMovementAccess("addition", input.id, ctx.permissions); assertWarehouseAccess(ctx.permissions, [input.warehouseId ?? existing[0]]); const result = await safe(() => updateAddition(input)); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "update", entity: "addition", entityId: input.id, details: input }); return result; }),
    uploadDocumentImage: writePermissionProcedure("additions")
      .input(z.object({ movementId: z.number().int().positive(), fileName: z.string().trim().min(1).max(128), contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), dataBase64: z.string().min(20).max(7_000_000) }))
      .mutation(async ({ input, ctx }) => { await assertExistingMovementAccess("addition", input.movementId, ctx.permissions); return safe(() => uploadDocumentImage({ ...input, movementType: "addition" })); }),
    clearDocumentImage: writePermissionProcedure("additions").input(z.object({ movementId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      await assertExistingMovementAccess("addition", input.movementId, ctx.permissions);
      const result = await safe(() => clearMovementDocumentImage("addition", input.movementId));
      if (result.imageKey) { try { await storageDelete(result.imageKey); } catch (error) { console.warn("[Storage] Failed to delete addition document image:", error); } }
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "clear_document_image", entity: "addition", entityId: input.movementId });
      return result;
    }),
    delete: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => { const result = await safe(() => deleteAddition(input.id)); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "delete", entity: "addition", entityId: input.id }); return result; }),
  }),

  disbursements: router({
    list: permissionProcedure("disbursements")
      .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
      .query(({ input, ctx }) => safe(() => listDisbursements(input?.limit ?? 100, ctx.permissions.allowedWarehouseIds))),
    listPaged: permissionProcedure("disbursements").input(z.object({ page: z.number().int().positive().default(1), pageSize: z.number().int().min(10).max(100).default(50), itemSearch: z.string().trim().optional(), permitSearch: z.string().trim().optional(), purposeSearch: z.string().trim().optional(), fromDate: z.string().trim().optional(), toDate: z.string().trim().optional(), customerId: z.number().int().positive().optional() })).query(({ input, ctx }) => safe(() => listDisbursementsPaged(input, ctx.permissions.allowedWarehouseIds))),
    account: reportPermissionProcedure("customer-account").input(z.object({ customerId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const permissions = await safe(() => getUserPermissionSettings(ctx.user.id, ctx.user.role));
      const rows = await safe(() => listCustomerAccount(input.customerId, permissions.allowedWarehouseIds));
      const canViewFinancialDetails = permissions.allowedReports.includes("warehouse-financial-details");
      return canViewFinancialDetails ? rows : rows.map(({ unitPrice: _unitPrice, totalValue: _totalValue, ...row }) => row);
    }),
    create: writePermissionProcedure("disbursements")
      .input(disbursementInput)
      .mutation(async ({ input, ctx }) => { assertWarehouseAccess(ctx.permissions, [input.warehouseId]); const result = await safe(() => createDisbursement(input)); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "create", entity: "disbursement", entityId: result?.id, details: { itemCode: input.itemCode, quantity: input.quantity } }); return result; }),
    update: writePermissionProcedure("disbursements")
      .input(disbursementInput.partial().extend({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => { const existing = await assertExistingMovementAccess("disbursement", input.id, ctx.permissions); assertWarehouseAccess(ctx.permissions, [input.warehouseId ?? existing[0]]); const result = await safe(() => updateDisbursement(input)); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "update", entity: "disbursement", entityId: input.id, details: input }); return result; }),
    uploadDocumentImage: writePermissionProcedure("disbursements")
      .input(z.object({ movementId: z.number().int().positive(), fileName: z.string().trim().min(1).max(128), contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), dataBase64: z.string().min(20).max(7_000_000) }))
      .mutation(async ({ input, ctx }) => { await assertExistingMovementAccess("disbursement", input.movementId, ctx.permissions); return safe(() => uploadDocumentImage({ ...input, movementType: "disbursement" })); }),
    clearDocumentImage: writePermissionProcedure("disbursements").input(z.object({ movementId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      await assertExistingMovementAccess("disbursement", input.movementId, ctx.permissions);
      const result = await safe(() => clearMovementDocumentImage("disbursement", input.movementId));
      if (result.imageKey) { try { await storageDelete(result.imageKey); } catch (error) { console.warn("[Storage] Failed to delete disbursement document image:", error); } }
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "clear_document_image", entity: "disbursement", entityId: input.movementId });
      return result;
    }),
    delete: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => { const result = await safe(() => deleteDisbursement(input.id)); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "delete", entity: "disbursement", entityId: input.id }); return result; }),
  }),

  transfers: router({
    list: permissionProcedure("transfers")
      .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
      .query(({ input, ctx }) => safe(() => listTransfers(input?.limit ?? 100, ctx.permissions.allowedWarehouseIds))),
    listPaged: permissionProcedure("transfers").input(z.object({ page: z.number().int().positive().default(1), pageSize: z.number().int().min(10).max(100).default(50), itemSearch: z.string().trim().optional(), permitSearch: z.string().trim().optional(), purposeSearch: z.string().trim().optional(), fromDate: z.string().trim().optional(), toDate: z.string().trim().optional() })).query(({ input, ctx }) => safe(() => listTransfersPaged(input, ctx.permissions.allowedWarehouseIds))),
    create: writePermissionProcedure("transfers").input(transferInput).mutation(async ({ input, ctx }) => { assertWarehouseAccess(ctx.permissions, [input.fromWarehouseId, input.toWarehouseId]); const result = await safe(() => createTransfer(input)); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "create", entity: "transfer", entityId: result?.id, details: { itemCode: input.itemCode, quantity: input.quantity, transferType: input.transferType } }); return result; }),
    update: writePermissionProcedure("transfers")
      .input(transferInput.partial().extend({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => { const existing = await assertExistingMovementAccess("transfer", input.id, ctx.permissions); assertWarehouseAccess(ctx.permissions, [input.fromWarehouseId ?? existing[0], input.toWarehouseId ?? existing[1]]); const result = await safe(() => updateTransfer(input)); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "update", entity: "transfer", entityId: input.id, details: input }); return result; }),
    uploadDocumentImage: writePermissionProcedure("transfers")
      .input(z.object({ movementId: z.number().int().positive(), fileName: z.string().trim().min(1).max(128), contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), dataBase64: z.string().min(20).max(7_000_000) }))
      .mutation(async ({ input, ctx }) => { await assertExistingMovementAccess("transfer", input.movementId, ctx.permissions); return safe(() => uploadDocumentImage({ ...input, movementType: "transfer" })); }),
    clearDocumentImage: writePermissionProcedure("transfers").input(z.object({ movementId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      await assertExistingMovementAccess("transfer", input.movementId, ctx.permissions);
      const result = await safe(() => clearMovementDocumentImage("transfer", input.movementId));
      if (result.imageKey) { try { await storageDelete(result.imageKey); } catch (error) { console.warn("[Storage] Failed to delete transfer document image:", error); } }
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "clear_document_image", entity: "transfer", entityId: input.movementId });
      return result;
    }),
    delete: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => { const result = await safe(() => deleteTransfer(input.id)); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "delete", entity: "transfer", entityId: input.id }); return result; }),
  }),

  reports: router({
    dataset: permissionProcedure("reports").input(z.object({ includeRows: z.boolean().default(false), fromDate: z.string().trim().optional(), toDate: z.string().trim().optional(), permitSearch: z.string().trim().optional(), incomingFromSearch: z.string().trim().optional(), outgoingToSearch: z.string().trim().optional(), additionPurposeSearch: z.string().trim().optional(), disbursementPurposeSearch: z.string().trim().optional(), returnPurposeSearch: z.string().trim().optional() })).query(({ input, ctx }) => safe(() => getReportDataset(input, ctx.permissions.allowedWarehouseIds))),
    inventoryAudit: permissionProcedure("reports").query(({ ctx }) => safe(() => getCompanyInventoryAuditReport(ctx.permissions.allowedWarehouseIds))),
  }),

  dashboard: router({
    movementAnalytics: permissionProcedure("dashboard")
      .input(z.object({ warehouseId: z.number().int().positive().nullable().default(null) }))
      .query(({ ctx, input }) =>
        safe(async () => {
          const permissions = await getUserPermissionSettings(ctx.user.id, ctx.user.role);
          const [rows, configuredThreshold] = await Promise.all([
            getInventoryRows(permissions.allowedWarehouseIds),
            getSettingValue("threshold_percentage", "20"),
          ]);
          const visibleRows = permissions.allowedWarehouseIds.length ? rows.filter(row => canViewWarehouse(permissions.allowedWarehouseIds, row.warehouseId)) : rows;
          const thresholdPercentage = Math.min(100, Math.max(0, Number(configuredThreshold) || 20));
          if (input.warehouseId && !canViewWarehouse(permissions.allowedWarehouseIds, input.warehouseId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية رؤية هذا المخزن" });
          return getMovementAnalytics(visibleRows, thresholdPercentage, input.warehouseId, permissions.allowedWarehouseIds);
        }),
      ),
    summary: permissionProcedure("dashboard").query(async ({ ctx }) =>
      safe(async () => {
        const permissions = await getUserPermissionSettings(ctx.user.id, ctx.user.role);
        const [rows, movements, latestPermits, configuredThreshold] = await Promise.all([
          getInventoryRows(permissions.allowedWarehouseIds),
          getRecentMovements(8, permissions.allowedWarehouseIds),
          getLatestPermitSummaries(permissions.allowedWarehouseIds),
          getSettingValue("threshold_percentage", "20"),
        ]);
        const visibleRows = permissions.allowedWarehouseIds.length ? rows.filter(row => canViewWarehouse(permissions.allowedWarehouseIds, row.warehouseId)) : rows;
        const visibleMovements = permissions.allowedWarehouseIds.length ? {
          additions: movements.additions.filter(row => canViewWarehouse(permissions.allowedWarehouseIds, row.warehouseId)),
          disbursements: movements.disbursements.filter(row => canViewWarehouse(permissions.allowedWarehouseIds, row.warehouseId)),
          transfers: movements.transfers.filter(row => canViewWarehouse(permissions.allowedWarehouseIds, row.fromWarehouseId) || canViewWarehouse(permissions.allowedWarehouseIds, row.toWarehouseId)),
        } : movements;
        const thresholdPercentage = Math.min(100, Math.max(0, Number(configuredThreshold) || 20));
        const lowStock = visibleRows.filter(item => {
          const current = Number(item.currentStock ?? 0);
          const reorder = Number(item.reorderLevel ?? 0);
          if (reorder <= 0) return current <= 0;
          return current <= reorder * (thresholdPercentage / 100);
        });
        const total = (field: "currentStock" | "incomingStock" | "outgoingStock") =>
          visibleRows.reduce((sum, item) => sum + Number(item[field] ?? 0), 0);
        const itemCountsByWarehouse = Array.from(visibleRows.reduce((counts, item) => {
          const warehouseId = item.warehouseId ?? null;
          counts.set(warehouseId, (counts.get(warehouseId) ?? 0) + 1);
          return counts;
        }, new Map<number | null, number>()).entries()).map(([warehouseId, count]) => ({ warehouseId, count }));
        const analytics = await getMovementAnalytics(visibleRows, thresholdPercentage, null, permissions.allowedWarehouseIds);
        return {
          stats: {
            totalItems: visibleRows.length,
            lowStockCount: lowStock.length,
            totalCurrentStock: total("currentStock"),
            totalIncoming: total("incomingStock"),
            totalOutgoing: total("outgoingStock"),
            itemCountsByWarehouse,
          },
          thresholdPercentage,
          lowStock,
          recentMovements: visibleMovements,
          latestPermits,
          analytics,
        };
      }),
    ),
  }),

  notifications: router({
    list: protectedProcedure.query(({ ctx }) => safe(() => listNotificationsForUser(ctx.user.id, 100))),
    sent: adminProcedure.query(({ ctx }) => safe(() => listNotificationsCreatedBy(ctx.user.id, 500))),
    markRead: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => safe(() => markNotificationRead({ id: input.id, userId: ctx.user.id }))),
    markAllRead: protectedProcedure.mutation(({ ctx }) => safe(() => markAllNotificationsRead(ctx.user.id))),
    clearRead: adminProcedure.mutation(async ({ ctx }) => { const result = await safe(() => clearReadNotifications(ctx.user.id)); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "clear_read_notifications", entity: "notifications", details: { deleted: result.deleted } }); return result; }),
    clearMine: protectedProcedure.mutation(({ ctx }) => safe(() => deleteUserNotifications(ctx.user.id))),
    submitHelpRequest: protectedProcedure.input(z.object({ title: z.string().trim().min(3).max(255), message: z.string().trim().min(5).max(5000), priority: z.enum(["low", "normal", "high", "critical"]).default("normal") })).mutation(({ ctx, input }) => safe(() => createHelpRequest({ senderUserId: ctx.user.id, ...input }))),
    helpRequests: adminProcedure.query(() => safe(() => listHelpRequests(300))),
    myHelpRequests: protectedProcedure.query(({ ctx }) => safe(() => listHelpRequestsForUser(ctx.user.id, 100))),
    markHelpRequestRead: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => safe(() => markHelpRequestRead({ id: input.id, ownerUserId: ctx.user.id }))),
    updateHelpRequestStatus: adminProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["new", "in_progress", "completed"]) })).mutation(({ ctx, input }) => safe(() => updateHelpRequestStatus({ id: input.id, ownerUserId: ctx.user.id, status: input.status }))),
    create: adminProcedure.input(z.object({ recipientUserIds: z.array(z.number().int().positive()).max(500).default([]), notificationType: z.string().trim().min(1).max(64), title: z.string().trim().min(1).max(255), message: z.string().trim().min(1).max(5000), priority: z.enum(["low", "normal", "high", "critical"]).default("normal"), link: z.string().trim().max(500).nullable().optional() })).mutation(({ ctx, input }) => safe(async () => { const recipientUserIds = input.recipientUserIds.length ? input.recipientUserIds : (await listUsersForManagement()).map(user => user.id); const { recipientUserIds: _recipientUserIds, ...notification } = input; return Promise.all(recipientUserIds.map(recipientUserId => createNotification({ ...notification, recipientUserId, createdBy: ctx.user.id }))); })),
  }),

  chat: router({
    users: permissionProcedure("chat").query(({ ctx }) => safe(() => listChatUsers(ctx.user.id))),
    conversations: permissionProcedure("chat").query(({ ctx }) => safe(() => listChatConversations(ctx.user.id))),
    messages: permissionProcedure("chat").input(z.object({ conversationId: z.number().int().positive(), limit: z.number().int().min(1).max(100).default(40), beforeId: z.number().int().positive().optional() })).query(({ ctx, input }) => safe(() => listChatMessages({ userId: ctx.user.id, ...input }))),
    createPrivate: permissionProcedure("chat").input(z.object({ participantUserIds: z.array(z.number().int().positive()).min(1).max(49), title: z.string().trim().max(255).nullable().optional() })).mutation(({ ctx, input }) => safe(() => createPrivateConversation({ userId: ctx.user.id, ...input }))),
    send: permissionProcedure("chat").input(z.object({ conversationId: z.number().int().positive(), body: z.string().trim().max(5000).default(""), attachment: z.object({ dataBase64: z.string().min(20).max(12_000_000), name: z.string().trim().min(1).max(255), mime: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf", "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"]), size: z.number().int().positive().max(8 * 1024 * 1024) }).optional() })).mutation(({ ctx, input }) => safe(() => sendChatMessage({ userId: ctx.user.id, ...input }))),
    markRead: permissionProcedure("chat").input(z.object({ conversationId: z.number().int().positive() })).mutation(({ ctx, input }) => safe(() => markChatConversationRead({ userId: ctx.user.id, ...input }))),
    deleteMessage: adminProcedure.input(z.object({ messageId: z.number().int().positive() })).mutation(({ ctx, input }) => safe(async () => { const result = await deleteChatMessage({ messageId: input.messageId, adminUserId: ctx.user.id }); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "delete_chat_message", entity: "chat_message", entityId: input.messageId, details: { reason: "admin_moderation" } }); return result; })),
    cleanupOldMessages: adminProcedure.mutation(({ ctx }) => safe(async () => { const result = await cleanupOldChatMessages({ adminUserId: ctx.user.id, olderThanDays: 30 }); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "cleanup_old_chat_messages", entity: "chat_message", details: { olderThanDays: 30, deletedMessages: result.deletedMessages, deletedReceipts: result.deletedReceipts } }); return result; })),
    deleteAllMessages: adminProcedure.mutation(({ ctx }) => safe(async () => { const result = await deleteAllChatMessages({ adminUserId: ctx.user.id }); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "delete_all_chat_messages", entity: "chat_message", details: result }); return result; })),
  }),

  governance: router({
    audit: managementProcedure.query(() => safe(() => listAuditLogs(300))),
    shareActivity: managementProcedure.query(() => safe(() => listShareActivity(300))),
    clearShareActivity: adminProcedure.mutation(async ({ ctx }) => { const result = await safe(() => clearShareActivity()); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "clear_activity", entity: "share_activity", details: buildActivityCleanupAuditDetails(result.deleted) }); return result; }),
    clearLoginActivity: adminProcedure.mutation(async ({ ctx }) => { const result = await safe(() => clearLoginActivity()); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "clear_activity", entity: "login_activity", details: buildActivityCleanupAuditDetails(result.deleted) }); return result; }),
    loginLogs: adminProcedure.query(() => safe(() => listLoginAuditLogs(300))),
    securityNotifications: adminProcedure.query(() => safe(() => listSecurityNotifications(100))),
    markSecurityNotificationsRead: adminProcedure.mutation(() => safe(() => markSecurityNotificationsRead())),
    revokeLoginSession: adminProcedure.input(z.object({ loginLogId: z.number().int().positive() })).mutation(async ({ input, ctx }) => { const result = await safe(() => revokeLoginSession({ loginLogId: input.loginLogId, revokedBy: ctx.user.id })); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "revoke_session", entity: "login_session", entityId: input.loginLogId, details: { reason: "admin_security_action" } }); return result; }),
    users: adminProcedure.query(() => safe(() => listUsersForManagement())),
    updateUserRole: adminProcedure.input(z.object({ id: z.number().int().positive(), role: z.enum(["user", "admin", "manager", "operator", "reviewer", "reports", "viewer"]) })).mutation(async ({ input, ctx }) => { const result = await safe(() => updateManagedUserRole(input)); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "update_role", entity: "user", entityId: input.id, details: { role: input.role } }); return result; }),
    absenceList: protectedProcedure.query(({ ctx }) => safe(() => listUserAbsences(ctx.user.id))),
    absenceTotals: managementProcedure.query(() => safe(() => getUserAbsenceTotals())),
    absenceAdminList: adminProcedure.query(() => safe(() => listUserAbsences())),
    absenceCreate: adminProcedure.input(z.object({ userId: z.number().int().positive(), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), days: z.number().int().min(1).max(366) })).mutation(async ({ input, ctx }) => { const result = await safe(() => createUserAbsence(input)); await createNotification({ recipientUserId: result.userId, createdBy: ctx.user.id, notificationType: "user_absence", title: "تم تسجيل غيابك", message: `تم تسجيل غيابك ابتداءً من ${result.startDate} لمدة ${result.days} يومًا.`, priority: "normal" }); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "create", entity: "user_absence", entityId: result.id, details: input }); return result; }),
    absenceUpdate: adminProcedure.input(z.object({ id: z.number().int().positive(), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), days: z.number().int().min(1).max(366) })).mutation(async ({ input, ctx }) => { const result = await safe(() => updateUserAbsence(input)); await createNotification({ recipientUserId: result.userId, createdBy: ctx.user.id, notificationType: "user_absence", title: "تم تعديل غيابك", message: `تم تعديل غيابك ليبدأ في ${result.startDate} لمدة ${result.days} يومًا.`, priority: "normal" }); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "update", entity: "user_absence", entityId: input.id, details: input }); return result; }),
    absenceDelete: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => { const result = await safe(() => deleteUserAbsence(input.id)); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "delete", entity: "user_absence", entityId: input.id }); return result; }),
    backupExport: adminProcedure.query(async ({ ctx }) => { const result = await safe(() => exportBackupSnapshot()); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "export", entity: "backup", details: { schemaVersion: result.schemaVersion } }); return result; }),
    backupCreate: adminProcedure.mutation(async ({ ctx }) => { const result = await safe(() => createBackupRecord({ userId: ctx.user.id, userName: ctx.user.name, backupType: "manual" })); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "create", entity: "backup", entityId: result.record.id, details: { fileName: result.record.fileName } }); return result; }),
    backupList: adminProcedure.query(() => safe(() => listBackupRecords(100))),
    backupDownload: adminProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => safe(() => getBackupSnapshotFromRecord(input.id))),
    backupVerificationConfig: adminProcedure.query(() => safe(() => getBackupVerificationConfig())),
    backupVerificationRuns: adminProcedure.query(() => safe(() => listBackupVerificationRuns(30))),
    backupVerificationRunNow: adminProcedure.mutation(async ({ ctx }) => {
      const result = await safe(() => runLatestBackupVerification("manual"));
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "verify_restore", entity: "backup", entityId: result.backupRecordId, details: { runId: result.runId, status: result.status, runType: "manual" } });
      return result;
    }),
    backupVerificationRunIsolatedFull: adminProcedure.mutation(async ({ ctx }) => {
      const result = await safe(() => runIsolatedFullBackupRestore());
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "verify_restore", entity: "backup", entityId: result.backupRecordId, details: { runId: result.runId, status: result.status, runType: "isolated_full", testDatabase: "testDatabase" in result ? result.testDatabase : null } });
      return result;
    }),
    backupCleanupExpired: adminProcedure.mutation(async ({ ctx }) => {
      const result = await safe(() => cleanupExpiredBackupRecords({ retentionDays: 30 }));
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "cleanup_expired_backups", entity: "backup", details: result });
      return result;
    }),
    backupEmailTest: adminProcedure.mutation(async ({ ctx }) => {
      const result = await safe(() => sendBackupEmailTest());
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "send_backup_email_test", entity: "backup", details: { recipient: result.recipient } });
      return result;
    }),
    backupVerificationSetSchedule: adminProcedure.input(z.object({ enabled: z.boolean(), cronExpression: z.string().trim().regex(/^\S+(?:\s+\S+){5}$/, "صيغة الجدولة يجب أن تحتوي 6 حقول").default("0 0 2 * * 0") })).mutation(async ({ input, ctx }) => {
      const config = await safe(() => getBackupVerificationConfig());
      if (!input.enabled && !config?.scheduleCronTaskUid) return { config: null, nextExecutionAt: null };
      const localSchedule = Boolean(config?.scheduleCronTaskUid?.startsWith("local:")) || !process.env.BUILT_IN_FORGE_API_URL || !process.env.BUILT_IN_FORGE_API_KEY;
      if (localSchedule) {
        const taskUid = config?.scheduleCronTaskUid?.startsWith("local:") ? config.scheduleCronTaskUid : `local:backup-restore:${ctx.user.id}`;
        const nextExecutionAt = input.enabled ? getNextWeeklyBackupExecution() : null;
        const saved = await safe(() => saveBackupVerificationSchedule({ taskUid, cronExpression: input.cronExpression, nextExecutionAt, enabled: input.enabled }));
        await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: input.enabled ? "enable_restore_verification_schedule" : "disable_restore_verification_schedule", entity: "backup", details: { taskUid, cronExpression: input.cronExpression, nextExecutionAt } });
        return { config: saved, nextExecutionAt };
      }
      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      const job = config?.scheduleCronTaskUid
        ? await updateHeartbeatJob(config.scheduleCronTaskUid, { cron: input.cronExpression, path: "/api/scheduled/backup-restore-verification", method: "POST", description: "اختبار أسبوعي آمن لاستعادة أحدث نسخة احتياطية", enable: input.enabled }, sessionToken)
        : await createHeartbeatJob({ name: "smart-inventory-backup-restore-verification", cron: input.cronExpression, path: "/api/scheduled/backup-restore-verification", method: "POST", description: "اختبار أسبوعي آمن لاستعادة أحدث نسخة احتياطية" }, sessionToken);
      const taskUid = config?.scheduleCronTaskUid ?? (job as { taskUid: string }).taskUid;
      const nextExecutionAt = job.nextExecutionAt ? new Date(job.nextExecutionAt) : null;
      const saved = await safe(() => saveBackupVerificationSchedule({ taskUid, cronExpression: input.cronExpression, nextExecutionAt, enabled: input.enabled }));
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: input.enabled ? "enable_restore_verification_schedule" : "disable_restore_verification_schedule", entity: "backup", details: { taskUid, cronExpression: input.cronExpression, nextExecutionAt: job.nextExecutionAt ?? null } });
      return { config: saved, nextExecutionAt: job.nextExecutionAt ?? null };
    }),
    backupRestoreRecord: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => { const result = await safe(() => getBackupSnapshotFromRecord(input.id)); const restored = await safe(() => restoreBackupSnapshot(result.snapshot)); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "restore", entity: "backup", entityId: input.id, details: { fileName: result.record.fileName } }); return restored; }),
    backupRestore: adminProcedure.input(z.object({ snapshot: z.any() })).mutation(async ({ input, ctx }) => { const result = await safe(() => restoreBackupSnapshot(input.snapshot)); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "restore", entity: "backup", details: { schemaVersion: input.snapshot?.schemaVersion } }); return result; }),
    resetOperationalData: adminProcedure.input(z.object({ confirmation: z.literal("ابدأ استخدام جديد"), backupConfirmed: z.literal(true) })).mutation(async ({ ctx }) => { const result = await safe(() => resetOperationalData({ userId: ctx.user.id, userName: ctx.user.name })); await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "reset_operational_data", entity: "inventory", details: { deleted: result.counts, backupExportedAt: result.snapshot.exportedAt } }); return result; }),
  }),

  activity: router({
    recordShare: protectedProcedure.input(z.object({ fileType: z.enum(["pdf", "excel"]), reportTitle: z.string().trim().min(1).max(255), fileName: z.string().trim().min(1).max(255), channel: z.enum(["native", "whatsapp", "email"]), status: z.enum(["shared", "cancelled", "unsupported", "failed"]) })).mutation(({ ctx, input }) => safe(() => createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "share_report", entity: input.fileType, entityId: input.fileName, details: { reportTitle: input.reportTitle, fileName: input.fileName, channel: input.channel, status: input.status } }))),
  }),
  webSearch: router({
    config: protectedProcedure.query(() => ({
      searchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID?.trim() || DEFAULT_GOOGLE_SEARCH_ENGINE_ID,
    })),
    query: protectedProcedure
      .input(z.object({ query: z.string().trim().min(2).max(160) }))
      .mutation(async ({ input }) => {
        const apiKey = process.env.GOOGLE_SEARCH_API_KEY?.trim();
        const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID?.trim();
        if (!apiKey || !searchEngineId) throw new Error("البحث داخل البرنامج غير مفعّل بعد. أضف GOOGLE_SEARCH_API_KEY و GOOGLE_SEARCH_ENGINE_ID إلى إعدادات النشر.");
        const url = new URL("https://www.googleapis.com/customsearch/v1");
        url.searchParams.set("key", apiKey);
        url.searchParams.set("cx", searchEngineId);
        url.searchParams.set("q", input.query);
        url.searchParams.set("num", "8");
        const response = await fetch(url);
        const payload = await response.json().catch(() => null) as { items?: Array<{ title?: string; link?: string; snippet?: string }>; error?: { message?: string } } | null;
        if (!response.ok) {
          const googleMessage = payload?.error?.message || "تعذر الاتصال بخدمة بحث Google.";
          if (response.status === 403 && googleMessage.toLowerCase().includes("custom search json api")) {
            throw new Error("مفتاح Google موجود، لكن مشروع Google Cloud لا يملك صلاحية Custom Search JSON API. فعّل الواجهة للمشروع المرتبط بالمفتاح أو استخدم مفتاحًا من مشروع مفعّلة عليه.");
          }
          throw new Error(googleMessage);
        }
        return (payload?.items ?? []).map(item => ({ title: item.title || "نتيجة بحث", link: item.link || "", snippet: item.snippet || "" })).filter(item => item.link);
      }),
  }),
  permissions: router({
    mine: protectedProcedure.query(({ ctx }) => safe(() => getUserPermissionSettings(ctx.user.id, ctx.user.role))),
    list: adminProcedure.query(() => safe(() => listManagedUserPermissions())),
    update: adminProcedure.input(z.object({ userId: z.number().int().positive(), allowedScreens: z.array(z.enum(["dashboard", "inventory", "additions", "disbursements", "transfers", "suppliers", "customers", "reports", "alerts", "chat", "stock-adjustments", "settings"])).max(30), allowedReports: z.array(z.enum(["inventory-summary", "movement-reports", "item-card", "supplier-account", "customer-account", "adjustments", "warehouse-financial-details", "item-create", "item-create-disabled"])).max(30), allowedWarehouseIds: z.array(z.number().int().positive()).max(100), readOnly: z.boolean() })).mutation(({ input }) => safe(() => upsertUserPermissionSettings(input))),
  }),

  preferences: router({
    get: protectedProcedure.query(({ ctx }) => safe(() => getUserPreferences(ctx.user.id))),
    update: protectedProcedure.input(z.object({ quickActions: z.array(z.string().trim().min(1).max(64)).min(1).max(10), hapticEnabled: z.boolean(), reportColumnOrder: z.record(z.string().trim().min(1).max(64), z.array(z.string().trim().min(1).max(64)).max(20)).optional() })).mutation(({ ctx, input }) => safe(() => upsertUserPreferences({ userId: ctx.user.id, ...input }))),
    setOnboardingCompleted: protectedProcedure.input(z.object({ completed: z.boolean() })).mutation(({ ctx, input }) => safe(() => setUserOnboardingCompleted(ctx.user.id, input.completed))),
  }),
  settings: router({
    list: protectedProcedure.query(() => safe(() => listSettings())),
    uploadCompanyLogo: adminProcedure
      .input(z.object({ fileName: z.string().trim().min(1).max(128), contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), dataBase64: z.string().min(20).max(7_000_000) }))
      .mutation(({ input }) => safe(() => uploadCompanyLogo(input))),
    clearCompanyLogo: adminProcedure.mutation(({ ctx }) => safe(async () => {
      await upsertSetting({ key: "company_logo_url", value: "", allowEmpty: true, description: "رابط شعار الشركة العام المستخدم في تقارير PDF" });
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name, action: "clear_company_logo", entity: "settings", details: { setting: "company_logo_url" } });
      return { cleared: true };
    })),
    update: adminProcedure
      .input(
        z.object({
          key: z.string().trim().min(1).max(128),
          value: z.string().trim().min(1).max(500),
          description: z.string().trim().max(500).nullable().optional(),
        }),
      )
      .mutation(({ input }) => safe(() => upsertSetting(input))),
    updateReportConfig: adminProcedure
      .input(z.object({ recipients: z.string().max(2000), enabled: z.boolean(), defaultSupplier: z.string().max(255), defaultCustomer: z.string().max(255), watermarkEnabled: z.boolean(), watermarkOpacity: z.coerce.number().min(0.02).max(0.25), watermarkScale: z.coerce.number().min(0.2).max(0.8), watermarkPosition: z.enum(["center", "top", "bottom"]), watermarkRepeat: z.boolean() }))
      .mutation(({ input }) =>
        safe(async () => {
          await upsertSetting({ key: "report_recipients", value: input.recipients || "", allowEmpty: true, description: "مستلمو التقارير مفصولون بفاصلة أو سطر جديد" });
          await upsertSetting({ key: "reports_enabled", value: String(input.enabled), description: "تفعيل التقارير والتنبيهات الدورية" });
          await upsertSetting({ key: "report_default_supplier", value: input.defaultSupplier || "", allowEmpty: true, description: "اسم المورد الافتراضي الظاهر في إعدادات وتقارير الإضافة" });
          await upsertSetting({ key: "report_default_customer", value: input.defaultCustomer || "", allowEmpty: true, description: "اسم العميل الافتراضي الظاهر في إعدادات وتقارير الصرف" });
          await upsertSetting({ key: "report_watermark_enabled", value: String(input.watermarkEnabled), description: "تفعيل العلامة المائية في تقارير PDF" });
          await upsertSetting({ key: "report_watermark_opacity", value: String(input.watermarkOpacity), description: "شفافية العلامة المائية في تقارير PDF" });
          await upsertSetting({ key: "report_watermark_scale", value: String(input.watermarkScale), description: "حجم العلامة المائية في تقارير PDF" });
          await upsertSetting({ key: "report_watermark_position", value: input.watermarkPosition, description: "موضع العلامة المائية في تقارير PDF" });
          return upsertSetting({ key: "report_watermark_repeat", value: String(input.watermarkRepeat), description: "تكرار العلامة المائية داخل صفحة PDF" });
        }),
      ),
    updateThreshold: adminProcedure
      .input(z.object({ percentage: z.coerce.number().min(0).max(100) }))
      .mutation(({ input }) =>
        safe(() =>
          upsertSetting({
            key: "threshold_percentage",
            value: String(input.percentage),
            description: "نسبة تنبيه انخفاض المخزون من حد الطلب",
          }),
        ),
      ),
  }),
});

export type AppRouter = typeof appRouter;
