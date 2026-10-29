import { describe, expect, it } from "vitest";
import {
  buildDailyInventoryReportHtml,
  buildDailyReportWhatsAppMessage,
  buildInventoryReportHtml,
  getItemsAtOrBelowMinimum,
  getLowStockItems,
  summarizeDailyDisbursements,
  type DailyDisbursementRow,
} from "./inventoryReports";

const rows = [
  { code: "A-1", name: "صنف منخفض", currentStock: "2", incomingStock: "0", outgoingStock: "8", reorderLevel: "10", unit: "قطعة" },
  { code: "A-2", name: "وصل للحد", currentStock: "8", incomingStock: "2", outgoingStock: "4", reorderLevel: "10", unit: "قطعة" },
  { code: "A-3", name: "بدون حد", currentStock: "0", incomingStock: "0", outgoingStock: "1", reorderLevel: "0", unit: "قطعة" },
];

const dailyRows: DailyDisbursementRow[] = [
  { date: "2026-10-29", eznNum: "5207", itemCode: "20004", itemName: "حديد 16 مم", quantity: "5", totalValue: "5000", unit: "طن" },
  { date: "2026-10-29", eznNum: "5207", itemCode: "CAB-1", itemName: "كابل", quantity: "10", totalValue: "100", unit: "متر" },
  { date: "2026-10-29", eznNum: "5210", itemCode: "20004", itemName: "حديد 16 مم", quantity: "-1", totalValue: "-1000", unit: "طن" },
];

describe("inventory reports", () => {
  it("detects rows at or below the configured percentage", () => {
    expect(getLowStockItems(rows, 20).map(row => row.code)).toEqual(["A-1", "A-3"]);
    expect(getLowStockItems(rows, 10).map(row => row.code)).toEqual(["A-3"]);
  });

  it("includes all items at or below the reorder minimum in the daily report list", () => {
    expect(getItemsAtOrBelowMinimum(rows).map(row => row.code)).toEqual(["A-1", "A-2", "A-3"]);
  });

  it("builds an Arabic RTL weekly/low-stock report with status and summary", () => {
    const html = buildInventoryReportHtml(rows, 20, "التقرير الأسبوعي للمخزون");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("التقرير الأسبوعي للمخزون");
    expect(html).toContain("يحتاج متابعة");
    expect(html).toContain("إجمالي الأصناف");
  });

  it("uses a dot for decimal quantities instead of a comma", () => {
    const html = buildInventoryReportHtml([
      { ...rows[0], currentStock: "2.736" },
    ], 20, "تقرير الكميات");
    expect(html).toContain(">2.736 قطعة<");
    expect(html).not.toContain(">2,736 قطعة<");
  });

  it("summarizes daily disbursements by unit and nets negative corrections", () => {
    const summary = summarizeDailyDisbursements(dailyRows);
    expect(summary).toMatchObject({ permitCount: 2, lineCount: 3, correctionCount: 1, netValue: 4100 });
    expect(summary.quantityByUnit).toEqual(expect.arrayContaining([
      { unit: "متر", quantity: 10 },
      { unit: "طن", quantity: 4 },
    ]));
    expect(summary.items.find(item => item.itemCode === "20004" && item.unit === "طن")).toMatchObject({ quantity: 4, totalValue: 4000 });
  });

  it("builds the daily summary with threshold stock and disbursement totals", () => {
    const summary = summarizeDailyDisbursements(dailyRows);
    const html = buildDailyInventoryReportHtml(rows, 20, summary, "2026-10-29");
    expect(html).toContain("ملخص المخزون والصرف اليومي");
    expect(html).toContain("2026-10-29");
    expect(html).toContain("وصل للحد");
    expect(html).toContain("وصل إلى حد الطلب أو دونه");
    expect(html).toContain("انخفاض حاد");
    expect(html).toContain("كميات الصرف حسب الوحدة");
    expect(html).toContain("4100 ج.م");
    expect(html).toContain("10");
    expect(html).toContain("متر");
  });

  it("escapes item names in the new daily HTML report", () => {
    const unsafeRows = [{ ...rows[0], name: "<script>alert(1)</script>", currentStock: "0" }];
    const html = buildDailyInventoryReportHtml(unsafeRows, 20, summarizeDailyDisbursements([]), "2026-10-29");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("includes low-stock details and per-unit net quantities in the WhatsApp summary", () => {
    const summary = summarizeDailyDisbursements(dailyRows);
    const message = buildDailyReportWhatsAppMessage("2026-10-29", getItemsAtOrBelowMinimum(rows), 20, summary);
    expect(message).toContain("صافي قيمة الصرف: 4100 ج.م");
    expect(message).toContain("4 طن");
    expect(message).toContain("10 متر");
    expect(message).toContain("وصل للحد");
  });
});
