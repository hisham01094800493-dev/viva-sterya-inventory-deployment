import { describe, expect, it } from "vitest";
import { extractReportPeriod, getGlobalSearchRoute, parseGlobalVoiceSearch } from "./globalVoiceSearch";

describe("global voice search commands", () => {
  it("recognizes supplier account statement commands", () => {
    const command = parseGlobalVoiceSearch("افتح كشف حساب المورد النور");
    expect(command.intent).toBe("supplier-statement");
    expect(command.terms).toBe("النور");
  });

  it("recognizes item-card and movement commands", () => {
    expect(parseGlobalVoiceSearch("كارت حركة الصنف أسمنت").intent).toBe("item-card");
    expect(parseGlobalVoiceSearch("ابحث في أذونات الصرف عن أسمنت").intent).toBe("disbursements");
  });

  it("builds direct routes for item cards and account statements", () => {
    expect(getGlobalSearchRoute("item-card", "أسمنت", 7)).toBe("/items?card=7");
    expect(getGlobalSearchRoute("customer-statement", "شركة النور", 4)).toBe("/customers/4/statement");
  });

  it.each([
    ["إذن إضافة رقم 120", "additions", "120"],
    ["أذون إضافة برقم 121", "additions", "121"],
    ["إذن صرف رقم 122", "disbursements", "122"],
    ["صرف رقم 123", "disbursements", "123"],
    ["إذن صرف برقم 124", "disbursements", "124"],
    ["إذن ارتجاع برقم ١٢٥", "transfers", "125"],
    ["مرتجع رقم 126", "transfers", "126"],
  ])("understands permit command %s", (spoken, intent, permitNumber) => {
    const command = parseGlobalVoiceSearch(spoken);
    expect(command.intent).toBe(intent);
    expect(command.permitNumber).toBe(permitNumber);
  });

  it("routes a permit number to the permit filter", () => {
    expect(getGlobalSearchRoute("disbursements", "124", undefined, "124")).toBe("/disbursements?permit=124");
  });

  it("understands a supplier sales report for a named month", () => {
    const command = parseGlobalVoiceSearch("اعرض تقرير مبيعات المورد النور لشهر مارس", new Date("2026-08-25T00:00:00Z"));
    expect(command.intent).toBe("supplier-report");
    expect(command.terms).toBe("النور");
    expect(command.period).toMatchObject({ from: "2026-03-01", to: "2026-03-31" });
    expect(getGlobalSearchRoute(command.intent, command.terms, undefined, undefined, command.period)).toContain("incomingFrom=%D8%A7%D9%84%D9%86%D9%88%D8%B1");
  });

  it("understands a customer sales report separately from supplier inbound movements", () => {
    const command = parseGlobalVoiceSearch("اعرض تقرير مبيعات العميل النور لشهر مارس", new Date("2026-08-25T00:00:00Z"));
    expect(command.intent).toBe("customer-report");
    expect(command.terms).toBe("النور");
    expect(getGlobalSearchRoute(command.intent, command.terms, undefined, undefined, command.period)).toContain("outgoingTo=%D8%A7%D9%84%D9%86%D9%88%D8%B1&movement=صرف");
  });

  it("understands this month and the previous month", () => {
    const reference = new Date("2026-08-25T00:00:00Z");
    expect(extractReportPeriod("تقرير المورد النور هذا الشهر", reference)).toMatchObject({ from: "2026-08-01", to: "2026-08-31" });
    expect(extractReportPeriod("تقرير المورد النور الشهر الماضي", reference)).toMatchObject({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("understands Arabic and numeric date ranges for supplier reports", () => {
    const reference = new Date("2026-08-25T00:00:00Z");
    const arabicRange = parseGlobalVoiceSearch("اعرض تقرير المورد النور من 1 مارس إلى 15 مارس 2026", reference);
    expect(arabicRange.period).toMatchObject({ from: "2026-03-01", to: "2026-03-15" });
    expect(arabicRange.terms).toBe("النور");
    expect(extractReportPeriod("من ٠١/٠٣/٢٠٢٦ إلى ١٥/٠٣/٢٠٢٦", reference)).toMatchObject({ from: "2026-03-01", to: "2026-03-15" });
  });
});
