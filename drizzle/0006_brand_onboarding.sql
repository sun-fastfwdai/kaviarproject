CREATE TABLE "brand_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "onboarding_step" integer;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "onboarding" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_assets_brand" ON "brand_assets" USING btree ("brand_id","kind");
--> statement-breakpoint
ALTER TABLE "brand_assets" ENABLE ROW LEVEL SECURITY;
