ALTER TABLE `additions` ADD COLUMN `intake_type` varchar(32) NOT NULL DEFAULT 'purchase';--> statement-breakpoint
ALTER TABLE `additions` ADD COLUMN `source_location` varchar(180);--> statement-breakpoint
ALTER TABLE `additions` ADD COLUMN `item_condition` varchar(64);--> statement-breakpoint
ALTER TABLE `additions` ADD COLUMN `notes` text;
