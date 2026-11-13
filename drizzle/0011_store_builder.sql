CREATE TABLE "store_builds" (
	"brand_id" uuid PRIMARY KEY NOT NULL,
	"theme" text DEFAULT 'kaviar-starter' NOT NULL,
	"pages" jsonb DEFAULT '["home","products","collections","story","contact","policies"]'::jsonb NOT NULL,
	"apps" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content" jsonb,
	"approved" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store_builds" ADD CONSTRAINT "store_builds_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "store_builds" ENABLE ROW LEVEL SECURITY;
