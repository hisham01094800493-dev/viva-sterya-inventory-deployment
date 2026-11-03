# خطة تسوية سجل Drizzle قبل تطبيق Migration 0036

**التاريخ:** 3 نوفمبر 2026
**الهدف:** تطبيق 0035 و0036 على قاعدة Aiven (`defaultdb`) دون إعادة إنشاء آثار 0034 الموجودة، ودون أي تغيير في قيم الأرصدة.
**الحالة:** خطة جاهزة للمراجعة — **لم تُنفَّذ أي كتابة على قاعدة الإنتاج.**

---

## 1. نتيجة فحص النسخة الاحتياطية

النسخة `aiven-viva-sterya-pre-migration-2026-11-03.sql.gz` سليمة:

| البند | القيمة |
|---|---|
| فحص gzip | ناجح |
| SHA-256 | `74d1eb12036e266639f6d63b458b08fd849808143192f3f402091b5a1bbcf5fa` |
| الحجم المضغوط | 56,920 بايت |
| الحجم بعد فك الضغط | 580,785 بايت |
| عدد الجداول | 31 |
| جدول `projects` | غير موجود |
| أي عمود `project_id` | غير موجود |
| الفهرس `disbursements_item_date_idx` | غير موجود |

## 2. مطابقة سجل `__drizzle_migrations`

السجل يحتوي 35 صفًا. البصمة `hash` هي SHA-256 لمحتوى ملف SQL. المطابقة أعطت النتيجة القاطعة التالية:

| معرّف السجل | البصمة | الملف المحلي المطابق | وقت التطبيق (UTC) |
|---:|---|---|---|
| 33 | `aa3611d3…` | `0032_glossy_morg` | 2026-10-20 01:13:37 |
| 34 | `22bd2130…` | `0033_futuristic_christian_walker` | 2026-10-28 08:34:12 |
| 35 | `a1394f70…` | **لا يطابق أي ملف محلي** | 2026-10-28 23:29:42 |

المطابقة دقيقة 100%: بصمة السجل 34 تساوي حرفيًا بصمة الملف `0033_futuristic_christian_walker.sql`، ووقت التطبيق يساوي `when` في `meta/_journal.json`. أي أن ترقيم السجلات يساوي `idx + 1` لكل الملفات حتى 0033.

السجل 35 تطبيقه في **2026-10-28 23:29:42 UTC**، أي **قبل** الطابع الزمني لملف 0034 في الـjournal (**2026-10-29 12:53:16 UTC**) بأكثر من 13 ساعة. هذا يعني أن السجل 35 لا يمكن أن يكون تطبيقًا للملف 0034 الحالي؛ فهو ترحيل سابق (يدوي أو من ملف حُذف/أُعيد توليده لاحقًا) وبصمته غير معروفة للمستودع.

## 3. مقارنة DDL لجدول `report_scheduler_runs`

الجدول موجود في Aiven بالتعريف التالي:

