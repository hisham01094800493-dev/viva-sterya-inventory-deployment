import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("التفاصيل المالية في جدول المخازن", () => {
  it("يتطلب إذنًا مستقلًا ولا يعيد سعر الوحدة لغير المخوّل", () => {
    const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const db = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
    expect(db).toContain('"warehouse-financial-details"');
    expect(routers).toContain('permissions.allowedReports.includes("warehouse-financial-details")');
    expect(routers).toContain('rows.map(({ unitPrice: _unitPrice, ...row }) => row)');
  });

  it("لا يرسم الأعمدة المالية إلا للمخول الذي فعّلها من داخل React", () => {
    const page = readFileSync(resolve(process.cwd(), "client/src/pages/WarehousesSuppliersPages.tsx"), "utf8");
    const layout = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");
    expect(page).toContain('const showFinancialDetails = canViewFinancialDetails && financialPreferenceVisible');
    expect(page).toContain('showFinancialDetails ? <><th className="px-5 py-4">سعر الوحدة</th><th className="px-5 py-4">إجمالي السعر</th></> : null');
    expect(page).toContain('showFinancialDetails ? <><td className="px-5 py-4 text-[#0d4f62]">');
    expect(page).toContain('إظهار التفاصيل المالية');
    expect(page).toContain('إخفاء التفاصيل المالية');
    expect(page).toContain('WAREHOUSE_FINANCIAL_PREFERENCE_KEY');
    expect(page).toContain('movement-financial-toggle');
    expect(page).toContain('aria-pressed={showFinancialDetails}');
    expect(layout).not.toContain('WarehouseFinancialColumnsAssistant');
  });
});
