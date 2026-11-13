CREATE TABLE "shoot_flows" (
	"brand_id" uuid PRIMARY KEY NOT NULL,
	"flow" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shoot_flows" ADD CONSTRAINT "shoot_flows_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoot_flows" ADD CONSTRAINT "shoot_flows_updated_by_members_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoot_flows" ENABLE ROW LEVEL SECURITY;
