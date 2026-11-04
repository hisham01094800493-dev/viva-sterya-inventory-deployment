import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

vi.mock("./projectScope", () => ({
  resolveProjectScope: vi.fn(),
  // بقية الدوال قد تُستورد في مكان آخر؛ نُبقيها كدوال وهمية آمنة.
  assertWarehousesInProject: vi.fn(),
  assertMovementInProject: vi.fn(),
  assertItemInProject: vi.fn(),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    createWarehouse: vi.fn(),
    createAuditLog: vi.fn(async () => ({ id: 1 })),
  };
});

import { createWarehouse, createAuditLog } from "./db";
import { resolveProjectScope } from "./projectScope";

function context(role: "user" | "manager" | "admin"): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 7,
      openId: "warehouse-create-user",
      email: "warehouse@example.com",
      name: "مستخدم المخازن",
      loginMethod: "manus",
      role,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const scope = { projectId: 1, projectCode: "MAIN", projectName: "المشروع الرئيسي" };

beforeEach(() => {
  vi.mocked(resolveProjectScope).mockResolvedValue(scope as never);
  vi.mocked(createWarehouse).mockReset();
  vi.mocked(createAuditLog).mockClear();
});

describe("warehouses.create - الصلاحيات وربط المشروع", () => {
  it("يسمح للمدير بإنشاء مخزن داخل المشروع النشط", async () => {
    vi.mocked(createWarehouse).mockResolvedValue({ id: 5, projectId: 1, slot: 2, name: "مخزن" } as never);
    const caller = appRouter.createCaller(context("manager"));

    const result = await caller.warehouses.create({ name: "مخزن" });

    expect(result).toMatchObject({ id: 5, projectId: 1, slot: 2 });
    expect(createWarehouse).toHaveBeenCalledWith({ name: "مخزن", projectId: 1, slot: undefined });
  });

  it("يسجّل عملية الإنشاء في سجل التدقيق مع المشروع والمخزن", async () => {
    vi.mocked(createWarehouse).mockResolvedValue({ id: 9, projectId: 1, slot: 3, name: "مخزن جديد" } as never);
    const caller = appRouter.createCaller(context("admin"));

    await caller.warehouses.create({ name: "مخزن جديد" });

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        action: "create",
        entity: "warehouse",
        entityId: 9,
        details: expect.objectContaining({ projectId: 1, warehouseId: 9, name: "مخزن جديد", slot: 3 }),
      })
    );
  });

  it("يرفض المستخدم العادي (الافتراضي: المدير فقط)", async () => {
    const caller = appRouter.createCaller(context("user"));
    await expect(caller.warehouses.create({ name: "مخزن" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(createWarehouse).not.toHaveBeenCalled();
  });

  it("يسمح للمدير العام بتحديد مشروع آخر صراحةً", async () => {
    vi.mocked(createWarehouse).mockResolvedValue({ id: 6, projectId: 4, slot: 1, name: "مخزن" } as never);
    const caller = appRouter.createCaller(context("admin"));

    await caller.warehouses.create({ name: "مخزن", projectId: 4 });

    expect(createWarehouse).toHaveBeenCalledWith({ name: "مخزن", projectId: 4, slot: undefined });
  });

  it("يرفض المدير (غير العام) تمرير مشروع مختلف", async () => {
    const caller = appRouter.createCaller(context("manager"));
    await expect(caller.warehouses.create({ name: "مخزن", projectId: 4 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(createWarehouse).not.toHaveBeenCalled();
  });

  it("يرفض الإنشاء عند عدم وجود مشروع نشط", async () => {
    vi.mocked(resolveProjectScope).mockResolvedValue({ projectId: null } as never);
    const caller = appRouter.createCaller(context("manager"));

    await expect(caller.warehouses.create({ name: "مخزن" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(createWarehouse).not.toHaveBeenCalled();
  });

  it("يرفض الاسم الفارغ عبر مخطط الإدخال", async () => {
    const caller = appRouter.createCaller(context("manager"));
    await expect(caller.warehouses.create({ name: "   " })).rejects.toBeTruthy();
    expect(createWarehouse).not.toHaveBeenCalled();
  });
});
