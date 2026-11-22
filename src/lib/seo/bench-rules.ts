import { LIMIT, scores, type Audit } from "./types";

/**
 * The baseline: a brand's store scores against its competitors'. One set of rules for everyone, so a score means the same thing on
 * every site and the brand's score here is the very number shown on its Store screen:
 *  - search title: written on purpose (not just the product's name) and short enough to show whole;
 *  - search description: written on purpose (not just the opening of the product text) and 50–165 letters;
 *  - pictures: each of the product's own pictures says what it shows;
 *  - product text: at least 50 words about the product.
 * The brand is read through Shopify (every product). A competitor can only be read from outside (a few product pages), so each rule is
 * worked out from what its public page shows — which, on a Shopify store, comes to the same answer. Pure, so it can be tested.
 */
export type Rival = { name: string; url: string; by: "research" | "team" };
export type SiteRead = { name: string; url: string; you: boolean; at: string; audit: Audit | null; note?: string };
/** What a store's public product list says about one product (Shopify publishes it); used to tell a written title from the product's name, and the product's own pictures from the rest of the page. */
export type ProductInfo = { url: string; name: string | null; text: string | null; images: string[] };
export type Point = { at: string; you: Record<"seo" | "ai" | "speed", number | null>; avg: Record<"seo" | "ai" | "speed", number | null> };
export type Bench = { at: string; sites: SiteRead[]; history?: Point[] }; // history: one point per read, so a trend can be drawn once there are a few

export const PUBLIC = { pages: 3, mainWords: 150 } as const; // product pages read on a competitor's site; and, only where a site publishes no product text, how many words the page itself must carry
const plain = (s: string) => s.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;|&rsquo;/g, "’").replace(/&quot;/g, "\"").replace(/&nbsp;/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
const attr = (tag: string, name: string) => new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)?.slice(2).find((x) => x != null) ?? null;

export const pageTitle = (html: string) => plain(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
/** <meta name="…" content="…"> in either order, by name or by property. */
export function metaContent(html: string, name: string): string {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const k = (attr(m[0], "name") ?? attr(m[0], "property") ?? "").toLowerCase();
    if (k === name.toLowerCase()) return plain(attr(m[0], "content") ?? "");
  }
  return "";
}

/** Product pages a home page links to, on the same site, each once. */
export function productLinks(html: string, base: string, max: number = PUBLIC.pages): string[] {
  const out = new Set<string>(), host = new URL(base).hostname.replace(/^www\./, "");
  for (const m of html.matchAll(/<a\b[^>]*\shref=["']([^"'#]+)["']/gi)) {
    let u: URL;
    try { u = new URL(m[1], base); } catch { continue; }
    if (u.hostname.replace(/^www\./, "") !== host) continue;
    const at = /\/products?\/([^/?]+)\/?$/.exec(u.pathname);
    if (!at || /^(all|new|sale|category|categories)$/i.test(at[1])) continue;
    out.add(`${u.origin}${u.pathname.replace(/^.*(\/products?\/[^/]+)\/?$/, "$1")}`); // "/collections/x/products/y" and "/products/y" are the same page
    if (out.size >= max) break;
  }
  return [...out];
}
/** The addresses in a sitemap file. */
export const sitemapLocs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => plain(m[1]));

const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const strip = (html: string) => plain(html.replace(/<[^>]+>/g, " "));
const wordsIn = (t: string) => (t ? t.split(/\s+/).filter(Boolean).length : 0);

