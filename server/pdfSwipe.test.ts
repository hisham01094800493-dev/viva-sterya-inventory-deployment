import { describe, expect, it } from "vitest";
import { getPdfSwipeDirection } from "../client/src/lib/pdfSwipe";

describe("السحب بين صفحات PDF", () => {
  it("يحوّل السحب الأفقي الواضح إلى الصفحة السابقة أو التالية", () => {
    expect(getPdfSwipeDirection({ x: 80, y: 320 }, { x: 170, y: 328 })).toBe("previous");
    expect(getPdfSwipeDirection({ x: 270, y: 320 }, { x: 160, y: 316 })).toBe("next");
  });

  it("يتجاهل السحب القصير أو العمودي حتى لا يعطل التمرير والتكبير", () => {
    expect(getPdfSwipeDirection({ x: 100, y: 100 }, { x: 140, y: 102 })).toBeNull();
    expect(getPdfSwipeDirection({ x: 100, y: 100 }, { x: 132, y: 230 })).toBeNull();
  });
});
