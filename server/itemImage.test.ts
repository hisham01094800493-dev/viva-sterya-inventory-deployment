import { describe, expect, it } from "vitest";
import { validateItemImage } from "../client/src/lib/itemImage";

describe("التحقق من صور الأصناف", () => {
  it("يقبل صور PNG ضمن الحجم المسموح", () => {
    expect(validateItemImage({ type: "image/png", size: 1024 })).toBeNull();
  });

  it("يرفض الصيغ غير المدعومة والصور الأكبر من 5 ميجابايت", () => {
    expect(validateItemImage({ type: "application/pdf", size: 1024 })).toContain("JPG");
    expect(validateItemImage({ type: "image/jpeg", size: 5 * 1024 * 1024 + 1 })).toContain("5 ميجابايت");
  });
});
