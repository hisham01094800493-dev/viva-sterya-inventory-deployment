import { describe, expect, it } from "vitest";
import { buildInventoryExportRows, buildInventoryPdfRows } from "../client/src/lib/inventoryExport";

describe("تصدير بيانات المخزون", () => {
  const items = [{ code: "A-1", name: "صنف تجريبي", category: "مكتبي", unit: "قطعة", currentStock: 4, reorderLevel: 1, unitPrice: 12.5, imageUrl: "https://example.com/item.png" }];

  it("يبني صف Excel بالسعر وقيمة المخزون ورابط الصورة", () => {
    expect(buildInventoryExportRows(items)[0]).toMatchObject({ "سعر الوحدة": 12.5, "قيمة المخزون": 50, "رابط الصورة": "https://example.com/item.png" });
  });

  it("يبني صف PDF يتضمن صورة الصنف", () => {
    const rows = buildInventoryPdfRows(items, value => value.toFixed(2));
    expect(rows[0]?.[7]).toBe("50.00");
    expect(rows[0]?.[8]).toContain("<img src=\"https://example.com/item.png\"");
  });
});
