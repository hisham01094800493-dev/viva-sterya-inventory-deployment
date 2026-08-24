import { describe, expect, it } from "vitest";
import { buildAccountStatementRows, filterAndSortDirectory } from "../client/src/pages/WarehousesSuppliersPages";
import { cameraImageInputProps, normalizeScannedBarcode } from "../client/src/pages/InventoryPages";

describe("بحث وترتيب أدلة الجهات", () => {
  const rows = [
    { name: "شركة النور", phone: "0102", email: "noor@example.com" },
    { name: "مؤسسة الأمل", phone: "0110", email: "amal@example.com" },
  ];

  it("يبحث بالاسم أو الهاتف أو البريد", () => {
    expect(filterAndSortDirectory(rows, "0110", "name", "asc")).toHaveLength(1);
    expect(filterAndSortDirectory(rows, "noor@", "name", "asc")[0].name).toBe("شركة النور");
  });

  it("يرتب تصاعدياً وتنازلياً بالمفتاح المختار", () => {
    expect(filterAndSortDirectory(rows, "", "name", "asc").map(row => row.name)).toEqual(["شركة النور", "مؤسسة الأمل"]);
    expect(filterAndSortDirectory(rows, "", "phone", "desc").map(row => row.phone)).toEqual(["0110", "0102"]);
  });

  it("يطبع قيمة الباركود ويرفض القيمة الفارغة", () => {
    expect(normalizeScannedBarcode("  890123  ")).toBe("890123");
    expect(normalizeScannedBarcode("   ")).toBeNull();
    expect(normalizeScannedBarcode("x".repeat(140))).toHaveLength(128);
    expect(cameraImageInputProps).toEqual({ accept: "image/jpeg,image/png,image/webp", capture: "environment" });
  });

  it("يصفّي كشف حساب المورد ويحسب الكمية والقيمة من الإضافات المطابقة فقط", () => {
    const statement = buildAccountStatementRows([
      { id: 1, date: "2026-01-01", eznNum: "A1", itemName: "صنف 1", quantity: "2", unitPrice: "10", totalValue: "20", supplierId: 3 },
      { id: 2, date: "2026-01-02", eznNum: "A2", itemName: "صنف 2", quantity: "5", unitPrice: "4", totalValue: "20", supplierId: 9 },
    ], "supplier", 3);
    expect(statement).toHaveLength(1);
    expect(statement.reduce((sum, row) => sum + row.quantity, 0)).toBe(2);
    expect(statement.reduce((sum, row) => sum + row.total, 0)).toBe(20);
  });

  it("يصفّي كشف حساب العميل ويحسب الكمية والقيمة من أذونات الصرف المطابقة فقط", () => {
    const statement = buildAccountStatementRows([
      { id: 1, date: "2026-01-01", eznNum: "D1", itemName: "صنف 1", quantity: "3", unitPrice: "7", totalValue: "21", customerId: 4 },
      { id: 2, date: "2026-01-02", eznNum: "D2", itemName: "صنف 2", quantity: "8", unitPrice: "2", totalValue: "16", customerId: 6 },
    ], "customer", 4);
    expect(statement).toHaveLength(1);
    expect(statement.reduce((sum, row) => sum + row.quantity, 0)).toBe(3);
    expect(statement.reduce((sum, row) => sum + row.total, 0)).toBe(21);
  });
});
