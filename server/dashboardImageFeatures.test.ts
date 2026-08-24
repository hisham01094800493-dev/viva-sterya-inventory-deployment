import { describe, expect, it } from "vitest";
import { summarizeWarehouseBalances } from "../client/src/pages/Home";
import { hasDocumentPreview } from "../client/src/pages/InventoryPages";
import { getCompressionDimensions } from "../client/src/lib/imageCompression";

describe("Dashboard وأدوات الصور", () => {
  it("يجمع رصيد كل مخزن وعدد أصنافه وحالات المتابعة", () => {
    const result = summarizeWarehouseBalances(
      [{ id: 1, slot: 1, name: "المخزن الرئيسي" }, { id: 2, slot: 2, name: "مخزن الفرع" }],
      [{ warehouseId: 1, currentStock: "12.5", reorderLevel: 4 }, { warehouseId: 1, currentStock: 2, reorderLevel: 3 }, { warehouseId: 2, currentStock: 9, reorderLevel: 2 }],
    );
    expect(result).toEqual([
      { id: 1, slot: 1, name: "المخزن الرئيسي", itemCount: 2, balance: 14.5, lowCount: 1 },
      { id: 2, slot: 2, name: "مخزن الفرع", itemCount: 1, balance: 9, lowCount: 0 },
    ]);
  });

  it("يفتح معاينة الإذن عند وجود الرابط ويعرض الحالة الفارغة عند غيابه", () => {
    expect(hasDocumentPreview("https://cdn.test/permit.jpg")).toBe(true);
    expect(hasDocumentPreview("  ")).toBe(false);
    expect(hasDocumentPreview(null)).toBe(false);
  });

  it("يقلل أبعاد الصور الكبيرة ويحافظ على أبعاد الصور الصغيرة", () => {
    expect(getCompressionDimensions(4000, 2000, 1600)).toEqual({ width: 1600, height: 800 });
    expect(getCompressionDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});
