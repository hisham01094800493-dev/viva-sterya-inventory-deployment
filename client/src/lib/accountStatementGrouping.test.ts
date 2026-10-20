import { describe, expect, it } from "vitest";
import { summarizeAccountStatementItems } from "./accountStatementGrouping";
import type { MovementExportItem } from "./inventoryExportFiles";

const row = (overrides: Partial<MovementExportItem>): MovementExportItem => ({
  id: 1,
  type: "صرف",
  date: "2026-10-01",
  eznNum: "D-1",
  itemCode: "IRON-18",
  name: "حديد تسليح 18 مم",
  quantity: 2,
  detail: "عميل",
  unitPrice: 100,
  totalValue: 200,
  ...overrides,
});

describe("summarizeAccountStatementItems", () => {
  it("يعرض صافي كمية الصنف بعد خصم الكميات السالبة", () => {
    const summary = summarizeAccountStatementItems([
      row({ id: 1, eznNum: "D-1", quantity: 5 }),
      row({ id: 2, eznNum: "D-2", quantity: 3 }),
      row({ id: 3, eznNum: "D-2", quantity: 2 }),
      row({ id: 4, type: "مرتجع", eznNum: "R-1", quantity: -4 }),
    ]);

    expect(summary).toEqual([{
      itemCode: "IRON-18",
      itemName: "حديد تسليح 18 مم",
      netQuantity: 6,
    }]);
  });

  it("يعرض كل صنف في ملخص مستقل ويحافظ على صافي الكمية السالب", () => {
    const summary = summarizeAccountStatementItems([
      row({ id: 1, eznNum: "D-1" }),
      row({ id: 2, itemCode: "IRON-16", name: "حديد تسليح 16 مم", eznNum: "D-2", quantity: -1 }),
      row({ id: 3, itemCode: "IRON-16", name: "حديد تسليح 16 مم", type: "مرتجع", eznNum: "R-1", quantity: -2 }),
    ]);

    expect(summary).toEqual([
      { itemCode: "IRON-18", itemName: "حديد تسليح 18 مم", netQuantity: 2 },
      { itemCode: "IRON-16", itemName: "حديد تسليح 16 مم", netQuantity: -3 },
    ]);
  });
});
