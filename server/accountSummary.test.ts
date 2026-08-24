import { describe, expect, it } from "vitest";
import { buildAccountSummary } from "../client/src/lib/accountSummary";

describe("account movement summary", () => {
  it("groups additions by linked supplier and disbursements by linked customer", () => {
    const result = buildAccountSummary(
      [{ itemCode: "10001", quantity: 2, unitPrice: 10, supplierId: 1, supplier: "قديم" }, { itemCode: "10001", quantity: 3, unitPrice: 10, supplierId: 1 }],
      [{ itemCode: "10001", quantity: 4, unitPrice: 10, customerId: 2, destination: "قديم" }],
      [{ code: "10001", unitPrice: 10 }],
      [{ id: 1, name: "المورد الأول" }],
      [{ id: 2, name: "العميل الأول" }],
    );
    expect(result.suppliers).toEqual([{ name: "المورد الأول", quantity: 5, value: 50, movements: 2 }]);
    expect(result.customers).toEqual([{ name: "العميل الأول", quantity: 4, value: 40, movements: 1 }]);
  });

  it("keeps legacy supplier and destination text when ids are missing", () => {
    const result = buildAccountSummary([{ itemCode: "10001", quantity: 1, supplier: "مورد قديم" }], [{ itemCode: "10001", quantity: 1, destination: "جهة قديمة" }], [{ code: "10001", unitPrice: 7 }], [], []);
    expect(result.suppliers[0].name).toBe("مورد قديم");
    expect(result.customers[0].name).toBe("جهة قديمة");
  });
});
