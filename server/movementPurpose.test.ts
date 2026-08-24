import { describe, expect, it } from "vitest";
import { formatDisbursementPurpose, splitBuildingPurposeForPdf, splitMixedArabicLatinForPdf } from "../client/src/lib/movementPurpose";

describe("تنسيق لزوم الصرف للمباني", () => {
  it("يضيف كلمة مبنى إلى رمز المبنى المنفرد دون تكرار", () => {
    expect(formatDisbursementPurpose("L2")).toBe("مبنى L2");
    expect(formatDisbursementPurpose("L4 & L5")).toBe("مبنى L4 & L5");
    expect(formatDisbursementPurpose("L3-L5")).toBe("مبنى L3-L5");
    expect(formatDisbursementPurpose("مبنى B")).toBe("مبنى B");
    expect(formatDisbursementPurpose("تشغيل مضخة")).toBe("تشغيل مضخة");
  });

  it("يفصل العربية عن الرمز اللاتيني لرسمهما بخطين واضحين داخل PDF", () => {
    expect(splitBuildingPurposeForPdf("L2")).toEqual({ arabic: "مبنى", latin: "L2" });
    expect(splitBuildingPurposeForPdf("L4 & L5")).toEqual({ arabic: "مبنى", latin: "L4 & L5" });
    expect(splitBuildingPurposeForPdf("L3-L5")).toEqual({ arabic: "مبنى", latin: "L3-L5" });
    expect(splitBuildingPurposeForPdf("مبنى B")).toEqual({ arabic: "مبنى", latin: "B" });
    expect(splitBuildingPurposeForPdf("تشغيل مضخة")).toBeNull();
  });

  it("يفصل نص لزوم الإضافة المختلط لرسم الحروف الإنجليزية بوضوح داخل PDF", () => {
    expect(splitMixedArabicLatinForPdf("إضافة لمبنى L4 & L5")).toEqual({ arabic: "إضافة لمبنى", latin: "L4 & L5" });
    expect(splitMixedArabicLatinForPdf("مرتجع من مبنى L3-L5")).toEqual({ arabic: "مرتجع من مبنى", latin: "L3-L5" });
    expect(splitMixedArabicLatinForPdf("تحويل إلى B2")).toEqual({ arabic: "تحويل إلى", latin: "B2" });
    expect(splitMixedArabicLatinForPdf("B-M-L (41)")).toEqual({ arabic: "", latin: "B-M-L (41)" });
    expect(splitMixedArabicLatinForPdf("استكمال أعمال الموقع")).toBeNull();
  });
});
