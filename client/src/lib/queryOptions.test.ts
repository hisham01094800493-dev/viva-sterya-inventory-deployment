import { describe, expect, it } from "vitest";
import { dashboardQueryOptions, inventoryQueryOptions } from "./queryOptions";

describe("inventory query synchronization", () => {
  it("keeps inventory data cached briefly without refetching on every focus change", () => {
    expect(inventoryQueryOptions.refetchOnWindowFocus).toBe(false);
    expect(inventoryQueryOptions.refetchOnReconnect).toBe(false);
    expect(inventoryQueryOptions.staleTime).toBe(30_000);
  });

  it("polls dashboard balances only while the dashboard is visible", () => {
    expect(dashboardQueryOptions.refetchInterval).toBe(45_000);
    expect(dashboardQueryOptions.refetchIntervalInBackground).toBe(false);
    expect(dashboardQueryOptions.staleTime).toBe(dashboardQueryOptions.refetchInterval);
  });
});
