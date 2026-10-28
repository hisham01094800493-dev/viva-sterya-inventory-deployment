import { describe, expect, it } from "vitest";
import { buildCustomerTransferAccountRows } from "./db";

describe("كشف حساب تحويلات جهات الصرف", () => {
  it("يخصم التحويل من الجهة الأولى ويضيفه للجهة الثانية", () => {
    const movement = { id: 77, itemCode: "10001", quantity: "5.000", totalValue: "500.00", fromCustomerId: 11, toCustomerId: 22, transferType: "customer_transfer" };
    const source = buildCustomerTransferAccountRows([movement], 11)[0];
    const destination = buildCustomerTransferAccountRows([movement], 22)[0];
    expect(source).toMatchObject({ customerId: 11, quantity: "-5", totalValue: "-500", destination: "تحويل إلى جهة 22", transferType: "customer_transfer", disburseType: "تحويل من عميل إلى عميل" });
    expect(destination).toMatchObject({ customerId: 22, quantity: "5.000", totalValue: "500.00", destination: "تحويل من جهة 11", transferType: "customer_transfer", disburseType: "تحويل من عميل إلى عميل" });
  });

  it("يسجل ارتجاع العميل كخصم من كشفه وليس كتوريد جديد", () => {
    const movement = { id: 78, itemCode: "10001", quantity: "5.000", totalValue: "500.00", fromCustomerId: 11, toCustomerId: null, transferType: "مرتجع من عميل" };
    const row = buildCustomerTransferAccountRows([movement], 11)[0];
    expect(row).toMatchObject({ customerId: 11, quantity: "-5", totalValue: "-500", destination: "مرتجع إلى المخزن", disburseType: "مرتجع من العميل" });
  });
});
