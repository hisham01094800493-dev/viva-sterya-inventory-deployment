import { describe, expect, it } from "vitest";
import { calculateStockDelta } from "./db/scale";

describe("تصحيح أذونات الصرف بالكميات السالبة", () => {
  it("يزيد الرصيد الحالي ويخفض صافي المنصرف عند إدخال صرف سالب", () => {
    expect(calculateStockDelta(
      { code: "10001", incomingStock: "10.000", outgoingStock: "8.000", currentStock: "2.000" },
      { incoming: 0, outgoing: -2500, current: 2500 },
    )).toEqual({ incomingStock: "10.000", outgoingStock: "5.500", currentStock: "4.500" });
  });

  it("لا يسمح بأن يصبح الرصيد الحالي سالباً حتى مع التصحيح", () => {
    expect(() => calculateStockDelta(
      { code: "10001", incomingStock: "10.000", outgoingStock: "8.000", currentStock: "2.000" },
      { incoming: 0, outgoing: -5000, current: -5000 },
    )).toThrow("الرصيد الحالي للصنف 10001 لا يكفي");
  });
});
