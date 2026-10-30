import { describe, expect, it } from "vitest";
import { applyCustomerAccountTransferNetting, type CustomerAccountTotal } from "./customerAccountTransferNetting";

const emptyTotals = (name: string, quantity: number, value: number): CustomerAccountTotal => ({
  name,
  movements: 0,
  quantity,
  value,
  negativeReturnQuantity: 0,
  negativeReturnValue: 0,
  negativeReturnMovements: 0,
  returns: 0,
  returnMovements: 0,
});

describe("applyCustomerAccountTransferNetting", () => {
  it("subtracts source transfers and adds them to the receiving party", () => {
    const result = applyCustomerAccountTransferNetting(
      [{ ...emptyTotals("التهامي", 102.412, 1024.12), movements: 12 }],
      [{ partyId: 1, quantity: "5.000", value: "50.00" }],
      [{ partyId: 2, quantity: "5.000", value: "50.00" }],
      new Map([[1, "التهامي"], [2, "جهة مستلمة"]]),
    );

    expect(result.find(row => row.name === "التهامي")).toMatchObject({
      quantity: 97.412,
      value: 974.12,
      movements: 12,
    });
    expect(result.find(row => row.name === "جهة مستلمة")).toMatchObject({
      quantity: 5,
      value: 50,
      movements: 0,
    });
  });

  it("does not create a negative transfer adjustment from a negative stored magnitude", () => {
    const [row] = applyCustomerAccountTransferNetting(
      [emptyTotals("التهامي", 10, 100)],
      [{ partyId: 1, quantity: "-2.000", value: "-20.00" }],
      [],
      new Map([[1, "التهامي"]]),
    );

    expect(row).toMatchObject({ quantity: 8, value: 80 });
  });
});
