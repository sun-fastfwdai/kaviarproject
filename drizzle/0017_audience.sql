CREATE TABLE "audience_panels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"panel" jsonb,
	"calibration" jsonb,
	"error" text,
	"created_by" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audience_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"panel_id" uuid NOT NULL,
	"purpose" text DEFAULT 'test' NOT NULL,
	"title" text NOT NULL,
	"source" jsonb NOT NULL,
	"personas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reactions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"progress" jsonb DEFAULT '{"done":0,"total":0,"failed":0}'::jsonb NOT NULL,
	"result" jsonb,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"created_by" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audience_panels" ADD CONSTRAINT "audience_panels_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_panels" ADD CONSTRAINT "audience_panels_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_tests" ADD CONSTRAINT "audience_tests_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_tests" ADD CONSTRAINT "audience_tests_panel_id_audience_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."audience_panels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_tests" ADD CONSTRAINT "audience_tests_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audience_panels_kind" ON "audience_panels" USING btree ("brand_id","kind");--> statement-breakpoint
CREATE INDEX "audience_tests_brand" ON "audience_tests" USING btree ("brand_id","created_at");--> statement-breakpoint
ALTER TABLE "audience_panels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audience_tests" ENABLE ROW LEVEL SECURITY;