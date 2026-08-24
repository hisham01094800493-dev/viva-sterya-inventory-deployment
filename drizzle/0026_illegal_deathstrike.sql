CREATE INDEX `additions_item_code_idx` ON `additions` (`item_code`);--> statement-breakpoint
CREATE INDEX `additions_ezn_num_idx` ON `additions` (`ezn_num`);--> statement-breakpoint
CREATE INDEX `disbursements_item_code_idx` ON `disbursements` (`item_code`);--> statement-breakpoint
CREATE INDEX `disbursements_ezn_num_idx` ON `disbursements` (`ezn_num`);--> statement-breakpoint
CREATE INDEX `items_warehouse_id_idx` ON `items` (`warehouse_id`);--> statement-breakpoint
CREATE INDEX `transfers_item_code_idx` ON `transfers` (`item_code`);--> statement-breakpoint
CREATE INDEX `transfers_ezn_num_idx` ON `transfers` (`ezn_num`);