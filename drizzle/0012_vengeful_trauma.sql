CREATE TABLE `login_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_name` varchar(255),
	`email` varchar(320),
	`login_method` varchar(64),
	`user_agent` text,
	`device_type` varchar(32),
	`ip_address` varchar(128),
	`logged_in_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_audit_logs_id` PRIMARY KEY(`id`)
);
