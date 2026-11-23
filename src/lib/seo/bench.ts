import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { get, judge, type Got } from "./audit";
import { measureSpeed } from "./speed";
import { currentAudit, read, write } from "./run";
import { productFacts, type Audit } from "./types";
import { cleanUrl, compare, guessSites, isSiteOf, metaContent, pageOk, pointOf, productLinks, productList, PUBLIC, readPage, show, sitemapLocs, theyLine, type Bench, type MeasureKey, type ProductInfo, type Rival, type SiteRead } from "./bench-rules";
import type { MarketReport, RivalAds } from "../research/types";

/**
 * Reads a brand's competitors from outside: opens each public site like a visitor, reads the home page, robots.txt and a few product
 * pages, and applies the store's own rules to what each page shows (see bench-rules). The brand itself is not read here — its side of
 * the comparison is its own store check, the one its Store screen shows, so the two screens can never disagree. Every number is
 * measured by Kaviar on the day shown; nothing is an outside estimate.
 */
const RIVALS = "rivals", BENCH = "bench";

/**
 * The product pages to read: the ones the home page shows (what a store puts forward — its best sellers), topped up from the store's own
 * public product list, else the first in the sitemap. Where the store publishes that list (Shopify does), each page comes with the
 * product's name, text and pictures; otherwise those are read from the page itself.
 */
async function productPages(home: NonNullable<Got>): Promise<ProductInfo[]> {
  const root = new URL(home.url).origin, linked = productLinks(home.text, home.url, 12), bare = (url: string): ProductInfo => ({ url, name: null, text: null, images: [] });
  const list = await get(`${root}/products.json?limit=50`);
  let listed: ProductInfo[] = [];
  if (list && list.status < 400) { try { listed = productList(JSON.parse(list.text), root, linked, 50); } catch { /* not a Shopify store, or the list is switched off */ } }
  const known = new Map(listed.map((i) => [i.url, i])), chosen = linked.slice(0, PUBLIC.pages).map((u) => known.get(u) ?? bare(u));
  for (const i of listed) if (chosen.length < PUBLIC.pages && !chosen.some((c) => c.url === i.url)) chosen.push(i);
  if (chosen.length) return chosen;
  const map = await get(`${root}/sitemap.xml`);
  if (!map || map.status >= 400) return [];
  let locs = sitemapLocs(map.text);
  const inner = locs.find((l) => /product/i.test(l) && /\.xml/i.test(l));
  if (inner) { const m = await get(inner); locs = m && m.status < 400 ? sitemapLocs(m.text) : []; }
  return locs.filter((l) => /\/products?\/[^/]+/i.test(l)).slice(0, PUBLIC.pages).map(bare);
}

/**
 * Shopify turns away a reader that opens product pages quickly — and it counts every store together. So product pages are opened in one
 * line across all the sites being read, a few seconds apart; told to slow down, the line waits once as long as it is asked to.
 */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const GAP = 2500;
let line: Promise<unknown> = Promise.resolve(), waited = false;
function slowly(url: string): Promise<Got> {
  const next = line.then(async () => {
    await wait(GAP);
    let p = await get(url);
    if (p?.status === 429 && !waited) { waited = true; await wait(62_000); p = await get(url); }
    return p;
  });
  line = next.catch(() => null);
  return next;
}

export async function readSite(name: string, url: string, you: boolean): Promise<SiteRead> {
  const at = new Date().toISOString(), base = { name, url, you, at };
  const [home, robots] = await Promise.all([get(url), get(`${url.replace(/\/$/, "")}/robots.txt`)]);
  if (!home) return { ...base, audit: null, note: "Didn’t answer" };
  if (home.status >= 400) return { ...base, audit: null, note: [401, 403, 429, 503].includes(home.status) ? "Shut to automated readers" : "Didn’t answer" };
  const infos = await productPages(home), opened: NonNullable<Got>[] = [], kept: ProductInfo[] = [];
  for (const i of infos) { const p = await slowly(i.url); if (p?.status === 429) break; if (p && p.status < 400) { opened.push(p); kept.push(i); } }
  const site0 = metaContent(home.text, "og:site_name"), seen = judge(home, robots, opened[0] ?? null), pages = opened.map((p, k) => readPage(p.text, kept[k], site0)), ok = pages.map(pageOk);
  const count = (f: (x: (typeof ok)[number]) => boolean) => ({ ok: ok.filter(f).length, total: ok.length });
  const pictures = pages.reduce((n, p) => n + (p.pictures ?? 0), 0);
  // Review stars and machine-readable price count if any of the pages read publishes them.
  const facts = opened.map((p) => productFacts(p.text));
  const site = seen.checks.map((c) => (c.key === "reviews" && c.ok === false && facts.some((f) => f.reviews) ? { ...c, ok: true, detail: "Ratings are published with the product", how: undefined }
    : c.key === "facts" && c.ok === false && facts.some((f) => f.found && f.price) ? { ...c, ok: true, detail: "Product pages publish name, price and stock in the form Google and AI read", how: undefined } : c));
  const audit: Audit = {
    at, domain: new URL(home.url).origin, products: pages.length, pictures,
    title: count((x) => x.title), description: count((x) => x.description), alt: { ok: pages.reduce((n, p) => n + (p.described ?? 0), 0), total: pictures }, text: count((x) => x.text),
    site, speed: await measureSpeed(seen.pages).catch(() => undefined),
  };
  return { ...base, url: audit.domain ?? url, audit };
}

