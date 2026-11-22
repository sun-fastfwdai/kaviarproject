import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { db, schema } from "../db";

/**
 * Brand files (photos, videos, voices, decks) live in a private Supabase Storage bucket; the database keeps one row per file
 * (name, type, size, a small thumbnail, where it is stored) but not the bytes. Files open through short-lived signed links.
 * Without storage keys (local development) the bytes stay in the row, and everything else works the same.
 */
const BUCKET = "assets";
const A = schema.brandAssets;
const storage = () => {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
};
export const storageOn = () => Boolean(storage());

async function sb(path: string, init: RequestInit = {}) {
  const s = storage();
  if (!s) throw new Error("Storage isn’t configured.");
  const headers = new Headers(init.headers);
  headers.set("apikey", s.key);
  if (!s.key.startsWith("sb_")) headers.set("Authorization", `Bearer ${s.key}`);
  return fetch(`${s.url}/storage/v1/${path}`, { ...init, headers, cache: "no-store" });
}

let bucket: Promise<unknown> | null = null;
const ensureBucket = () => (bucket ??= sb("bucket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) }).catch(() => { bucket = null; })); // 409 when it exists

async function upload(path: string, mime: string, data: Buffer): Promise<void> {
  await ensureBucket();
  for (let attempt = 0; ; attempt++) {
    const r = await sb(`object/${BUCKET}/${path}`, { method: "POST", headers: { "Content-Type": mime || "application/octet-stream", "x-upsert": "true" }, body: new Uint8Array(data) });
    if (r.ok) return;
    if (attempt >= 2) throw new Error(`upload ${r.status}: ${(await r.text()).slice(0, 120)}`);
    await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
  }
}
async function download(path: string): Promise<Buffer> {
  const r = await sb(`object/authenticated/${BUCKET}/${path}`);
  if (!r.ok) throw new Error(`The file couldn’t be read from storage (${r.status}).`);
  return Buffer.from(await r.arrayBuffer());
}
/** The stored object's size, or null when it isn't there. */
async function storedSize(path: string): Promise<number | null> {
  const r = await sb(`object/authenticated/${BUCKET}/${path}`, { method: "HEAD" });
  if (!r.ok) return null;
  const n = Number(r.headers.get("content-length"));
  return Number.isFinite(n) ? n : null;
}

/** Files that don't belong to a brand (the example ad for each ad style), kept at a fixed path. */
export const putFile = (path: string, mime: string, data: Buffer) => upload(path, mime, data);
export const getFile = (path: string): Promise<Buffer | null> => download(path).catch(() => null);

/** A link that opens the stored file for an hour. */
export async function signedLink(path: string, downloadAs?: string): Promise<string> {
  const s = storage()!;
  const r = await sb(`object/sign/${BUCKET}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 3600 }) });
  if (!r.ok) throw new Error(`sign ${r.status}`);
  const { signedURL } = (await r.json()) as { signedURL: string };
  return `${s.url}/storage/v1${signedURL}${downloadAs ? `&download=${encodeURIComponent(downloadAs)}` : ""}`;
}

export type AssetFile = { id: string; brandId: string; kind: schema.AssetKind; name: string; mime: string; size: number; meta: (typeof A.$inferSelect)["meta"]; data: Buffer };
/** Assets with their bytes, wherever they are kept. Use for anything that needs the file itself (models, ffmpeg, re-encoding). */
export async function readAssets(where: SQL | undefined, limit = 40): Promise<AssetFile[]> {
  const rows = await db.select({ id: A.id, brandId: A.brandId, kind: A.kind, name: A.name, mime: A.mime, size: A.size, meta: A.meta,
    data: sql<Buffer | null>`case when jsonb_exists(${A.meta}, 'stored') then null else ${A.data} end` }).from(A).where(where).limit(limit);
  const out: AssetFile[] = [];
  for (const r of rows) out.push({ ...r, data: r.data ? Buffer.from(r.data) : await download(r.meta.stored!) });
  return out;
}

/** Save a new file: the bytes go to storage, the row keeps a thumbnail. Returns `[{ id }]`, like an insert … returning. */
export async function saveAsset(v: typeof A.$inferInsert): Promise<{ id: string }[]> {
  const data = Buffer.from(v.data), id = v.id ?? randomUUID();
  let stored: string | null = null;
  if (storage()) {
    const path = `${v.brandId}/${id}`;
    try { await upload(path, v.mime, data); stored = path; } catch (e) { console.error("asset upload", id, (e as Error).message); }
  }
  let thumb: Buffer | null = null;
  if (/^(image|video)\//.test(v.mime) && v.mime !== "image/svg+xml") {
    const { thumbnail } = await import("../audience/media");
    thumb = await thumbnail(data, v.mime).catch(() => null);
  }
  await db.insert(A).values({ ...v, id, size: v.size ?? data.length, data: stored ? Buffer.alloc(0) : data, thumb, meta: { ...(v.meta ?? {}), ...(stored ? { stored } : {}) } });
  return [{ id }];
}

/** Delete assets and their stored files. */
export async function deleteAssets(where: SQL | undefined): Promise<void> {
  const rows = await db.delete(A).where(where).returning({ stored: sql<string | null>`${A.meta}->>'stored'` });
  const paths = rows.map((r) => r.stored).filter((p): p is string => Boolean(p));
  if (paths.length && storage()) await sb(`object/${BUCKET}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: paths }) }).catch(() => undefined);
}

