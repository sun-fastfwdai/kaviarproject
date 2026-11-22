/**
 * Speed: what makes a store slow on a phone, measured two ways.
 *  - Kaviar's own reading of the page as it is served: how fast the store answers, how much script it ships and from how many apps,
 *    what holds the first paint back, which pictures load too early or without a reserved size. Always available.
 *  - Google's speed test (PageSpeed Insights): the 0–100 score, how long the main content takes, and what real shoppers experienced.
 *    Only when a key for it is set for the project.
 * Everything here is pure, so the rules can be tested without a store.
 */
export type SpeedCheck = { key: "answer" | "scripts" | "apps" | "blocking" | "lazy" | "sized"; name: string; ok: boolean; value: string; n?: string; raw?: number; detail: string; how?: string; items?: string[] }; // n: the number alone, for a tile; raw: the same as a plain number (ms, bytes, a count) so two sites can be compared; items: exactly which pictures, and where on the page
export type Slow = { name: string; how: string | null; saves: number | null }; // saves: milliseconds Google estimates the fix would save
export type Vitals = {
  score: number; lcp: number | null; cls: number | null; tbt: number | null;
  real: { lcp: number | null; inp: number | null; cls: number | null; verdict: "FAST" | "AVERAGE" | "SLOW" | null } | null; // real shoppers, last 28 days — only for stores with enough visits
  slows: Slow[];
};
export type SpeedPage = { key: "home" | "product"; name: string; url: string; checks: SpeedCheck[]; google: Vitals | null };
export type Speed = { pages: SpeedPage[]; google: "on" | "off" | "failed" };

/** Guideline limits — where a check turns amber. The measured value is always shown beside it. */
export const SPEED_LIMIT = { answerMs: 800, scriptKb: 700, apps: 8, blocking: 3, notLazy: 3, unsized: 3 } as const;

const SHOPIFY = /(^|\.)(shopify\.com|shopifycdn\.com|shopifycdn\.net|shopifysvc\.com|shopifycloud\.com|myshopify\.com|shop\.app)$/i;
const attr = (tag: string, name: string) => new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)?.slice(2).find((x) => x != null) ?? null;
const has = (tag: string, name: string) => new RegExp(`\\s${name}(\\s|=|>|/)`, "i").test(tag);
const site = (host: string) => host.replace(/^www\./, "").split(".").slice(-2).join(".");

export type Weight = { scripts: string[]; outside: string[]; addOns: number; blocking: number; pictures: number; notLazy: number; unsized: number; early: string[]; loose: string[] };

