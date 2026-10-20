import { describe, expect, it } from "vitest";
import { buildVoiceMovementQueryResult } from "./voiceMovementQuery";

const rows = [
  { id: 1, date: "2026-10-20", itemCode: "20001", itemName: "حديد 18 ملي", quantity: "16.000", unitPrice: "100", totalValue: "1600", warehouseId: 1, customer: "Civil", movementType: "disbursement" as const },
  { id: 2, date: "2026-10-20", itemCode: "20002", itemName: "عتاد تسليح", quantity: "12.000", unitPrice: "50", totalValue: "600", warehouseId: 1, supplier: "مصر Steel", movementType: "addition" as const },
  { id: 3, date: "2026-10-20", itemCode: "20003", itemName: "أسمنت", quantity: "8.000", unitPrice: "20", totalValue: "160", warehouseId: 2, fromStore: "مخازن مكادي", toStore: "المخزن الرئيسي", movementType: "transfer" as const },
];

describe("البحث الصوتي في الحركات", () => {
  it("يلخص ما أخذه العميل مع القيمة عند امتلاك الصلاحية", () => {
    const result = buildVoiceMovementQueryResult({ query: "Civil أخذ كم من حديد 18 ملي", rows, warehouses: [{ id: 1, name: "الرئيسي" }], allowedWarehouseIds: [], canViewFinancialDetails: true });
    expect(result.quantity).toBe("16.000");
    expect(result.totalValue).toBe("1600.00");
  });
  it("يلخص المورد والكميات الموردة", () => {
    const result = buildVoiceMovementQueryResult({ query: "الكمية الموردة من مصر Steel", rows, warehouses: [], allowedWarehouseIds: [], canViewFinancialDetails: false });
    expect(result.movementType).toBe("addition");
    expect(result.quantity).toBe("12.000");
    expect(result.totalValue).toBeNull();
  });
  it("يلتزم بالمخزن المسموح ولا يعرض القيمة دون الصلاحية", () => {
    const result = buildVoiceMovementQueryResult({ query: "قيمة التحويل من مخازن مكادي", rows, warehouses: [], allowedWarehouseIds: [2], canViewFinancialDetails: false });
    expect(result.movementType).toBe("transfer");
    expect(result.quantity).toBe("8.000");
    expect(result.totalValue).toBeNull();
  });
});