/** Move one file that still has its bytes in the database: upload, check it arrived whole, then clear the bytes from the row. */
async function moveOne(id: string): Promise<boolean> {
  const [a] = await db.select({ id: A.id, brandId: A.brandId, mime: A.mime, meta: A.meta, data: A.data, hasThumb: sql<boolean>`${A.thumb} is not null` }).from(A).where(eq(A.id, id));
  if (!a) return false;
  const data = Buffer.from(a.data);
  if (!data.length) return true;
  const path = `${a.brandId}/${a.id}`;
  if ((await storedSize(path)) !== data.length) {
    await upload(path, a.mime, data);
    if ((await storedSize(path)) !== data.length) throw new Error("size mismatch after upload");
  }
  let thumb: Buffer | null = null;
  if (!a.hasThumb && /^(image|video)\//.test(a.mime) && a.mime !== "image/svg+xml") {
    const { thumbnail } = await import("../audience/media");
    thumb = await thumbnail(data, a.mime).catch(() => null);
  }
  await db.update(A).set({ data: Buffer.alloc(0), size: data.length, meta: { ...a.meta, stored: path }, ...(thumb ? { thumb } : {}) }).where(eq(A.id, id));
  return true;
}

let moving = false;
/** Move files still in the database into storage, one at a time, for up to `budgetMs`. Returns how many are left. */
export async function moveToStorage(brandId: string | null, budgetMs = 120_000): Promise<number> {
  if (!storage()) return 0;
  const scope = brandId ? and(eq(A.brandId, brandId), sql`octet_length(${A.data}) > 0`) : sql`octet_length(${A.data}) > 0`;
  const left = async () => (await db.select({ n: sql<number>`count(*)::int` }).from(A).where(scope))[0].n;
  if (moving) return left();
  moving = true;
  try {
    const until = Date.now() + budgetMs;
    while (Date.now() < until) {
      const [next] = await db.select({ id: A.id }).from(A).where(scope).orderBy(sql`${A.createdAt} desc`).limit(1);
      if (!next) break;
      try { await moveOne(next.id); }
      catch (e) { console.error("move to storage", next.id, (e as Error).message); break; }
    }
  } finally { moving = false; }
  return left();
}

/**
 * Files in storage that no row points at any more — left behind when rows were deleted without their files. Nothing in Kaviar can
 * open them. Listing is read-only; removing is permanent.
 */
export async function leftoverFiles(brandId: string): Promise<{ paths: string[]; bytes: number }> {
  if (!storage()) return { paths: [], bytes: 0 };
  const kept = new Set((await db.select({ p: sql<string | null>`${A.meta}->>'stored'` }).from(A).where(eq(A.brandId, brandId))).map((r) => r.p).filter(Boolean) as string[]);
  const paths: string[] = [];
  let bytes = 0;
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const r = await sb(`object/list/${BUCKET}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefix: `${brandId}/`, limit: 1000, offset }) });
    if (!r.ok) throw new Error(`list ${r.status}`);
    const items = (await r.json()) as { name: string; id: string | null; metadata?: { size?: number } | null }[];
    for (const it of items) { const path = `${brandId}/${it.name}`; if (it.id && !kept.has(path)) { paths.push(path); bytes += it.metadata?.size ?? 0; } }
    if (items.length < 1000) break;
  }
  return { paths, bytes };
}
export async function removeLeftovers(brandId: string): Promise<number> {
  const { paths } = await leftoverFiles(brandId);
  let done = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const r = await sb(`object/${BUCKET}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: paths.slice(i, i + 100) }) });
    if (r.ok) done += ((await r.json()) as unknown[]).length;
  }
  return done;
}
