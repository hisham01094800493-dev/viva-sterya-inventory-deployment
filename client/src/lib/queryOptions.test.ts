import { describe, expect, it } from "vitest";
import { dashboardQueryOptions, inventoryQueryOptions } from "./queryOptions";

describe("inventory query synchronization", () => {
  it("refreshes inventory data when a desktop session regains focus or reconnects", () => {
    expect(inventoryQueryOptions.refetchOnWindowFocus).toBe(true);
    expect(inventoryQueryOptions.refetchOnReconnect).toBe(true);
    expect(inventoryQueryOptions.staleTime).toBeLessThanOrEqual(15_000);
  });

  it("polls dashboard balances at a lightweight interval while the dashboard is visible", () => {
    expect(dashboardQueryOptions.refetchInterval).toBe(15_000);
    expect(dashboardQueryOptions.refetchIntervalInBackground).toBe(false);
    expect(dashboardQueryOptions.staleTime).toBeLessThan(dashboardQueryOptions.refetchInterval);
  });
});
