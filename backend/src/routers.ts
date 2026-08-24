import { TRPCError } from "@trpc/server";
import { z } from "zod";
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
  getItemById,
  getRecentMovements,
  getMovementAnalytics,
  getSettingValue,
  InventoryError,
  listAdditions,
  listDisbursements,
  listItems,
  listSettings,
  listTransfers,
  updateAddition,
  updateDisbursement,
  updateItem,
  updateTransfer,
  upsertSetting,
} from "./db.js";
import { whatsappRouter } from "./whatsappRouter.js";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./trpc.js";
import { COOKIE_NAME } from "./constants.js";

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

const itemInput = z.object({
  code: z.string().trim().min(1, "كود الصنف مطلوب").max(64),
  name: z.string().trim().min(1, "اسم الصنف مطلوب").max(500),
  initialStock: z.coerce.number().min(0).default(0),
  reorderLevel: z.coerce.number().min(0).default(0),
  category: z.string().trim().max(128).nullable().optional(),
  unit: z.string().trim().max(64).nullable().optional(),
});

const importItemInput = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(500),
  initialStock: z.coerce.number().min(0).default(0),
  reorderLevel: z.coerce.number().min(0).default(0),
  category: z.string().trim().max(128).nullable().optional(),
  unit: z.string().trim().max(64).nullable().optional(),
});

const additionInput = z.object({
  date: z.string().trim().min(1, "التاريخ مطلوب").max(32),
  eznNum: z.string().trim().min(1, "رقم الإذن مطلوب").max(64),
  itemCode: z.string().trim().min(1, "كود الصنف مطلوب").max(64),
  store: z.string().trim().max(128).nullable().optional(),
  quantity: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر"),
  purpose: z.string().trim().max(500).nullable().optional(),
  supplier: z.string().trim().max(128).nullable().optional(),
  category: z.string().trim().max(128).nullable().optional(),
});

const disbursementInput = z.object({
  date: z.string().trim().min(1, "التاريخ مطلوب").max(32),
  eznNum: z.string().trim().min(1, "رقم الإذن مطلوب").max(64),
  itemCode: z.string().trim().min(1, "كود الصنف مطلوب").max(64),
  destination: z.string().trim().max(128).nullable().optional(),
  quantity: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر"),
  notes: z.string().trim().max(1000).nullable().optional(),
  store: z.string().trim().max(128).nullable().optional(),
  disburseType: z.string().trim().max(128).nullable().optional(),
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
});

const transferInput = z.object({
  date: z.string().trim().min(1, "التاريخ مطلوب").max(32),
  eznNum: z.string().trim().min(1, "رقم الإذن مطلوب").max(64),
  itemCode: z.string().trim().min(1, "كود الصنف مطلوب").max(64),
  fromStore: z.string().trim().max(128).nullable().optional(),
  toStore: z.string().trim().max(128).nullable().optional(),
  quantity: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر"),
  notes: z.string().trim().max(1000).nullable().optional(),
  transferType: z.string().trim().max(64).nullable().optional(),
});

export const appRouter = router({
  whatsapp: whatsappRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.req.logout(error => {
        if (error) throw error;
      });
      ctx.res.clearCookie(COOKIE_NAME, { secure: true, sameSite: "none", httpOnly: true, path: "/" });
      return { success: true } as const;
    }),
  }),

  items: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().optional() }).optional())
      .query(({ input }) => safe(() => listItems(input?.search))),
    getById: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input }) =>
      safe(() => getItemById(input.id)),
    ),
    getByCode: protectedProcedure.input(z.object({ code: z.string().trim().min(1) })).query(({ input }) =>
      safe(() => getItemByCode(input.code)),
    ),
    create: protectedProcedure.input(itemInput).mutation(({ input }) => safe(() => createItem(input))),
    importBulk: protectedProcedure
      .input(z.object({ rows: z.array(importItemInput).min(1).max(5000) }))
      .mutation(({ input }) => safe(() => importItems(input.rows))),
    importMovements: protectedProcedure
      .input(z.object({ rows: z.array(movementImportRow).min(1).max(5000) }))
      .mutation(({ input }) => safe(() => importMovements(input.rows))),
    update: protectedProcedure
      .input(itemInput.partial().extend({ id: z.number().int().positive() }))
      .mutation(({ input }) => safe(() => updateItem(input))),
    delete: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input }) => safe(() => deleteItem(input.id))),
  }),

  additions: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
      .query(({ input }) => safe(() => listAdditions(input?.limit ?? 100))),
    create: protectedProcedure.input(additionInput).mutation(({ input }) => safe(() => createAddition(input))),
    update: protectedProcedure
      .input(additionInput.partial().extend({ id: z.number().int().positive() }))
      .mutation(({ input }) => safe(() => updateAddition(input))),
    delete: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input }) => safe(() => deleteAddition(input.id))),
  }),

  disbursements: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
      .query(({ input }) => safe(() => listDisbursements(input?.limit ?? 100))),
    create: protectedProcedure
      .input(disbursementInput)
      .mutation(({ input }) => safe(() => createDisbursement(input))),
    update: protectedProcedure
      .input(disbursementInput.partial().extend({ id: z.number().int().positive() }))
      .mutation(({ input }) => safe(() => updateDisbursement(input))),
    delete: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input }) => safe(() => deleteDisbursement(input.id))),
  }),

  transfers: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
      .query(({ input }) => safe(() => listTransfers(input?.limit ?? 100))),
    create: protectedProcedure.input(transferInput).mutation(({ input }) => safe(() => createTransfer(input))),
    update: protectedProcedure
      .input(transferInput.partial().extend({ id: z.number().int().positive() }))
      .mutation(({ input }) => safe(() => updateTransfer(input))),
    delete: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input }) => safe(() => deleteTransfer(input.id))),
  }),

  dashboard: router({
    summary: protectedProcedure.query(async () =>
      safe(async () => {
        const [rows, movements, configuredThreshold] = await Promise.all([
          getInventoryRows(),
          getRecentMovements(8),
          getSettingValue("threshold_percentage", "20"),
        ]);
        const thresholdPercentage = Math.min(100, Math.max(0, Number(configuredThreshold) || 20));
        const lowStock = rows.filter(item => {
          const current = Number(item.currentStock ?? 0);
          const reorder = Number(item.reorderLevel ?? 0);
          if (reorder <= 0) return current <= 0;
          return current <= reorder * (thresholdPercentage / 100);
        });
        const total = (field: "currentStock" | "incomingStock" | "outgoingStock") =>
          rows.reduce((sum, item) => sum + Number(item[field] ?? 0), 0);
        const analytics = await getMovementAnalytics(rows, thresholdPercentage);
        return {
          stats: {
            totalItems: rows.length,
            lowStockCount: lowStock.length,
            totalCurrentStock: total("currentStock"),
            totalIncoming: total("incomingStock"),
            totalOutgoing: total("outgoingStock"),
          },
          thresholdPercentage,
          lowStock,
          recentMovements: movements,
          analytics,
        };
      }),
    ),
  }),

  settings: router({
    list: protectedProcedure.query(() => safe(() => listSettings())),
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
      .input(z.object({ recipients: z.string().max(2000), enabled: z.boolean() }))
      .mutation(({ input }) =>
        safe(async () => {
          await upsertSetting({ key: "report_recipients", value: input.recipients || "", allowEmpty: true, description: "مستلمو التقارير مفصولون بفاصلة أو سطر جديد" });
          return upsertSetting({ key: "reports_enabled", value: String(input.enabled), description: "تفعيل التقارير والتنبيهات الدورية" });
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
