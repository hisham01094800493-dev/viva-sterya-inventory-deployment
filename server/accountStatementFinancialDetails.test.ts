import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("التفاصيل المالية في كشف حساب العميل والمورد", () => {
  const page = readFileSync(resolve(process.cwd(), "client/src/pages/WarehousesSuppliersPages.tsx"), "utf8");
  const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
  const exports = readFileSync(resolve(process.cwd(), "client/src/lib/inventoryExportFiles.ts"), "utf8");

  it("يربط تفضيل إظهار التفاصيل المالية بمفتاح خاص بكل جهة", () => {
    expect(page).toContain("account-financial-details:${kind}:${id}");
    expect(page).toContain("const showAccountFinancialDetails = canViewAccountFinancialDetails && financialPreferenceVisible");
  });

  it("يعرض زر التبديل بحالة مضغوطة صحيحة", () => {
    expect(page).toContain("aria-pressed={showAccountFinancialDetails}");
    expect(page).toContain("movement-financial-toggle");
  });

  it("يخفي الأعمدة المالية عندما تكون التفاصيل مخفية", () => {
    expect(page).toContain("showAccountFinancialDetails");
    expect(page).toMatch(/showAccountFinancialDetails\s*\?/);
  });

  it("يحمي سعر الوحدة وإجمالي القيمة في مساري كشف المورد والعميل", () => {
    expect(routers).toContain("listSupplierAccount(");
    expect(routers).toContain("listCustomerAccount(");
    expect(routers).toContain('permissions.allowedReports.includes("warehouse-financial-details")');
    expect(routers).toContain("unitPrice: _unitPrice");
    expect(routers).toContain("totalValue: _totalValue");
  });

  it("ينشئ PDF كشف الحساب بوضع أحادي اللون للطباعة", () => {
    expect(exports).toContain("options.monochrome ? [255, 255, 255] : [13, 79, 98]");
    expect(exports).toContain("options.monochrome ? [0, 0, 0] : [255, 255, 255]");
    expect(exports).toContain("alternateRowStyles");
    expect(exports).toContain("headStyles");
    expect((exports.match(/monochrome/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("يرسم ترويسة الكشف بمحاذاة يمين لدعم العربية", () => {
    expect(exports).toContain("drawAccountStatementHeader");
    expect(exports).toContain("pageWidth - 36");
    expect(exports).toContain("shapeArabic");
  });
});
