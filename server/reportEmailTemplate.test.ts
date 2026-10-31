import { describe, expect, it } from "vitest";
import { buildDailyReportEmail, type ReportEmailInput } from "./reportEmailTemplate";

function baseInput(overrides: Partial<ReportEmailInput> = {}): ReportEmailInput {
  return {
    reportDate: "2026-11-01",
    thresholdPercentage: 20,
    inventoryTotal: 184,
    minimumStockItems: [
      { code: "ITM-1042", name: "زيت ذرة 5 لتر", currentStock: 3, reorderLevel: 40, unit: "كرتونة" },
      { code: "ITM-2210", name: "أرز مصري فاخر 10 كجم", currentStock: 0, reorderLevel: 25, unit: "شيكارة" },
    ],
    severeCodes: new Set(["ITM-2210"]),
    forecasts: [
      { code: "ITM-2210", name: "أرز مصري فاخر 10 كجم", unit: "شيكارة", currentStock: 0, velocity: 3.4, daysToExhaust: 0 },
      { code: "ITM-3301", name: "منظف أرضيات 4 لتر", unit: "جالون", currentStock: 12, velocity: 0.5, daysToExhaust: 24 },
    ],
    buildingAlerts: [{ name: "مبنى الإدارة", quantity: 120, value: 8450.5 }],
    unassigned: 2,
    totalTodayMovements: 27,
    summary: {
      permitCount: 9,
      lineCount: 27,
      correctionCount: 1,
      netValue: 25780.5,
      quantityByUnit: [{ unit: "كرتونة", quantity: 120 }],
      items: [{ itemCode: "ITM-1042", itemName: "زيت ذرة 5 لتر", unit: "كرتونة", quantity: 120, totalValue: 8450.5 }],
    },
    ...overrides,
  };
}

describe("buildDailyReportEmail", () => {
  it("ينتج مستند RTL عربي واحد بدون تكرار التقارير", () => {
    const html = buildDailyReportEmail(baseInput());
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    expect(html).toContain("التقرير اليومي للمخزون");
    expect((html.match(/التقرير اليومي للمخزون/g) ?? []).length).toBeLessThanOrEqual(2);
    expect(html).not.toContain("الملخص التنفيذي اليومي");
  });

  it("يحتوي على الأقسام الأربعة مرة واحدة لكل قسم", () => {
    const html = buildDailyReportEmail(baseInput());
    for (const title of ["أصناف عند حد الطلب أو دونه", "توقعات النفاذ", "حركة الصرف اليوم", "تنبيهات المباني"]) {
      expect((html.match(new RegExp(title, "g")) ?? []).length).toBe(1);
    }
  });

  it("كل خلية بيانات لها padding وفواصل صفوف (حل مشكلة الزحمة)", () => {
    const html = buildDailyReportEmail(baseInput());
    const dataCells = html.match(/<td(?![^>]*padding)[^>]*>/g) ?? [];
    expect(dataCells.length).toBeLessThan(20);
    expect(html).toContain("border-collapse:collapse");
    expect(html).toContain("table-layout:fixed");
    expect(html).toContain("border-bottom:1px solid");
  });

  it("يتضمن media query للموبايل وpreheader", () => {
    const html = buildDailyReportEmail(baseInput());
    expect(html).toContain("@media screen and (max-width:620px)");
    expect(html).toContain("max-width:660px");
    expect(html).toContain("display:none");
  });

  it("يهرب HTML من بيانات الأصناف لمنع الحقن", () => {
    const html = buildDailyReportEmail(
      baseInput({
        minimumStockItems: [{ code: "<script>", name: "صنف <b>خطير</b>", currentStock: 1, reorderLevel: 9, unit: "علبة" }],
        severeCodes: new Set(["<script>"]),
      }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;خطير&lt;/b&gt;");
  });

  it("يعرض رسائل بديلة عند عدم وجود بيانات", () => {
    const html = buildDailyReportEmail(
      baseInput({ minimumStockItems: [], forecasts: [], buildingAlerts: [], unassigned: 0, summary: { permitCount: 0, lineCount: 0, correctionCount: 0, netValue: 0, quantityByUnit: [], items: [] } }),
    );
    expect(html).toContain("لا توجد");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
  });
});
