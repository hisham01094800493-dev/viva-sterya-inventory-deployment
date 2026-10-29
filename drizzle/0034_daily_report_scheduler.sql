CREATE TABLE `report_scheduler_runs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `report_date` varchar(10) NOT NULL,
  `status` enum('running','success','failed') NOT NULL,
  `started_at` timestamp NOT NULL DEFAULT (now()),
  `completed_at` timestamp NULL,
  `result_summary` text,
  `error_message` text,
  CONSTRAINT `report_scheduler_runs_id` PRIMARY KEY(`id`),
  CONSTRAINT `report_scheduler_runs_report_date_unique` UNIQUE(`report_date`)
);
--> statement-breakpoint
CREATE INDEX `report_scheduler_runs_status_idx` ON `report_scheduler_runs` (`status`);
--> statement-breakpoint
CREATE INDEX `report_scheduler_runs_completed_at_idx` ON `report_scheduler_runs` (`completed_at`);
