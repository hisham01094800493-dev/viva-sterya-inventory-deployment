/**
 * Practical isolation test against a real MySQL/MariaDB database.
 * Runs only when DB_HOST is set, so normal CI (no DB) skips it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  listItemsPaged,
  listAdditionsPaged,
  listDisbursementsPaged,
  listTransfersPaged,
  getItemCard,
  listCustomerAccount,
  listSupplierAccount,
  getWarehouseProjectIds,
  getMovementProjectId,
  getBuildingProjectId,
  createDisbursementBatch,
  closeDatabasePool,
} from "./db";

const hasDb = Boolean(process.env.DB_HOST);
const maybe = hasDb ? describe : describe.skip;

maybe("practical project isolation (real DB)", () => {
  beforeAll(async () => {
    // Remove artifacts from previous runs so assertions stay deterministic.
    const { getPool } = await import("./db/connection");
    const pool = await getPool();
    await pool.query("DELETE FROM disbursements WHERE client_request_id LIKE 'batch-test-%'");
    await pool.query("UPDATE items SET current_stock = 100, outgoing_stock = 0 WHERE id = 1");
    await pool.query("UPDATE item_warehouse_balances SET current_stock = 100 WHERE item_id = 1 AND warehouse_id = 1");
  });
  afterAll(async () => {
    await closeDatabasePool();
  });

  it("items list: P1 sees only P1 items, P2 only P2 items", async () => {
    const p1 = await listItemsPaged({ page: 1, pageSize: 50 }, [], 1);
    const p2 = await listItemsPaged({ page: 1, pageSize: 50 }, [], 2);
    const p1Codes = p1.items.map((r: any) => r.code).sort();
    const p2Codes = p2.items.map((r: any) => r.code).sort();
    console.log("P1 items:", p1Codes, "P2 items:", p2Codes);
    expect(p1Codes).toEqual(["P1-ITEM-A", "P1-ITEM-B"]);
    expect(p2Codes).toEqual(["P2-ITEM-A", "P2-ITEM-B"]);
    expect(p1.total).toBe(2);
    expect(p2.total).toBe(2);
  });

  it("additions: each project sees only its own permits", async () => {
    const p1 = await listAdditionsPaged({ page: 1, pageSize: 50 } as any, [], 1);
    const p2 = await listAdditionsPaged({ page: 1, pageSize: 50 } as any, [], 2);
    const p1Nums = p1.rows.map((r: any) => r.eznNum);
    const p2Nums = p2.rows.map((r: any) => r.eznNum);
    console.log("P1 additions:", p1Nums, "P2 additions:", p2Nums);
    expect(p1Nums).toEqual(["P1-ADD-1"]);
    expect(p2Nums).toEqual(["P2-ADD-1"]);
  });

  it("disbursements: each project sees only its own permits", async () => {
    const p1 = await listDisbursementsPaged({ page: 1, pageSize: 50 } as any, [], 1);
    const p2 = await listDisbursementsPaged({ page: 1, pageSize: 50 } as any, [], 2);
    expect(p1.rows.map((r: any) => r.eznNum)).toEqual(["P1-DIS-1"]);
    expect(p2.rows.map((r: any) => r.eznNum)).toEqual(["P2-DIS-1"]);
  });

  it("transfers: each project sees only its own permits", async () => {
    const p1 = await listTransfersPaged({ page: 1, pageSize: 50 } as any, [], 1);
    const p2 = await listTransfersPaged({ page: 1, pageSize: 50 } as any, [], 2);
    expect(p1.rows.map((r: any) => r.eznNum)).toEqual(["P1-TRF-1"]);
    expect(p2.rows.map((r: any) => r.eznNum)).toEqual(["P2-TRF-1"]);
  });

  it("item card: P1 cannot open a P2 item", async () => {
    const own = await getItemCard(1, [], 1);
    const foreign = await getItemCard(3, [], 1);
    console.log("own card:", own?.item?.code, "foreign card:", foreign);
    expect(own?.item?.code).toBe("P1-ITEM-A");
    expect(foreign).toBeUndefined();
  });

  it("customer statement is scoped: P1 does not include P2 disbursements", async () => {
    // Both projects share customer 1 in seed; scope must split them.
    const p1 = await listCustomerAccount(1, [], 1);
    const p2 = await listCustomerAccount(1, [], 2);
    const p1Nums = p1.map((r: any) => r.eznNum);
    const p2Nums = p2.map((r: any) => r.eznNum);
    console.log("customer P1:", p1Nums, "customer P2:", p2Nums);
    expect(p1Nums).not.toContain("P2-DIS-1");
    expect(p2Nums).not.toContain("P1-DIS-1");
  });

  it("supplier statement is scoped", async () => {
    const p1 = await listSupplierAccount(1, [], 1);
    const p2 = await listSupplierAccount(1, [], 2);
    const p1Nums = p1.map((r: any) => r.eznNum);
    const p2Nums = p2.map((r: any) => r.eznNum);
    console.log("supplier P1:", p1Nums, "supplier P2:", p2Nums);
    expect(p1Nums).toContain("P1-ADD-1");
    expect(p1Nums).not.toContain("P2-ADD-1");
    expect(p2Nums).toContain("P2-ADD-1");
    expect(p2Nums).not.toContain("P1-ADD-1");
  });

  it("guard helpers expose the real project of warehouses/movements/buildings", async () => {
    const wh = await getWarehouseProjectIds([1, 2, 3, 4]);
    const byId = new Map(wh.map((r: any) => [r.id, r.projectId]));
    expect(byId.get(1)).toBe(1);
    expect(byId.get(2)).toBe(1);
    expect(byId.get(3)).toBe(2);
    expect(byId.get(4)).toBe(2);

    expect(await getMovementProjectId("addition", 1)).toBe(1);
    expect(await getMovementProjectId("addition", 2)).toBe(2);
    expect(await getMovementProjectId("disbursement", 1)).toBe(1);
    expect(await getMovementProjectId("disbursement", 2)).toBe(2);
    expect(await getMovementProjectId("transfer", 1)).toBe(1);
    expect(await getMovementProjectId("transfer", 2)).toBe(2);
    expect(await getMovementProjectId("addition", 999999)).toBeUndefined();

    expect(await getBuildingProjectId(1)).toBe(1);
    expect(await getBuildingProjectId(999999)).toBeUndefined();
  });

  it("createDisbursementBatch stamps the active project and stays isolated", async () => {
    const before = await listDisbursementsPaged({ page: 1, pageSize: 50 } as any, [], 2);
    await createDisbursementBatch({
      date: "2026-02-01",
      eznNum: "P1-DIS-BATCH",
      warehouseId: 1,
      buildingId: 1,
      destination: "جهة",
      customerId: 1,
      clientRequestId: "batch-test-1",
      userId: 1,
      projectId: 1,
      lines: [{ itemCode: "P1-ITEM-A", quantity: 2 }],
    });
    const p1 = await listDisbursementsPaged({ page: 1, pageSize: 50 } as any, [], 1);
    const p2 = await listDisbursementsPaged({ page: 1, pageSize: 50 } as any, [], 2);
    expect(p1.rows.map((r: any) => r.eznNum)).toContain("P1-DIS-BATCH");
    expect(p2.rows.map((r: any) => r.eznNum)).not.toContain("P1-DIS-BATCH");
    expect(p2.total).toBe(before.total);
  });
});