/** A picture's file, whatever size it is served at: ".../files/Toner_800x.jpg?v=1&width=600" and ".../files/toner.jpg" are the same picture. */
export function fileKey(url: string): string {
  const name = decodeURIComponent(url.split(/[?#]/)[0].split("/").pop() ?? "").toLowerCase();
  return name.replace(/_(\{width\}x|\d+x\d*|\d*x\d+|pico|icon|thumb|small|compact|medium|large|grande|original|master)(@\dx)?(?=\.[a-z0-9]+$)/, ""); // "{width}" is how some themes write a picture that loads later
}
/** The product a page describes, from the facts it publishes for machines (schema.org Product). */
export function productLd(html: string): { name: string | null; description: string | null; images: string[] } {
  const out = { name: null as string | null, description: null as string | null, images: [] as string[] };
  const walk = (x: unknown) => {
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>, t = ([] as unknown[]).concat(o["@type"] ?? []);
    if ((t.includes("Product") || t.includes("ProductGroup")) && !out.name) {
      if (typeof o.name === "string") out.name = plain(o.name);
      if (typeof o.description === "string") out.description = strip(o.description);
      for (const i of ([] as unknown[]).concat(o.image ?? [])) { const u = typeof i === "string" ? i : i && typeof i === "object" ? (i as { url?: unknown }).url : null; if (typeof u === "string") out.images.push(u); }
    }
    walk(o["@graph"]);
  };
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) { try { walk(JSON.parse(m[1].trim())); } catch { /* a broken block is the same as none */ } }
  return out;
}
/** The page title without the store's own name on the end (or the front) — Google shows the store's name separately. */
export function titleBase(title: string, site: string): string {
  const s = site.trim();
  if (!s) return title;
  const e = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return title.replace(new RegExp(`\\s*[-–—|:·•]?\\s*${e}\\s*$`, "i"), "").replace(new RegExp(`^\\s*${e}\\s*[-–—|:·•]\\s*`, "i"), "").trim() || title;
}

export type PageRead = {
  title: string; base: string; description: string; name: string | null; // base: the title without the store's name; name: the product's own name
  text: string | null; words: number | null; mainWords: number; // the product's text where the site publishes it; else only the words on the page
  pictures: number | null; described: number | null; // the product's own pictures found on the page, and how many say what they show; null when the site doesn't say which pictures are the product's
};
/** What one product page says to Google and to an AI assistant that doesn't run scripts. */
export function readPage(raw: string, info: Partial<ProductInfo> = {}, site = ""): PageRead {
  const ld = productLd(raw), name = info.name ?? ld.name, text = info.text ?? ld.description;
  const title = pageTitle(raw), html = raw.replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, " ");
  const from = html.search(/<main\b/i), to = html.search(/<\/main>/i), main = from >= 0 ? html.slice(from, to > from ? to : undefined) : html.slice(Math.max(0, html.search(/<body\b/i)));
  // The product's own pictures, wherever the page shows them (gallery, thumbnails): described if any copy carries more than the product's name.
  const want = new Set((info.images?.length ? info.images : ld.images).map(fileKey).filter(Boolean)), seen = new Map<string, boolean>();
  if (want.size) for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const alt = plain(attr(m[0], "alt") ?? ""), real = Boolean(alt) && (!name || norm(alt) !== norm(name));
    const srcs = [attr(m[0], "src"), attr(m[0], "data-src"), ...(attr(m[0], "srcset") ?? attr(m[0], "data-srcset") ?? "").split(",").map((x) => x.trim().split(/\s+/)[0])].filter(Boolean) as string[];
    for (const k of new Set(srcs.map(fileKey))) if (want.has(k)) seen.set(k, (seen.get(k) ?? false) || real);
  }
  return { title, base: titleBase(title, site || metaContent(raw, "og:site_name")), description: metaContent(raw, "description"), name: name ?? null, text: text ?? null, words: text != null ? wordsIn(text) : null,
    mainWords: wordsIn(strip(main)), pictures: want.size ? seen.size : null, described: want.size ? [...seen.values()].filter(Boolean).length : null };
}
/** The store's rules, on a public page. */
export const pageOk = (p: PageRead) => ({
  title: p.base.length > 0 && p.base.length <= LIMIT.title + 5 && (!p.name || norm(p.base) !== norm(p.name)), // its own wording, not just the product's name — and short enough to show whole
  description: p.description.length >= 50 && p.description.length <= LIMIT.description + 10 && !(p.text && norm(p.description).length >= 20 && norm(p.text).startsWith(norm(p.description).slice(0, 60))), // not just the opening of the product text
  text: p.words != null ? p.words >= LIMIT.thinWords : p.mainWords >= PUBLIC.mainWords,
});
/** A store's public product list (Shopify's /products.json), as the products to read — the ones the home page links to first. */
export function productList(json: unknown, origin: string, linked: string[] = [], max: number = PUBLIC.pages): ProductInfo[] {
  const list = (json as { products?: { handle?: unknown; title?: unknown; body_html?: unknown; images?: { src?: unknown }[] }[] } | null)?.products;
  if (!Array.isArray(list)) return [];
  const all = list.filter((p) => typeof p.handle === "string" && p.handle).map((p) => ({ url: `${origin}/products/${p.handle as string}`, name: typeof p.title === "string" ? plain(p.title) : null,
    text: typeof p.body_html === "string" ? strip(p.body_html) : "", images: (p.images ?? []).map((i) => i.src).filter((x): x is string => typeof x === "string") }));
  const rank = (u: string) => { const i = linked.findIndex((l) => l.replace(/\/$/, "").endsWith(new URL(u).pathname)); return i < 0 ? 1e6 : i; };
  return [...all].sort((a, b) => rank(a.url) - rank(b.url)).slice(0, max);
}

