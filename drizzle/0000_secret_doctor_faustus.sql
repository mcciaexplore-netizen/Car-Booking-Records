CREATE TABLE `actual_trips` (
	`id` text PRIMARY KEY NOT NULL,
	`rowId` text NOT NULL,
	`data` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`rowId`) REFERENCES `extracted_rows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `actual_trips_rowId_unique` ON `actual_trips` (`rowId`);--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`entityId` text NOT NULL,
	`message` text NOT NULL,
	`state` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `api_budget` (
	`day` text PRIMARY KEY NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`tripId` text NOT NULL,
	`action` text NOT NULL,
	`bookingId` text,
	`duplicateOf` text,
	`reason` text NOT NULL,
	`reviewer` text NOT NULL,
	`createdAt` text NOT NULL,
	`evidenceHash` text NOT NULL,
	`originalResult` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`sha256` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`objectKey` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`uploadedBy` text NOT NULL,
	`createdAt` text NOT NULL,
	`operation` text,
	`extractionKey` text,
	`error` text,
	`deletedAt` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_sha256_unique` ON `documents` (`sha256`);--> statement-breakpoint
CREATE TABLE `extracted_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`documentId` text NOT NULL,
	`page` integer NOT NULL,
	`row` integer NOT NULL,
	`original` text NOT NULL,
	`corrected` text NOT NULL,
	`flags` text NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`reviewer` text,
	`reviewedAt` text,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`documentId`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `row_document` ON `extracted_rows` (`documentId`);--> statement-breakpoint
CREATE TABLE `fuel_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`rowId` text NOT NULL,
	`data` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`rowId`) REFERENCES `extracted_rows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fuel_purchases_rowId_unique` ON `fuel_purchases` (`rowId`);--> statement-breakpoint
CREATE TABLE `change_history` (
	`id` text PRIMARY KEY NOT NULL,
	`entityId` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`before` text,
	`after` text,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expiresAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reconciliations` (
	`id` text PRIMARY KEY NOT NULL,
	`tripId` text NOT NULL,
	`inputHash` text NOT NULL,
	`ruleVersion` text NOT NULL,
	`result` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reconciliation_trip` ON `reconciliations` (`tripId`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_records` (
	`generation` text NOT NULL,
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`report` text NOT NULL,
	`sourceId` text NOT NULL,
	`raw` text NOT NULL,
	`data` text NOT NULL,
	`fetchedAt` text NOT NULL,
	PRIMARY KEY(`generation`, `kind`, `id`),
	FOREIGN KEY (`generation`) REFERENCES `sync_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `source_generation` ON `source_records` (`generation`,`kind`);--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`mode` text NOT NULL,
	`startedAt` text NOT NULL,
	`finishedAt` text,
	`reportIndex` integer DEFAULT 0 NOT NULL,
	`cursor` text,
	`pages` integer DEFAULT 0 NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`retryAt` text,
	`leaseUntil` text,
	`mappingHash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);