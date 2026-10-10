import { describe, expect, it } from "vitest";
import { buildAccountSummary } from "../client/src/lib/accountSummary";

describe("كميات أذونات الصرف للمقاولين", () => {
  it("تخصم الكمية والقيمة من كشف حساب المقاول عند تسجيلها بالسالب", () => {
    const result = buildAccountSummary(
      [],
      [{ itemCode: "10001", quantity: -2.5, unitPrice: 10, customerId: 4 }],
      [{ code: "10001", unitPrice: 10 }],
      [],
      [{ id: 4, name: "مقاول الاختبار" }],
    );
    expect(result.customers).toEqual([{ name: "مقاول الاختبار", quantity: -2.5, value: -25, movements: 1 }]);
  });
});