/** The competitors Iris's research names, with the website Kaviar could confirm for each. */
async function fromResearch(brandId: string): Promise<Rival[]> {
  const R = schema.marketResearch;
  const rows = await db.select({ report: R.report, rivals: R.rivals }).from(R).where(and(eq(R.brandId, brandId), eq(R.status, "done"))).orderBy(desc(R.updatedAt)).limit(4);
  const names = new Map<string, string[]>(); // name → addresses the research cites
  for (const r of rows) {
    const rep = r.report as MarketReport | null, src = (rep?.sources ?? []).map((s) => s.url);
    for (const c of rep?.competitors ?? []) if (!names.has(c.name)) names.set(c.name, src);
    for (const a of (r.rivals as RivalAds[] | null) ?? []) if (!names.has(a.name)) names.set(a.name, src);
  }
  const out: Rival[] = [];
  await Promise.all([...names].slice(0, 6).map(async ([name, src]) => {
    for (const u of guessSites(name, src)) {
      const home = await get(u);
      if (home && home.status < 400 && isSiteOf(home.text, name)) { out.push({ name, url: new URL(home.url).origin, by: "research" }); return; }
    }
  }));
  return out.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 5);
}

export type Compete = { rivals: Rival[]; bench: Bench | null; own: string | null; mine: Audit | null }; // mine: the brand's own store check, as its Store screen shows it
async function ownSite(brandId: string): Promise<string | null> {
  const a = await read<Audit>(brandId, "store-audit");
  if (a?.domain) return a.domain;
  const [b] = await db.select({ website: schema.brands.website }).from(schema.brands).where(eq(schema.brands.id, brandId));
  return b?.website ? cleanUrl(b.website) : null;
}
export async function getCompete(brandId: string): Promise<Compete> {
  const [list, bench, own, audit] = await Promise.all([read<{ list?: Rival[] }>(brandId, RIVALS), read<Bench>(brandId, BENCH), ownSite(brandId), read<Audit>(brandId, "store-audit")]);
  return { rivals: list?.list ?? [], bench: bench?.at ? { ...bench, sites: bench.sites.filter((s) => !s.you) } : null, own, mine: await currentAudit(brandId, audit?.at ? audit : null) };
}

/** Read the brand's site and every competitor's, and keep the result. The first time, the competitors come from Iris's research. */
export async function runBench(brand: { id: string; name: string }): Promise<{ sites: number; read: number; error?: string }> {
  const c = await getCompete(brand.id);
  let rivals = c.rivals;
  if (!rivals.length) { rivals = await fromResearch(brand.id); if (rivals.length) await write(brand.id, RIVALS, { list: rivals }); }
  if (!rivals.length) return { sites: 0, read: 0, error: "Add a competitor’s website to compare against" };
  waited = false;
  const sites = await Promise.all(rivals.map((r) => readSite(r.name, r.url, false)));
  const b: Bench = { at: new Date().toISOString(), sites };
  b.history = [...(c.bench?.history ?? []), pointOf(b, c.mine)].slice(-26);
  await write(brand.id, BENCH, b as unknown as Record<string, unknown>);
  return { sites: sites.length, read: sites.filter((s) => s.audit).length };
}

