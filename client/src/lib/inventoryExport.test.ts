import { describe, expect, it } from "vitest";
import { sortInventoryRowsByCategory, type InventoryExportItem } from "./inventoryExport";

const row = (code: string, name: string, category?: string): InventoryExportItem => ({
  code, name, category: category ?? "", unit: "قطعة", currentStock: 1, reorderLevel: 0, unitPrice: 1,
});

describe("sortInventoryRowsByCategory", () => {
  it("sorts by Arabic category, then name, then code without mutating input", () => {
    const input = [row("20", "زجاج", "تشطيبات"), row("2", "ألف", "كهرباء"), row("1", "ألف", "كهرباء"), row("3", "حديد")];
    const sorted = sortInventoryRowsByCategory(input);
    expect(sorted.map(item => item.code)).toEqual(["20", "1", "2", "3"]);
    expect(input.map(item => item.code)).toEqual(["20", "2", "1", "3"]);
  });

  it("uses بدون تصنيف for missing categories", () => {
    const sorted = sortInventoryRowsByCategory([row("1", "صنف", ""), row("2", "صنف", "كهرباء")]);
    expect(sorted.map(item => item.category)).toEqual(["كهرباء", ""]);
  });
});
