import { describe, expect, it } from "vitest";
import { buildCompanyInventoryAuditReport } from "./db";

describe("تقرير الجرد الشامل", () => {
  it("يستخدم رصيد الصنف الأساسي عند غياب سجل رصيد المخزن التفصيلي", () => {
    const report = buildCompanyInventoryAuditReport(
      [{ id: 10, slot: 1, name: "المخزن الرئيسي" }],
      [{
        itemId: 1,
        code: "MH-0001",
        name: "صنف تجريبي",
        category: null,
        unit: "قطعة",
        reorderLevel: "0",
        warehouseId: null,
        currentStock: null,
        itemWarehouseId: 10,
        itemCurrentStock: "12.500",
      }],
    );

    expect(report.rows[0]?.warehouseBalances[0]?.currentStock).toBe(12.5);
    expect(report.rows[0]?.totalCurrentStock).toBe(12.5);
    expect(report.summary.totalCompanyBalance).toBe(12.5);
  });

  it("يفضل رصيد المخزن التفصيلي عند وجوده", () => {
    const report = buildCompanyInventoryAuditReport(
      [{ id: 10, slot: 1, name: "المخزن الرئيسي" }],
      [{
        itemId: 1,
        code: "MH-0001",
        name: "صنف تجريبي",
        category: null,
        unit: "قطعة",
        reorderLevel: "0",
        warehouseId: 10,
        currentStock: "8.250",
        itemWarehouseId: 10,
        itemCurrentStock: "12.500",
      }],
    );

    expect(report.summary.totalCompanyBalance).toBe(8.25);
  });
});
