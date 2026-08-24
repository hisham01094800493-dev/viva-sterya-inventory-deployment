import { describe, expect, it } from "vitest";
import { buildInventoryReportHtml, getLowStockItems } from "./inventoryReports";

const rows = [
  { code: "A-1", name: "صنف منخفض", currentStock: "2", incomingStock: "0", outgoingStock: "8", reorderLevel: "10", unit: "قطعة" },
  { code: "A-2", name: "صنف مستقر", currentStock: "8", incomingStock: "2", outgoingStock: "4", reorderLevel: "10", unit: "قطعة" },
  { code: "A-3", name: "بدون حد", currentStock: "0", incomingStock: "0", outgoingStock: "1", reorderLevel: "0", unit: "قطعة" },
];

describe("inventory reports", () => {
  it("detects rows at or below the configured percentage", () => {
    expect(getLowStockItems(rows, 20).map(row => row.code)).toEqual(["A-1", "A-3"]);
    expect(getLowStockItems(rows, 10).map(row => row.code)).toEqual(["A-3"]);
  });

  it("builds an Arabic RTL report with status and summary", () => {
    const html = buildInventoryReportHtml(rows, 20, "التقرير اليومي للمخزون");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("التقرير اليومي للمخزون");
    expect(html).toContain("يحتاج متابعة");
    expect(html).toContain("إجمالي الأصناف");
  });
});
