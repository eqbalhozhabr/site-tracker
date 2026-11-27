CREATE TABLE `records` (
 `store` text NOT NULL,
 `id` text NOT NULL,
 `space_id` text,
 `payload` text NOT NULL,
 `updated_at` text NOT NULL,
 PRIMARY KEY(`store`, `id`)
);
--> statement-breakpoint
CREATE INDEX `records_space_idx` ON `records` (`store`,`space_id`);
