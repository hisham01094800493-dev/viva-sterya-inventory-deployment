ALTER TABLE `chat_messages` ADD `attachment_url` varchar(700);--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `attachment_key` varchar(500);--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `attachment_name` varchar(255);--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `attachment_mime` varchar(100);--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `attachment_size` int;