import { describe, expect, it } from "vitest";
import { buildBuildingCostComparison } from "./buildingCostComparison";

describe("buildBuildingCostComparison", () => {
  it("groups quantities and costs by building and respects date range", () => {
    const result = buildBuildingCostComparison([
      { id: 1, name: "مبنى أ", code: "A", budget: "1000", type: "owned_building" },
      { id: 2, name: "مبنى ب", code: "B", budget: "500", type: "subcontractor" },
    ], [
      { buildingId: 1, quantity: "10", totalValue: "250", date: "2026-10-01" },
      { buildingId: 1, quantity: "2", totalValue: "50", date: "2026-09-30" },
      { buildingId: 2, quantity: "4", totalValue: "600", date: "2026-10-02" },
      { buildingId: null, quantity: "1", totalValue: "20", date: "2026-10-02" },
    ], { fromDate: "2026-10-01", toDate: "2026-10-31" });
    expect(result.rows.map(row => row.name)).toEqual(["مبنى ب", "مبنى أ", "صرف غير مرتبط بمبنى"]);
    expect(result.rows[0].cost).toBe(600);
    expect(result.rows[0].remainingBudget).toBe(-100);
    expect(result.totals.quantity).toBe(15);
    expect(result.totals.cost).toBe(870);
  });

  it("keeps active buildings with zero activity visible", () => {
    const result = buildBuildingCostComparison([{ id: 1, name: "مبنى فارغ", code: "EMPTY", budget: 100 }], []);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].movements).toBe(0);
    expect(result.rows[0].budgetUsagePercent).toBe(0);
  });
});
