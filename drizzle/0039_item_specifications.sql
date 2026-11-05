ALTER TABLE `items` ADD COLUMN `item_type` enum('general','ceramic','marble') NULL DEFAULT 'general';--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `size_length_cm` decimal(8,2) NULL;--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `size_width_cm` decimal(8,2) NULL;--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `tone` varchar(64) NULL;--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `thickness_cm` decimal(6,2) NULL;--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `spec_group_key` varchar(128) NULL;
