import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPdfCanvasSize, getPdfDoubleTapZoom, getPdfFitZoom, getPdfPinchZoom } from "../client/src/lib/pdfPreview";

describe("عارض PDF الداخلي", () => {
  it("يضبط حجم لوحة الرسم حسب التكبير ودقة شاشة الهاتف دون تجاوز الحدود", () => {
    expect(getPdfCanvasSize(600, 800, 1, 2)).toEqual({ cssWidth: 600, cssHeight: 800, pixelWidth: 1200, pixelHeight: 1600, pixelRatio: 2 });
    expect(getPdfCanvasSize(600, 800, 4, 9)).toMatchObject({ cssWidth: 1050, cssHeight: 1400, pixelRatio: 3 });
    expect(getPdfFitZoom(960, 336, 1)).toBe(0.35);
    expect(getPdfFitZoom(960, 336, 1.25)).toBe(1.25);
    expect(getPdfPinchZoom(1, 100, 150)).toBe(1.5);
    expect(getPdfPinchZoom(1.6, 100, 150)).toBe(1.75);
    expect(getPdfPinchZoom(1, 100, 25)).toBe(0.75);
    expect(getPdfDoubleTapZoom(1)).toBe(1.5);
    expect(getPdfDoubleTapZoom(1.5)).toBe(1);
  });

  it("يعيد استخدام مستند PDF المحمّل عند تغيير الصفحة أو التكبير ويحد دقة الرسم", () => {
    const canvas = readFileSync(resolve(process.cwd(), "client/src/components/PdfPageCanvas.tsx"), "utf8");
    const exports = readFileSync(resolve(process.cwd(), "client/src/lib/inventoryExportFiles.ts"), "utf8");
    expect(canvas).toContain("pdfDocumentRef");
    expect(canvas).toContain("cached.pdf ? Promise.resolve(cached.pdf)");
    expect(canvas).toContain("Math.min(2, window.devicePixelRatio || 1)");
    expect(exports).toContain("void fetchArabicFontData()");
  });
});
