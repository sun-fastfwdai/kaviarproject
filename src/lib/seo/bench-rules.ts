import { scores, type Audit } from "./types";

/**
 * The baseline: the same checks Kaviar runs on a brand's store, run on its competitors' public sites, so every number can be read as
 * "ahead", "average" or "behind". Nothing here is an estimate — each site is opened the way Google and an AI assistant open it, a
 * handful of product pages are read, and the counts are compared. Pure, so the rules can be tested without a site.
 */
export type Rival = { name: string; url: string; by: "research" | "team" };
export type SiteRead = { name: string; url: string; you: boolean; at: string; audit: Audit | null; note?: string };
export type Point = { at: string; you: Record<"seo" | "ai" | "speed", number | null>; avg: Record<"seo" | "ai" | "speed", number | null> };
export type Bench = { at: string; sites: SiteRead[]; history?: Point[] }; // history: one point per read, so a trend can be drawn once there are a few

/** What a public product page must say. Google cuts a title near 60 letters; a page title also carries the store's name, hence 70. */
export const PUBLIC = { title: 70, descMin: 50, descMax: 165, words: 150, pages: 3 } as const;

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
export function productLinks(html: string, base: string, max = PUBLIC.pages): string[] {
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

export type PageRead = { title: string; description: string; pictures: number; described: number; words: number };
/** What one product page says to Google and to an AI assistant that doesn't run scripts. */
export function readPage(raw: string): PageRead {
  const html = raw.replace(/<(script|style|video|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, " ");
  const from = html.search(/<main\b/i), to = html.search(/<\/main>/i);
  const main = from >= 0 ? html.slice(from, to > from ? to : undefined) : html.slice(Math.max(0, html.search(/<body\b/i)));
  const imgs = [...main.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]).filter((t) => { const src = attr(t, "src") ?? attr(t, "data-src") ?? attr(t, "srcset") ?? ""; return src && !src.startsWith("data:") && Number(attr(t, "width") ?? 999) >= 40; });
  const text = plain(main.replace(/<[^>]+>/g, " "));
  return { title: pageTitle(raw), description: metaContent(raw, "description"), pictures: imgs.length, described: imgs.filter((t) => (attr(t, "alt") ?? "").trim()).length, words: text ? text.split(/\s+/).length : 0 };
}
export const pageOk = (p: PageRead) => ({
  title: p.title.length > 0 && p.title.length <= PUBLIC.title,
  description: p.description.length >= PUBLIC.descMin && p.description.length <= PUBLIC.descMax,
  text: p.words >= PUBLIC.words,
});

/** Is this page the site of the brand called `name`? Used to check an address Kaviar worked out before trusting it. */
const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
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
  { key: "title", name: "Search titles", unit: "pct", better: "high", hint: `Product pages with a title of ${PUBLIC.title} letters or fewer` },
  { key: "description", name: "Search descriptions", unit: "pct", better: "high", hint: `Product pages with a description of ${PUBLIC.descMin}–${PUBLIC.descMax} letters` },
  { key: "alt", name: "Pictures described", unit: "pct", better: "high", hint: "Pictures on product pages that say what they show" },
  { key: "text", name: "Enough to quote", unit: "pct", better: "high", hint: `Product pages with ${PUBLIC.words} words or more` },
];
export const measure = (key: MeasureKey) => MEASURES.find((m) => m.key === key)!;

/** One site's numbers, or null where it couldn't be measured. */
export function valuesOf(a: Audit): Record<MeasureKey, number | null> {
  const s = scores(a), home = a.speed?.pages.find((p) => p.key === "home");
  const raw = (k: string) => home?.checks.find((c) => c.key === k)?.raw ?? null;
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
export function compare(b: Bench): { you: SiteRead | null; rivals: SiteRead[]; rows: Row[] } {
  const you = b.sites.find((s) => s.you) ?? null, rivals = b.sites.filter((s) => !s.you);
  const mine = you?.audit ? valuesOf(you.audit) : null, theirs = rivals.map((r) => (r.audit ? valuesOf(r.audit) : null));
  return { you, rivals, rows: MEASURES.map((m) => { const each = theirs.map((t) => t?.[m.key] ?? null); return { m, each, s: stand(m, mine?.[m.key] ?? null, each) }; }) };
}

/** The three headline numbers of one read, kept so a trend can be drawn later. */
export function pointOf(b: Bench): Point {
  const rows = compare(b).rows, at = (k: string) => rows.find((r) => r.m.key === k)?.s, r = (v: number | null | undefined) => (v == null ? null : Math.round(v));
  return { at: b.at, you: { seo: r(at("seo")?.you), ai: r(at("ai")?.you), speed: r(at("speed")?.you) }, avg: { seo: r(at("seo")?.avg), ai: r(at("ai")?.avg), speed: r(at("speed")?.avg) } };
}
/** "3 of 4 have it" for a yes/no measure, "they 300 KB" for the rest — what the competitors do, in a few words. */
export const theyLine = (r: Row) => (r.m.unit === "yes" ? `${Math.round((r.s.avg ?? 0) * r.s.n)} of ${r.s.n} have it` : `they ${show(r.m, r.s.avg)}`);
