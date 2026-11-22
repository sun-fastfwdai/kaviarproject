CREATE TABLE "store_fixes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"product_gid" text NOT NULL,
	"product_title" text NOT NULL,
	"handle" text,
	"image" text,
	"media_gid" text,
	"problem" text NOT NULL,
	"before" text DEFAULT '' NOT NULL,
	"after" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"by" text,
	"decided_by" uuid,
	"applied_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "features" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "store_fixes" ADD CONSTRAINT "store_fixes_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_fixes" ADD CONSTRAINT "store_fixes_decided_by_members_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "store_fixes_key" ON "store_fixes" USING btree ("brand_id","key");--> statement-breakpoint
CREATE INDEX "store_fixes_brand" ON "store_fixes" USING btree ("brand_id","status");--> statement-breakpoint
ALTER TABLE "store_fixes" ENABLE ROW LEVEL SECURITY;