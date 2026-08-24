import { describe, expect, it } from "vitest";
import { formatAutoItemCode, formatWarehouseItemCode, selectNextAutoItemCode } from "./db";
import { getInventoryStatusLabel, summarizeInventoryStatuses } from "../client/src/pages/WarehousesSuppliersPages";

describe("المخازن والموردون والتكويد التلقائي", () => {
  it("ينشئ أكواداً متسلسلة بصيغة Smart Inventory", () => {
    expect(formatAutoItemCode(1)).toBe("SI-000001");
    expect(formatAutoItemCode(27)).toBe("SI-000027");
    expect(formatAutoItemCode(1000000)).toBe("SI-1000000");
  });

  it("يطبع أقل قيمة صالحة عند تمرير رقم غير صالح للتسلسل", () => {
    expect(formatAutoItemCode(0)).toBe("SI-000001");
    expect(formatAutoItemCode(-4)).toBe("SI-000001");
  });

  it("يبدأ التكويد الرقمي من النطاق الخاص بكل مخزن", () => {
    expect(formatWarehouseItemCode(1, 1)).toBe("10001");
    expect(formatWarehouseItemCode(2, 1)).toBe("20001");
    expect(formatWarehouseItemCode(3, 1)).toBe("30001");
    expect(formatWarehouseItemCode(4, 1)).toBe("40001");
    expect(formatWarehouseItemCode(5, 1)).toBe("50001");
    expect(selectNextAutoItemCode(1, ["10001", "10002"], value => formatWarehouseItemCode(1, value))).toEqual({ code: "10003", nextSequence: 4 });
  });

  it("يصنف حالة المخزون إلى نافد أو منخفض أو متوفر", () => {
    expect(getInventoryStatusLabel(0, 2)).toBe("نافد");
    expect(getInventoryStatusLabel(1, 2)).toBe("منخفض");
    expect(getInventoryStatusLabel(5, 2)).toBe("متوفر");
    expect(getInventoryStatusLabel(3, 0)).toBe("متوفر");
  });

  it("يلخص أعداد الأصناف حسب حالة المخزون", () => {
    expect(summarizeInventoryStatuses([
      { currentStock: 0, reorderLevel: 2 },
      { currentStock: 1, reorderLevel: 2 },
      { currentStock: 5, reorderLevel: 2 },
      { currentStock: 7, reorderLevel: 2 },
    ])).toEqual({ available: 2, low: 1, outOfStock: 1 });
  });

  it("يتجاوز الأكواد الموجودة ولا يعيد استخدامها", () => {
    expect(selectNextAutoItemCode(1, ["SI-000001", "SI-000002"])).toEqual({ code: "SI-000003", nextSequence: 4 });
  });
});
