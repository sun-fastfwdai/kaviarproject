import { NextResponse, type NextRequest } from "next/server";
import { getMember } from "@/lib/auth";
import { lookExample, makeLookExample } from "@/lib/creative/look-examples";

export const maxDuration = 300;

/** Kaviar's example ad for an ad style (the picture in the style picker). 404 until one has been shot — the picker then shows its drawing. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/looks/[key]">) {
  if (!(await getMember())) return new NextResponse("Not found", { status: 404 });
  const { key } = await ctx.params;
  const jpg = /^[a-z]{2,16}$/.test(key) ? await lookExample(key) : null;
  if (!jpg) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "private, max-age=120" } });
  return new NextResponse(new Uint8Array(jpg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=604800" } });
}

/** Shoot (or re-shoot) the example for one style. Workspace owners only — it spends a photo. */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/looks/[key]">) {
  const me = await getMember();
  if (!me || me.role !== "owner") return NextResponse.json({ error: "Owners only." }, { status: 403 });
  const { key } = await ctx.params;
  if (!/^[a-z]{2,16}$/.test(key)) return NextResponse.json({ error: "Unknown style." }, { status: 404 });
  const r = await makeLookExample(key).catch((e: Error) => ({ error: e.message.slice(0, 200) }));
  return NextResponse.json(r, { status: "error" in r && r.error ? 500 : 200 });
}
