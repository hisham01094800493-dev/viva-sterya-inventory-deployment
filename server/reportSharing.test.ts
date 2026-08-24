import { describe, expect, it } from "vitest";
import { createReportMailtoUrl, createReportWhatsAppUrl } from "../client/src/lib/reportSharing";

describe("مشاركة تقارير PDF", () => {
  it("ينشئ رابط بريد إلكتروني بعنوان واسم ملف التقرير", () => {
    const url = createReportMailtoUrl("تقرير المخزون", "smart-inventory-stock.pdf");
    expect(url).toContain("mailto:?subject=");
    expect(decodeURIComponent(url)).toContain("تقرير المخزون");
    expect(decodeURIComponent(url)).toContain("smart-inventory-stock.pdf");
  });

  it("ينشئ رابط واتساب برسالة التقرير", () => {
    const url = createReportWhatsAppUrl("تقرير الحركات", "smart-inventory-movements.pdf");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url)).toContain("تقرير الحركات");
    expect(decodeURIComponent(url)).toContain("smart-inventory-movements.pdf");
  });

  it("يدعم اسم ملف Excel في بدائل المشاركة", () => {
    const url = createReportMailtoUrl("تقرير المخزون", "smart-inventory-stock.xlsx");
    expect(decodeURIComponent(url)).toContain("smart-inventory-stock.xlsx");
  });
});
