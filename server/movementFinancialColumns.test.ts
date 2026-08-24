import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("التفاصيل المالية في جداول الحركات", () => {
  it("لا يرسم السعر أو إجماليه إلا للمخول الذي فعّل العرض", () => {
    const page = readFileSync(resolve(process.cwd(), "client/src/pages/InventoryPages.tsx"), "utf8");
    const layout = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");
    const styles = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

    expect(page).toContain('const showMovementFinancialDetails = canViewMovementFinancialDetails && movementFinancialPreferenceVisible');
    expect(page).toContain('showMovementFinancialDetails ? <><th className="px-4 py-4">سعر الوحدة</th><th className="px-4 py-4">الإجمالي</th></> : null');
    expect(page).toContain('showMovementFinancialDetails ? <><td className="px-4 py-4 text-sm font-bold text-[#0d4f62]">');
    expect(page).toContain('showMovementFinancialDetails ? <Card className="border-0 bg-white shadow-sm">');
    expect(page).toContain('showMovementFinancialDetails ? "sm:grid-cols-3" : "sm:grid-cols-2"');
    expect(page).toContain('[totalQuantity, totalValue, totalRows, totalScopeLabel, showMovementFinancialDetails]');
    expect(layout).toContain('MOVEMENT_FINANCIAL_PREFERENCE_KEY');
    expect(layout).toContain('إظهار التفاصيل المالية');
    expect(layout).toContain('إخفاء التفاصيل المالية');
    expect(layout).toContain('smart-inventory-movement-financial-details');
    expect(layout).not.toContain('data-movement-financial-hidden');
    expect(layout).toContain('movement-financial-toggle');
    expect(styles).toContain('.movement-data-table thead tr');
    expect(styles).toContain('.dark .movement-data-table thead tr');
    expect(page).toContain('className="movement-data-table table-auto w-max min-w-[780px] text-right"');
    expect(page).toContain('className="movement-table-pagination flex flex-wrap items-center justify-between gap-3');
    expect(page).toContain('عرض {(page - 1) * 50 + 1}–{Math.min(totalRows, page * 50)} من {totalRows} حركة');
    expect(page).not.toContain('data.movementPagination');
    expect(styles).toContain('.movement-table-pagination');
    expect(styles).toContain('.movement-financial-toggle[aria-pressed="true"]');
  });
});
