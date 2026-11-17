import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { ffmpegPath, run } from "../creative/cut";

/** What the panel sees: images as base64 blocks, small enough to send to many agents in one test. */
export type Img = { media: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string };
const OK = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ASSET = /^\/api\/assets\/([0-9a-f-]{36})/i;

/** Any picture as a JPEG at most `width` wide, optionally cut to `box` first (fractions of the picture: x, y, w, h). Null when ffmpeg can't read it. */
export async function toJpeg(buf: Buffer, width = 1080, box?: { x: number; y: number; w: number; h: number }): Promise<Buffer | null> {
  const dir = await mkdtemp(join(tmpdir(), "aud-"));
  try {
    const bin = await ffmpegPath();
    const inp = join(dir, "in"), out = join(dir, "out.jpg");
    await writeFile(inp, buf);
    const f = (n: number) => Math.min(1, Math.max(0, n)).toFixed(4);
    const crop = box ? `crop=trunc(iw*${f(box.w)}/2)*2:trunc(ih*${f(box.h)}/2)*2:iw*${f(box.x)}:ih*${f(box.y)},` : "";
    await run(bin, ["-hide_banner", "-y", "-i", inp, "-vf", `${crop}scale='min(${width},iw)':-2`, "-frames:v", "1", "-q:v", "4", out], 60_000);
    return await readFile(out);
  } catch { return null; }
  finally { await rm(dir, { recursive: true, force: true }).catch(() => undefined); }
}
const shrink = (buf: Buffer) => toJpeg(buf);

/** A picture's size, read from ffmpeg's description of it. */
export async function imageSize(buf: Buffer): Promise<{ w: number; h: number } | null> {
  const dir = await mkdtemp(join(tmpdir(), "aud-s-"));
  try {
    const bin = await ffmpegPath();
    const inp = join(dir, "in");
    await writeFile(inp, buf);
    const out = await run(bin, ["-hide_banner", "-i", inp], 30_000).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
    const m = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(out.stderr);
    return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
  } catch { return null; }
  finally { await rm(dir, { recursive: true, force: true }).catch(() => undefined); }
}

/** An ad's picture — a Kaviar asset (AI photo, upload) or a URL (Shopify CDN, Meta) — as an image block. Null when it can't be read. */
export async function loadImage(brandId: string, url: string | null): Promise<Img | null> {
  if (!url) return null;
  let buf: Buffer | null = null, mime = "";
  try {
    const m = ASSET.exec(url);
    if (m) {
      const [a] = await db.select({ data: schema.brandAssets.data, mime: schema.brandAssets.mime }).from(schema.brandAssets)
        .where(and(eq(schema.brandAssets.id, m[1]), eq(schema.brandAssets.brandId, brandId)));
      if (!a || !a.mime.startsWith("image/")) return null;
      buf = Buffer.from(a.data); mime = a.mime;
    } else if (/^https:\/\//.test(url)) {
      const u = new URL(url);
      if (u.hostname === "cdn.shopify.com") u.searchParams.set("width", "1080");
      const res = await fetch(u, { signal: AbortSignal.timeout(15_000), cache: "no-store", headers: { "user-agent": "Mozilla/5.0 (compatible; KaviarBot/1.0)", accept: "image/*" } });
      if (!res.ok) return null;
      mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
      buf = Buffer.from(await res.arrayBuffer());
    }
  } catch { return null; }
  if (!buf?.length) return null;
  // Big or unusual files are re-encoded to a 1080-wide JPEG; ordinary ones go as they are.
  if (buf.length > 1_200_000 || !OK.has(mime)) {
    const small = await shrink(buf);
    if (small) return { media: "image/jpeg", data: small.toString("base64") };
    if (!OK.has(mime) || buf.length > 4_500_000) return null;
  }
  return { media: mime as Img["media"], data: buf.toString("base64") };
}

/** A video from Shoots as the frames a viewer sees: the first second, the hook, the middle and the end. */
export async function videoFrames(brandId: string, assetId: string): Promise<{ at: number; img: Img }[]> {
  const [a] = await db.select({ data: schema.brandAssets.data, meta: schema.brandAssets.meta }).from(schema.brandAssets)
    .where(and(eq(schema.brandAssets.id, assetId), eq(schema.brandAssets.brandId, brandId)));
  if (!a) return [];
  const dir = await mkdtemp(join(tmpdir(), "aud-v-"));
  try {
    const bin = await ffmpegPath();
    const f = join(dir, "v.mp4");
    await writeFile(f, Buffer.from(a.data));
    let dur = a.meta.seconds ?? 0;
    if (!dur) {
      const out = await run(bin, ["-hide_banner", "-i", f], 30_000).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
      const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(out.stderr);
      dur = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 10;
    }
    const times = [...new Set([0.4, 2, dur * 0.45, dur * 0.8].map((t) => Math.round(Math.min(Math.max(0.2, dur - 0.3), t) * 10) / 10))];
    const frames: { at: number; img: Img }[] = [];
    for (const [i, t] of times.entries()) {
      const out = join(dir, `f${i}.jpg`);
      try {
        await run(bin, ["-hide_banner", "-y", "-ss", String(t), "-i", f, "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "5", out], 60_000);
        frames.push({ at: t, img: { media: "image/jpeg", data: (await readFile(out)).toString("base64") } });
      } catch { /* a frame past the end — skip it */ }
    }
    return frames;
  } catch { return []; }
  finally { await rm(dir, { recursive: true, force: true }).catch(() => undefined); }
}

/** The average colour of part of a picture (fractions x, y, w, h) — to choose dark or light type over it. */
export async function avgColor(buf: Buffer, box: { x: number; y: number; w: number; h: number }): Promise<{ r: number; g: number; b: number } | null> {
  const dir = await mkdtemp(join(tmpdir(), "aud-c-"));
  try {
    const bin = await ffmpegPath();
    const inp = join(dir, "in"), out = join(dir, "c.rgb");
    await writeFile(inp, buf);
    const f = (n: number) => Math.min(1, Math.max(0, n)).toFixed(4);
    await run(bin, ["-hide_banner", "-y", "-i", inp, "-vf", `crop=iw*${f(box.w)}:ih*${f(box.h)}:iw*${f(box.x)}:ih*${f(box.y)},scale=1:1:flags=area`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", out], 30_000);
    const px = await readFile(out);
    return px.length >= 3 ? { r: px[0], g: px[1], b: px[2] } : null;
  } catch { return null; }
  finally { await rm(dir, { recursive: true, force: true }).catch(() => undefined); }
}
