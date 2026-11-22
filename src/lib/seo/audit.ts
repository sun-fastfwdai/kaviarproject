import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { shopifyGraphql } from "../shopify/client";
import type { FixKind } from "../db/schema";
import { measureSpeed } from "./speed";
import { blockedBots, check, productFacts, type Audit, type ProductRead as Node, type SiteCheck } from "./types";

/**
 * Read the store the way Google and an AI assistant do, and write down every field that should change. Nothing here is a model's opinion:
 * each finding is a fixed rule applied to what the store says today (a missing search description, a picture with no description, a page
 * shut to AI crawlers). One row per field in store_fixes; checking again never duplicates and drops what was fixed elsewhere.
 */
const F = schema.storeFixes;
type Page = { shop: { name: string; primaryDomain: { url: string } | null }; products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Node[] } };
const QUERY = `query($after: String) {
  shop { name primaryDomain { url } }
  products(first: 40, after: $after, query: "status:active", sortKey: TITLE) {
    pageInfo { hasNextPage endCursor }
    nodes { id title handle onlineStoreUrl description seo { title description } media(first: 10) { nodes { ... on MediaImage { id alt image { url } } } } }
  }
}`;
async function get(url: string): Promise<{ url: string; status: number; text: string; ms: number } | null> {
  try {
    const t0 = performance.now();
    const res = await fetch(url, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(12_000), headers: { "User-Agent": "Mozilla/5.0 (compatible; KaviarStoreCheck/1.0)", Accept: "text/html,text/plain,*/*" } });
    const ms = performance.now() - t0; // until the store starts answering — the page is only opened once, so the store is never hammered
    return { url: res.url, status: res.status, text: (await res.text()).slice(0, 1_500_000), ms };
  } catch { return null; }
}
const tag = (html: string, re: RegExp) => (re.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();

/** The store-wide checks, read from the public storefront like any visitor. */
type Opened = { key: "home" | "product"; name: string; url: string; html: string; ms: number };
async function site(domain: string | null, productUrl: string | null): Promise<{ checks: SiteCheck[]; pages: Opened[] }> {
  const cant = (key: SiteCheck["key"], name: string, why: string): SiteCheck => ({ key, name, ok: null, detail: why });
  const names = { open: "Open to Google", home: "Home page title and description", ai: "AI assistants may read it", facts: "Price and stock readable by machines", reviews: "Review stars reach Google" } as const;
  if (!domain) return { pages: [], checks: (Object.keys(names) as SiteCheck["key"][]).map((k) => cant(k, names[k], "The store has no public address yet")) };
  const [home, robots, product] = await Promise.all([get(domain), get(`${domain.replace(/\/$/, "")}/robots.txt`), productUrl ? get(productUrl) : Promise.resolve(null)]);
  if (!home || home.status >= 400) return { pages: [], checks: (Object.keys(names) as SiteCheck["key"][]).map((k) => cant(k, names[k], "The store didn’t answer — Kaviar will try again tomorrow")) };
  const locked = /\/password\b/.test(new URL(home.url).pathname);
  const noindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(home.text);
  const out: SiteCheck[] = [];
  out.push(locked ? { key: "open", name: names.open, ok: false, detail: "The store is behind a password. Nobody outside can see it — not shoppers, not Google.", how: "Shopify admin › Online Store › Preferences › remove the password" }
    : noindex ? { key: "open", name: names.open, ok: false, detail: "The home page tells Google not to list it.", how: "Remove the “noindex” line from the theme" }
    : { key: "open", name: names.open, ok: true, detail: "Anyone can open the store, and Google may list it" });
  if (locked) return { pages: [], checks: [...out, ...(["home", "ai", "facts", "reviews"] as const).map((k) => cant(k, names[k], "Can’t be checked until the password is off"))] };
  const pages: Opened[] = [{ key: "home", name: "Home page", url: home.url, html: home.text, ms: home.ms }];
  const title = tag(home.text, /<title[^>]*>([\s\S]*?)<\/title>/i), desc = tag(home.text, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  out.push(title && desc ? { key: "home", name: names.home, ok: true, detail: `“${title.slice(0, 70)}”` }
    : { key: "home", name: names.home, ok: false, detail: !title ? "The home page has no title" : "The home page has no description for Google", how: "Shopify admin › Online Store › Preferences › Title and meta description" });
  const shut = robots && robots.status < 400 ? blockedBots(robots.text) : [];
  out.push(shut.length ? { key: "ai", name: names.ai, ok: false, detail: `The store tells ${shut.join(", ")} to stay out`, how: "Remove those lines from robots.txt in the theme" }
    : { key: "ai", name: names.ai, ok: true, detail: "ChatGPT, Claude, Perplexity and Google’s AI are allowed in" });
  if (!product || product.status >= 400) return { pages, checks: [...out, cant("facts", names.facts, "No product page could be opened"), cant("reviews", names.reviews, "No product page could be opened")] };
  pages.push({ key: "product", name: "Product page", url: product.url, html: product.text, ms: product.ms });
  const f = productFacts(product.text);
  out.push(f.found && f.price ? { key: "facts", name: names.facts, ok: true, detail: "Product pages publish name, price and stock in the form Google and AI read" }
    : { key: "facts", name: names.facts, ok: false, detail: "Product pages don’t publish price and stock in the form Google and AI read", how: "Use a current Shopify theme — they include it" });
  out.push(f.reviews ? { key: "reviews", name: names.reviews, ok: true, detail: "Ratings are published with the product" }
    : { key: "reviews", name: names.reviews, ok: false, detail: "No rating is published with the product, so no stars in Google", how: "Add a reviews app that publishes ratings (Judge.me, Loox, Yotpo)" });
  return { checks: out, pages };
}

/** Read the whole store, bring store_fixes in line with what is true today, and return the totals. */
export async function audit(brandId: string, connectionId: string): Promise<{ audit: Audit; added: number }> {
  const nodes: Node[] = [];
  let after: string | null = null, domain: string | null = null;
  for (let i = 0; i < 6; i++) {
    const page: Page = await shopifyGraphql<Page>(connectionId, QUERY, { after });
    domain = page.shop.primaryDomain?.url ?? null;
    nodes.push(...page.products.nodes);
    if (!page.products.pageInfo.hasNextPage) break;
    after = page.products.pageInfo.endCursor;
  }
  const found = nodes.flatMap(check), byKey = new Map(found.map((f) => [f.key, f]));
  const rows = await db.select().from(F).where(eq(F.brandId, brandId));
  const have = new Map(rows.map((r) => [r.key, r]));
  let added = 0;
  const fresh = found.filter((f) => !have.has(f.key));
  for (let i = 0; i < fresh.length; i += 200) {
    const r = await db.insert(F).values(fresh.slice(i, i + 200).map((f) => ({ brandId, ...f }))).onConflictDoNothing().returning({ id: F.id });
    added += r.length;
  }
  // What the store says changed since the suggestion was written, or what Kaviar set was changed back: suggest afresh.
  for (const r of rows) {
    const f = byKey.get(r.key);
    if (!f) continue;
    if (r.status === "proposed" && (r.before !== f.before || r.problem !== f.problem)) await db.update(F).set({ before: f.before, problem: f.problem, productTitle: f.productTitle, image: f.image, after: r.before !== f.before ? null : r.after, updatedAt: new Date() }).where(eq(F.id, r.id));
    if (r.status === "applied" && f.before !== (r.after ?? "")) await db.update(F).set({ status: "proposed", before: f.before, problem: f.problem, after: null, appliedAt: null, by: null, updatedAt: new Date() }).where(eq(F.id, r.id));
  }
  // Open rows the store no longer needs (fixed in Shopify, or the product is gone).
  const gone = rows.filter((r) => r.status === "proposed" && !byKey.has(r.key)).map((r) => r.id);
  if (gone.length) await db.delete(F).where(and(eq(F.brandId, brandId), inArray(F.id, gone)));

  const pictures = nodes.reduce((n, p) => n + p.media.nodes.filter((m) => m.id && m.image?.url).length, 0);
  const bad = (k: FixKind) => found.filter((f) => f.kind === k).length;
  const seen = await site(domain, nodes.find((p) => p.onlineStoreUrl)?.onlineStoreUrl ?? null);
  const a: Audit = {
    at: new Date().toISOString(), domain, products: nodes.length, pictures,
    title: { ok: nodes.length - bad("search_title"), total: nodes.length }, description: { ok: nodes.length - bad("search_description"), total: nodes.length },
    alt: { ok: pictures - bad("alt"), total: pictures }, text: { ok: nodes.length - bad("thin"), total: nodes.length },
    site: seen.checks, speed: await measureSpeed(seen.pages).catch(() => undefined),
  };
  return { audit: a, added };
}
