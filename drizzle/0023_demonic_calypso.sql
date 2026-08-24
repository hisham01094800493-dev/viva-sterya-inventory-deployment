CREATE TABLE `chat_message_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`message_id` int NOT NULL,
	`user_id` int NOT NULL,
	`delivered_at` timestamp NOT NULL DEFAULT (now()),
	`read_at` timestamp,
	CONSTRAINT `chat_message_receipts_id` PRIMARY KEY(`id`)
);
