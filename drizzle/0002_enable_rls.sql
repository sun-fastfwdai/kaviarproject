-- Supabase exposes the public schema over its REST API (anon/authenticated roles).
-- Kaviar only talks to Postgres directly as the owner, so: RLS on, no policies = no API access.
ALTER TABLE "members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_cursors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shop_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shop_variants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shop_customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shop_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shop_order_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "meta_campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "meta_ads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "meta_insights_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
