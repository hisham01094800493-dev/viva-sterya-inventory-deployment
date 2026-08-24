ALTER TABLE `login_audit_logs` MODIFY COLUMN `session_id` varchar(64);--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `report_column_order` text;