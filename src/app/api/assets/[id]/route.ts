import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { canSee, getMember } from "@/lib/auth";
import { thumbnail } from "@/lib/audience/media";
import { readAssets, signedLink } from "@/lib/assets/storage";

const EXT: Record<string, string> = {
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "image/svg+xml": "svg", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3", "application/pdf": "pdf",
};
/** A Vercel function can't send back more than 4.5 MB: bigger files go out in parts, as a smaller copy, or from storage. */
const LIMIT = 4_000_000;
const A = schema.brandAssets;

/**
 * Serves a brand asset to signed-in team members only. SVGs are sandboxed so they can't run script.
 * - `?w=480` returns the stored thumbnail (lists, the Editor's media panel) — a small JPEG kept with the row.
 * - Files live in Supabase Storage: videos, audio and anything over 4 MB open through a short-lived signed link;
 *   smaller files are passed through, so pictures keep working in the Editor's canvas.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/assets/[id]">) {
  const me = await getMember();
  if (!me) return new NextResponse("Not found", { status: 404 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const [a] = await db.select({ id: A.id, brandId: A.brandId, mime: A.mime, name: A.name, size: A.size, meta: A.meta }).from(A).where(eq(A.id, id)).limit(1);
  if (!a || !canSee(me, a.brandId)) return new NextResponse("Not found", { status: 404 }); // a brand login only gets its own files
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
  const whole = async () => (await readAssets(eq(A.id, id), 1))[0].data;
  const visual = (a.mime.startsWith("image/") && a.mime !== "image/svg+xml") || a.mime.startsWith("video/");

  // A thumbnail for lists: made when the file is saved; older files get theirs on first view.
  const w = Number(req.nextUrl.searchParams.get("w"));
  if (visual && w >= 120 && w <= 600) {
    const [t] = await db.select({ thumb: A.thumb }).from(A).where(eq(A.id, id)).limit(1);
    let jpg: Buffer | null = t?.thumb ? Buffer.from(t.thumb) : null;
    if (!jpg) {
      jpg = await thumbnail(await whole(), a.mime);
      if (jpg) await db.update(A).set({ thumb: jpg }).where(eq(A.id, id));
    }
    if (jpg) return new NextResponse(new Uint8Array(jpg), { headers: head("image/jpeg", named("jpg"), { "Cache-Control": "private, max-age=604800, immutable" }) });
  }

  // Big files, video and audio open straight from storage.
  const direct = a.size > LIMIT || a.mime.startsWith("video/") || a.mime.startsWith("audio/") || req.nextUrl.searchParams.has("download");
  if (a.meta.stored && direct) {
    const link = await signedLink(a.meta.stored, req.nextUrl.searchParams.has("download") ? named(ext) : undefined).catch((e: Error) => { console.error("asset link", id, e.message); return null; });
    if (link) return NextResponse.redirect(link, 302);
  }
  if (a.size > LIMIT) return new NextResponse("This file is still being moved to storage — try again in a minute.", { status: 503, headers: { "Retry-After": "60" } });
  return new NextResponse(new Uint8Array(await whole()), { headers: head(a.mime, named(ext)) });
}