```sql
CREATE TABLE `report_scheduler_runs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `report_date` varchar(10) NOT NULL,
  `status` enum('running','success','failed') NOT NULL,
  `started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL,
  `result_summary` text,
  `error_message` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `report_scheduler_runs_report_date_unique` (`report_date`),
  KEY `report_scheduler_runs_status_idx` (`status`),
  KEY `report_scheduler_runs_completed_at_idx` (`completed_at`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

والمقارنة بالملف المحلي `0034_daily_report_scheduler.sql`:

| العنصر | الملف المحلي | Aiven | مطابق؟ |
|---|---|---|---|
| الأعمدة السبعة وأنواعها | `id, report_date, status, started_at, completed_at, result_summary, error_message` | نفسها | نعم |
| القيد الفريد على `report_date` | `report_scheduler_runs_report_date_unique` | موجود | نعم |
| فهرس `status` | `report_scheduler_runs_status_idx` | موجود | نعم |
| فهرس `completed_at` | `report_scheduler_runs_completed_at_idx` | موجود | نعم |
| القيمة الافتراضية لـ`started_at` | `DEFAULT (now())` | `DEFAULT CURRENT_TIMESTAMP` | مكافئ وظيفيًا |
| `completed_at` | `timestamp NULL` | `timestamp NULL DEFAULT NULL` | مكافئ |
| الترميز | utf8mb4 | utf8mb4_0900_ai_ci | مطابق |

**الاستنتاج:** أثر 0034 موجود بالكامل ومكافئ. لذلك **إعادة تشغيل 0034 ستفشل** بخطأ `Table 'report_scheduler_runs' already exists`، وهو ما تؤكده المذكرة.

## 4. سبب تعليق الترحيل

`drizzle-kit migrate` يقرأ مجموعة بصمات السجلات المطبقة، ثم يطبّق كل مدخل في الـjournal بصمته غير موجودة في المجموعة. الوضع الحالي:

- بصمة 0034 (`8e5debf6…`) **غير موجودة** في السجل → سيعتبرها Drizzle غير مطبقة ويحاول تنفيذها → فشل.
- بصمة 0035 (`9df5d3ad…`) غير موجودة → ستُطبّق.
- بصمة 0036 (`b22e8652…`) غير موجودة → ستُطبّق.
- البصمة `a1394f70…` (السجل 35) لا تنتمي لأي ملف → تبقى صفًا تاريخيًا غير مؤثر.

## 5. خطة التسوية المقترحة (ثلاثة خيارات)

### الخيار A — تسجيل 0034 كـ«مطبّق» ثم تشغيل migrate (المُفضّل)

1. أخذ نسخة احتياطية جديدة قبل التنفيذ (لأن النسخة الحالية عمرها ساعات وقد تتغير البيانات).
2. التحقق من أن `report_scheduler_runs` ما زال موجودًا وبنيته مطابقة (استعلام `SHOW CREATE TABLE`).
3. تنفيذ إدراج **صف واحد فقط** في `__drizzle_migrations`:

```sql
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
VALUES ('8e5debf6d31102930c8062701f0d057fcea42434b5372f3649d848f5905009c0', 1793278396000);
```

4. تشغيل `pnpm drizzle-kit migrate` → يطبّق 0035 ثم 0036 فقط.
5. التحقق بعد التنفيذ (القسم 7).

**المزايا:** لا يلمس أي جدول بيانات، ولا يحذف شيئًا، ويحافظ على تاريخ الترحيلات متسقًا مع الـjournal.
**المخاطر:** إدراج صف في جدول إدارة Drizzle. لا يؤثر على البيانات التشغيلية، لكنه تعديل على سجل الترحيلات ويجب أن يكون بموافقة صريحة.

### الخيار B — تطبيق 0035 و0036 يدويًا ثم تسجيل الثلاثة

تنفيذ محتوى `0035` و`0036` عبر عميل MySQL، ثم إدراج ثلاث بصمات (0034، 0035، 0036) في `__drizzle_migrations`.

**المزايا:** تحكم كامل في كل عبارة وتوقيت كل خطوة.
**العيوب:** يجب تقسيم الملف على `--> statement-breakpoint` يدويًا، واحتمال خطأ بشري أعلى، ولا يزال يتطلب تعديل سجل الترحيلات.

### الخيار C — تجاهل 0034 نهائيًا بحذف ملفها

حذف `0034_daily_report_scheduler.sql` ومدخلها من الـjournal، ثم تشغيل migrate.

**مرفوض:** يحوّل المشروع إلى حالة لا يمكن إعادة إنتاجها على قاعدة جديدة، ويجعل أي بيئة نظيفة تفقد جدول `report_scheduler_runs`.

**التوصية:** الخيار A، لأنه الأقل تدخلًا والأكثر قابلية للتحقق.

## 6. ما سيُكتب بالضبط عند تنفيذ الخيار A

### 6.1 على جدول `__drizzle_migrations`
صف واحد: `(hash = 8e5debf6…, created_at = 1793278396000)`.

### 6.2 Migration 0035 — فهرس واحد
```sql
CREATE INDEX `disbursements_item_date_idx` ON `disbursements` (`item_code`, `date`);
```
لا يغيّر أي صف، ولا أي قيمة رصيد.

### 6.3 Migration 0036 — البنية والربط
- إنشاء جدول `projects` (7 أعمدة، قيد فريد على `code`).
- إدراج صف مشروع واحد: الاسم «مشروع جديد»، الكود `MAIN`، الحالة `active`.
- إضافة عمود `project_id` (int, nullable) إلى: `additions`, `buildings`, `disbursements`, `items`, `transfers`, `warehouses`.
- إضافة `allowed_projects` varchar(2000) NOT NULL DEFAULT '[]' إلى `user_permissions`.
- إضافة `active_project_id` int إلى `user_preferences`.
- حذف قيدين فريدين قديمين: `items_code_unique`, `warehouses_slot_unique`.
- تعبئة `project_id` في الجداول الستة بقيمة معرّف مشروع `MAIN` حيث كان `NULL`.
- تعبئة `allowed_projects` بالقيمة `[<id MAIN>]` حيث كانت `[]` أو `NULL` (باستخدام استعلام فرعي، لا رقم ثابت).
- تعبئة `active_project_id` بمعرّف `MAIN` حيث كان `NULL`.
- إضافة قيدين فريدين جديدين: `items_project_code_uq(project_id, code)` و`warehouses_project_slot_uq(project_id, slot)`.
- إنشاء فهرسين: `items_project_id_idx`, `warehouses_project_id_idx`.

**لا يحذف 0036 أي صف، ولا يعدّل أي حقل من:** `initial_stock`, `incoming_stock`, `outgoing_stock`, `current_stock`, `item_warehouse_balances.current_stock`.

## 7. التحقق بعد التنفيذ

1. `SELECT * FROM projects;` → صف واحد `MAIN`.
2. `SELECT COUNT(*) FROM warehouses WHERE project_id IS NULL;` → 0 (وكذلك buildings, items, additions, disbursements, transfers).
3. `SELECT COUNT(*) FROM user_permissions WHERE allowed_projects = '[]';` → 0.
4. `SELECT COUNT(*) FROM user_preferences WHERE active_project_id IS NULL;` → 0.
5. `SHOW INDEX FROM disbursements WHERE Key_name = 'disbursements_item_date_idx';` → صف واحد.
6. مقارنة أعداد الصفوف مع خط الأساس: warehouses 5، buildings 9، items 13، item_warehouse_balances 14، additions 114، disbursements 173، transfers 6، user_permissions 7، user_preferences 11.
7. مقارنة المجاميع: `initial_stock` = 0.000، `incoming_stock` = 2613.095، `outgoing_stock` = 2601.100، `current_stock` = 6.995، ومجموع `item_warehouse_balances.current_stock` = 6.995.

أي اختلاف في البنود 6 أو 7 يعني إيقاف العمل فورًا والرجوع إلى النسخة الاحتياطية.

## 8. شرط البدء

لا يُنفَّذ أي بند من القسم 6 قبل:
- موافقة صريحة ومستقلة من صاحب المشروع.
- نسخة احتياطية جديدة موثقة (اسم، وقت، حجم، بصمة).
- تأكيد أن 0034 لم يُسجَّل بعد بأي طريقة أخرى.
