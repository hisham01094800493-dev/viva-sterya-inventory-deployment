import { describe, expect, it } from "vitest";
import { buildStockVarianceRows, summarizeStockVariance } from "./stockVariance";

describe("stock variance report", () => {
  it("calculates net as initial plus additions and returns minus disbursements", () => {
    const [row] = buildStockVarianceRows(
      [{ code: "20001", name: "حديد", initialStock: 0, currentStock: 2 }],
      [{ itemCode: "20001", quantity: 91.65 }],
      [{ itemCode: "20001", quantity: 89.65 }],
      [{ itemCode: "20001", quantity: 2, transferType: "مرتجع" }],
    );
    expect(row.net).toBeCloseTo(4, 3);
    expect(row.returns).toBe(2);
    expect(row.variance).toBeCloseTo(2, 3);
    expect(row.status).toBe("فرق موجب");
  });

  it("ignores non-return transfers and identifies a matching balance", () => {
    const [row] = buildStockVarianceRows(
      [{ code: "A", name: "صنف", initialStock: 2, currentStock: 5 }],
      [{ itemCode: "A", quantity: 4 }],
      [{ itemCode: "A", quantity: 1 }],
      [{ itemCode: "A", quantity: 9, transferType: "تحويل" }],
    );
    expect(row.net).toBe(5);
    expect(row.returns).toBe(0);
    expect(row.status).toBe("متطابق");
  });

  it("summarizes matched and unmatched rows", () => {
    const rows = buildStockVarianceRows(
      [{ code: "A", name: "أ", currentStock: 1 }, { code: "B", name: "ب", currentStock: 0 }],
      [{ itemCode: "A", quantity: 1 }, { itemCode: "B", quantity: 2 }],
      [{ itemCode: "B", quantity: 1 }],
      [],
    );
    expect(summarizeStockVariance(rows)).toMatchObject({ total: 2, matched: 1, positive: 1, negative: 0 });
  });
});