export async function addRival(brandId: string, name: string, input: string): Promise<{ error?: string }> {
  const url = cleanUrl(input);
  if (!url) return { error: "That doesn’t look like a website address" };
  const c = await getCompete(brandId), host = (u: string) => new URL(u).hostname.replace(/^www\./, "");
  if (c.rivals.some((r) => host(r.url) === host(url))) return { error: "Already on the list" };
  if (c.rivals.length >= 6) return { error: "Six competitors at most — remove one first" };
  const home = await get(url);
  if (!home || home.status >= 500) return { error: "That website didn’t answer" };
  const label = name.trim() || host(url).split(".")[0].replace(/^./, (x) => x.toUpperCase());
  await write(brandId, RIVALS, { list: [...c.rivals, { name: label, url, by: "team" as const }] });
  if (c.bench) { // read just the new one, so the table fills without re-reading everyone
    const one = await readSite(label, url, false);
    await write(brandId, BENCH, { ...c.bench, sites: [...c.bench.sites, one] } as unknown as Record<string, unknown>);
  }
  return {};
}
export async function removeRival(brandId: string, url: string): Promise<void> {
  const c = await getCompete(brandId), host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  await write(brandId, RIVALS, { list: c.rivals.filter((r) => host(r.url) !== host(url)) });
  if (c.bench) await write(brandId, BENCH, { ...c.bench, sites: c.bench.sites.filter((s) => s.you || host(s.url) !== host(url)) } as unknown as Record<string, unknown>);
}

/** Where the brand is behind its competitors, for Today and the Store screen — the measures, with both numbers. */
export type Gap = { key: MeasureKey; name: string; hint: string; you: string; they: string };
export async function benchGaps(brandId: string): Promise<{ sites: number; measured: number; gaps: Gap[]; stands: Partial<Record<"seo" | "ai" | "speed", { verdict: "ahead" | "level" | "behind"; avg: number; each?: number[] }>> } | null> {
  const g = await getCompete(brandId), b = g.bench;
  if (!b || !g.mine) return null;
  const c = compare(b, g.mine), stands: Partial<Record<"seo" | "ai" | "speed", { verdict: "ahead" | "level" | "behind"; avg: number; each?: number[] }>> = {};
  for (const r of c.rows) if ((r.m.key === "seo" || r.m.key === "ai" || r.m.key === "speed") && r.s.verdict && r.s.avg != null) stands[r.m.key] = { verdict: r.s.verdict, avg: r.s.avg, each: r.each.filter((x): x is number => x != null) };
  return { sites: c.rivals.filter((r) => r.audit).length, measured: c.rows.filter((r) => r.s.verdict).length, stands,
    gaps: c.rows.filter((r) => r.s.verdict === "behind").map((r) => ({ key: r.m.key, name: r.m.name, hint: r.m.hint, you: show(r.m, r.s.you), they: theyLine(r) })) };
}

/** The weekly refresh, from the daily store check. */
export async function refreshBench(brand: { id: string; name: string }, olderThanDays = 7): Promise<boolean> {
  const c = await getCompete(brand.id);
  if (!c.bench || !c.rivals.length || Date.now() - Date.parse(c.bench.at) < olderThanDays * 86_400_000) return false;
  await runBench(brand);
  return true;
}

/** How each competitor advertises on Meta, from the Ad Library read Iris already made. */
export type RivalAdLine = { name: string; ads: number; new30: number; longest: number; median: number; video: number | null; at: string }; // median: days their live ads have been running
export async function rivalAds(brandId: string): Promise<{ rows: RivalAdLine[]; subject: string | null; market: string | null }> {
  const R = schema.marketResearch;
  const rows = await db.select({ subject: R.subject, market: R.market, rivals: R.rivals }).from(R).where(and(eq(R.brandId, brandId), sql`jsonb_array_length(${R.rivals}) > 0`)).orderBy(desc(R.updatedAt)).limit(4);
  const seen = new Map<string, RivalAdLine>();
  for (const r of rows) for (const a of (r.rivals as RivalAds[]) ?? []) {
    if (seen.has(a.name) || !a.stats || !a.stats.ads) continue;
    const f = a.stats.formats ?? {}, all = Object.values(f).reduce((n, x) => n + x, 0);
    seen.set(a.name, { name: a.name, ads: a.stats.ads, new30: a.stats.new30, longest: a.stats.longest, median: a.stats.median ?? 0, video: all ? Math.round(((f.video ?? 0) / all) * 100) : null, at: a.at });
  }
  return { rows: [...seen.values()].sort((a, b) => b.ads - a.ads), subject: rows[0]?.subject ?? null, market: rows[0]?.market ?? null };
}
