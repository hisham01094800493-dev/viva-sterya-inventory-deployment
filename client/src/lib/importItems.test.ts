import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { isSupportedItemsFile, parseItemsWorkbook } from "./importItems";

describe("استيراد ملفات الأصناف", () => {
  it("يدعم امتداد XLSB ويقرأ ورقة العمل الأولى", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet([
      { "كود الصنف": "ST-001", "اسم الصنف": "كرسي", "الرصيد الأولي": 12, "حد الطلب": 3, التصنيف: "أثاث", الوحدة: "قطعة" },
      { "كود الصنف": "", "اسم الصنف": "صف ناقص" },
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "الأصناف");
    const bytes = XLSX.write(workbook, { bookType: "xlsb", type: "array" });

    const result = await parseItemsWorkbook(bytes);

    expect(isSupportedItemsFile("inventory.xlsb")).toBe(true);
    expect(result.sheetName).toBe("الأصناف");
    expect(result.rows).toEqual([
      { code: "ST-001", name: "كرسي", initialStock: 12, reorderLevel: 3, category: "أثاث", unit: "قطعة" },
    ]);
    expect(result.rejected).toBe(1);
    expect(result.issues[0]).toContain("كود الصنف مفقود");
  });

  it("يرفض الامتدادات غير المدعومة", () => {
    expect(isSupportedItemsFile("inventory.pdf")).toBe(false);
    expect(isSupportedItemsFile("inventory.xlsx")).toBe(true);
  });
});
