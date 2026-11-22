import type { FixKind } from "../db/schema";
import { speedScore, type Speed } from "./speed-rules";

/**
 * SEO & AI search: what Kaviar checks on a brand's Shopify store so Google and AI assistants (ChatGPT, Claude, Perplexity, Google's AI
 * answers) can find it and quote it. Counts and checks come from code reading the store; only the replacement wording is written by Cleo.
 */
export const LIMIT = { title: 60, description: 155, alt: 125, thinWords: 50 } as const;

export const KIND: Record<FixKind, { name: string; many: string; where: string }> = {
  search_title: { name: "Search title", many: "search titles", where: "The blue headline in Google" },
  search_description: { name: "Search description", many: "search descriptions", where: "The two lines under it — also what AI assistants quote" },
  alt: { name: "Picture description", many: "picture descriptions", where: "How Google Images and AI read a picture" },
  thin: { name: "Product page text", many: "thin product pages", where: "What Google and AI assistants read about the product" },
};

export type SiteCheck = { key: "open" | "home" | "ai" | "facts" | "reviews"; name: string; ok: boolean | null; detail: string; how?: string };
export type Part = { ok: number; total: number };
export type Audit = {
  at: string; domain: string | null; products: number; pictures: number;
  title: Part; description: Part; alt: Part; text: Part; site: SiteCheck[];
  speed?: Speed; // how fast the home page and a product page are on a phone
};
export type StoreRun = { at: string; day: string; by: "schedule" | "team"; products: number; found: number; wrote: number; fixed: string[]; note?: string };

export type Fix = {
  id: string; kind: FixKind; productGid: string; productTitle: string; handle: string | null; image: string | null;
  problem: string; before: string; after: string | null; status: "proposed" | "applied" | "skipped"; by: "team" | "autopilot" | null; appliedAt: string | null; error: string | null;
};

/** Every check that passes, out of every check made — fields on products, the store-wide ones that could be read, and speed. */
export function score(a: Audit): Part {
  const site = a.site.filter((c) => c.ok != null), sp = speedScore(a.speed);
  return { ok: a.title.ok + a.description.ok + a.alt.ok + a.text.ok + site.filter((c) => c.ok).length + sp.ok, total: a.title.total + a.description.total + a.alt.total + a.text.total + site.length + sp.total };
}

/**
 * Three scores out of 100, and one overall. Each is the share of its checks that pass, with every group of checks counting the same
 * (so 71 pictures don't drown out 25 search titles). These are Kaviar's scores from the checks on this page — except Speed, which is
 * Google's own score whenever Google's speed test is switched on.
 *  - SEO: search titles, search descriptions, picture descriptions; the store is open to Google, the home page is titled, ratings are published.
 *  - AI search: search descriptions (what assistants quote), enough text on each product page; AI crawlers are let in, price and stock are machine-readable.
 */
export type Scores = { overall: number; seo: number; ai: number; speed: number | null; speedFrom: "google" | "checks" | null };
export function scores(a: Audit): Scores {
  const share = (p: Part) => (p.total ? p.ok / p.total : null);
  const site = (keys: SiteCheck["key"][]) => { const c = a.site.filter((x) => keys.includes(x.key) && x.ok != null); return c.length ? c.filter((x) => x.ok).length / c.length : null; };
  const mean = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? Math.round((v.reduce((n, x) => n + x, 0) / v.length) * 100) : 0; };
  const seo = mean([share(a.title), share(a.description), share(a.alt), site(["open", "home", "reviews"])]);
  const ai = mean([share(a.description), share(a.text), site(["open", "ai", "facts"])]);
  const g = (a.speed?.pages ?? []).map((p) => p.google?.score).filter((x): x is number => x != null), sp = speedScore(a.speed);
  const speed = g.length ? Math.round(g.reduce((n, x) => n + x, 0) / g.length) : sp.total ? Math.round((sp.ok / sp.total) * 100) : null;
  const all = [seo, ai, ...(speed != null ? [speed] : [])];
  return { overall: Math.round(all.reduce((n, x) => n + x, 0) / all.length), seo, ai, speed, speedFrom: g.length ? "google" : sp.total ? "checks" : null };
}

/** Cut to a limit at a word, never mid-word. */
export function fit(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1), at = cut.lastIndexOf(" ");
  return (at > max * 0.6 ? cut.slice(0, at) : t.slice(0, max)).replace(/[\s,;:–—-]+$/, "");
}

