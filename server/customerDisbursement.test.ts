import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { createDisbursement } from "./db";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, createDisbursement: vi.fn() };
});

function context(): TrpcContext {
  const now = new Date();
  return { user: { id: 1, openId: "customer-user", email: "customer@example.com", name: "Customer User", loginMethod: "manus", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("ربط العملاء بأذونات الصرف", () => {
  it("يمرر customerId إلى دالة إنشاء إذن الصرف", async () => {
    vi.mocked(createDisbursement).mockResolvedValue({ id: 11 } as never);
    const caller = appRouter.createCaller(context());
    await caller.disbursements.create({ date: "2026-08-15", eznNum: "D-11", itemCode: "SI-000001", quantity: 2, customerId: 4, destination: "شركة العميل" });
    expect(createDisbursement).toHaveBeenCalledWith(expect.objectContaining({ customerId: 4, destination: "شركة العميل" }));
  });
});
