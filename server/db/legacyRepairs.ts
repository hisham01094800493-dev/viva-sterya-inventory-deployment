import type mysql from "mysql2/promise";

/**
 * Permit 18 is a historical account-only adjustment. It must remain visible
 * in the customer/supplier account, but it must not change item stock.
 *
 * This repair is deliberately one-time and idempotent. It reverses the stock
 * effect that was previously applied when the negative disbursement was saved.
 */
export async function repairLegacyAccountOnlyPermit18(pool: mysql.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory_data_repairs (
      repair_key varchar(128) NOT NULL,
      applied_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (repair_key)
    )
  `);

  const [existing] = await pool.query(
    `SELECT repair_key FROM inventory_data_repairs WHERE repair_key = ? LIMIT 1`,
    ["permit-18-account-only-v3"],
  );
  if (Array.isArray(existing) && existing.length > 0) return;
  const [oldRepair] = await pool.query(
    `SELECT repair_key FROM inventory_data_repairs WHERE repair_key = ? LIMIT 1`,
    ["permit-18-account-only-v1"],
  );
  const v1WasApplied = Array.isArray(oldRepair) && oldRepair.length > 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [cancellationRows] = await connection.query<any[]>(
      `SELECT id, client_request_id
       FROM disbursements
       WHERE disburse_type = ? AND notes LIKE ?
       FOR UPDATE`,
      ["إلغاء موثق", "%(الإذن 18)%"],
    );
    const reversalIds = cancellationRows.map(row => Number(row.id)).filter(Number.isInteger);
    const originalIds = cancellationRows
      .map(row => String(row.client_request_id ?? "").match(/^cancel-disbursement-(\d+)$/)?.[1])
      .filter(Boolean);

    const [originalRows] = originalIds.length > 0
      ? await connection.query<any[]>(
          `SELECT id, item_code, warehouse_id, quantity
           FROM disbursements
           WHERE id IN (${originalIds.map(() => "?").join(",")})
           FOR UPDATE`,
          originalIds,
        )
      : [[]];

    // v1 may already have reversed these rows before this cleanup ran. Put
    // that exact effect back, then remove the accidental cancellation rows.
    if (v1WasApplied) {
      for (const row of originalRows) {
        const quantity = Math.abs(Number(row.quantity ?? 0));
        if (!Number.isFinite(quantity) || quantity <= 0) continue;
        await connection.query(
          `UPDATE items
           SET outgoing_stock = outgoing_stock - ?, current_stock = current_stock + ?
           WHERE code = ?`,
          [quantity, quantity, row.item_code],
        );
        if (row.warehouse_id != null) {
          await connection.query(
            `UPDATE item_warehouse_balances
             SET current_stock = current_stock + ?
             WHERE item_id = (SELECT id FROM items WHERE code = ? LIMIT 1)
               AND warehouse_id = ?`,
            [quantity, row.item_code, row.warehouse_id],
          );
        }
      }
    }

    if (reversalIds.length > 0) {
      await connection.query(
        `DELETE FROM disbursements WHERE id IN (${reversalIds.map(() => "?").join(",")})`,
        reversalIds,
      );
    }
    if (originalIds.length > 0) {
      await connection.query(
        `DELETE FROM audit_logs
         WHERE action = ? AND entity = ? AND entity_id IN (${originalIds.map(() => "?").join(",")})`,
        ["cancel_movement", "disbursement", ...originalIds],
      );
    }

    const [rows] = await connection.query<any[]>(
      `SELECT id, item_code, warehouse_id, quantity
       FROM disbursements
       WHERE ezn_num = ? AND quantity < 0
       FOR UPDATE`,
      ["18"],
    );

    for (const row of rows) {
      if (originalIds.includes(String(row.id))) continue;
      const quantity = Math.abs(Number(row.quantity ?? 0));
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      // The old negative disbursement increased current stock and reduced
      // outgoing stock. Undo exactly that effect.
      await connection.query(
        `UPDATE items
         SET outgoing_stock = outgoing_stock + ?, current_stock = current_stock - ?
         WHERE code = ?`,
        [quantity, quantity, row.item_code],
      );

      if (row.warehouse_id != null) {
        await connection.query(
          `UPDATE item_warehouse_balances
           SET current_stock = current_stock - ?
           WHERE item_id = (SELECT id FROM items WHERE code = ? LIMIT 1)
             AND warehouse_id = ?`,
          [quantity, row.item_code, row.warehouse_id],
        );
      }
    }

    // These four historical lines are account-only and must not leave any
    // stock behind. Keep the account rows intact; normalize only their item
    // balances and the matching warehouse balances as the final step.
    const itemWarehousePairs = new Set(
      rows
        .map(row => `${String(row.item_code)}\u0000${String(row.warehouse_id ?? "")}`)
        .filter(Boolean),
    );
    for (const pair of Array.from(itemWarehousePairs)) {
      const [itemCode, warehouseId] = pair.split("\u0000");
      await connection.query(`UPDATE items SET current_stock = 0 WHERE code = ?`, [itemCode]);
      if (warehouseId) {
        await connection.query(
          `UPDATE item_warehouse_balances SET current_stock = 0
           WHERE item_id = (SELECT id FROM items WHERE code = ? LIMIT 1)
             AND warehouse_id = ?`,
          [itemCode, warehouseId],
        );
      }
    }

    await connection.query(
      `INSERT INTO inventory_data_repairs (repair_key) VALUES (?)`,
      ["permit-18-account-only-v3"],
    );
    await connection.commit();
    console.info(`[Database] Applied legacy repair: permit 18 account-only (${rows.length} row(s))`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
