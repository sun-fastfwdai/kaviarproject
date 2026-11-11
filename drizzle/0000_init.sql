CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"image_url" text,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"external_id" text,
	"display_name" text,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_expires_at" timestamp with time zone,
	"refresh_expires_at" timestamp with time zone,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"connected_by" uuid,
	"connected_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'operator' NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "meta_ads" (
	"brand_id" uuid NOT NULL,
	"id" text NOT NULL,
	"campaign_id" text,
	"adset_id" text,
	"name" text NOT NULL,
	"status" text,
	"effective_status" text,
	"thumbnail_url" text,
	"created_time" timestamp with time zone,
	"updated_time" timestamp with time zone,
	CONSTRAINT "meta_ads_brand_id_id_pk" PRIMARY KEY("brand_id","id")
);
--> statement-breakpoint
CREATE TABLE "meta_campaigns" (
	"brand_id" uuid NOT NULL,
	"id" text NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"objective" text,
	"status" text,
	"effective_status" text,
	"daily_budget" numeric(14, 2),
	"lifetime_budget" numeric(14, 2),
	"created_time" timestamp with time zone,
	"updated_time" timestamp with time zone,
	CONSTRAINT "meta_campaigns_brand_id_id_pk" PRIMARY KEY("brand_id","id")
);
--> statement-breakpoint
CREATE TABLE "meta_insights_daily" (
	"brand_id" uuid NOT NULL,
	"ad_id" text NOT NULL,
	"campaign_id" text,
	"date" date NOT NULL,
	"spend" numeric(14, 2) DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"purchases" numeric(12, 2) DEFAULT 0 NOT NULL,
	"purchase_value" numeric(14, 2) DEFAULT 0 NOT NULL,
	CONSTRAINT "meta_insights_daily_brand_id_ad_id_date_pk" PRIMARY KEY("brand_id","ad_id","date")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_customers" (
	"brand_id" uuid NOT NULL,
	"id" bigint NOT NULL,
	"number_of_orders" integer DEFAULT 0 NOT NULL,
	"amount_spent" numeric(14, 2),
	"marketing_consent" boolean,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	CONSTRAINT "shop_customers_brand_id_id_pk" PRIMARY KEY("brand_id","id")
);
--> statement-breakpoint
CREATE TABLE "shop_order_lines" (
	"brand_id" uuid NOT NULL,
	"id" bigint NOT NULL,
	"order_id" bigint NOT NULL,
	"product_id" bigint,
	"variant_id" bigint,
	"title" text NOT NULL,
	"variant_title" text,
	"sku" text,
	"quantity" integer NOT NULL,
	"unit_price" numeric(14, 2),
	"total" numeric(14, 2),
	CONSTRAINT "shop_order_lines_brand_id_id_pk" PRIMARY KEY("brand_id","id")
);
--> statement-breakpoint
CREATE TABLE "shop_orders" (
	"brand_id" uuid NOT NULL,
	"id" bigint NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"test" boolean DEFAULT false NOT NULL,
	"currency" text,
	"total" numeric(14, 2) NOT NULL,
	"subtotal" numeric(14, 2),
	"discounts" numeric(14, 2),
	"refunded" numeric(14, 2) DEFAULT 0 NOT NULL,
	"financial_status" text,
	"fulfillment_status" text,
	"customer_id" bigint,
	"source_name" text,
	"discount_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"landing_page" text,
	"referrer" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"utm_term" text,
	"channel" text DEFAULT 'direct' NOT NULL,
	"meta_campaign_id" text,
	"meta_ad_id" text,
	CONSTRAINT "shop_orders_brand_id_id_pk" PRIMARY KEY("brand_id","id")
);
--> statement-breakpoint
CREATE TABLE "shop_products" (
	"brand_id" uuid NOT NULL,
	"id" bigint NOT NULL,
	"title" text NOT NULL,
	"handle" text,
	"status" text,
	"product_type" text,
	"vendor" text,
	"image_url" text,
	"total_inventory" integer,
	"price_min" numeric(14, 2),
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	CONSTRAINT "shop_products_brand_id_id_pk" PRIMARY KEY("brand_id","id")
);
--> statement-breakpoint
CREATE TABLE "shop_variants" (
	"brand_id" uuid NOT NULL,
	"id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"title" text,
	"sku" text,
	"price" numeric(14, 2),
	"unit_cost" numeric(14, 2),
	"inventory_quantity" integer,
	CONSTRAINT "shop_variants_brand_id_id_pk" PRIMARY KEY("brand_id","id")
);
--> statement-breakpoint
CREATE TABLE "sync_cursors" (
	"brand_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"resource" text NOT NULL,
	"cursor" text,
	"last_success_at" timestamp with time zone,
	CONSTRAINT "sync_cursors_brand_id_provider_resource_pk" PRIMARY KEY("brand_id","provider","resource")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"trigger" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"rows" integer DEFAULT 0 NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"message" text,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" uuid,
	"shop" text NOT NULL,
	"topic" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_connected_by_members_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ads" ADD CONSTRAINT "meta_ads_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_campaigns" ADD CONSTRAINT "meta_campaigns_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_insights_daily" ADD CONSTRAINT "meta_insights_daily_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_customers" ADD CONSTRAINT "shop_customers_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_lines" ADD CONSTRAINT "shop_order_lines_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_variants" ADD CONSTRAINT "shop_variants_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_cursors" ADD CONSTRAINT "sync_cursors_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connections_brand_provider" ON "connections" USING btree ("brand_id","provider");--> statement-breakpoint
CREATE INDEX "connections_external" ON "connections" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "meta_insights_brand_date" ON "meta_insights_daily" USING btree ("brand_id","date");--> statement-breakpoint
CREATE INDEX "shop_order_lines_order" ON "shop_order_lines" USING btree ("brand_id","order_id");--> statement-breakpoint
CREATE INDEX "shop_orders_brand_created" ON "shop_orders" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE INDEX "shop_orders_brand_customer" ON "shop_orders" USING btree ("brand_id","customer_id");--> statement-breakpoint
CREATE INDEX "shop_variants_product" ON "shop_variants" USING btree ("brand_id","product_id");--> statement-breakpoint
CREATE INDEX "sync_runs_brand_started" ON "sync_runs" USING btree ("brand_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_runs_one_running" ON "sync_runs" USING btree ("brand_id","provider") WHERE status = 'running';--> statement-breakpoint
CREATE INDEX "webhook_events_brand" ON "webhook_events" USING btree ("brand_id","received_at");