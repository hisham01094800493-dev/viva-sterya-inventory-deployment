-- Restore the four deleted negative disbursement rows for permit 18.
-- Quantities and item codes are taken from the paper permit supplied by the user.
INSERT INTO disbursements (
  date, ezn_num, item_code, item_name, destination, customer_id,
  quantity, unit_price, total_value, notes, store, warehouse_id,
  disburse_type, client_request_id
)
SELECT
  '08-08-2026', '18', i.code, i.name, 'Civil',
  (SELECT c.id FROM customers c WHERE c.name = 'Civil' LIMIT 1),
  CASE i.code
    WHEN '20006' THEN -2.830
    WHEN '20005' THEN -2.736
    WHEN '20004' THEN -21.900
    WHEN '20002' THEN -3.998
  END,
  i.unit_price,
  CASE i.code
    WHEN '20006' THEN -2.830
    WHEN '20005' THEN -2.736
    WHEN '20004' THEN -21.900
    WHEN '20002' THEN -3.998
  END * i.unit_price,
  'إعادة إدخال إذن الصرف 18 كما كان',
  NULL, i.warehouse_id, 'صرف',
  CONCAT('manual-permit-18-negative-', i.code)
FROM items i
WHERE i.code IN ('20006', '20005', '20004', '20002')
  AND NOT EXISTS (
    SELECT 1 FROM disbursements d
    WHERE d.client_request_id = CONCAT('manual-permit-18-negative-', i.code)
  );

--> statement-breakpoint

UPDATE items i
JOIN (
  SELECT item_code, SUM(ABS(quantity)) AS quantity
  FROM disbursements
  WHERE client_request_id LIKE 'manual-permit-18-negative-%'
  GROUP BY item_code
) d ON d.item_code = i.code
SET
  i.current_stock = i.current_stock - d.quantity,
  i.outgoing_stock = i.outgoing_stock + d.quantity;

--> statement-breakpoint

UPDATE item_warehouse_balances b
JOIN (
  SELECT item_code, warehouse_id, SUM(ABS(quantity)) AS quantity
  FROM disbursements
  WHERE client_request_id LIKE 'manual-permit-18-negative-%'
  GROUP BY item_code, warehouse_id
) d ON d.warehouse_id = b.warehouse_id
JOIN items i ON i.id = b.item_id AND i.code = d.item_code
SET b.current_stock = b.current_stock - d.quantity;
