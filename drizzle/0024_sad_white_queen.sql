CREATE TABLE `backup_verification_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`schedule_cron_task_uid` varchar(65),
	`cron_expression` varchar(64) NOT NULL DEFAULT '0 0 2 * * 0',
	`is_enabled` boolean NOT NULL DEFAULT false,
	`last_run_id` int,
	`last_run_at` timestamp,
	`last_status` varchar(32),
	`next_execution_at` timestamp,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `backup_verification_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `backup_verification_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`backup_record_id` int,
	`run_type` enum('manual','scheduled') NOT NULL,
	`status` enum('running','passed','failed','skipped') NOT NULL,
	`sample_rows_per_table` int NOT NULL DEFAULT 3,
	`attempted_rows` text,
	`coverage` text,
	`validation` text,
	`error_message` text,
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	CONSTRAINT `backup_verification_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `backup_verification_configs_task_uid_idx` ON `backup_verification_configs` (`schedule_cron_task_uid`);--> statement-breakpoint
CREATE INDEX `backup_verification_runs_backup_record_idx` ON `backup_verification_runs` (`backup_record_id`);--> statement-breakpoint
CREATE INDEX `backup_verification_runs_started_at_idx` ON `backup_verification_runs` (`started_at`);