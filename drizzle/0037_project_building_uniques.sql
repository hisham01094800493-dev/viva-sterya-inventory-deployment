-- Project-scoped building identity.
-- Safety: this migration intentionally does not rename, delete, or reassign buildings.
-- It must run only after 0036 has populated buildings.project_id and after duplicate preflight.
--> statement-breakpoint
ALTER TABLE `buildings` DROP INDEX `buildings_name_unique`;--> statement-breakpoint
ALTER TABLE `buildings` DROP INDEX `buildings_code_unique`;--> statement-breakpoint
ALTER TABLE `buildings` ADD CONSTRAINT `buildings_project_name_uq` UNIQUE(`project_id`,`name`);--> statement-breakpoint
ALTER TABLE `buildings` ADD CONSTRAINT `buildings_project_code_uq` UNIQUE(`project_id`,`code`);--> statement-breakpoint
CREATE INDEX `buildings_project_id_idx` ON `buildings` (`project_id`);
