import { describe, expect, it } from "vitest";
import { rankWarehousesByUsage } from "./db";

describe("ترتيب المخازن بحسب الاستخدام", () => {
  it("يجمع استخدام الإضافة والصرف والتحويل ثم يعرض الأعلى أولاً", () => {
    const ranked = rankWarehousesByUsage(
      [{ id: 1, slot: 1, name: "الرئيسي" }, { id: 2, slot: 2, name: "الفرع" }, { id: 3, slot: 3, name: "الهالك" }],
      [{ warehouseId: 2, usageCount: 4 }, { warehouseId: 1, usageCount: 3 }, { warehouseId: 1, usageCount: 5 }, { warehouseId: null, usageCount: 99 }],
    );
    expect(ranked.map(warehouse => [warehouse.id, warehouse.usageCount])).toEqual([[1, 8], [2, 4], [3, 0]]);
  });

  it("يحافظ على ترتيب الخانات عندما تتساوى أعداد الاستخدام", () => {
    const ranked = rankWarehousesByUsage(
      [{ id: 4, slot: 4, name: "الرابع" }, { id: 1, slot: 1, name: "الأول" }],
      [],
    );
    expect(ranked.map(warehouse => warehouse.id)).toEqual([1, 4]);
  });
});
