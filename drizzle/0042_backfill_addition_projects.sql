-- Repair legacy additions after project isolation was introduced.
-- The warehouse is the authoritative project boundary for an addition.
-- Idempotent: only rows with a known warehouse project are updated.
UPDATE `additions` a
INNER JOIN `warehouses` w ON w.`id` = a.`warehouse_id`
SET a.`project_id` = w.`project_id`
WHERE w.`project_id` IS NOT NULL
  AND (a.`project_id` IS NULL OR a.`project_id` <> w.`project_id`);
