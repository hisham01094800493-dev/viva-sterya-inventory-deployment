import { describe, expect, it } from "vitest";
import { buildForecast, classifySeverity } from "./stockForecast";

describe("smart stock forecast", () => {
  it("calculates weighted rate and cover from positive disbursements", () => {
    const rows = buildForecast([{ id: 1, code: "A", name: "حديد", currentStock: "10", unit: "طن", unitPrice: "5", warehouseId: 1, createdAt: new Date("2025-01-01") }], [{ itemCode: "A", quantity: 2, unitPrice: 5, date: "2026-10-01", warehouseId: 1 }, { itemCode: "A", quantity: 4, unitPrice: 5, date: "2026-09-01", warehouseId: 1 }], new Date("2026-10-29T12:00:00Z"));
    expect(rows[0].dailyRate).toBeGreaterThan(0);
    expect(rows[0].daysOfCover).toBeGreaterThan(0);
  });
  it("handles no movement, negative corrections and short item history", () => {
    const rows = buildForecast([{ id: 1, code: "A", name: "صنف", currentStock: "5", createdAt: new Date("2026-10-20") }], [{ itemCode: "A", quantity: -10, date: "2026-10-25", unitPrice: 1 }], new Date("2026-10-29T00:00:00Z"));
    expect(rows[0].dailyRate).toBe(0);
    expect(rows[0].daysOfCover).toBeNull();
    expect(rows[0].lowConfidence).toBe(true);
  });
  it("returns exact severity boundaries", () => {
    expect(classifySeverity(3, 1)).toBe("critical");
    expect(classifySeverity(7, 1)).toBe("warning");
    expect(classifySeverity(14, 1)).toBe("watch");
    expect(classifySeverity(null, 0)).toBe("critical");
  });
  it("suggests order quantity and identifies stagnant stock", () => {
    const rows = buildForecast([{ id: 1, code: "A", name: "صنف", currentStock: "1", createdAt: new Date("2025-01-01") }], [{ itemCode: "A", quantity: 1, date: "2026-06-01", unitPrice: 10 }], new Date("2026-10-29T00:00:00Z"));
    expect(rows[0].stagnant).toBe(true);
    expect(rows[0].suggestedOrderQty).toBeGreaterThanOrEqual(0);
    expect(["A", "B", "C"]).toContain(rows[0].abcClass);
  });
});
