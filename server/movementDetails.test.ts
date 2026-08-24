import { describe, expect, it } from "vitest";
import { resolveMovementDetail } from "../client/src/lib/movementDetails";

describe("movement details", () => {
  it("prefers the linked supplier name for additions", () => {
    expect(resolveMovementDetail("additions", { supplierId: 7, supplier: "اسم قديم" }, new Map([[7, "المورد المرتبط"]]))).toBe("المورد المرتبط");
  });

  it("prefers the linked customer name for disbursements", () => {
    expect(resolveMovementDetail("disbursements", { customerId: 3, destination: "جهة قديمة" }, new Map(), new Map([[3, "العميل المرتبط"]]))).toBe("العميل المرتبط");
  });

  it("shows both endpoints for transfers", () => {
    expect(resolveMovementDetail("transfers", { fromStore: "العميل", toStore: "المخزن الرئيسي" })).toBe("العميل ← المخزن الرئيسي");
  });

  it("keeps legacy text when no linked record exists", () => {
    expect(resolveMovementDetail("disbursements", { customerId: 99, destination: "جهة قديمة" })).toBe("جهة قديمة");
  });
});
