CREATE TABLE "agent_notes" (
	"brand_id" uuid NOT NULL,
	"key" text NOT NULL,
	"facts_hash" text NOT NULL,
	"body" jsonb NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_notes_brand_id_key_pk" PRIMARY KEY("brand_id","key")
);
--> statement-breakpoint
ALTER TABLE "agent_notes" ADD CONSTRAINT "agent_notes_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_notes" ENABLE ROW LEVEL SECURITY;