/** Which AI crawlers a robots.txt shuts out completely. */
export const AI_BOTS: [string, string][] = [["GPTBot", "ChatGPT"], ["OAI-SearchBot", "ChatGPT search"], ["ClaudeBot", "Claude"], ["PerplexityBot", "Perplexity"], ["Google-Extended", "Google’s AI"]];
export function blockedBots(robots: string): string[] {
  type Group = { agents: string[]; rules: [string, string][] };
  const groups: Group[] = [];
  let g: Group | null = null, inRules = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(), at = line.indexOf(":");
    if (at < 0) continue;
    const k = line.slice(0, at).trim().toLowerCase(), v = line.slice(at + 1).trim();
    if (k === "user-agent") {
      if (!g || inRules) { g = { agents: [], rules: [] }; groups.push(g); inRules = false; }
      g.agents.push(v.toLowerCase());
    } else if (g && (k === "disallow" || k === "allow")) { g.rules.push([k, v]); inRules = true; }
  }
  const shut = (x: Group | undefined) => Boolean(x && x.rules.some(([k, v]) => k === "disallow" && v === "/") && !x.rules.some(([k, v]) => k === "allow" && v === "/"));
  return AI_BOTS.filter(([bot]) => shut(groups.find((x) => x.agents.includes(bot.toLowerCase())) ?? groups.find((x) => x.agents.includes("*")))).map(([, name]) => name);
}

/** The product facts a page publishes for machines (schema.org Product in JSON-LD). */
export function productFacts(html: string): { found: boolean; price: boolean; reviews: boolean } {
  const out = { found: false, price: false, reviews: false };
  const walk = (x: unknown) => {
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>, t = ([] as unknown[]).concat(o["@type"] ?? []);
    if (t.includes("Product") || t.includes("ProductGroup")) {
      out.found = true;
      if (o.offers || o.hasVariant) out.price = true;
      if (o.aggregateRating) out.reviews = true;
      walk(o.hasVariant);
    }
    walk(o["@graph"]);
  };
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())); } catch { /* a broken block is the same as none */ }
  }
  return out;
}

// ---------------------------------------------------------------- the rules
export type MediaRead = { id?: string; alt?: string | null; image?: { url: string } | null };
export type ProductRead = { id: string; title: string; handle: string; onlineStoreUrl: string | null; description: string; seo: { title: string | null; description: string | null }; media: { nodes: MediaRead[] } };
export type Found = { key: string; kind: FixKind; productGid: string; productTitle: string; handle: string; image: string | null; mediaGid: string | null; problem: string; before: string };
const num = (gid: string) => gid.slice(gid.lastIndexOf("/") + 1);
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** The rules, on one product as the store has it today. */
export function check(p: ProductRead): Found[] {
  const out: Found[] = [], pics = p.media.nodes.filter((m) => m.id && m.image?.url), first = pics[0]?.image?.url ?? null;
  const base = { productGid: p.id, productTitle: p.title, handle: p.handle, image: first, mediaGid: null };
  const t = p.seo.title?.trim() ?? "", d = p.seo.description?.trim() ?? "";
  if (!t) out.push({ ...base, key: `search_title:${num(p.id)}`, kind: "search_title", before: "", problem: "Not set — Google shows only the product name" });
  else if (t.length > LIMIT.title + 5) out.push({ ...base, key: `search_title:${num(p.id)}`, kind: "search_title", before: t, problem: `${t.length} letters — Google cuts it at about ${LIMIT.title}` });
  if (!d) out.push({ ...base, key: `search_description:${num(p.id)}`, kind: "search_description", before: "", problem: "Not set — Google and AI assistants make up their own" });
  else if (d.length > LIMIT.description + 10) out.push({ ...base, key: `search_description:${num(p.id)}`, kind: "search_description", before: d, problem: `${d.length} letters — Google cuts it at about ${LIMIT.description}` });
  else if (d.length < 50) out.push({ ...base, key: `search_description:${num(p.id)}`, kind: "search_description", before: d, problem: `Only ${d.length} letters — too short to say why to click` });
  for (const m of pics) if (!m.alt?.trim()) out.push({ ...base, key: `alt:${num(p.id)}:${num(m.id!)}`, kind: "alt", image: m.image!.url, mediaGid: m.id!, before: "", problem: "No description — Google Images and AI can’t tell what it shows" });
  const n = words(p.description);
  if (n < LIMIT.thinWords) out.push({ ...base, key: `thin:${num(p.id)}`, kind: "thin", before: `${n} word${n === 1 ? "" : "s"}`, problem: n ? `Only ${n} words — too little for Google or an AI assistant to quote` : "No description at all" });
  return out;
}

