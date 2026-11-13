ALTER TABLE "store_builds" ADD COLUMN "history" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "store_builds" ADD COLUMN "log" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "store_builds" ADD COLUMN "comments" jsonb DEFAULT '[]'::jsonb NOT NULL;