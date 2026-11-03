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
    ["permit-18-account-only-v1"],
  );
  if (Array.isArray(existing) && existing.length > 0) return;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<any[]>(
      `SELECT id, item_code, warehouse_id, quantity
       FROM disbursements
       WHERE ezn_num = ? AND quantity < 0
       FOR UPDATE`,
      ["18"],
    );

    for (const row of rows) {
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

    await connection.query(
      `INSERT INTO inventory_data_repairs (repair_key) VALUES (?)`,
      ["permit-18-account-only-v1"],
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
