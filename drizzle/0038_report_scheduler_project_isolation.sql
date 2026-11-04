-- عزل جدولة التقرير اليومي بين المشاريع.
-- لكل مشروع سجل تشغيل مستقل في نفس اليوم، بدل قيد فريد عالمي على التاريخ.
-- السلامة: لا حذف ولا تعديل لبيانات التشغيل السابقة؛ الصفوف القديمة تبقى بـ project_id = NULL.
--> statement-breakpoint
ALTER TABLE `report_scheduler_runs` ADD COLUMN `project_id` int NULL;--> statement-breakpoint
ALTER TABLE `report_scheduler_runs` DROP INDEX `report_scheduler_runs_report_date_unique`;--> statement-breakpoint
ALTER TABLE `report_scheduler_runs` ADD CONSTRAINT `report_scheduler_runs_project_date_uq` UNIQUE(`project_id`,`report_date`);--> statement-breakpoint
CREATE INDEX `report_scheduler_runs_project_idx` ON `report_scheduler_runs` (`project_id`);
