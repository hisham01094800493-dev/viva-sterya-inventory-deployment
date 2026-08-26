import { describe, expect, it } from "vitest";
import { calculateStockDelta, formatWarehouseItemCode, fromScaled, getCustomerReturnStockDelta, InventoryError, selectNextAutoItemCode, toScaled } from "./db";

describe("inventory quantity rules", () => {
  it("keeps decimal quantities deterministic at three decimal places", () => {
    expect(toScaled("1.2346")).toBe(1235);
    expect(fromScaled(1235)).toBe("1.235");
    expect(toScaled(0)).toBe(0);
  });

  it("applies an addition to incoming and current stock", () => {
    expect(
      calculateStockDelta(
        { code: "A-1", incomingStock: "2.000", outgoingStock: "1.000", currentStock: "5.000" },
        { incoming: 2500, outgoing: 0, current: 2500 },
      ),
    ).toEqual({ incomingStock: "4.500", outgoingStock: "1.000", currentStock: "7.500" });
  });

  it("adds a customer return to available stock without classifying it as new incoming supply", () => {
    const delta = getCustomerReturnStockDelta(2000);
    expect(delta).toEqual({ incoming: 0, outgoing: 0, current: 2000 });
    expect(
      calculateStockDelta(
        { code: "A-1", incomingStock: "91.650", outgoingStock: "89.650", currentStock: "2.000" },
        delta,
      ),
    ).toEqual({ incomingStock: "91.650", outgoingStock: "89.650", currentStock: "4.000" });
  });

  it("rejects a disbursement that would create a negative current balance", () => {
    expect(() =>
      calculateStockDelta(
        { code: "A-1", incomingStock: "10.000", outgoingStock: "8.000", currentStock: "2.000" },
        { incoming: 0, outgoing: 0, current: -2001 },
      ),
    ).toThrowError(InventoryError);
  });

  it("rejects reversing more outgoing stock than the item has recorded", () => {
    expect(() =>
      calculateStockDelta(
        { code: "A-1", incomingStock: "10.000", outgoingStock: "1.000", currentStock: "9.000" },
        { incoming: 0, outgoing: -1001, current: 1001 },
      ),
    ).toThrow("لا يمكن أن تصبح حركة المخزون سالبة");
  });

  it("starts automatic warehouse codes at 10001 and fills skipped unused codes", () => {
    const formatter = (sequence: number) => formatWarehouseItemCode(1, sequence);
    expect(selectNextAutoItemCode(1, ["10003"], formatter)).toEqual({ code: "10001", nextSequence: 2 });
    expect(selectNextAutoItemCode(1, ["10001", "10003"], formatter)).toEqual({ code: "10002", nextSequence: 3 });
  });
});
