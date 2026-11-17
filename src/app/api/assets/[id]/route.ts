import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getMember } from "@/lib/auth";
import { toJpeg } from "@/lib/audience/media";
import { storedLink } from "@/lib/assets/storage";

const EXT: Record<string, string> = {
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "image/svg+xml": "svg", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3", "application/pdf": "pdf",
};
/** A Vercel function can't send back more than 4.5 MB: bigger files go out in parts, as a smaller copy, or from storage. */
const LIMIT = 4_000_000;
const CHUNK = 3_500_000;
const A = schema.brandAssets;

/**
 * Serves a brand asset to signed-in team members only. SVGs are sandboxed so they can't run script.
 * - `?w=480` returns a JPEG thumbnail (lists, the Editor's media panel).
 * - Videos, audio and pictures over 4 MB are kept in Supabase Storage and open through a short-lived signed link.
 * - If storage can't be reached: video ranges are read in parts from the database, and large pictures go out as full-size JPEGs.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/assets/[id]">) {
  if (!(await getMember())) return new NextResponse("Not found", { status: 404 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const [a] = await db.select({ id: A.id, brandId: A.brandId, mime: A.mime, name: A.name, size: A.size, meta: A.meta }).from(A).where(eq(A.id, id)).limit(1);
  if (!a) return new NextResponse("Not found", { status: 404 });
  const ext = EXT[a.mime], base = a.name.replace(/[\\/:*?"<>|\r\n]+/g, " ").trim() || "asset";
  const named = (e: string | undefined) => (e && !base.toLowerCase().endsWith(`.${e}`) ? `${base}.${e}` : base);
  const head = (mime: string, file: string, extra: Record<string, string> = {}) => ({
    "Content-Type": mime,
    "Content-Disposition": `inline; filename="${file.replace(/[^\x20-\x7e]/g, "-")}"; filename*=UTF-8''${encodeURIComponent(file)}`,
    "Cache-Control": "private, max-age=86400",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  });
  const whole = async () => Buffer.from((await db.select({ data: A.data }).from(A).where(eq(A.id, id)).limit(1))[0].data);
  const isImage = a.mime.startsWith("image/") && a.mime !== "image/svg+xml" && a.mime !== "image/gif";

  // A thumbnail.
  const w = Number(req.nextUrl.searchParams.get("w"));
  if (isImage && w >= 120 && w <= 1600) {
    const jpg = await toJpeg(await whole(), Math.round(w));
    if (jpg) return new NextResponse(new Uint8Array(jpg), { headers: head("image/jpeg", named("jpg"), { "Cache-Control": "private, max-age=604800, immutable" }) });
  }

  // Videos, audio and large pictures live in Supabase Storage: open them from there (copied in the first time).
  if (a.size > LIMIT || a.mime.startsWith("video/") || a.mime.startsWith("audio/")) {
    const link = await storedLink(a, whole, named(ext), req.nextUrl.searchParams.has("download")).catch((e) => { console.error("asset storage", id, (e as Error).message); return null; });
    if (link) return NextResponse.redirect(link, 302);
  }

  // Storage unreachable — fallbacks. Byte ranges (video and audio players), read in parts from the database.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && a.size > 0) {
    const start = range[1] ? Number(range[1]) : Math.max(0, a.size - Number(range[2] || 0));
    if (start >= a.size) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${a.size}` } });
    const end = Math.min(a.size - 1, range[2] && range[1] ? Number(range[2]) : a.size - 1, start + CHUNK - 1);
    const [part] = (await db.execute(sql`select substring(data from ${start + 1} for ${end - start + 1}) as d from brand_assets where id = ${id}`)).rows as { d: Buffer }[];
    return new NextResponse(new Uint8Array(part.d), { status: 206, headers: head(a.mime, named(ext), { "Content-Range": `bytes ${start}-${end}/${a.size}`, "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1) }) });
  }

  if (a.size <= LIMIT) return new NextResponse(new Uint8Array(await whole()), { headers: head(a.mime, named(ext), { "Accept-Ranges": "bytes" }) });

  // Too big to send at once: a picture as a full-size JPEG.
  if (isImage) {
    const jpg = await toJpeg(await whole(), 2400);
    if (jpg && jpg.length <= LIMIT) return new NextResponse(new Uint8Array(jpg), { headers: head("image/jpeg", named("jpg")) });
  }
  return new NextResponse("This file is too large to open here — play it in Kaviar.", { status: 413 });
}
