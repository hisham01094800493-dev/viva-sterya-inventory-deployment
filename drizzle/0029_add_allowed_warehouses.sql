ALTER TABLE `user_permissions` ADD COLUMN `allowed_warehouses` varchar(2000) NOT NULL DEFAULT '[]';
