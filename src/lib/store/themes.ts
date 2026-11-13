import "server-only";
import { shopifyGraphql } from "../shopify/client";
import { dawnIndexJson } from "./build";
import type { StoreContent } from "../db/schema";

/**
 * Kaviar Starter — Kaviar's own base theme (a Dawn fork with Kaviar's sections) — lives in Supabase Storage.
 * Kaviar installs it in a brand's store as an unpublished theme, then writes Remy's content into it.
 * Every other theme comes from Shopify: what's already in the store (including themes the merchant bought).
 */
const BUCKET = "themes";
const STARTER = "kaviar-starter/latest.zip";

const storage = () => {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
};
export const storageReady = () => Boolean(storage());

async function sb(path: string, init: RequestInit = {}) {
  const s = storage();
  if (!s) throw new Error("Kaviar’s theme storage isn’t switched on yet.");
  return fetch(`${s.url}/storage/v1/${path}`, { ...init, headers: { Authorization: `Bearer ${s.key}`, apikey: s.key, ...(init.headers ?? {}) }, cache: "no-store" });
}

/** The current Kaviar Starter in storage: size and when it was uploaded, or null. */
export async function starterInfo(): Promise<{ size: number; updatedAt: string } | null> {
  if (!storageReady()) return null;
  const r = await sb(`object/list/${BUCKET}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefix: "kaviar-starter/", search: "latest.zip", limit: 1 }) });
  if (!r.ok) return null;
  const [f] = (await r.json()) as { name: string; updated_at: string; metadata?: { size?: number } }[];
  return f ? { size: f.metadata?.size ?? 0, updatedAt: f.updated_at } : null;
}

/** Upload a new Kaviar Starter zip (creates the private bucket the first time). */
export async function uploadStarter(zip: Buffer): Promise<void> {
  await sb("bucket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) }); // 409 if it exists — fine
  const r = await sb(`object/${BUCKET}/${STARTER}`, { method: "POST", headers: { "Content-Type": "application/zip", "x-upsert": "true" }, body: new Uint8Array(zip) });
  if (!r.ok) throw new Error(`Upload failed (${r.status})`);
}

/** A short-lived link Shopify downloads the theme from. */
async function starterLink(): Promise<string> {
  const r = await sb(`object/sign/${BUCKET}/${STARTER}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 900 }) });
  if (!r.ok) throw new Error("Kaviar Starter isn’t in storage yet.");
  const { signedURL } = (await r.json()) as { signedURL: string };
  return `${storage()!.url}/storage/v1${signedURL}`;
}

export type StoreTheme = { id: string; name: string; role: string; processing: boolean; updatedAt: string };

/** Themes in the brand's store, straight from Shopify (needs read_themes). */
export async function storeThemes(connectionId: string): Promise<StoreTheme[]> {
  const r = await shopifyGraphql<{ themes: { nodes: StoreTheme[] } }>(connectionId, `{ themes(first: 20) { nodes { id name role processing updatedAt } } }`, {});
  return r.themes.nodes;
}

/** Install Kaviar Starter as an unpublished theme (needs write_themes). Shopify processes it in the background. */
export async function installStarter(connectionId: string, brand: string): Promise<StoreTheme> {
  const src = await starterLink();
  const r = await shopifyGraphql<{ themeCreate: { theme: StoreTheme | null; userErrors: { message: string }[] } }>(connectionId,
    `mutation($src: URL!, $name: String) { themeCreate(source: $src, name: $name, role: UNPUBLISHED) { theme { id name role processing updatedAt } userErrors { message } } }`,
    { src, name: `Kaviar Starter · ${brand}` });
  if (!r.themeCreate.theme) throw new Error(r.themeCreate.userErrors[0]?.message ?? "Shopify didn’t create the theme.");
  return r.themeCreate.theme;
}

/** Write Remy's homepage into a theme (needs write_themes). Works on Kaviar Starter and Dawn-based themes. */
export async function applyHomepage(connectionId: string, themeId: string, content: StoreContent): Promise<void> {
  const r = await shopifyGraphql<{ themeFilesUpsert: { userErrors: { message: string }[] } }>(connectionId,
    `mutation($id: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) { themeFilesUpsert(themeId: $id, files: $files) { userErrors { message } } }`,
    { id: themeId, files: [{ filename: "templates/index.json", body: { type: "TEXT", value: dawnIndexJson(content) } }] });
  if (r.themeFilesUpsert.userErrors.length) throw new Error(r.themeFilesUpsert.userErrors[0].message);
}

/** Make a theme live (needs write_themes). The old one stays as an unpublished backup. */
export async function publishTheme(connectionId: string, themeId: string): Promise<void> {
  const r = await shopifyGraphql<{ themePublish: { userErrors: { message: string }[] } }>(connectionId,
    `mutation($id: ID!) { themePublish(id: $id) { userErrors { message } } }`, { id: themeId });
  if (r.themePublish.userErrors.length) throw new Error(r.themePublish.userErrors[0].message);
}
