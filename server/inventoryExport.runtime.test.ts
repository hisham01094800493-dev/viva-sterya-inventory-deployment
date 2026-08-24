import { describe, expect, it, vi } from "vitest";
import { buildMovementPdf, convertWebpToPng, getMovementPdfCellValue } from "../client/src/lib/inventoryExportFiles";
import { downloadBlobFile, getExportImageExtension, savePdfFile } from "../client/src/lib/inventoryExportRuntime";

describe("تشغيل تصدير المخزون", () => {
  it("يحوّل WEBP إلى PNG قبل التضمين", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 2, height: 2, close: vi.fn() })));
    vi.stubGlobal("document", { createElement: vi.fn(() => ({ width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), toBlob: (callback: (blob: Blob) => void) => callback(new Blob(["png"], { type: "image/png" })) })) });
    const converted = await convertWebpToPng(new Blob(["webp"], { type: "image/webp" }));
    expect(converted.type).toBe("image/png");
    vi.unstubAllGlobals();
  });

  it("يثبت امتداد الصور لكل الصيغ المدعومة", () => {
    expect(getExportImageExtension("image/png", "item.png")).toBe("png");
    expect(getExportImageExtension("image/jpeg", "item.jpg")).toBe("jpeg");
    expect(getExportImageExtension("image/webp", "item.webp")).toBe("webp");
  });

  it("ينشئ رابط التنزيل وينقره ثم يحرره", () => {
    const runtime = { createObjectURL: vi.fn(() => "blob:stock"), revokeObjectURL: vi.fn(), click: vi.fn() };
    expect(downloadBlobFile(new Blob(["stock"]), "smart-inventory-stock.xlsx", runtime)).toBe("smart-inventory-stock.xlsx");
    expect(runtime.click).toHaveBeenCalledWith("blob:stock", "smart-inventory-stock.xlsx");
    expect(runtime.revokeObjectURL).toHaveBeenCalledWith("blob:stock");
  });

  it("يحفظ ملف PDF بالاسم المطلوب", () => {
    const doc = { save: vi.fn() };
    expect(savePdfFile(doc, "smart-inventory-stock.pdf")).toBe("smart-inventory-stock.pdf");
    expect(doc.save).toHaveBeenCalledWith("smart-inventory-stock.pdf");
  });

  it("يحمي معاينة PDF من الصفوف الناقصة أثناء معالجة أعمدة اللزوم", () => {
    expect(getMovementPdfCellValue(undefined, "additionPurpose")).toBe("—");
    expect(getMovementPdfCellValue(undefined, "disbursementPurpose")).toBe("—");
    expect(getMovementPdfCellValue({ type: "إضافة", additionPurpose: "مبنى B-M-L" } as any, "additionPurpose")).toBe("مبنى B-M-L");
  });

  it("يدعم موضع العلامة المائية وتكرارها في تقرير متعدد الصفحات", async () => {
    const rows = Array.from({ length: 70 }, (_, index) => ({ id: index + 1, type: "إضافة", date: "2026-08-17", eznNum: `إضافة-${index + 1}`, itemCode: `2000${index}`, quantity: 2, detail: "توريد حديد تسليح من المورد الرئيسي", unitPrice: 10, totalValue: 20 }));
    const doc = await buildMovementPdf(rows, { columns: ["date", "eznNum", "detail", "quantity"], summary: "إجمالي الكمية المطابقة: 140", watermarkPosition: "top", watermarkRepeat: true });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it("يفصل صفوف تقرير الحركات الطويل على صفحات متعددة", async () => {
    const rows = Array.from({ length: 70 }, (_, index) => ({ id: index + 1, type: "إضافة", date: "2026-08-17", eznNum: `إضافة-${index + 1}`, itemCode: `2000${index}`, quantity: 2, detail: "توريد حديد تسليح من المورد الرئيسي", unitPrice: 10, totalValue: 20 }));
    const doc = await buildMovementPdf(rows, { columns: ["date", "eznNum", "detail", "quantity"], summary: "إجمالي الكمية المطابقة: 140" });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });
});
