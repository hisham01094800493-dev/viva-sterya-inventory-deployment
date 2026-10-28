import { describe, expect, it } from "vitest";
import { calculateStockDelta, getCustomerReturnStockDelta, isInternalTransfer, isReturnDisbursement, isReturnTransfer } from "./db";

describe("warehouse movement rules", () => {
  it("keeps internal transfers distinct from return movements", () => {
    expect(isInternalTransfer("transfer")).toBe(true);
    expect(isInternalTransfer("تحويل داخلي")).toBe(true);
    expect(isInternalTransfer("مرتجع من عميل")).toBe(false);
  });

  it("recognizes legacy positive disbursements as returns from their description", () => {
    expect(isReturnDisbursement({ quantity: "5.000", disburseType: "مرتجع من العميل" })).toBe(true);
    expect(isReturnDisbursement({ quantity: "5.000", notes: "ارتجاع من المقاول" })).toBe(true);
    expect(isReturnDisbursement({ quantity: "5.000", disburseType: "صرف عادي" })).toBe(false);
  });

  it("treats both return labels as stock replenishment rather than new procurement", () => {
    expect(isReturnTransfer("مرتجع من عميل")).toBe(true);
    expect(isReturnTransfer("مرتجع للمخزن")).toBe(true);
    expect(getCustomerReturnStockDelta(2000)).toEqual({ incoming: 0, outgoing: 0, current: 2000 });
    expect(calculateStockDelta(
      { code: "20001", incomingStock: "91.650", outgoingStock: "89.650", currentStock: "2.000" },
      getCustomerReturnStockDelta(2000),
    )).toEqual({ incomingStock: "91.650", outgoingStock: "89.650", currentStock: "4.000" });
  });
});
