ALTER TABLE `additions` ADD `client_request_id` varchar(64);--> statement-breakpoint
ALTER TABLE `disbursements` ADD `client_request_id` varchar(64);--> statement-breakpoint
ALTER TABLE `transfers` ADD `client_request_id` varchar(64);--> statement-breakpoint
ALTER TABLE `additions` ADD CONSTRAINT `additions_client_request_id_unique` UNIQUE(`client_request_id`);--> statement-breakpoint
ALTER TABLE `disbursements` ADD CONSTRAINT `disbursements_client_request_id_unique` UNIQUE(`client_request_id`);--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_client_request_id_unique` UNIQUE(`client_request_id`);