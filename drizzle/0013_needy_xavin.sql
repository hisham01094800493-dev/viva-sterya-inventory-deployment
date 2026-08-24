CREATE TABLE `security_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`notification_type` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`login_log_id` int,
	`is_read` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `security_notifications_id` PRIMARY KEY(`id`)
);
