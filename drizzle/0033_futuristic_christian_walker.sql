CREATE TABLE `buildings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`code` varchar(64) NOT NULL,
	`type` enum('owned_building','subcontractor') NOT NULL DEFAULT 'owned_building',
	`budget` decimal(14,2) NOT NULL DEFAULT '0',
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `buildings_id` PRIMARY KEY(`id`),
	CONSTRAINT `buildings_name_unique` UNIQUE(`name`),
	CONSTRAINT `buildings_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `disbursements` ADD `building_id` int;--> statement-breakpoint
CREATE INDEX `disbursements_building_id_idx` ON `disbursements` (`building_id`);--> statement-breakpoint
INSERT INTO `buildings` (`name`, `code`, `type`, `budget`, `status`) VALUES
  ('مبنى 1', 'OWNED-01', 'owned_building', 0, 'active'),
  ('مبنى 2', 'OWNED-02', 'owned_building', 0, 'active'),
  ('مبنى 3', 'OWNED-03', 'owned_building', 0, 'active'),
  ('مبنى 4', 'OWNED-04', 'owned_building', 0, 'active'),
  ('مبنى 5', 'OWNED-05', 'owned_building', 0, 'active'),
  ('مقاول / جهة خارجية', 'SUBCONTRACTOR-01', 'subcontractor', 0, 'active');
