import { describe, expect, it } from "vitest";
import { calculateQuickExpression } from "../client/src/pages/Home";

describe("الحاسبة السريعة في Dashboard", () => {
  it("تحسب العمليات الأربع مع أولوية الضرب والقسمة", () => {
    expect(calculateQuickExpression("12+3×4")).toBe(24);
    expect(calculateQuickExpression("24÷6+5")).toBe(9);
    expect(calculateQuickExpression("10-2*3")).toBe(4);
  });

  it("ترفض المدخلات الناقصة والقسمة على صفر بدل إنتاج قيمة غير صحيحة", () => {
    expect(calculateQuickExpression("12+")).toBeNull();
    expect(calculateQuickExpression("10÷0")).toBeNull();
    expect(calculateQuickExpression("عملية غير صالحة")).toBeNull();
  });
});
