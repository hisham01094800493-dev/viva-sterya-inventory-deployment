import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { createCustomer, createSupplier, listCustomerAccount, listCustomers, listSupplierAccount, listSuppliers, listWarehouses, updateWarehouse } from "./db";
import { uploadDocumentImage } from "./documentImageUpload";

vi.mock("./documentImageUpload", () => ({ uploadDocumentImage: vi.fn() }));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, listWarehouses: vi.fn(), updateWarehouse: vi.fn(), listSuppliers: vi.fn(), createSupplier: vi.fn(), listCustomers: vi.fn(), createCustomer: vi.fn(), listSupplierAccount: vi.fn(), listCustomerAccount: vi.fn() };
});

function context(role: "user" | "admin" = "admin"): TrpcContext {
  const now = new Date();
  return { user: { id: 1, openId: "warehouse-user", email: "warehouse@example.com", name: "Warehouse User", loginMethod: "manus", role, createdAt: now, updatedAt: now, lastSignedIn: now }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("tRPC للمخازن والموردين", () => {
  it("يعرض المخازن الخمسة ويحدّث اسم المخزن عبر الإجراء الإداري", async () => {
    vi.mocked(listWarehouses).mockResolvedValue([1, 2, 3, 4, 5].map(slot => ({ id: slot, slot, name: `المخزن ${slot}` })) as never);
    vi.mocked(updateWarehouse).mockResolvedValue({ id: 2, slot: 2, name: "مخزن قطع الغيار" } as never);
    const caller = appRouter.createCaller(context());
    await expect(caller.warehouses.list()).resolves.toHaveLength(5);
    await caller.warehouses.update({ id: 2, name: "مخزن قطع الغيار" });
    expect(updateWarehouse).toHaveBeenCalledWith({ id: 2, name: "مخزن قطع الغيار" });
  });

  it("يستدعي كشفي حساب المورد والعميل بالمعرّف الصحيح", async () => {
    vi.mocked(listSupplierAccount).mockResolvedValue([{ id: 1, supplierId: 3, totalValue: "25" }] as never);
    vi.mocked(listCustomerAccount).mockResolvedValue([{ id: 2, customerId: 4, totalValue: "40" }] as never);
    const caller = appRouter.createCaller(context("user"));
    await expect(caller.additions.account({ supplierId: 3 })).resolves.toHaveLength(1);
    await expect(caller.disbursements.account({ customerId: 4 })).resolves.toHaveLength(1);
    expect(listSupplierAccount).toHaveBeenCalledWith(3);
    expect(listCustomerAccount).toHaveBeenCalledWith(4);
  });

  it("يربط مساري رفع صور الأذونات بنوع الحركة والرقم الصحيح", async () => {
    vi.mocked(uploadDocumentImage).mockResolvedValue({ id: 12, documentImageUrl: "https://cdn.test/permit.png" } as never);
    const caller = appRouter.createCaller(context("user"));
    await caller.additions.uploadDocumentImage({ movementId: 12, fileName: "addition.png", contentType: "image/png", dataBase64: "data:image/png;base64,cGFwZXI=" });
    await caller.disbursements.uploadDocumentImage({ movementId: 18, fileName: "disbursement.png", contentType: "image/png", dataBase64: "data:image/png;base64,cGFwZXI=" });
    expect(uploadDocumentImage).toHaveBeenNthCalledWith(1, expect.objectContaining({ movementType: "addition", movementId: 12 }));
    expect(uploadDocumentImage).toHaveBeenNthCalledWith(2, expect.objectContaining({ movementType: "disbursement", movementId: 18 }));
  });

  it("يرفض رفع صور الأذونات عند غياب جلسة المستخدم", async () => {
    const caller = appRouter.createCaller({ ...context("user"), user: null });
    const input = { movementId: 12, fileName: "permit.png", contentType: "image/png" as const, dataBase64: "data:image/png;base64,cGFwZXI=" };
    await expect(caller.additions.uploadDocumentImage(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.disbursements.uploadDocumentImage(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("ينشئ عميلاً أو جهة مستلمة عبر عقد العملاء المحمي", async () => {
    vi.mocked(createCustomer).mockResolvedValue({ id: 8, name: "فرع القاهرة" } as never);
    const caller = appRouter.createCaller(context("user"));
    await caller.customers.create({ name: "فرع القاهرة" });
    expect(createCustomer).toHaveBeenCalledWith({ name: "فرع القاهرة" });
    expect(listCustomers).not.toHaveBeenCalled();
  });

  it("ينشئ مورداً عبر عقد الموردين المحمي", async () => {
    vi.mocked(createSupplier).mockResolvedValue({ id: 7, name: "شركة النور" } as never);
    const caller = appRouter.createCaller(context("user"));
    await caller.suppliers.create({ name: "شركة النور", phone: "0100" });
    expect(createSupplier).toHaveBeenCalledWith({ name: "شركة النور", phone: "0100" });
    expect(listSuppliers).not.toHaveBeenCalled();
  });
});
