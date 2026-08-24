CREATE TABLE `user_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`allowed_screens` text NOT NULL,
	`allowed_reports` text NOT NULL,
	`read_only` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_permissions_user_id_unique` UNIQUE(`user_id`)
);
