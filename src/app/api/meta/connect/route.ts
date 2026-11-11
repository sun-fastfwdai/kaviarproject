import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getMember } from "@/lib/auth";
import { env } from "@/lib/env";
import { metaAuthorizeUrl } from "@/lib/meta/oauth";
import { startOAuth } from "@/lib/oauth-state";

export async function GET(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.redirect(new URL("/login", req.url));
  if (!env.metaConfigured()) return NextResponse.json({ error: "Meta app keys are not configured" }, { status: 500 });
  const slug = req.nextUrl.searchParams.get("brand") ?? "";
  const [b] = await db.select({ id: schema.brands.id }).from(schema.brands).where(eq(schema.brands.slug, slug)).limit(1);
  if (!b) return NextResponse.redirect(new URL("/brands", req.url));
  const state = await startOAuth("kv_meta_oauth", { brandId: b.id, slug, memberId: member.id });
  return NextResponse.redirect(metaAuthorizeUrl(state));
}
