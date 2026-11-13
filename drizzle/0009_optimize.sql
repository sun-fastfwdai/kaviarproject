CREATE TABLE "optimize_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"week" date NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"why" text NOT NULL,
	"before" text NOT NULL,
	"after" text NOT NULL,
	"target" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "optimize_changes" ADD CONSTRAINT "optimize_changes_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimize_changes" ADD CONSTRAINT "optimize_changes_decided_by_members_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "optimize_changes_key" ON "optimize_changes" USING btree ("brand_id","week","key");
--> statement-breakpoint
ALTER TABLE "optimize_changes" ENABLE ROW LEVEL SECURITY;
