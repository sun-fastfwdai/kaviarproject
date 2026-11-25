import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { canSee, getMember } from "@/lib/auth";
import { cardAt } from "@/lib/creative/design";

export const maxDuration = 60;
const SIZE = ["4x5", "1x1", "9x16"] as const;

/** A designed ad's picture in one of Meta's three shapes — feed, square or story — drawn when asked for. Signed-in team members only. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMember();
  const { id } = await ctx.params;
  if (!me || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const want = req.nextUrl.searchParams.get("size"), size = SIZE.find((s) => s === want) ?? "4x5";
  const A = schema.ads;
  const [ad] = await db.select({ brandId: A.brandId, design: A.design, hook: A.hook, headline: A.headline, cta: A.cta, offer: A.offer }).from(A).where(eq(A.id, id)).limit(1);
  if (!ad || !canSee(me, ad.brandId)) return new NextResponse("Not found", { status: 404 }); // a brand login only gets its own ads
  const png = await cardAt(ad.brandId, ad, size).catch((e) => { console.error("ad card", id, (e as Error).message.slice(0, 160)); return null; });
  if (!png) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff", "Content-Disposition": `inline; filename="ad-${size}.png"` } });
}
