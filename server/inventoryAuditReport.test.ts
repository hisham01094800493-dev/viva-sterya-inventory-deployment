import { describe, expect, it } from "vitest";
import { buildCompanyInventoryAuditReport } from "./db";

describe("تقرير الجرد الشامل", () => {
  it("يوزع كل صنف على المخازن ويحسب إجمالي الشركة دون مضاعفة الرصيد", () => {
    const report = buildCompanyInventoryAuditReport(
      [{ id: 1, slot: 1, name: "الرئيسي" }, { id: 2, slot: 2, name: "الفرع" }],
      [
        { itemId: 10, code: "10001", name: "صنف أ", category: null, unit: "طن", reorderLevel: "2", warehouseId: 1, currentStock: "2.000" },
        { itemId: 10, code: "10001", name: "صنف أ", category: null, unit: "طن", reorderLevel: "2", warehouseId: 2, currentStock: "3.500" },
        { itemId: 11, code: "10002", name: "صنف ب", category: null, unit: "قطعة", reorderLevel: "0", warehouseId: null, currentStock: null },
      ],
    );
    expect(report.summary).toEqual({ totalItems: 2, totalCompanyBalance: 5.5 });
    expect(report.rows[0]).toMatchObject({ code: "10001", totalCurrentStock: 5.5 });
    expect(report.rows[0]?.warehouseBalances.map(row => row.currentStock)).toEqual([2, 3.5]);
    expect(report.rows[1]).toMatchObject({ code: "10002", totalCurrentStock: 0 });
  });

  it("يعرض رصيد الأصناف القديمة المرتبط بالمخزن الأساسي عند غياب سجل الرصيد التفصيلي", () => {
    const report = buildCompanyInventoryAuditReport(
      [{ id: 1, slot: 1, name: "الرئيسي" }],
      [{ itemId: 12, code: "10012", name: "صنف قديم", category: null, unit: "قطعة", reorderLevel: "0", warehouseId: 1, currentStock: "8.250" }],
    );
    expect(report.rows[0]).toMatchObject({ code: "10012", totalCurrentStock: 8.25 });
    expect(report.rows[0]?.warehouseBalances[0]?.currentStock).toBe(8.25);
  });
});
