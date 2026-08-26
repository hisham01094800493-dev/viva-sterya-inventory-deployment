import { describe, expect, it } from "vitest";
import { isOfflineCacheableQuery } from "./offlineQueryCache";

describe("تخزين بيانات القوائم دون اتصال", () => {
  const queryKey = (namespace: string, procedure: string) => [[namespace, procedure], { type: "query" }] as const;

  it("keeps the primary inventory directories and movement views available from local snapshots", () => {
    expect(isOfflineCacheableQuery(queryKey("warehouses", "list"))).toBe(true);
    expect(isOfflineCacheableQuery(queryKey("items", "warehouseStocks"))).toBe(true);
    expect(isOfflineCacheableQuery(queryKey("items", "warehouseCards"))).toBe(true);
    expect(isOfflineCacheableQuery(queryKey("additions", "listPaged"))).toBe(true);
    expect(isOfflineCacheableQuery(queryKey("disbursements", "listPaged"))).toBe(true);
    expect(isOfflineCacheableQuery(queryKey("transfers", "listPaged"))).toBe(true);
    expect(isOfflineCacheableQuery(queryKey("reports", "inventoryAudit"))).toBe(true);
    expect(isOfflineCacheableQuery(queryKey("reports", "dataset"))).toBe(true);
    expect(isOfflineCacheableQuery(queryKey("items", "warehouseLowStock"))).toBe(true);
    expect(isOfflineCacheableQuery(queryKey("warehouses", "listByUsage"))).toBe(true);
  });

  it("does not persist unrelated procedures", () => {
    expect(isOfflineCacheableQuery(queryKey("chat", "messages"))).toBe(false);
  });
});
