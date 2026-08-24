import { describe, expect, it } from "vitest";
import { filterInventoryItems } from "../client/src/lib/itemFilters";

const items = [
  { id: 1, name: "كرسي مكتب", code: "OFF-01", category: "أثاث", currentStock: 2, reorderLevel: 5 },
  { id: 2, name: "قلم أزرق", code: "STA-01", category: "قرطاسية", currentStock: 30, reorderLevel: 5 },
  { id: 3, name: "طاولة اجتماعات", code: "OFF-02", category: "أثاث", currentStock: 10, reorderLevel: 2 },
];

describe("البحث والتصفية في الأصناف", () => {
  it("يعرض أصناف التصنيف المحدد فقط", () => {
    expect(filterInventoryItems(items, "", "أثاث", "all", "code").map(item => item.code)).toEqual(["OFF-01", "OFF-02"]);
  });

  it("يعزل الأصناف منخفضة المخزون ويرتبها حسب الرصيد", () => {
    expect(filterInventoryItems(items, "", "all", "low", "stock").map(item => item.code)).toEqual(["OFF-01"]);
  });

  it("يجمع البحث السريع مع التصنيف ويعرض النتيجة المطابقة فقط", () => {
    expect(filterInventoryItems(items, "طاولة", "أثاث", "all", "name").map(item => item.code)).toEqual(["OFF-02"]);
  });
});
