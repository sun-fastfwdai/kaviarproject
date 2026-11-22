import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "../db";
import { shopifyGraphql } from "../shopify/client";

/**
 * Save fixes to the Shopify store. Kaviar only does this when the store has granted permission to edit products, changes only the
 * field named on the row, keeps what was there before so it can be put back, and trusts Shopify's own answer for whether it saved.
 */
const F = schema.storeFixes;
export const WRITE_SCOPE = "write_products";
type Row = typeof F.$inferSelect;

export type StoreAccess = { connected: boolean; sample: boolean; canFix: boolean; connectionId: string | null; shop: string | null };
export async function storeAccess(brandId: string): Promise<StoreAccess> {
  const C = schema.connections;
  const [c] = await db.select({ id: C.id, status: C.status, scopes: C.scopes, shop: C.externalId }).from(C).where(and(eq(C.brandId, brandId), eq(C.provider, "shopify")));
  const connected = c?.status === "connected";
  return { connected, sample: c?.status === "sample", canFix: connected && c.scopes.includes(WRITE_SCOPE), connectionId: connected ? c.id : null, shop: c?.shop ?? null };
}

const SEO = `mutation($product: ProductUpdateInput!) { productUpdate(product: $product) { product { id seo { title description } } userErrors { message } } }`;
const ALT = `mutation($productId: ID!, $media: [UpdateMediaInput!]!) { productUpdateMedia(productId: $productId, media: $media) { media { ... on MediaImage { id alt } } mediaUserErrors { message } } }`;
type SeoOut = { productUpdate: { product: { seo: { title: string | null; description: string | null } } | null; userErrors: { message: string }[] } };
type AltOut = { productUpdateMedia: { media: { id?: string; alt?: string | null }[] | null; mediaUserErrors: { message: string }[] } };

/** Why a save failed, in words a brand can act on — never a raw error. */
function plain(e: Error): string {
  if (e.name === "ShopifyAuthError") return "Shopify refused Kaviar’s access — reconnect the store";
  if (/access denied|access scope/i.test(e.message)) return "The store hasn’t allowed Kaviar to edit products";
  if (/does not exist|not found/i.test(e.message)) return "That product or picture is no longer in the store";
  return "Kaviar couldn’t reach Shopify — try again";
}

/** Write one product's fields (value = what to set; "" clears it back to Shopify's default). Returns the row ids that saved, and why any didn't. */
async function save(connectionId: string, productGid: string, rows: { id: string; kind: Row["kind"]; mediaGid: string | null; value: string }[]): Promise<{ ok: string[]; error: string | null }> {
  const ok: string[] = [];
  let error: string | null = null;
  const seo = rows.filter((r) => r.kind === "search_title" || r.kind === "search_description"), alt = rows.filter((r) => r.kind === "alt" && r.mediaGid);
  try {
    if (seo.length) {
      const input: Record<string, string | null> = {};
      for (const r of seo) input[r.kind === "search_title" ? "title" : "description"] = r.value || null;
      const out = await shopifyGraphql<SeoOut>(connectionId, SEO, { product: { id: productGid, seo: input } });
      const e = out.productUpdate.userErrors[0]?.message, now = out.productUpdate.product?.seo;
      if (e || !now) error = e ?? "Shopify didn’t save it";
      else for (const r of seo) if (((r.kind === "search_title" ? now.title : now.description) ?? "") === r.value) ok.push(r.id); else error = "Shopify kept the old text";
    }
    if (alt.length) {
      const out = await shopifyGraphql<AltOut>(connectionId, ALT, { productId: productGid, media: alt.map((r) => ({ id: r.mediaGid, alt: r.value })) });
      const e = out.productUpdateMedia.mediaUserErrors[0]?.message, back = new Map((out.productUpdateMedia.media ?? []).map((m) => [m.id, m.alt ?? ""]));
      if (e) error = e;
      else for (const r of alt) if (back.get(r.mediaGid!) === r.value) ok.push(r.id); else error = "Shopify kept the old description";
    }
  } catch (e) { error = plain(e as Error); }
  return { ok, error };
}

/** Apply the chosen fixes that have a replacement written. Returns one line per product changed. */
export async function applyFixes(brandId: string, ids: string[] | "all" | "empty-only", who: { memberId?: string | null; by: "team" | "autopilot" }): Promise<{ fixed: string[]; fields: number; failed: number; error: string | null }> {
  const access = await storeAccess(brandId);
  if (!access.canFix || !access.connectionId) return { fixed: [], fields: 0, failed: 0, error: "Kaviar may not change this store yet" };
  const where = [eq(F.brandId, brandId), eq(F.status, "proposed"), isNotNull(F.after)];
  if (Array.isArray(ids)) { if (!ids.length) return { fixed: [], fields: 0, failed: 0, error: null }; where.push(inArray(F.id, ids.slice(0, 500))); }
  if (ids === "empty-only") where.push(eq(F.before, "")); // on its own, Kaviar only fills what is empty — it never replaces words a person wrote
  const rows = (await db.select().from(F).where(and(...where)).limit(800)).filter((r) => r.kind !== "thin" && r.after);
  const fixed: string[] = [];
  let fields = 0, failed = 0, last: string | null = null;
  for (const group of Map.groupBy(rows, (r) => r.productGid).values()) {
    const r = await save(access.connectionId, group[0].productGid, group.map((x) => ({ id: x.id, kind: x.kind, mediaGid: x.mediaGid, value: x.after! })));
    const now = new Date();
    if (r.ok.length) {
      await db.update(F).set({ status: "applied", appliedAt: now, by: who.by, decidedBy: who.memberId ?? null, error: null, updatedAt: now }).where(inArray(F.id, r.ok));
      fixed.push(`${group[0].productTitle} · ${r.ok.length} field${r.ok.length === 1 ? "" : "s"}`);
      fields += r.ok.length;
    }
    const bad = group.filter((x) => !r.ok.includes(x.id)).map((x) => x.id);
    if (bad.length) { failed += bad.length; last = r.error; await db.update(F).set({ error: r.error ?? "Shopify didn’t save it", updatedAt: now }).where(inArray(F.id, bad)); }
  }
  return { fixed, fields, failed, error: last };
}

/** Put back what the store said before Kaviar changed it. The row is then left alone (skipped), so Autopilot doesn't redo it. */
export async function undoFix(brandId: string, id: string): Promise<{ error?: string }> {
  const access = await storeAccess(brandId);
  const [r] = await db.select().from(F).where(and(eq(F.brandId, brandId), eq(F.id, id), eq(F.status, "applied")));
  if (!r) return { error: "Nothing to undo" };
  if (!access.canFix || !access.connectionId) return { error: "Kaviar may not change this store" };
  const out = await save(access.connectionId, r.productGid, [{ id: r.id, kind: r.kind, mediaGid: r.mediaGid, value: r.before }]);
  if (!out.ok.length) return { error: out.error ?? "Shopify didn’t save it" };
  await db.update(F).set({ status: "skipped", appliedAt: null, by: null, updatedAt: new Date() }).where(eq(F.id, id));
  return {};
}
