import { describe, expect, it } from "vitest";
import { dedupeItemCardReturns, isReturnDisbursement, normalizeCustomerAccountDisbursement } from "./db";
import { calculateStockDelta } from "./db/scale";

describe("تصحيح أذونات الصرف بالكميات السالبة", () => {
  it("يعرض إذن المرتجع مرة واحدة في كارت الصنف إذا تكرر بين التحويلات وأذونات الصرف", () => {
    const transferReturn = {
      id: 1,
      itemCode: "20004",
      eznNum: "18",
      date: "2026-08-08",
      quantity: "2.736",
      fromCustomerId: 7,
    };
    const duplicateDisbursement = {
      id: 2,
      itemCode: "20004",
      eznNum: "18",
      date: "2026-08-08",
      quantity: "-2.736",
      customerId: 7,
    };
    const differentCustomer = {
      ...duplicateDisbursement,
      id: 3,
      customerId: 8,
    };

    expect(dedupeItemCardReturns([transferReturn, duplicateDisbursement, differentCustomer])).toEqual([
      transferReturn,
      differentCustomer,
    ]);
  });

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

  it("يسمح بعكس حركة محذوفة دون حظر إصلاح سجل برصيد سالب", () => {
    expect(calculateStockDelta(
      { code: "10001", incomingStock: "10.000", outgoingStock: "8.000", currentStock: "-2.000" },
      { incoming: 0, outgoing: -1000, current: 1000 },
      { allowNegativeCurrent: true },
    )).toEqual({ incomingStock: "10.000", outgoingStock: "7.000", currentStock: "-1.000" });
  });

  it("يحافظ على تصنيف إذني 18 و19 التاريخيين كمرتجع حتى لو كانت الكمية المخزنة موجبة", () => {
    expect(isReturnDisbursement({ eznNum: "19", quantity: "5.000" })).toBe(true);
    expect(isReturnDisbursement({ eznNum: 18, quantity: "2.830" })).toBe(true);
    expect(isReturnDisbursement({ eznNum: "20", quantity: "-5.000" })).toBe(false);
  });

  it("يبقي إذن التهامي 5207 صرفًا موجبًا حتى لو احتوت بياناته على وصف مرتجع قديم", () => {
    const row = { eznNum: "5207", quantity: "2.830", totalValue: "283.00", disburseType: "مرتجع من العميل", notes: "مرتجع" };
    expect(isReturnDisbursement(row)).toBe(false);
    expect(normalizeCustomerAccountDisbursement(row)).toMatchObject({
      quantity: "2.830",
      totalValue: "283.00",
    });
    expect(normalizeCustomerAccountDisbursement(row)).not.toHaveProperty("transferType");
  });

  it("يعرض الكمية والقيمة في كشف الحساب بالسالب ونوع الحركة كمرتجع", () => {
    expect(normalizeCustomerAccountDisbursement({ eznNum: "19", quantity: "5.000", totalValue: "500.00" })).toMatchObject({
      transferType: "مرتجع من عميل",
      quantity: "-5",
      totalValue: "-500",
      disburseType: "مرتجع من العميل",
    });
  });
});