/** Is this page the site of the brand called `name`? Used to check an address Kaviar worked out before trusting it. */
export function isSiteOf(html: string, name: string): boolean {
  const n = norm(name);
  return n.length >= 3 && [pageTitle(html), metaContent(html, "og:site_name"), metaContent(html, "application-name")].some((x) => norm(x).includes(n));
}
/** Where a brand called `name` most likely lives: a source the research already cites on its own address, then name.com. */
export function guessSites(name: string, sources: string[]): string[] {
  const n = norm(name), out = new Set<string>();
  if (n.length < 3) return [];
  for (const s of sources) { try { const u = new URL(s); if (norm(u.hostname.replace(/^www\./, "").split(".").slice(0, -1).join("")).includes(n)) out.add(u.origin); } catch { /* not an address */ } }
  out.add(`https://www.${n}.com`);
  return [...out].slice(0, 3);
}
export function cleanUrl(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  try { const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`); return u.hostname.includes(".") ? u.origin : null; } catch { return null; }
}

// ---------------------------------------------------------------- comparing
export type MeasureKey = "seo" | "ai" | "speed" | "answer" | "code" | "apps" | "reviews" | "aiOpen" | "facts" | "title" | "description" | "alt" | "text";
export type Measure = { key: MeasureKey; name: string; unit: "score" | "pct" | "ms" | "kb" | "n" | "yes"; better: "high" | "low"; hint: string };
export const MEASURES: Measure[] = [
  { key: "seo", name: "SEO", unit: "score", better: "high", hint: "Search titles, descriptions, picture descriptions, review stars — out of 100" },
  { key: "ai", name: "AI search", unit: "score", better: "high", hint: "What ChatGPT, Claude and Perplexity can read and quote — out of 100" },
  { key: "speed", name: "Speed", unit: "score", better: "high", hint: "Google’s phone speed score when its test is on; otherwise the share of Kaviar’s speed checks that pass" },
  { key: "answer", name: "Answers in", unit: "ms", better: "low", hint: "How long the home page takes to start answering" },
  { key: "code", name: "Code", unit: "kb", better: "low", hint: "Script a phone downloads on the home page" },
  { key: "apps", name: "Apps", unit: "n", better: "low", hint: "Apps and outside services loading on the home page" },
  { key: "reviews", name: "Review stars", unit: "yes", better: "high", hint: "Ratings published so Google can show stars" },
  { key: "aiOpen", name: "AI allowed in", unit: "yes", better: "high", hint: "AI crawlers aren’t shut out" },
  { key: "facts", name: "Price readable", unit: "yes", better: "high", hint: "Price and stock published in the form Google and AI read" },
  { key: "title", name: "Search titles", unit: "pct", better: "high", hint: "Products with a search title written on purpose and short enough to show whole" },
  { key: "description", name: "Search descriptions", unit: "pct", better: "high", hint: "Products with a search description written on purpose, 50–165 letters" },
  { key: "alt", name: "Pictures described", unit: "pct", better: "high", hint: "Product pictures that say what they show" },
  { key: "text", name: "Enough to quote", unit: "pct", better: "high", hint: `Products with at least ${LIMIT.thinWords} words about them` },
];
export const measure = (key: MeasureKey) => MEASURES.find((m) => m.key === key)!;

/** One site's numbers, or null where it couldn't be measured. */
export function valuesOf(a: Audit): Record<MeasureKey, number | null> {
  const s = scores(a), home = a.speed?.pages.find((p) => p.key === "home");
  // A check saved before the plain number was kept still has it as text ("222 ms", "1.8 s", "32 KB", "1.2 MB", "3").
  const parse = (t: string | undefined) => { const m = /^([\d.]+)\s*(ms|s|KB|MB)?/.exec(t ?? ""); return m ? Number(m[1]) * ({ ms: 1, s: 1000, KB: 1000, MB: 1_000_000 }[m[2] ?? ""] ?? 1) : null; };
  const raw = (k: string) => { const c = home?.checks.find((x) => x.key === k); return c ? c.raw ?? parse(c.n) : null; };
  const site = (k: string) => { const c = a.site.find((x) => x.key === k); return c?.ok == null ? null : c.ok ? 1 : 0; };
  const share = (p: { ok: number; total: number }) => (p.total ? Math.round((p.ok / p.total) * 100) : null);
  const read = a.products > 0; // with no product page read, a score would rest on the home page alone — say nothing instead
  return {
    seo: read ? s.seo : null, ai: read ? s.ai : null, speed: s.speed ?? share(s.speedChecks), answer: raw("answer"), code: raw("scripts"), apps: raw("apps"),
    reviews: site("reviews"), aiOpen: site("ai"), facts: site("facts"), title: share(a.title), description: share(a.description), alt: share(a.alt), text: share(a.text),
  };
}
export function show(m: Measure, v: number | null): string {
  if (v == null) return "–";
  if (m.unit === "ms") return v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(1)} s`;
  if (m.unit === "kb") return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)} MB` : `${Math.round(v / 1000)} KB`;
  if (m.unit === "pct") return `${Math.round(v)}%`;
  if (m.unit === "yes") return v >= 0.5 ? "Yes" : "No";
  return String(Math.round(v));
}

export type Verdict = "ahead" | "level" | "behind";
export const VERDICT_NAME: Record<Verdict, string> = { ahead: "Ahead", level: "Average", behind: "Behind" };
export type Stand = { you: number | null; avg: number | null; best: number | null; n: number; verdict: Verdict | null };
/** Where the brand stands on one measure against the competitors that could be measured. "Average" means within a small margin of their average. */
export function stand(m: Measure, you: number | null, others: (number | null)[]): Stand {
  const v = others.filter((x): x is number => x != null);
  if (!v.length) return { you, avg: null, best: null, n: 0, verdict: null };
  const avg = v.reduce((n, x) => n + x, 0) / v.length, best = m.better === "high" ? Math.max(...v) : Math.min(...v);
  if (you == null) return { you, avg, best, n: v.length, verdict: null };
  const d = m.better === "high" ? you - avg : avg - you; // positive = the brand is better
  const margin = m.unit === "yes" ? 0.49 : m.unit === "score" || m.unit === "pct" ? 5 : Math.max(avg * 0.15, m.unit === "n" ? 1 : 0);
  return { you, avg, best, n: v.length, verdict: d > margin ? "ahead" : d < -margin ? "behind" : "level" };
}
export type Row = { m: Measure; s: Stand; each: (number | null)[] }; // each: one value per competitor, in order
/** `mine`: the brand's own store check — the same one its Store screen shows — so its numbers here are those numbers. */
export function compare(b: Bench, own: Audit | null): { rivals: SiteRead[]; rows: Row[] } {
  const rivals = b.sites.filter((s) => !s.you);
  const mine = own ? valuesOf(own) : null, theirs = rivals.map((r) => (r.audit ? valuesOf(r.audit) : null));
  // Speed is Google's 0–100 score when its test is on; otherwise it is the share of Kaviar's own speed checks that pass, and is named so.
  const google = own ? scores(own).speed != null : rivals.some((r) => r.audit && scores(r.audit).speed != null);
  const named = (m: Measure): Measure => (m.key === "speed" && !google ? { ...m, name: "Speed checks", unit: "pct", hint: "The share of Kaviar’s speed checks that pass on the home page and a product page" } : m);
  return { rivals, rows: MEASURES.map(named).map((m) => { const each = theirs.map((t) => t?.[m.key] ?? null); return { m, each, s: stand(m, mine?.[m.key] ?? null, each) }; }) };
}

/** The three headline numbers of one read, kept so a trend can be drawn later. */
export function pointOf(b: Bench, own: Audit | null): Point {
  const rows = compare(b, own).rows, at = (k: string) => rows.find((r) => r.m.key === k)?.s, r = (v: number | null | undefined) => (v == null ? null : Math.round(v));
  return { at: b.at, you: { seo: r(at("seo")?.you), ai: r(at("ai")?.you), speed: r(at("speed")?.you) }, avg: { seo: r(at("seo")?.avg), ai: r(at("ai")?.avg), speed: r(at("speed")?.avg) } };
}
/** "3 of 4 have it" for a yes/no measure, "they 300 KB" for the rest — what the competitors do, in a few words. */
export const theyLine = (r: Row) => (r.m.unit === "yes" ? `${Math.round((r.s.avg ?? 0) * r.s.n)} of ${r.s.n} have it` : `they ${show(r.m, r.s.avg)}`);
