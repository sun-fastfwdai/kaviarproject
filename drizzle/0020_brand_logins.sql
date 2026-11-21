CREATE TABLE "member_brands" (
	"member_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_brands_member_id_brand_id_pk" PRIMARY KEY("member_id","brand_id")
);
--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "member_brands" ADD CONSTRAINT "member_brands_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_brands" ADD CONSTRAINT "member_brands_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;