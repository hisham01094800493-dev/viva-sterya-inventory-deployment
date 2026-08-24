import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { buildInventoryExportRows, buildInventoryPdfRows } from "../client/src/lib/inventoryExport";

describe("ملفات تصدير المخزون الفعلية", () => {
  const items = [{ code: "A-1", name: "صنف", category: "عام", unit: "قطعة", currentStock: 2, reorderLevel: 1, unitPrice: 10, imageUrl: null }];

  it("ينشئ مصنف Excel قابل للقراءة", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("المخزون الحالي");
    sheet.columns = Object.keys(buildInventoryExportRows(items)[0] ?? {}).map(key => ({ header: key, key }));
    sheet.addRows(buildInventoryExportRows(items));
    const buffer = await workbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(buffer);
    expect(reopened.getWorksheet("المخزون الحالي")?.getRow(2).getCell(8).value).toBe(20);
  });

  it("ينشئ PDF غير فارغاً بجدول المخزون", () => {
    const doc = new jsPDF();
    autoTable(doc, { head: [["الكود", "القيمة"]], body: buildInventoryPdfRows(items, value => value.toFixed(2)).map(row => [row[0], row[7]]) });
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(500);
  });
});
