import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("التفاصيل المالية في كشف حساب العميل والمورد", () => {
  const page = readFileSync(resolve(process.cwd(), "client/src/pages/WarehousesSuppliersPages.tsx"), "utf8");
  const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
  const exports = readFileSync(resolve(process.cwd(), "client/src/lib/inventoryExportFiles.ts"), "utf8");

  it("يرسم زر التفاصيل والبطاقة والأعمدة المالية للمخوّل فقط وبعد التفعيل", () => {
    expect(page).toContain('const accountFinancialPreferenceKey = `account-financial-details:${kind}:${id}`');
    expect(page).toContain('const showAccountFinancialDetails = canViewAccountFinancialDetails && financialPreferenceVisible');
    expect(page).toContain('aria-pressed={showAccountFinancialDetails}');
    expect(page).toContain('showAccountFinancialDetails ? <Card className={surface}>');
    expect(page).toContain('showAccountFinancialDetails ? <><th className="px-4 py-3">سعر الوحدة</th><th className="px-4 py-3">الإجمالي</th></> : null');
    expect(page).toContain('showAccountFinancialDetails ? <><td className="px-4 py-3">');
    expect(page).toContain('movement-financial-toggle');
  });

  it("يحمي سعر الوحدة وإجمالي القيمة في مساري كشف المورد والعميل", () => {
    expect(routers).toContain('rows.map(({ unitPrice: _unitPrice, totalValue: _totalValue, ...row }) => row)');
    expect(routers).toContain('listSupplierAccount(input.supplierId)');
    expect(routers).toContain('listCustomerAccount(input.customerId)');
    expect(routers).toContain('permissions.allowedReports.includes("warehouse-financial-details")');
  });

  it("ينشئ PDF كشف الحساب بترويسة وجدول أحاديي اللون للطباعة", () => {
    expect(exports).toContain('summary: options.summary, monochrome: true');
    expect(exports).toContain('fillColor: options.monochrome ? [255, 255, 255] : [13, 79, 98]');
    expect(exports).toContain('textColor: options.monochrome ? [0, 0, 0] : [255, 255, 255]');
    expect(exports).toContain('drawPdfWatermark(doc, options.monochrome ? null : watermarkLogo');
    expect(exports.match(/const watermarkLogo = null;/g)?.length).toBeGreaterThanOrEqual(5);
    expect(exports.match(/headStyles: \{ fillColor: \[255, 255, 255\], textColor: \[0, 0, 0\]/g)?.length).toBeGreaterThanOrEqual(5);
    expect(exports).toContain('const headerRight = pageWidth - 14');
    expect(exports).toContain('{ align: "right", baseline: "middle" }');
    expect(exports).toContain('doc.setFontSize(16)');
    expect(exports).toContain('textColor: [0, 0, 0]');
    expect(exports.match(/headStyles: \{ fillColor: \[255, 255, 255\], textColor: \[0, 0, 0\].*halign: "center"/g)?.length).toBeGreaterThanOrEqual(5);
  });
});
