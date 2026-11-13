CREATE TABLE "ad_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"signal" text,
	"title" text NOT NULL,
	"brief" text NOT NULL,
	"audience" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"format" text NOT NULL,
	"hook" text NOT NULL,
	"primary_text" text NOT NULL,
	"headline" text NOT NULL,
	"cta" text NOT NULL,
	"offer" text NOT NULL,
	"product" text,
	"image_url" text,
	"why" text NOT NULL,
	"status" text DEFAULT 'review' NOT NULL,
	"note" text,
	"edited" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_batches" ADD CONSTRAINT "ad_batches_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_batches" ADD CONSTRAINT "ad_batches_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_batch_id_ad_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."ad_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_batches_brand" ON "ad_batches" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE INDEX "ads_batch" ON "ads" USING btree ("batch_id","position");
--> statement-breakpoint
ALTER TABLE "ad_batches" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ads" ENABLE ROW LEVEL SECURITY;
