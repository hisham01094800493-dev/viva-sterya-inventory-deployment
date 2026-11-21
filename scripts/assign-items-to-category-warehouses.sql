-- توزيع أصناف مشروع واحد على مخازن حسب التصنيف
-- MySQL 8 / Aiven
-- السكربت يبدأ بمعاينة فقط. لا يغير البيانات إلا بعد:
-- 1) ضبط @project_id إلى رقم المشروع الصحيح.
-- 2) مراجعة نتائج المعاينة.
-- 3) تغيير @execute_changes إلى 1.
-- لا تشغّله قبل أخذ Backup.

SET @project_id := 123;
SET @execute_changes := 0; -- 0 = معاينة فقط، 1 = تنفيذ التعديلات

-- ============================================================
-- معاينة التصنيفات والأصناف المؤهلة للتوزيع
-- ============================================================
SELECT
  TRIM(i.category) AS category,
  COUNT(*) AS total_items,
  SUM(CASE WHEN i.warehouse_id IS NULL THEN 1 ELSE 0 END) AS unassigned_items,
  SUM(CASE WHEN i.warehouse_id IS NOT NULL THEN 1 ELSE 0 END) AS already_assigned_items,
  SUM(CASE WHEN i.warehouse_id IS NULL THEN CAST(i.current_stock AS DECIMAL(18,3)) ELSE 0 END) AS stock_to_assign
FROM items i
WHERE i.project_id = @project_id
  AND i.category IS NOT NULL
  AND TRIM(i.category) <> ''
GROUP BY TRIM(i.category)
ORDER BY TRIM(i.category);

SELECT
  i.id,
  i.code,
  i.name,
  TRIM(i.category) AS category,
  i.current_stock,
  i.warehouse_id
FROM items i
WHERE i.project_id = @project_id
  AND i.warehouse_id IS NULL
  AND i.category IS NOT NULL
  AND TRIM(i.category) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM item_warehouse_balances b WHERE b.item_id = i.id
  )
ORDER BY TRIM(i.category), i.code;

-- ============================================================
-- التنفيذ: محمي داخل Procedure ولا يعمل افتراضيًا
-- ============================================================
DROP PROCEDURE IF EXISTS assign_category_warehouses;

DELIMITER $$
CREATE PROCEDURE assign_category_warehouses(
  IN p_project_id INT,
  IN p_execute_changes TINYINT
)
main_block: BEGIN
  DECLARE v_project_exists INT DEFAULT 0;

  IF p_execute_changes <> 1 THEN
    SELECT 'معاينة فقط: لم يتم تعديل أي بيانات' AS status;
    LEAVE main_block;
  END IF;

  SELECT COUNT(*) INTO v_project_exists
  FROM projects
  WHERE id = p_project_id AND status = 'active';

  IF v_project_exists <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'المشروع غير موجود أو غير نشط';
  END IF;

  START TRANSACTION;

  DROP TEMPORARY TABLE IF EXISTS tmp_category_names;
  CREATE TEMPORARY TABLE tmp_category_names (
    category VARCHAR(128) NOT NULL PRIMARY KEY,
    warehouse_name VARCHAR(128) NOT NULL,
    warehouse_id INT NULL
  );

  INSERT INTO tmp_category_names (category, warehouse_name)
  SELECT DISTINCT
    TRIM(i.category),
    LEFT(CONCAT('مخزن ', TRIM(i.category)), 128)
  FROM items i
  WHERE i.project_id = p_project_id
    AND i.warehouse_id IS NULL
    AND i.category IS NOT NULL
    AND TRIM(i.category) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM item_warehouse_balances b WHERE b.item_id = i.id
    );

  -- إعادة استخدام مخزن الاسم نفسه داخل المشروع، وعدم إنشاء نسخة مكررة.
  INSERT INTO warehouses (project_id, slot, code_prefix, name)
  SELECT
    p_project_id,
    COALESCE((SELECT MAX(w.slot) FROM warehouses w WHERE w.project_id = p_project_id), 0)
      + ROW_NUMBER() OVER (ORDER BY c.warehouse_name),
    COALESCE((SELECT MAX(w.slot) FROM warehouses w WHERE w.project_id = p_project_id), 0)
      + ROW_NUMBER() OVER (ORDER BY c.warehouse_name),
    c.warehouse_name
  FROM tmp_category_names c
  WHERE NOT EXISTS (
    SELECT 1
    FROM warehouses existing
    WHERE existing.project_id = p_project_id
      AND existing.name = c.warehouse_name
  );

  UPDATE tmp_category_names c
  JOIN warehouses w
    ON w.project_id = p_project_id
   AND w.name = c.warehouse_name
  SET c.warehouse_id = w.id;

  -- إنشاء رصيد تفصيلي مساوي للرصيد الحالي، للأصناف غير المرتبطة فقط.
  INSERT INTO item_warehouse_balances (item_id, warehouse_id, current_stock)
  SELECT i.id, c.warehouse_id, CAST(i.current_stock AS DECIMAL(18,3))
  FROM items i
  JOIN tmp_category_names c ON c.category = TRIM(i.category)
  WHERE i.project_id = p_project_id
    AND i.warehouse_id IS NULL
    AND c.warehouse_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM item_warehouse_balances b WHERE b.item_id = i.id
    );

  -- ربط الصنف بالمخزن بعد إنشاء الرصيد التفصيلي.
  UPDATE items i
  JOIN tmp_category_names c ON c.category = TRIM(i.category)
  SET i.warehouse_id = c.warehouse_id
  WHERE i.project_id = p_project_id
    AND i.warehouse_id IS NULL
    AND c.warehouse_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM item_warehouse_balances b
      WHERE b.item_id = i.id
        AND b.warehouse_id <> c.warehouse_id
    );

  -- تحقق داخل المعاملة قبل اعتمادها.
  SELECT
    w.id AS warehouse_id,
    w.name AS warehouse_name,
    COUNT(i.id) AS assigned_items,
    COALESCE(SUM(i.current_stock), 0) AS item_stock_total,
    COALESCE(SUM(b.current_stock), 0) AS warehouse_balance_total
  FROM warehouses w
  LEFT JOIN items i
    ON i.project_id = p_project_id
   AND i.warehouse_id = w.id
  LEFT JOIN item_warehouse_balances b
    ON b.item_id = i.id
   AND b.warehouse_id = w.id
  WHERE w.project_id = p_project_id
  GROUP BY w.id, w.name
  ORDER BY w.slot;

  COMMIT;
  DROP TEMPORARY TABLE IF EXISTS tmp_category_names;
  SELECT 'تم التوزيع بنجاح' AS status;
END$$
DELIMITER ;

-- لا يتم التنفيذ تلقائيًا عند بقاء المعاينة.
CALL assign_category_warehouses(@project_id, @execute_changes);

DROP PROCEDURE IF EXISTS assign_category_warehouses;
