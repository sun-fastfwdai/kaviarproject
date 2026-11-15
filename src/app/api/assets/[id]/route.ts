import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getMember } from "@/lib/auth";

const EXT: Record<string, string> = {
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "image/svg+xml": "svg", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3", "application/pdf": "pdf",
};

/** Serves an uploaded brand asset to signed-in team members only. SVGs are sandboxed so they can't run script. */
export async function GET(_: NextRequest, ctx: RouteContext<"/api/assets/[id]">) {
  if (!(await getMember())) return new NextResponse("Not found", { status: 404 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const [a] = await db.select({ data: schema.brandAssets.data, mime: schema.brandAssets.mime, name: schema.brandAssets.name }).from(schema.brandAssets).where(eq(schema.brandAssets.id, id)).limit(1);
  if (!a) return new NextResponse("Not found", { status: 404 });
  // Downloads keep their type: "… · clip" saves as "… · clip.mp4".
  const ext = EXT[a.mime], base = a.name.replace(/[\\/:*?"<>|\r\n]+/g, " ").trim() || "asset";
  const file = ext && !base.toLowerCase().endsWith(`.${ext}`) ? `${base}.${ext}` : base;
  return new NextResponse(new Uint8Array(a.data), {
    headers: {
      "Content-Type": a.mime,
      "Content-Disposition": `inline; filename="${file.replace(/[^\x20-\x7e]/g, "-")}"; filename*=UTF-8''${encodeURIComponent(file)}`,
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
