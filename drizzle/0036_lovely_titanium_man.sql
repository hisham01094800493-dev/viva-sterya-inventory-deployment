CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`code` varchar(64) NOT NULL,
	`description` text,
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `projects_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `items` DROP INDEX `items_code_unique`;--> statement-breakpoint
ALTER TABLE `warehouses` DROP INDEX `warehouses_slot_unique`;--> statement-breakpoint
ALTER TABLE `additions` ADD `project_id` int;--> statement-breakpoint
ALTER TABLE `buildings` ADD `project_id` int;--> statement-breakpoint
ALTER TABLE `disbursements` ADD `project_id` int;--> statement-breakpoint
ALTER TABLE `items` ADD `project_id` int;--> statement-breakpoint
ALTER TABLE `transfers` ADD `project_id` int;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `allowed_projects` varchar(2000) DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `active_project_id` int;--> statement-breakpoint
ALTER TABLE `warehouses` ADD `project_id` int;--> statement-breakpoint
INSERT INTO `projects` (`name`, `code`, `description`, `status`)
VALUES ('مشروع جديد', 'MAIN', 'المشروع الافتراضي الذي يحتوي على بيانات التشغيل الحالية', 'active');--> statement-breakpoint
UPDATE `warehouses` SET `project_id` = (SELECT `id` FROM `projects` WHERE `code` = 'MAIN' LIMIT 1) WHERE `project_id` IS NULL;--> statement-breakpoint
UPDATE `buildings` SET `project_id` = (SELECT `id` FROM `projects` WHERE `code` = 'MAIN' LIMIT 1) WHERE `project_id` IS NULL;--> statement-breakpoint
UPDATE `items` SET `project_id` = (SELECT `id` FROM `projects` WHERE `code` = 'MAIN' LIMIT 1) WHERE `project_id` IS NULL;--> statement-breakpoint
UPDATE `additions` SET `project_id` = (SELECT `id` FROM `projects` WHERE `code` = 'MAIN' LIMIT 1) WHERE `project_id` IS NULL;--> statement-breakpoint
UPDATE `disbursements` SET `project_id` = (SELECT `id` FROM `projects` WHERE `code` = 'MAIN' LIMIT 1) WHERE `project_id` IS NULL;--> statement-breakpoint
UPDATE `transfers` SET `project_id` = (SELECT `id` FROM `projects` WHERE `code` = 'MAIN' LIMIT 1) WHERE `project_id` IS NULL;--> statement-breakpoint
UPDATE `user_permissions` SET `allowed_projects` = CONCAT('[', (SELECT `id` FROM `projects` WHERE `code` = 'MAIN' LIMIT 1), ']') WHERE `allowed_projects` = '[]' OR `allowed_projects` IS NULL;--> statement-breakpoint
UPDATE `user_preferences` SET `active_project_id` = (SELECT `id` FROM `projects` WHERE `code` = 'MAIN' LIMIT 1) WHERE `active_project_id` IS NULL;--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_project_code_uq` UNIQUE(`project_id`,`code`);--> statement-breakpoint
ALTER TABLE `warehouses` ADD CONSTRAINT `warehouses_project_slot_uq` UNIQUE(`project_id`,`slot`);--> statement-breakpoint
CREATE INDEX `items_project_id_idx` ON `items` (`project_id`);--> statement-breakpoint
CREATE INDEX `warehouses_project_id_idx` ON `warehouses` (`project_id`);
