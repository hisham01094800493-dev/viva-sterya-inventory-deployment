import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  createDisbursement,
  createTransfer,
  getItemByCode,
  getItemCard,
  suggestNextItemCode,
  getInventoryRows,
  getLatestPermitSummaries,
  getRecentMovements,
  getSettingValue,
  listItems,
  updateTransfer,
} from "./db";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    createDisbursement: vi.fn(),
    createTransfer: vi.fn(),
    getItemByCode: vi.fn(),
    getItemCard: vi.fn(),
    suggestNextItemCode: vi.fn(),
    getInventoryRows: vi.fn(),
    getLatestPermitSummaries: vi.fn(),
    getRecentMovements: vi.fn(),
    getSettingValue: vi.fn(),
    listItems: vi.fn(),
    updateTransfer: vi.fn(),
  };
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(role: "user" | "admin" = "user"): TrpcContext {
  const now = new Date();
  const user: AuthenticatedUser = {
    id: 1,
    openId: "inventory-user",
    email: "inventory@example.com",
    name: "Inventory User",
    loginMethod: "manus",
    role,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("inventory tRPC routers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires authentication for inventory queries", async () => {
    const ctx = { user: null, req: {} as any, res: {} as any } satisfies TrpcContext;
    const caller = appRouter.createCaller(ctx);
    await expect(caller.items.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("validates disbursement quantities before calling the database", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(
      caller.disbursements.create({
        date: "2026-08-15",
        eznNum: "DIS-1",
        itemCode: "A-1",
        quantity: 0,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(createDisbursement).not.toHaveBeenCalled();
  });

  it("passes a valid disbursement to the stock service", async () => {
    vi.mocked(createDisbursement).mockResolvedValue({ id: 7 } as any);
    const caller = appRouter.createCaller(createContext());
    const result = await caller.disbursements.create({
      date: "2026-08-15",
      eznNum: "DIS-2",
      itemCode: "A-2",
      quantity: 3,
      destination: "التشغيل",
    });
    expect(result).toEqual({ id: 7 });
    expect(createDisbursement).toHaveBeenCalledWith({
      date: "2026-08-15",
      eznNum: "DIS-2",
      itemCode: "A-2",
      quantity: 3,
      destination: "التشغيل",
    });
  });

  it("passes the offline idempotency key to the disbursement service", async () => {
    vi.mocked(createDisbursement).mockResolvedValue({ id: 8, clientRequestId: "offline-1234567890" } as any);
    const caller = appRouter.createCaller(createContext());
    await caller.disbursements.create({ date: "2026-08-15", eznNum: "DIS-OFFLINE", itemCode: "A-3", quantity: 2, clientRequestId: "offline-1234567890" });
    expect(createDisbursement).toHaveBeenCalledWith(expect.objectContaining({ clientRequestId: "offline-1234567890" }));
  });

  it("returns the item linked to a movement code for automatic form filling", async () => {
    vi.mocked(getItemByCode).mockResolvedValue({ id: 3, code: "10001", name: "صنف تجريبي", unit: "قطعة", unitPrice: "12.50" } as any);
    const caller = appRouter.createCaller(createContext());
    const result = await caller.items.getByCode({ code: "10001" });
    expect(result).toMatchObject({ code: "10001", name: "صنف تجريبي", unitPrice: "12.50" });
    expect(getItemByCode).toHaveBeenCalledWith("10001");
  });

  it("returns the complete item card with movement groups", async () => {
    vi.mocked(getItemCard).mockResolvedValue({ item: { id: 3, code: "10001", name: "صنف تجريبي", initialStock: "5.000", currentStock: "8.000" }, additions: [{ id: 1 }], disbursements: [{ id: 2 }], returns: [{ id: 3 }] } as any);
    const caller = appRouter.createCaller(createContext());
    await expect(caller.items.card({ id: 3 })).resolves.toMatchObject({ item: { code: "10001" }, additions: [{ id: 1 }], disbursements: [{ id: 2 }], returns: [{ id: 3 }] });
    expect(getItemCard).toHaveBeenCalledWith(3);
  });

  it("previews the next warehouse-scoped code before item creation", async () => {
    vi.mocked(suggestNextItemCode).mockResolvedValue("30001");
    const caller = appRouter.createCaller(createContext());
    await expect(caller.items.nextCode({ warehouseId: 3 })).resolves.toBe("30001");
    expect(suggestNextItemCode).toHaveBeenCalledWith(3);
  });

  it("computes low-stock items using the configured percentage", async () => {
    vi.mocked(getInventoryRows).mockResolvedValue([
      {
        id: 1,
        code: "A-1",
        name: "صنف قريب",
        initialStock: "100.000",
        incomingStock: "0.000",
        outgoingStock: "0.000",
        currentStock: "10.000",
        reorderLevel: "100.000",
      },
      {
        id: 2,
        code: "A-2",
        name: "صنف آمن",
        initialStock: "100.000",
        incomingStock: "0.000",
        outgoingStock: "0.000",
        currentStock: "50.000",
        reorderLevel: "100.000",
      },
    ] as any);
    vi.mocked(getSettingValue).mockResolvedValue("20");
    vi.mocked(getRecentMovements).mockResolvedValue({ additions: [], disbursements: [], transfers: [] } as any);
    vi.mocked(getLatestPermitSummaries).mockResolvedValue({ addition: { id: 11, eznNum: "ADD-11", date: "2026-08-21" }, disbursement: { id: 14, eznNum: "DIS-14", date: "2026-08-22" } });

    const caller = appRouter.createCaller(createContext());
    const result = await caller.dashboard.summary();
    expect(result.thresholdPercentage).toBe(20);
    expect(result.lowStock.map(item => item.code)).toEqual(["A-1"]);
    expect(result.stats).toMatchObject({ totalItems: 2, lowStockCount: 1, itemCountsByWarehouse: [{ warehouseId: null, count: 2 }] });
    expect(result.latestPermits).toEqual({ addition: { id: 11, eznNum: "ADD-11", date: "2026-08-21" }, disbursement: { id: 14, eznNum: "DIS-14", date: "2026-08-22" } });
  });

  it("protects destructive operations for administrators", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.items.delete({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("exposes transfer updates with typed input", async () => {
    vi.mocked(updateTransfer).mockResolvedValue({ id: 12, quantity: "4.000" } as any);
    const caller = appRouter.createCaller(createContext());
    const result = await caller.transfers.update({ id: 12, quantity: 4, transferType: "مرتجع" });
    expect(result).toEqual({ id: 12, quantity: "4.000" });
    expect(updateTransfer).toHaveBeenCalledWith({ id: 12, quantity: 4, transferType: "مرتجع" });
    expect(createTransfer).not.toHaveBeenCalled();
  });

  it("returns search results from the item service", async () => {
    vi.mocked(listItems).mockResolvedValue([{ id: 1, code: "A-1" }] as any);
    const caller = appRouter.createCaller(createContext());
    await expect(caller.items.list({ search: "A-1" })).resolves.toEqual([{ id: 1, code: "A-1" }]);
    expect(listItems).toHaveBeenCalledWith("A-1");
  });
});
