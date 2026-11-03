import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panel = readFileSync(resolve(process.cwd(), "client/src/components/reports/ReportFiltersPanel.tsx"), "utf8");
const page = readFileSync(resolve(process.cwd(), "client/src/pages/ReportsPage.tsx"), "utf8");

describe("لوحة فلاتر التقارير المستقلة", () => {
  it("تحتوي الفلاتر والأزرار الأساسية", () => {
    expect(panel).toContain("export function ReportFiltersPanel");
    expect(panel).toContain('type="date"');
    expect(panel).toContain("رقم الإذن");
    expect(panel).toContain("نوع الحركة");
    expect(panel).toContain("بحث");
    expect(panel).toContain("مسح جميع الفلاتر");
  });

  it("تُستدعى من الصفحة مع إبقاء الحالة خارج المكون", () => {
    expect(page).toContain("<ReportFiltersPanel");
    expect(page).toContain("applyReportFilters={applyReportFilters}");
    expect(page).toContain("clearReportFilters={clearReportFilters}");
    expect(panel).not.toContain("trpc.");
    expect(panel).not.toContain("localStorage");
  });
});
