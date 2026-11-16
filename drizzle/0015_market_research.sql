CREATE TABLE "market_research" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"market" text DEFAULT 'US' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"report" jsonb,
	"rivals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"manual" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ads_read" jsonb,
	"plan" jsonb,
	"error" text,
	"created_by" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_research" ADD CONSTRAINT "market_research_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_research" ADD CONSTRAINT "market_research_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "market_research_subject" ON "market_research" USING btree ("brand_id","subject","market");--> statement-breakpoint
ALTER TABLE "market_research" ENABLE ROW LEVEL SECURITY;