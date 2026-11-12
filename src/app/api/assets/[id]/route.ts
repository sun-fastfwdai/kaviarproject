import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getMember } from "@/lib/auth";

/** Serves an uploaded brand asset to signed-in team members only. SVGs are sandboxed so they can't run script. */
export async function GET(_: NextRequest, ctx: RouteContext<"/api/assets/[id]">) {
  if (!(await getMember())) return new NextResponse("Not found", { status: 404 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const [a] = await db.select({ data: schema.brandAssets.data, mime: schema.brandAssets.mime, name: schema.brandAssets.name }).from(schema.brandAssets).where(eq(schema.brandAssets.id, id)).limit(1);
  if (!a) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(a.data), {
    headers: {
      "Content-Type": a.mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(a.name)}"`,
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
