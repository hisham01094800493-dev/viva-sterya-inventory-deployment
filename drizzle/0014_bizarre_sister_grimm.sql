CREATE TABLE `revoked_sessions` (
	`session_id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`revoked_by` int NOT NULL,
	`revoked_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `revoked_sessions_session_id` PRIMARY KEY(`session_id`)
);
--> statement-breakpoint
ALTER TABLE `login_audit_logs` ADD `session_id` varchar(64);