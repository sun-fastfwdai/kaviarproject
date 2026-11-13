import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getMember } from "@/lib/auth";
import { shopifyCsv } from "@/lib/store/catalog";

/** The catalog Cleo read from the old site, as Shopify's product import CSV. */
export async function GET(_: NextRequest, ctx: RouteContext<"/brands/[slug]/launch/csv">) {
  if (!(await getMember())) return new NextResponse("Not found", { status: 404 });
  const { slug } = await ctx.params;
  const [b] = await db.select({ name: schema.brands.name, onboarding: schema.brands.onboarding }).from(schema.brands).where(eq(schema.brands.slug, slug)).limit(1);
  const products = b?.onboarding?.catalog?.products;
  if (!products?.length) return new NextResponse("Read the website first.", { status: 404 });
  return new NextResponse(shopifyCsv(products), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}-products-for-shopify.csv"`, "Cache-Control": "no-store" },
  });
}
