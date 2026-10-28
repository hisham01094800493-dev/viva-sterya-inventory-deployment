import { describe, expect, it } from "vitest";
import { buildAccountStatementRows } from "./WarehousesSuppliersPages";

describe("تصنيف الحركات الموقعة في كشف حساب العميل", () => {
  it("يعرض التحويل بالسالب على حساب المُحوِّل وبالموجب على حساب المستقبِل", () => {
    const transferRows = [
      { id: 1, date: "2026-10-28", eznNum: "T-1", itemName: "أسمنت", itemCode: "10001", quantity: "-3.464", totalValue: "-346.40", customerId: 11, transferType: "customer_transfer" },
      { id: 1, date: "2026-10-28", eznNum: "T-1", itemName: "أسمنت", itemCode: "10001", quantity: "3.464", totalValue: "346.40", customerId: 22, transferType: "customer_transfer" },
    ];

    const sourceRow = buildAccountStatementRows(transferRows, "customer", 11)[0];
    const recipientRow = buildAccountStatementRows(transferRows, "customer", 22)[0];

    expect(sourceRow).toMatchObject({ type: "تحويل", quantity: -3.464, total: -346.4 });
    expect(recipientRow).toMatchObject({ type: "تحويل", quantity: 3.464, total: 346.4 });
    expect([sourceRow, recipientRow].reduce((total, row) => total + row.quantity, 0)).toBe(0);
  });

  it("يعرض المرتجع الحقيقي كمرتجع ويحافظ على كميته السالبة", () => {
    const [row] = buildAccountStatementRows([
      { id: 2, date: "2026-10-28", eznNum: "R-1", itemName: "أسمنت", itemCode: "10001", quantity: "-3.464", totalValue: "-346.40", customerId: 11, transferType: "مرتجع من عميل" },
    ], "customer", 11);

    expect(row).toMatchObject({ type: "مرتجع", quantity: -3.464, total: -346.4 });
  });

  it("يعرض إذن التهامي 5207 كصرف بكميته وقيمته الموجبتين", () => {
    const [row] = buildAccountStatementRows([
      { id: 3, date: "2026-08-09", eznNum: "5207", itemName: "حديد تسليح 22 مم", itemCode: "20006", quantity: "2.83", totalValue: "283.00", customerId: 11 },
    ], "customer", 11);

    expect(row).toMatchObject({ number: "5207", type: "صرف", quantity: 2.83, total: 283 });
  });
});
