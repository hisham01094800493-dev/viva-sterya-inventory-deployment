import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  getActiveProjectForUser,
  getUserPermissionSettings,
  getBuildingCostComparison,
  getCompanyInventoryAuditReport,
  getPermitDetails,
  getReportDataset,
  importItems,
  importMovements,
  listAdditions,
  listBuildings,
  listDisbursements,
  listItems,
  listTransfers,
  listWarehousesForAccess,
} from "./db";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getActiveProjectForUser: vi.fn(),
    getUserPermissionSettings: vi.fn(),
    getBuildingCostComparison: vi.fn(),
    getCompanyInventoryAuditReport: vi.fn(),
    getPermitDetails: vi.fn(),
    getReportDataset: vi.fn(),
    importItems: vi.fn(),
    importMovements: vi.fn(),
    listAdditions: vi.fn(),
    listBuildings: vi.fn(),
    listDisbursements: vi.fn(),
    listItems: vi.fn(),
    listTransfers: vi.fn(),
    listWarehousesForAccess: vi.fn(),
  };
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(role: "user" | "admin" = "user"): TrpcContext {
  const now = new Date();
  const user: AuthenticatedUser = {
    id: 1,
    openId: "scope-user",
    email: "scope@example.com",
    name: "Scope User",
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

const permissions = {
  userId: 1,
  allowedScreens: ["inventory", "additions", "disbursements", "transfers", "reports"] as string[],
  allowedReports: [] as string[],
  allowedWarehouseIds: [] as number[],
  allowedProjectIds: [] as number[],
  readOnly: false,
};

describe("project scoping in inventory reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserPermissionSettings).mockResolvedValue(permissions as never);
    vi.mocked(getActiveProjectForUser).mockResolvedValue({
      id: 9,
      code: "PROJECT-2",
      name: "المشروع الثاني",
      status: "active",
    } as never);
    vi.mocked(listItems).mockResolvedValue([] as never);
    vi.mocked(listWarehousesForAccess).mockResolvedValue([] as never);
    vi.mocked(listBuildings).mockResolvedValue([] as never);
    vi.mocked(listAdditions).mockResolvedValue([] as never);
    vi.mocked(listDisbursements).mockResolvedValue([] as never);
    vi.mocked(listTransfers).mockResolvedValue([] as never);
    vi.mocked(getReportDataset).mockResolvedValue({} as never);
    vi.mocked(getPermitDetails).mockResolvedValue({} as never);
    vi.mocked(getCompanyInventoryAuditReport).mockResolvedValue({} as never);
    vi.mocked(getBuildingCostComparison).mockResolvedValue({} as never);
    vi.mocked(importItems).mockResolvedValue({ created: 0, updated: 0, total: 0 } as never);
    vi.mocked(importMovements).mockResolvedValue({ imported: 0, failed: 0, errors: [] } as never);
  });

  it("scopes the item list to the active project", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.items.list({ search: "bolt" });

    expect(listItems).toHaveBeenCalledWith("bolt", undefined, 9);
  });

  it("scopes the warehouse list to the active project", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.warehouses.list();

    expect(listWarehousesForAccess).toHaveBeenCalledWith([], 9);
  });

  it("scopes the building list to the active project", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.buildings.list();

    expect(listBuildings).toHaveBeenCalledWith(9);
  });

  it("scopes additions, disbursements and transfers to the active project", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.additions.list({ limit: 10 });
    await caller.disbursements.list({ limit: 10 });
    await caller.transfers.list({ limit: 10 });

    expect(listAdditions).toHaveBeenCalledWith(10, [], 9);
    expect(listDisbursements).toHaveBeenCalledWith(10, [], 9);
    expect(listTransfers).toHaveBeenCalledWith(10, [], 9);
  });

  it("falls back to unscoped reads when the projects layer is unavailable", async () => {
    vi.mocked(getActiveProjectForUser).mockRejectedValue(
      new Error("Table 'projects' doesn't exist")
    );

    const caller = appRouter.createCaller(createContext());
    await caller.items.list({ search: "bolt" });

    expect(listItems).toHaveBeenCalledWith("bolt", undefined, null);
  });

  it("scopes report dataset and audit to the active project", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.reports.dataset({ includeRows: false });
    await caller.reports.inventoryAudit();
    await caller.reports.buildingCostComparison({});

    expect(getReportDataset).toHaveBeenCalledWith(expect.any(Object), [], 9);
    expect(getCompanyInventoryAuditReport).toHaveBeenCalledWith([], 9);
    expect(getBuildingCostComparison).toHaveBeenCalledWith(expect.any(Object), [], 9);
  });

  it("scopes permit details to the active project", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.reports.permitDetails({ permitNumber: "123" });

    expect(getPermitDetails).toHaveBeenCalledWith("123", [], 9);
  });

  it("scopes bulk import to the active project", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.items.importBulk({ rows: [{ code: "A1", name: "Item" }] as never });
    await caller.items.importMovements({ rows: [{ type: "addition", date: "2026-01-01", eznNum: "1", itemCode: "A1", quantity: 1 }] as never });

    expect(importItems).toHaveBeenCalledWith(expect.any(Array), 9);
    expect(importMovements).toHaveBeenCalledWith(expect.any(Array), 9);
  });
});
