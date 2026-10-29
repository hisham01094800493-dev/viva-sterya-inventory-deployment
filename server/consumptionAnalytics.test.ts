import { describe, expect, it } from "vitest";
import { calculateConsumptionBaseline, isConsumptionAnomaly } from "./consumptionAnalytics";

describe("تحليل استهلاك المباني", () => {
  const history = [
    { buildingId: 1, itemCode: "A-1", quantity: "2", date: "2026-09-28" },
    { buildingId: 1, itemCode: "A-1", quantity: "4", date: "2026-09-29" },
    { buildingId: 2, itemCode: "A-1", quantity: "100", date: "2026-09-29" },
  ];

  it("يحسب المتوسط اليومي والأسبوعي من حركات المبنى والصنف السابقة", () => {
    expect(calculateConsumptionBaseline(history, 1, "A-1", "2026-10-01")).toMatchObject({
      totalQuantity: 6,
      dailyAverage: 3,
      weeklyAverage: 21,
      activeDays: 2,
      movementCount: 2,
    });
  });

  it("يعتبر الكمية التي تتجاوز ضعف المتوسط انحرافاً", () => {
    expect(isConsumptionAnomaly(6.1, 3)).toBe(true);
    expect(isConsumptionAnomaly(6, 3)).toBe(false);
    expect(isConsumptionAnomaly(20, 0)).toBe(false);
  });
});
