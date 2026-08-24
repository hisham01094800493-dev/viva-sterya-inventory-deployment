CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`user_name` varchar(255),
	`action` varchar(64) NOT NULL,
	`entity` varchar(64) NOT NULL,
	`entity_id` varchar(128),
	`details` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','manager','operator','reviewer','reports') NOT NULL DEFAULT 'user';