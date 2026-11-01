import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("التفاصيل المالية في كشف حساب العميل والمورد", () => {
  const page = readFileSync(resolve(process.cwd(), "client/src/pages/WarehousesSuppliersPages.tsx"), "utf8");
  const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
  const exports = readFileSync(resolve(process.cwd(), "client/src/lib/inventoryExportFiles.ts"), "utf8");

  it("يعرض تفاصيل كشف الحساب المالية وفق الصلاحية والتفضيل الحاليين", () => {
    expect(page).toContain('const accountFinancialPreferenceKey = `account-financial-details:${kind}:${id}`');
    expect(page).toContain("const showAccountFinancialDetails = canViewAccountFinancialDetails && financialPreferenceVisible;");
    expect(page).toContain("aria-pressed={showAccountFinancialDetails}");
    expect(page).toMatch(/\{showAccountFinancialDetails \? <Card className=\{`\$\{surface\} border-r-4 border-r-\[#bd5147\]`\}>/);
    expect(page).toMatch(/\{showAccountFinancialDetails\s*\?\s*<><th className="px-4 py-3">سعر الوحدة<\/th><th className="px-4 py-3">الإجمالي<\/th><\/> : null\}/);
    expect(page).toMatch(/\{showAccountFinancialDetails \? <><td className="px-4 py-3">\{row\.unitPrice\.toLocaleString\("en-US"\)\} ج\.م<\/td><td className="px-4 py-3 font-black text-\[#0d4f62\]">\{row\.total\.toLocaleString\("en-US", \{ minimumFractionDigits: 2 \}\)\} ج\.م<\/td><\/> : null\}/);
    expect(page).toMatch(/\{canViewAccountFinancialDetails \? <Button[^>]*onClick=\{\(\) => void toggleAccountFinancialDetails\(\)\}[^>]*aria-pressed=\{showAccountFinancialDetails\}[^>]*className="[^"]*movement-financial-toggle/);
  });

  it("يحذف القيم المالية من مساري كشف المورد والعميل عند غياب صلاحية التفاصيل", () => {
    expect(routers).toContain("rows.map(({ unitPrice: _unitPrice, totalValue: _totalValue, ...row }) => row)");
    expect(routers).toContain("listSupplierAccount(input.supplierId, permissions.allowedWarehouseIds)");
    expect(routers).toContain("listCustomerAccount(input.customerId, permissions.allowedWarehouseIds)");
    expect(routers).toContain('permissions.allowedReports.includes("warehouse-financial-details")');
  });

  it("يبني PDF كشف الحساب بتخطيطه الحالي ويدعم تنسيق الجدول أحادي اللون", () => {
    expect(exports).toContain("summary: options.summary, summaryCards: options.summaryCards, monochrome: false, accountLayout: true");
    expect(exports).toContain("fillColor: options.monochrome ? [255, 255, 255] : [13, 79, 98]");
    expect(exports).toContain("textColor: options.monochrome ? [0, 0, 0] : [255, 255, 255]");
    expect(exports).toContain("drawPdfWatermark(doc, watermarkLogo, options.watermarkOpacity");
    expect(exports.match(/const watermarkLogo = options\.watermarkEnabled === false \? null : resolvedLogo;/g)?.length).toBeGreaterThanOrEqual(4);
    expect(exports.match(/headStyles: \{ fillColor: \[255, 255, 255\], textColor: \[0, 0, 0\]/g)?.length).toBeGreaterThanOrEqual(4);
    expect(exports).toContain("const headerRight = pageWidth - 36");
    expect(exports).toContain('{ align: "right", baseline: "middle" }');
    expect(exports).toContain("doc.setFontSize(17)");
    expect(exports).toContain("textColor: [0, 0, 0]");
    expect(exports.match(/headStyles: \{ fillColor: \[255, 255, 255\], textColor: \[0, 0, 0\].*halign: "center"/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
