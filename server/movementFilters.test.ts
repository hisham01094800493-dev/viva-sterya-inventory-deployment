import { describe, expect, it } from "vitest";
import { filterMovementRowsByItemAndPermit } from "../client/src/lib/movementFilters";

const dateKey = (value: unknown) => String(value ?? "");

const rows = [
  { id: 1, date: "2026-08-01", eznNum: "إضافة-1024", itemName: "حديد 8 مم", itemCode: "20001", supplierId: 7, purpose: "مبنى L" },
  { id: 2, date: "2026-08-02", eznNum: "إضافة-1025", itemName: "أسمنت", itemCode: "20002", supplierId: 8, purpose: "مبنى B" },
  { id: 3, date: "2026-08-03", eznNum: "إضافة-2024", itemName: "حديد 8 مم", itemCode: "30001", supplierId: 7, purpose: "استكمال الأعمال" },
];

describe("movement permit and item search", () => {
  it("filters additions by permit number independently from item search", () => {
    expect(filterMovementRowsByItemAndPermit(rows, { kind: "additions", permitSearch: "1024" }, dateKey).map(row => row.id)).toEqual([1]);
    expect(filterMovementRowsByItemAndPermit(rows, { kind: "additions", itemSearch: "حديد" }, dateKey).map(row => row.id)).toEqual([1, 3]);
    expect(filterMovementRowsByItemAndPermit(rows, { kind: "additions", itemSearch: "20002", permitSearch: "1025" }, dateKey).map(row => row.id)).toEqual([2]);
  });

  it("filters each movement screen by its dedicated purpose field", () => {
    expect(filterMovementRowsByItemAndPermit(rows, { kind: "additions", purposeSearch: "L" }, dateKey).map(row => row.id)).toEqual([1]);
    expect(filterMovementRowsByItemAndPermit([{ id: 4, date: "2026-08-04", eznNum: "صرف-1", itemName: "كابل", itemCode: "40001", disburseType: "تشغيل مبنى B" }], { kind: "disbursements", purposeSearch: "B" }, dateKey).map(row => row.id)).toEqual([4]);
    expect(filterMovementRowsByItemAndPermit([{ id: 6, date: "2026-08-06", eznNum: "صرف-2", itemName: "مفتاح", itemCode: "40002", disburseType: "L3-L5" }], { kind: "disbursements", purposeSearch: "L3-L5" }, dateKey).map(row => row.id)).toEqual([6]);
    expect(filterMovementRowsByItemAndPermit([{ id: 5, date: "2026-08-05", eznNum: "مرتجع-1", itemName: "صمام", itemCode: "50001", notes: "مرتجع مبنى L" }], { kind: "transfers", purposeSearch: "L" }, dateKey).map(row => row.id)).toEqual([5]);
  });
});
