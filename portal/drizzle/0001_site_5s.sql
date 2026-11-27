CREATE TABLE `corrective_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`inspection_id` text NOT NULL,
	`project_id` text NOT NULL,
	`category_id` text NOT NULL,
	`description` text NOT NULL,
	`responsible_person` text NOT NULL,
	`priority` text NOT NULL,
	`target_date` text NOT NULL,
	`status` text NOT NULL,
	`critical_hse` integer DEFAULT 0 NOT NULL,
	`before_photos` text DEFAULT '[]' NOT NULL,
	`after_photos` text DEFAULT '[]' NOT NULL,
	`closure_notes` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`closed_at` text,
	`last_change_id` text,
	FOREIGN KEY (`inspection_id`) REFERENCES `inspections`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "corrective_actions_priority" CHECK("corrective_actions"."priority" IN ('Low','Medium','High','Critical')),
	CONSTRAINT "corrective_actions_status" CHECK("corrective_actions"."status" IN ('Open','In Progress','Closed'))
);
--> statement-breakpoint
CREATE INDEX `corrective_actions_project_status` ON `corrective_actions` (`project_id`,`status`,`target_date`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`inspection_id` text,
	`category_id` text NOT NULL,
	`kind` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`inspection_id`) REFERENCES `inspections`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "evidence_kind" CHECK("evidence"."kind" IN ('category','before','after'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_object_key_unique` ON `evidence` (`object_key`);--> statement-breakpoint
CREATE TABLE `inspection_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`project_id` text,
	`event` text NOT NULL,
	`resource_id` text NOT NULL,
	`details` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inspection_audit_project_date` ON `inspection_audit` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `inspections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`inspection_date` text NOT NULL,
	`inspector_id` text NOT NULL,
	`inspector_name` text NOT NULL,
	`inspector_role` text NOT NULL,
	`total` integer NOT NULL,
	`classification` text NOT NULL,
	`critical_hse` integer DEFAULT 0 NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "inspections_total" CHECK("inspections"."total" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE INDEX `inspections_project_date` ON `inspections` (`project_id`,`inspection_date`);--> statement-breakpoint
CREATE TABLE `project_members` (
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `project_id`),
	FOREIGN KEY (`user_id`) REFERENCES `site_users`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `site_users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "site_users_role" CHECK("site_users"."role" IN ('administrator','management','project_manager','site_supervisor'))
);
