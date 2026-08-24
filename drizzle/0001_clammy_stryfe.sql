CREATE TABLE `additions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` varchar(32) NOT NULL,
	`ezn_num` varchar(64) NOT NULL,
	`item_code` varchar(64) NOT NULL,
	`item_name` text,
	`store` varchar(128),
	`quantity` decimal(12,3) NOT NULL,
	`purpose` text,
	`supplier` varchar(128),
	`category` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `additions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `disbursements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` varchar(32) NOT NULL,
	`ezn_num` varchar(64) NOT NULL,
	`item_code` varchar(64) NOT NULL,
	`item_name` text,
	`destination` varchar(128),
	`quantity` decimal(12,3) NOT NULL,
	`notes` text,
	`store` varchar(128),
	`disburse_type` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `disbursements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` text NOT NULL,
	`initial_stock` decimal(12,3) NOT NULL DEFAULT '0',
	`incoming_stock` decimal(12,3) NOT NULL DEFAULT '0',
	`outgoing_stock` decimal(12,3) NOT NULL DEFAULT '0',
	`current_stock` decimal(12,3) NOT NULL DEFAULT '0',
	`reorder_level` decimal(12,3) NOT NULL DEFAULT '0',
	`category` varchar(128),
	`unit` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `items_id` PRIMARY KEY(`id`),
	CONSTRAINT `items_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(128) NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` varchar(32) NOT NULL,
	`ezn_num` varchar(64) NOT NULL,
	`item_code` varchar(64) NOT NULL,
	`itemName` text,
	`from_store` varchar(128),
	`to_store` varchar(128),
	`quantity` decimal(12,3) NOT NULL,
	`notes` text,
	`transfer_type` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transfers_id` PRIMARY KEY(`id`)
);
