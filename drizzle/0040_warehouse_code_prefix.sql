ALTER TABLE `warehouses` ADD `code_prefix` int DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE `warehouses` SET `code_prefix` = `slot` WHERE `code_prefix` = 1;--> statement-breakpoint
