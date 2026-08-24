import { describe, expect, it } from "vitest";
import { calculateTotalValue, fromMoneyScaled, toMoneyScaled } from "./db";

describe("حساب أسعار حركات المخزون", () => {
  it("يحسب القيمة الإجمالية من سعر الوحدة والكمية بدقة", () => {
    const unitPrice = toMoneyScaled("12.50");
    const quantity = 2500;
    expect(fromMoneyScaled(calculateTotalValue(unitPrice, quantity))).toBe("31.25");
  });

  it("يتعامل مع السعر الفارغ كسعر صفري للصنف الجديد", () => {
    expect(fromMoneyScaled(toMoneyScaled(undefined))).toBe("0.00");
  });
});
