import "server-only";
import { z } from "zod";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { ask, aiReady, type Block } from "../ai/client";
import { fit, LIMIT } from "./types";

/**
 * Cleo writes the replacement for each open field — a search title, a search description, a description of a picture — from what the
 * product page already says and what the picture shows. She adds no fact the store doesn't state. Lengths are enforced in code.
 */
const F = schema.storeFixes;
const SYSTEM = `You write the search listing for products in an online store, so Google and AI assistants (ChatGPT, Claude, Perplexity) describe each product correctly.
Rules:
- Use only facts stated in the product text given to you, or plainly visible in a picture. Never invent ingredients, sizes, results, awards, reviews or claims. No medical or cure claims.
- searchTitle: at most 60 characters. The product's name plus what it is or who it is for, in the words a shopper would type. No brand slogans, no ALL CAPS, no emoji.
- searchDescription: 120 to 155 characters, one or two plain sentences: what it is, who it is for, the main benefit the product text states. No "best", "#1", "shop now".
- alts: one for each numbered picture, at most 12 words, saying what the picture shows (the product by name when it is in the picture, plus what is visible: packaging, texture, a hand, a face). Not "image of".
- Keep the brand's own tone and spelling. Write in the language of the product text.`;
const OUT = z.object({
  searchTitle: z.string(), searchDescription: z.string(),
  alts: z.array(z.object({ picture: z.number().describe("the picture's number"), alt: z.string() })),
});
const small = (url: string) => url + (url.includes("?") ? "&" : "?") + "width=512";

type Row = typeof F.$inferSelect;
async function one(brand: { name: string; category: string | null; positioning: string | null }, rows: Row[], text: string): Promise<number> {
  const pics = rows.filter((r) => r.kind === "alt" && r.image).slice(0, 8), p = rows[0];
  const content: Block[] = [{ type: "text", text: JSON.stringify({
    brand: brand.name, category: brand.category, howTheBrandTalks: brand.positioning, product: p.productTitle, productText: text.slice(0, 3000) || "(the page has no text)",
    need: { searchTitle: rows.some((r) => r.kind === "search_title"), searchDescription: rows.some((r) => r.kind === "search_description"), pictures: pics.length },
  }) }];
  pics.forEach((r, i) => content.push({ type: "text", text: `Picture ${i + 1}:` }, { type: "image", source: { type: "url", url: small(r.image!) } }));
  const out = await ask("cleo", { system: SYSTEM, content, schema: OUT, maxTokens: 1200 });
  if (!out) return 0;
  let n = 0;
  const set = async (id: string, after: string) => { if (after) { await db.update(F).set({ after, updatedAt: new Date() }).where(eq(F.id, id)); n++; } };
  for (const r of rows) {
    if (r.kind === "search_title") await set(r.id, fit(out.searchTitle, LIMIT.title));
    if (r.kind === "search_description") await set(r.id, fit(out.searchDescription, LIMIT.description));
  }
  for (const [i, r] of pics.entries()) await set(r.id, fit(out.alts.find((a) => a.picture === i + 1)?.alt ?? "", LIMIT.alt));
  return n;
}

/** Write what is still unwritten, product by product, within a time budget. Returns how many fields got a replacement. */
export async function writeFixes(brandId: string, budgetMs = 150_000): Promise<number> {
  if (!aiReady()) return 0;
  const t0 = Date.now();
  const [open, [b], [pos], texts] = await Promise.all([
    db.select().from(F).where(and(eq(F.brandId, brandId), eq(F.status, "proposed"), isNull(F.after), ne(F.kind, "thin"))).limit(600),
    db.select({ name: schema.brands.name, category: schema.brands.category }).from(schema.brands).where(eq(schema.brands.id, brandId)),
    db.select({ statement: sql<string | null>`${schema.marketResearch.positioning}->>'statement'` }).from(schema.marketResearch)
      .where(and(eq(schema.marketResearch.brandId, brandId), sql`${schema.marketResearch.positioning} is not null`)).orderBy(desc(schema.marketResearch.updatedAt)).limit(1).catch(() => []),
    productTexts(brandId),
  ]);
  if (!open.length || !b) return 0;
  const groups = [...Map.groupBy(open, (r) => r.productGid).values()];
  let n = 0;
  for (let i = 0; i < groups.length && Date.now() - t0 < budgetMs; i += 4)
    n += (await Promise.all(groups.slice(i, i + 4).map((g) => one({ ...b, positioning: pos?.statement ?? null }, g, texts.get(g[0].productGid) ?? "").catch(() => 0)))).reduce((a, x) => a + x, 0);
  return n;
}

/** Each product's own page text, read fresh from the store (it is what Cleo may draw facts from). */
async function productTexts(brandId: string): Promise<Map<string, string>> {
  const { shopifyGraphql } = await import("../shopify/client");
  const [c] = await db.select({ id: schema.connections.id }).from(schema.connections).where(and(eq(schema.connections.brandId, brandId), eq(schema.connections.provider, "shopify"), eq(schema.connections.status, "connected")));
  const out = new Map<string, string>();
  if (!c) return out;
  type R = { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { id: string; description: string; productType: string | null; priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } } | null }[] } };
  let after: string | null = null;
  for (let i = 0; i < 6; i++) {
    const r: R = await shopifyGraphql<R>(c.id, `query($after: String) { products(first: 50, after: $after, query: "status:active") { pageInfo { hasNextPage endCursor } nodes { id description productType priceRangeV2 { minVariantPrice { amount currencyCode } } } } }`, { after }).catch(() => ({ products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } }));
    for (const p of r.products.nodes) out.set(p.id, [p.productType ? `Type: ${p.productType}.` : "", p.description].filter(Boolean).join(" "));
    if (!r.products.pageInfo.hasNextPage) break;
    after = r.products.pageInfo.endCursor;
  }
  return out;
}
