ALTER TABLE `warehouses` ADD COLUMN `status` enum('active','archived') NOT NULL DEFAULT 'active';
