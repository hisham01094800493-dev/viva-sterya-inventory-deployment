ALTER TABLE `additions` ADD `unit_price` decimal(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `additions` ADD `total_value` decimal(14,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `disbursements` ADD `unit_price` decimal(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `disbursements` ADD `total_value` decimal(14,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `image_key` varchar(255);--> statement-breakpoint
ALTER TABLE `items` ADD `image_url` varchar(500);--> statement-breakpoint
ALTER TABLE `items` ADD `unit_price` decimal(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `transfers` ADD `unit_price` decimal(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `transfers` ADD `total_value` decimal(14,2) DEFAULT '0' NOT NULL;