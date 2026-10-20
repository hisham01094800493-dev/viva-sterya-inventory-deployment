CREATE TABLE IF NOT EXISTS `drafts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `kind` varchar(32) NOT NULL DEFAULT 'note',
  `title` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `payload` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `drafts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `drafts_user_updated_idx` ON `drafts` (`user_id`,`updated_at`);
