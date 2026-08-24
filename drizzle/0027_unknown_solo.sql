CREATE TABLE `item_warehouse_balances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`warehouse_id` int NOT NULL,
	`current_stock` decimal(12,3) NOT NULL DEFAULT '0',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `item_warehouse_balances_id` PRIMARY KEY(`id`),
	CONSTRAINT `item_warehouse_balances_item_warehouse_uq` UNIQUE(`item_id`,`warehouse_id`)
);
--> statement-breakpoint
ALTER TABLE `additions` ADD `warehouse_id` int;--> statement-breakpoint
ALTER TABLE `disbursements` ADD `warehouse_id` int;--> statement-breakpoint
ALTER TABLE `transfers` ADD `from_warehouse_id` int;--> statement-breakpoint
ALTER TABLE `transfers` ADD `to_warehouse_id` int;--> statement-breakpoint
CREATE INDEX `item_warehouse_balances_warehouse_idx` ON `item_warehouse_balances` (`warehouse_id`);