import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

vi.mock("./projectScope", () => ({
  resolveProjectScope: vi.fn(),
  assertWarehousesInProject: vi.fn(),
  assertMovementInProject: vi.fn(),
  assertItemInProject: vi.fn(),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getUserPermissionSettings: vi.fn(async () => ({ allowedWarehouseIds: [], readOnly: false })),
    listWarehousesForAccess: vi.fn(),
    createWarehouse: vi.fn(),
    createAuditLog: vi.fn(async () => ({ id: 1 })),
  };
});

import { createWarehouse, listWarehousesForAccess } from "./db";
import { resolveProjectScope } from "./projectScope";

function context(role: "user" | "manager" | "admin" = "manager"): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 7,
      openId: "isolation-user",
      email: "iso@example.com",
      name: "مستخدم",
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

beforeEach(() => {
  vi.mocked(listWarehousesForAccess).mockReset();
  vi.mocked(createWarehouse).mockReset();
});

describe("عزل المخازن بين المشاريع", () => {
  it("قائمة المخازن تُقيَّد بمشروع النطاق النشط (A) ولا تعرض مخازن B", async () => {
    vi.mocked(resolveProjectScope).mockResolvedValue({ projectId: 1, projectCode: "A", projectName: "A" } as never);
    vi.mocked(listWarehousesForAccess).mockResolvedValue([{ id: 1, projectId: 1, slot: 1, name: "مخزن A" }] as never);

    const caller = appRouter.createCaller(context());
    const rows = await caller.warehouses.list();

    expect(listWarehousesForAccess).toHaveBeenCalledWith([], 1);
    expect(rows).toEqual([{ id: 1, projectId: 1, slot: 1, name: "مخزن A" }]);
  });

  it("عند تبديل النطاق إلى B تُطلب مخازن B فقط", async () => {
    vi.mocked(resolveProjectScope).mockResolvedValue({ projectId: 2, projectCode: "B", projectName: "B" } as never);
    vi.mocked(listWarehousesForAccess).mockResolvedValue([{ id: 2, projectId: 2, slot: 1, name: "مخزن B" }] as never);

    const caller = appRouter.createCaller(context());
    await caller.warehouses.list();

    expect(listWarehousesForAccess).toHaveBeenCalledWith([], 2);
  });

  it("الإنشاء يختم المخزن بمشروع النطاق النشط فقط", async () => {
    vi.mocked(resolveProjectScope).mockResolvedValue({ projectId: 2, projectCode: "B", projectName: "B" } as never);
    vi.mocked(createWarehouse).mockResolvedValue({ id: 8, projectId: 2, slot: 1, name: "مخزن" } as never);

    const caller = appRouter.createCaller(context());
    const created = await caller.warehouses.create({ name: "مخزن" });

    expect(createWarehouse).toHaveBeenCalledWith({ name: "مخزن", projectId: 2, slot: undefined });
    expect(created).toMatchObject({ projectId: 2 });
  });

  it("المستخدم العادي لا يستطيع إنشاء مخزن يتجاوز صلاحياته", async () => {
    vi.mocked(resolveProjectScope).mockResolvedValue({ projectId: 1, projectCode: "A", projectName: "A" } as never);
    const caller = appRouter.createCaller(context("user"));

    await expect(caller.warehouses.create({ name: "مخزن" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(createWarehouse).not.toHaveBeenCalled();
  });
});