/** "shopify-section-template--123__media_with_content_MUN3P3" → "Media with content": the part of the page a picture sits in, as the theme editor names it. */
export function sectionName(id: string): string {
  const t = id.replace(/^shopify-section-/, "").replace(/^(template|sections)--\d+__/, "").replace(/_[A-Za-z0-9]{6}$/, "").replace(/[_-]+/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "Page";
}
/** What a page asks a phone to load, read from its HTML. */
export function weigh(raw: string, pageUrl: string): Weight {
  // A picture inside <video>, <noscript> or <template> is a fall-back the phone never downloads — blank those out (same length, so positions hold).
  const html = raw.replace(/<(video|noscript|template)\b[\s\S]*?<\/\1>/gi, (m) => " ".repeat(m.length));
  const page = new URL(pageUrl), headEnd = html.search(/<\/head>/i);
  const scripts = new Set<string>(), outside = new Set<string>();
  let addOns = 0, blocking = 0;
  for (const m of html.matchAll(/<script\b[^>]*>/gi)) {
    const tag = m[0], src = attr(tag, "src");
    if (!src) continue;
    let u: URL;
    try { u = new URL(src, page); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    scripts.add(u.href);
    if (u.hostname === "cdn.shopify.com" && /\/extensions\//.test(u.pathname)) addOns++; // an installed app's script, served from Shopify
    else if (u.hostname !== page.hostname && !SHOPIFY.test(u.hostname)) outside.add(site(u.hostname));
    const type = attr(tag, "type") ?? "";
    if (headEnd >= 0 && (m.index ?? 0) < headEnd && !has(tag, "async") && !has(tag, "defer") && type !== "module" && !/json|template/i.test(type)) blocking++;
  }
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => ({ tag: m[0], at: m.index ?? 0, src: attr(m[0], "src") ?? attr(m[0], "data-src") ?? "" })).filter((x) => x.src && !x.src.startsWith("data:"));
  // What the shopper sees first — the header and the first part of the page — should load at once. Everything below it should wait.
  const sections = [...html.matchAll(/<[a-z]+\b[^>]*\sid=["'](shopify-section-[^"']+)["'][^>]*>/gi)].map((m) => ({ at: m.index ?? 0, id: m[1] }));
  const main = html.search(/<main\b/i), below = sections.filter((x) => x.at > Math.max(0, main))[1]?.at ?? null; // where the second part of the page starts
  const where = (at: number) => { let id = ""; for (const x of sections) if (x.at <= at) id = x.id; return id ? sectionName(id) : "Page"; };
  const file = (src: string) => decodeURIComponent(src.split("?")[0].split("/").pop() ?? "").slice(0, 48) || "picture";
  const say = (x: { at: number; src: string }) => `${file(x.src)} — in “${where(x.at)}”`;
  const lazy = (t: string) => (attr(t, "loading") ?? "").toLowerCase() === "lazy" || has(t, "data-src");
  const early = (below != null ? imgs.filter((x) => x.at >= below) : imgs.slice(2)).filter((x) => !lazy(x.tag));
  const loose = imgs.filter((x) => !(attr(x.tag, "width") && attr(x.tag, "height")) && !/aspect-ratio/i.test(attr(x.tag, "style") ?? ""));
  return { scripts: [...scripts], outside: [...outside].sort(), addOns, blocking, pictures: imgs.length, notLazy: early.length, unsized: loose.length, early: [...new Set(early.map(say))], loose: [...new Set(loose.map(say))] };
}

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const kb = (bytes: number) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`);
export const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** The checks for one page, from what was measured. */
export function speedChecks(w: Weight, m: { answerMs: number | null; scriptBytes: number | null }): SpeedCheck[] {
  const out: SpeedCheck[] = [], L = SPEED_LIMIT, apps = w.outside.length + w.addOns;
  if (m.answerMs != null) out.push({ key: "answer", name: "The store answers quickly", ok: m.answerMs <= L.answerMs, value: m.answerMs < 1000 ? `${Math.round(m.answerMs)} ms` : secs(m.answerMs), n: m.answerMs < 1000 ? `${Math.round(m.answerMs)} ms` : secs(m.answerMs), raw: Math.round(m.answerMs),
    detail: m.answerMs <= L.answerMs ? "Time for the store to start sending the page" : "The store is slow to start sending the page — everything else waits for it", how: "Usually a heavy theme or app code that runs before the page is built" });
  if (m.scriptBytes != null) out.push({ key: "scripts", name: "Code the page loads", ok: m.scriptBytes <= L.scriptKb * 1000, value: `${kb(m.scriptBytes)} · ${n(w.scripts.length, "file")}`, n: kb(m.scriptBytes), raw: m.scriptBytes,
    detail: m.scriptBytes <= L.scriptKb * 1000 ? "A phone downloads and runs this before the page reacts" : "A phone has to download and run all of it before the page reacts to a tap", how: "Remove apps you no longer use — an app leaves its code on every page until it is removed" });
  out.push({ key: "apps", name: "Apps and outside services", ok: apps <= L.apps, value: n(apps, "service"), n: String(apps), raw: apps,
    detail: apps ? `${[...w.outside.slice(0, 6), ...(w.addOns ? [n(w.addOns, "Shopify app add-on")] : [])].join(", ")}${w.outside.length > 6 ? ` and ${w.outside.length - 6} more` : ""}` : "None load on this page",
    how: "Each one slows every visit. Keep the ones that earn their place; remove the rest in Shopify › Apps" });
  out.push({ key: "blocking", name: "Nothing holds the first view back", ok: w.blocking <= L.blocking, value: n(w.blocking, "file"), n: String(w.blocking), raw: w.blocking,
    detail: w.blocking <= L.blocking ? "Files the phone must finish before it shows anything" : "The phone must finish these before it shows anything at all", how: "Have the theme load them after the page shows (“defer”), or move to a current Shopify theme" });
  out.push({ key: "lazy", name: "Pictures wait their turn", ok: w.notLazy <= L.notLazy, value: `${w.notLazy} of ${w.pictures} load early`, n: String(w.notLazy),
    detail: w.notLazy <= L.notLazy ? "Pictures below the first view load only when scrolled to" : "Pictures far down the page load before the shopper can see them", how: "Set these pictures to load “lazy” in the theme", items: w.early.slice(0, 8) });
  out.push({ key: "sized", name: "Pictures keep their place", ok: w.unsized <= L.unsized, value: `${w.unsized} without a set size`, n: String(w.unsized),
    detail: w.unsized <= L.unsized ? "The page doesn’t jump as pictures arrive" : "The page jumps as these pictures arrive — shoppers tap the wrong thing", how: "Give these pictures a width and height in the theme", items: w.loose.slice(0, 8) });
  return out;
}

// ---------------------------------------------------------------- Google's speed test
/** Google's audit names are written for developers; these say the same thing to a brand, with what to do on Shopify. */
const PLAIN: [RegExp, string, string][] = [
  [/unused-javascript|legacy-javascript|duplicated-javascript|bootup-time|mainthread-work|unminified-javascript/, "Code that loads but isn’t needed", "Remove apps you no longer use; each leaves its code on every page"],
  [/render-blocking/, "Files that hold the page back before anything shows", "Have the theme load them after the page shows, or move to a current Shopify theme"],
  [/responsive-images|image-delivery|optimized-images|modern-image-formats|efficient-animated/, "Pictures heavier than they need to be", "Upload pictures no wider than 2,000 px and let the theme size them"],
  [/offscreen-images/, "Pictures further down load before they are needed", "Turn on lazy loading for pictures in the theme"],
  [/unused-css|unminified-css/, "Styling that loads but isn’t used", "Usually left behind by removed apps or old theme sections"],
  [/third-part/, "Outside services slowing the page", "Chat widgets, trackers, review apps — keep only what earns its place"],
  [/server-response|document-latency|redirects/, "The store is slow to answer", "A heavy theme or app code that runs before the page is built"],
  [/largest-contentful-paint|lcp-|prioritize-lcp/, "The main picture arrives late", "Don’t lazy-load the first picture on the page; have the theme load it first"],
  [/font-display|font/, "Text waits for the fonts", "Use fewer font weights, or let text show in a fallback font first"],
  [/layout-shift|cls-|unsized-images/, "Things move while the page loads", "Give pictures and banners a set size in the theme"],
  [/total-byte-weight|network-payload|dom-size|cache|long-cache-ttl|text-compression/, "The page is heavier than it needs to be", "Fewer sections, sliders and apps on the page"],
];
const plainly = (id: string, title: string): [string, string | null] => { const hit = PLAIN.find(([re]) => re.test(id)); return hit ? [hit[1], hit[2]] : [title, null]; };

type Audit = { id?: string; title?: string; score?: number | null; numericValue?: number; details?: { overallSavingsMs?: number }; metricSavings?: Record<string, number> };
type Metric = { percentile?: number };
/** Read Google's answer. Returns null when it isn't the shape expected, so a change on Google's side shows as "no score", never a wrong one. */
export function readGoogle(json: unknown): Vitals | null {
  const j = json as { lighthouseResult?: { categories?: { performance?: { score?: number | null } }; audits?: Record<string, Audit> }; loadingExperience?: { overall_category?: string; metrics?: Record<string, Metric> } } | null;
  const lh = j?.lighthouseResult, s = lh?.categories?.performance?.score;
  if (typeof s !== "number" || !lh?.audits) return null;
  const val = (id: string) => (typeof lh.audits![id]?.numericValue === "number" ? lh.audits![id].numericValue! : null);
  const slows = new Map<string, Slow>();
  for (const [id, a] of Object.entries(lh.audits)) {
    if (typeof a.score !== "number" || a.score >= 0.9) continue;
    const saves = Math.max(a.details?.overallSavingsMs ?? 0, a.metricSavings?.LCP ?? 0, a.metricSavings?.FCP ?? 0, a.metricSavings?.TBT ?? 0);
    if (saves < 100) continue;
    const [name, how] = plainly(id, a.title ?? id), was = slows.get(name);
    if (!was || (was.saves ?? 0) < saves) slows.set(name, { name, how, saves: Math.round(saves) });
  }
  const f = j?.loadingExperience, fm = f?.metrics, pct = (k: string) => (typeof fm?.[k]?.percentile === "number" ? fm[k].percentile! : null);
  const verdict = f?.overall_category === "FAST" || f?.overall_category === "AVERAGE" || f?.overall_category === "SLOW" ? f.overall_category : null;
  const cls = pct("CUMULATIVE_LAYOUT_SHIFT_SCORE");
  return {
    score: Math.round(s * 100), lcp: val("largest-contentful-paint"), cls: val("cumulative-layout-shift"), tbt: val("total-blocking-time"),
    real: fm && (verdict || pct("LARGEST_CONTENTFUL_PAINT_MS") != null) ? { lcp: pct("LARGEST_CONTENTFUL_PAINT_MS"), inp: pct("INTERACTION_TO_NEXT_PAINT"), cls: cls != null ? cls / 100 : null, verdict } : null,
    slows: [...slows.values()].sort((a, b) => (b.saves ?? 0) - (a.saves ?? 0)).slice(0, 5),
  };
}

/** Google's own bands: 90 and up is good, under 50 is poor. */
export const band = (score: number): "good" | "ok" | "poor" => (score >= 90 ? "good" : score >= 50 ? "ok" : "poor");
/** Every speed check that passes, out of every one made. */
export function speedScore(s: Speed | undefined | null): { ok: number; total: number } {
  const all = (s?.pages ?? []).flatMap((p) => p.checks);
  return { ok: all.filter((c) => c.ok).length, total: all.length };
}
