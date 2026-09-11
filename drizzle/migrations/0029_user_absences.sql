CREATE TABLE `user_absences` (
  
  `id` int AUTO_INCREMENT NOT NULL,
  
  `user_id` int NOT NULL,
  
  `start_date` varchar(10) NOT NULL,
  
  `days` int NOT NULL,
  
  `created_at` timestamp NOT NULL DEFAULT (now()),
  
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  
  CONSTRAINT `user_absences_id` PRIMARY KEY(`id`)
  
);



CREATE INDEX `user_absences_user_date_idx` ON `user_absences` (`user_id`,`start_date`);







