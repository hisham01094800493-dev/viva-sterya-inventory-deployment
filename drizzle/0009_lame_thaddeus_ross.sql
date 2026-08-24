CREATE TABLE `backup_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`file_key` varchar(500) NOT NULL,
	`file_url` varchar(500) NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_size` int NOT NULL DEFAULT 0,
	`backup_type` varchar(64) NOT NULL DEFAULT 'manual',
	`summary` text,
	`created_by` int,
	`created_by_name` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `backup_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `backup_records_file_key_unique` UNIQUE(`file_key`)
);
