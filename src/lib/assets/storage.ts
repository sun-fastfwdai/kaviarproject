import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";

/**
 * Large brand assets (finished videos, big photos) are copied once into a private Supabase Storage bucket and opened through
 * short-lived signed links — a Vercel function can't send more than 4.5 MB itself. The database keeps the original.
 */
const BUCKET = "assets";
const storage = () => {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
};
async function sb(path: string, init: RequestInit = {}) {
  const s = storage();
  if (!s) throw new Error("Storage isn’t configured.");
  const headers = new Headers(init.headers);
  headers.set("apikey", s.key);
  if (!s.key.startsWith("sb_")) headers.set("Authorization", `Bearer ${s.key}`);
  return fetch(`${s.url}/storage/v1/${path}`, { ...init, headers, cache: "no-store" });
}

type Asset = { id: string; brandId: string; mime: string; meta: Record<string, unknown> };
/** A signed link to the asset in storage, uploading it the first time. Null when storage isn't set up. */
export async function storedLink(a: Asset, data: () => Promise<Buffer>, file: string, download = false): Promise<string | null> {
  const s = storage();
  if (!s) return null;
  const path = `${a.brandId}/${a.id}`;
  if (a.meta.stored !== path) {
    await sb("bucket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) }); // 409 when it exists
    const up = await sb(`object/${BUCKET}/${path}`, { method: "POST", headers: { "Content-Type": a.mime, "x-upsert": "true" }, body: new Uint8Array(await data()) });
    if (!up.ok) throw new Error(`upload ${up.status}: ${(await up.text()).slice(0, 120)}`);
    await db.update(schema.brandAssets).set({ meta: { ...(a.meta as object), stored: path } }).where(eq(schema.brandAssets.id, a.id));
  }
  const r = await sb(`object/sign/${BUCKET}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 3600 }) });
  if (!r.ok) throw new Error(`sign ${r.status}`);
  const { signedURL } = (await r.json()) as { signedURL: string };
  return `${s.url}/storage/v1${signedURL}${download ? `&download=${encodeURIComponent(file)}` : ""}`;
}

/** Copy a new asset into storage right away (videos, finished cuts), so the first person to open it doesn't wait. */
export async function keepInStorage(assetId: string): Promise<void> {
  if (!storage()) return;
  const [a] = await db.select({ id: schema.brandAssets.id, brandId: schema.brandAssets.brandId, mime: schema.brandAssets.mime, meta: schema.brandAssets.meta, data: schema.brandAssets.data }).from(schema.brandAssets).where(eq(schema.brandAssets.id, assetId));
  if (!a) return;
  const { thumbnail } = await import("../audience/media");
  const t = await thumbnail(Buffer.from(a.data), a.mime).catch(() => null);
  if (t) await db.update(schema.brandAssets).set({ thumb: t }).where(eq(schema.brandAssets.id, assetId));
  await storedLink(a, async () => Buffer.from(a.data), "file").catch((e) => console.error("keep in storage", assetId, (e as Error).message));
}
