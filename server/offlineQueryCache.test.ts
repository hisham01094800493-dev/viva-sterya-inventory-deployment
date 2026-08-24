import { describe, expect, it } from "vitest";
import { getSnapshotKeysForCleanup, isOfflineCacheableQuery } from "../client/src/lib/offlineQueryCache";
import { formatQueueDate } from "../client/src/components/NetworkStatusIndicator";
import { inventoryQueryOptions, dashboardQueryOptions } from "../client/src/lib/queryOptions";

describe("offline query cache", () => {
  it("caches inventory, warehouse, dashboard, and report-related queries", () => {
    expect(isOfflineCacheableQuery(["items", "list", undefined])).toBe(true);
    expect(isOfflineCacheableQuery(["items", "listPaged", { page: 1, pageSize: 24 }])).toBe(true);
    expect(isOfflineCacheableQuery(["items", "categories"])).toBe(true);
    expect(isOfflineCacheableQuery([["items", "list"], { input: undefined, type: "query" }])).toBe(true);
    expect(isOfflineCacheableQuery(["dashboard", "summary"])).toBe(true);
    expect(isOfflineCacheableQuery(["warehouses", "list"])).toBe(true);
    expect(isOfflineCacheableQuery(["suppliers", "list"])).toBe(true);
    expect(isOfflineCacheableQuery(["additions", "account", { supplierId: 7 }])).toBe(true);
    expect(isOfflineCacheableQuery(["disbursements", "account", { customerId: 9 }])).toBe(true);
    expect(isOfflineCacheableQuery([["additions", "account"], { input: { supplierId: 7 }, type: "query" }])).toBe(true);
    expect(isOfflineCacheableQuery(["reports", "summary"])).toBe(false);
  });

  it("uses offline-first query behavior for cached inventory and dashboard data", () => {
    expect(inventoryQueryOptions.networkMode).toBe("offlineFirst");
    expect(dashboardQueryOptions.networkMode).toBe("offlineFirst");
    expect(isOfflineCacheableQuery(["items", "list"])).toBe(true);
    expect(isOfflineCacheableQuery(["items", "listPaged", { page: 2 }])).toBe(true);
    expect(isOfflineCacheableQuery(["dashboard", "summary"])).toBe(true);
  });

  it("uses cached account statements when the network query is unavailable", () => {
    const supplierAccountKey = ["additions", "account", { supplierId: 7 }];
    const customerAccountKey = ["disbursements", "account", { customerId: 9 }];
    expect(isOfflineCacheableQuery(supplierAccountKey)).toBe(true);
    expect(isOfflineCacheableQuery(customerAccountKey)).toBe(true);
  });

  it("removes expired snapshots while retaining current snapshots", () => {
    const now = 1_000_000_000;
    const snapshots = [
      { key: "old", queryKey: ["items", "list"], data: [], updatedAt: now - 15 * 24 * 60 * 60 * 1000 },
      { key: "fresh", queryKey: ["items", "list", { search: "حديد" }], data: [], updatedAt: now - 1_000 },
    ];
    expect(getSnapshotKeysForCleanup(snapshots, now)).toEqual(["old"]);
  });

  it("keeps only the newest snapshots when the cache reaches its limit", () => {
    const now = 1_000_000_000;
    const snapshots = Array.from({ length: 4 }, (_, index) => ({
      key: `snapshot-${index}`,
      queryKey: ["items", "list", { page: index }],
      data: [],
      updatedAt: now - index,
    }));
    expect(getSnapshotKeysForCleanup(snapshots, now, 60_000, 2)).toEqual(["snapshot-2", "snapshot-3"]);
  });

  it("formats the last sync timestamp with a complete date and time", () => {
    expect(formatQueueDate(Date.UTC(2026, 7, 18, 9, 5))).toContain("18/08/2026");
    expect(formatQueueDate(Date.UTC(2026, 7, 18, 9, 5))).toContain("09:05");
  });

  it("does not cache unrelated or mutation-like queries", () => {
    expect(isOfflineCacheableQuery(["auth", "me"])).toBe(false);
    expect(isOfflineCacheableQuery(["items", "create"])).toBe(false);
  });
});
