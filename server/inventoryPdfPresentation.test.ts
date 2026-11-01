import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pdfExportSource = readFileSync(resolve(process.cwd(), "client/src/lib/inventoryExportFiles.ts"), "utf8");
const inventoryPageSource = readFileSync(resolve(process.cwd(), "client/src/pages/InventoryPages.tsx"), "utf8");
const reportsPageSource = readFileSync(resolve(process.cwd(), "client/src/pages/ReportsPage.tsx"), "utf8");

describe("تنسيق ملفات PDF", () => {
  it("يضع اسم النظام كتذييل خفيف ولا يضيفه إلى عناوين التقارير", () => {
    expect([...pdfExportSource.matchAll(/Smart Inventory/g)]).toHaveLength(1);
    expect(pdfExportSource).toContain('doc.text("Smart Inventory", pageWidth / 2, pageHeight - 20, { align: "center" });');
    expect(pdfExportSource).toContain("doc.setTextColor(180, 190, 196);");
    expect(pdfExportSource).toContain("finalizeReportPdf(doc, title); savePdfFile(doc, filename);");
    expect(reportsPageSource).not.toContain("Smart Inventory - Stock Report");
    expect(reportsPageSource).not.toContain(" - Smart Inventory");
    expect(inventoryPageSource).not.toContain(" - Smart Inventory");
  });

  it("يتيح إظهار بطاقة القيمة المالية وإخفاءها من معاينة تقرير الأصناف", () => {
    expect(inventoryPageSource).toContain("إظهار بطاقة القيمة المالية");
    expect(inventoryPageSource).toContain("checked={includeInventoryValueCard}");
    expect(inventoryPageSource).toContain("updateInventoryValueCardInPreview(event.target.checked)");
    expect(inventoryPageSource).toContain("includeCategoryValueChart: canViewInventoryFinancialDetails && includeValueCard");
    expect(pdfExportSource).toContain("options.includeCategoryValueChart && enriched.length");
    expect(pdfExportSource).toContain("إجمالي قيمة المخزون حسب التصنيف");
  });

  it("يخصص عرضًا أكبر لعمود اسم الصنف في تقرير PDF", () => {
    expect(pdfExportSource).toContain('key === "name" ? 210');
  });
});
