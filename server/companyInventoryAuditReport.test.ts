import { describe, expect, it } from "vitest";
import { buildCompanyInventoryAuditReport } from "./db";

type SourceRow = Parameters<typeof buildCompanyInventoryAuditReport>[1][number];
const warehouse = [{ id: 10, slot: 1, name: "المخزن الرئيسي" }];
const baseRow = (overrides: Partial<SourceRow> = {}): SourceRow => ({
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
  itemInitialStock: "12.500",
  itemIncomingStock: "0",
  itemOutgoingStock: "0",
  ...overrides,
});

describe("تقرير الجرد الشامل", () => {
  it("يستخدم رصيد الصنف الأساسي عند غياب سجل رصيد المخزن التفصيلي", () => {
    const report = buildCompanyInventoryAuditReport(warehouse, [baseRow()]);

    expect(report.rows[0]?.warehouseBalances[0]?.currentStock).toBe(12.5);
    expect(report.rows[0]?.totalCurrentStock).toBe(12.5);
    expect(report.summary.totalCompanyBalance).toBe(12.5);
  });

  it("يفضل رصيد المخزن التفصيلي عند وجوده", () => {
    const report = buildCompanyInventoryAuditReport(warehouse, [baseRow({
      warehouseId: 10,
      currentStock: "8.250",
    })]);

    expect(report.summary.totalCompanyBalance).toBe(8.25);
  });

  it("يعود إلى رصيد الصنف عندما تكون السجلات التفصيلية صفرية", () => {
    const report = buildCompanyInventoryAuditReport(warehouse, [baseRow({
      warehouseId: 10,
      currentStock: "0",
    })]);

    expect(report.summary.totalCompanyBalance).toBe(12.5);
  });

  it("يستخدم الرصيد الأولي فقط إذا لم توجد حركة وارد أو منصرف", () => {
    const report = buildCompanyInventoryAuditReport(warehouse, [baseRow({
      itemCurrentStock: "0",
      itemInitialStock: "12.500",
      itemIncomingStock: "0",
      itemOutgoingStock: "0",
    })]);

    expect(report.summary.totalCompanyBalance).toBe(12.5);
  });

  it("لا يعيد الرصيد الأولي إذا وُجد صرف أو إضافة مسجلة", () => {
    const report = buildCompanyInventoryAuditReport(warehouse, [baseRow({
      itemCurrentStock: "0",
      itemInitialStock: "12.500",
      itemIncomingStock: "5",
      itemOutgoingStock: "17.500",
    })]);

    expect(report.summary.totalCompanyBalance).toBe(0);
  });
});
