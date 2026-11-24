import "server-only";
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { decrypt } from "../crypto";
import { MetaAuthError, metaGet } from "../meta/client";
import { toJpeg } from "../audience/media";
import type { KeptAd, LibAd, LibBlock, PastStats, RivalAds, RivalStats } from "./types";
import { deleteAssets, saveAsset } from "@/lib/assets/storage";

/**
 * Meta Ad Library (Graph API `ads_archive`). Meta shares ordinary (non-political) ads only when they reached someone in the EU or UK,
 * so we search that delivery: global brands usually run the same messages there. For those ads Meta also shares real numbers —
 * reach, who it reached by age and gender, where, what was targeted and who paid. US-only ads are read off screenshots (./shots).
 */
const EU = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
const WHERE = JSON.stringify([...EU, "GB"]);
const BASE = "id,page_id,page_name,ad_creation_time,ad_delivery_start_time,ad_delivery_stop_time,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_creative_link_captions,ad_snapshot_url,publisher_platforms,languages,eu_total_reach";
const RICH = `${BASE},total_reach_by_location,age_country_gender_reach_breakdown,target_ages,target_gender,target_locations,beneficiary_payers`;

/** Any team member's Meta login can read the Ad Library: this brand's first, else another brand's. */
export async function adLibraryToken(brandId: string): Promise<string | null> {
  const C = schema.connections;
  const rows = await db.select({ brandId: C.brandId, token: C.accessToken }).from(C)
    .where(and(eq(C.provider, "meta"), isNotNull(C.accessToken), ne(C.status, "disconnected"))).orderBy(desc(C.connectedAt)).limit(10);
  const row = rows.find((r) => r.brandId === brandId) ?? rows[0];
  try { return row?.token ? decrypt(row.token) : null; } catch { return null; }
}

export class LibraryError extends Error {
  constructor(message: string, readonly blocked?: LibBlock) { super(message); }
}
/** Meta's refusal in words the team can act on, with Meta's own message kept. */
export function libError(e: unknown): LibraryError {
  if (e instanceof LibraryError) return e;
  if (e instanceof MetaAuthError) return new LibraryError("The Meta login Kaviar reads the Ad Library with has expired — reconnect Meta Ads on Integrations.", "auth");
  const m = (e as Error)?.message ?? String(e), raw = m.replace(/^Meta API:\s*/, "").slice(0, 180);
  if (/\((10|2332\d+)\)|does not have permission|confirm (your )?identity/i.test(m))
    return new LibraryError(`Meta hasn’t opened the Ad Library API to this login yet: the person who connected Meta confirms their identity at facebook.com/ID, then it works. Meta said: “${raw}”`, "identity");
  if (/\((4|17|613|80004)\)|request limit|too many calls/i.test(m)) return new LibraryError("Meta’s hourly Ad Library limit was reached — try again in an hour.", "limit");
  return new LibraryError(`Meta said: “${raw}”`);
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
/** Does a Facebook Page name belong to this competitor? ("COSRX Official" ↔ "COSRX") */
export const samePage = (page: string, name: string) => { const a = norm(page), b = norm(name); return Boolean(a && b) && (a.includes(b) || (b.includes(a) && a.length >= 4)); };
export const daysSince = (iso: string | null | undefined, now = Date.now()) => (iso && !Number.isNaN(Date.parse(iso)) ? Math.max(0, Math.round((now - Date.parse(iso)) / 86_400_000)) : null);

type Breakdown = { country?: string; age_gender_breakdowns?: { age_range?: string; male?: number | null; female?: number | null; unknown?: number | null }[] };
export type Raw = {
  id: string; page_id?: string; page_name?: string; ad_creation_time?: string; ad_delivery_start_time?: string; ad_delivery_stop_time?: string;
  ad_creative_bodies?: string[]; ad_creative_link_titles?: string[]; ad_creative_link_descriptions?: string[]; ad_creative_link_captions?: string[];
  ad_snapshot_url?: string; publisher_platforms?: string[]; languages?: string[]; eu_total_reach?: number;
  total_reach_by_location?: { key: string; value: number }[]; age_country_gender_reach_breakdown?: Breakdown[];
  target_ages?: string[]; target_gender?: string; target_locations?: { name?: string; excluded?: boolean; type?: string }[]; beneficiary_payers?: { payer?: string; beneficiary?: string }[];
};
type Page = { data?: Raw[]; paging?: { next?: string; cursors?: { after?: string } } };
const lib = (params: Record<string, string>, token: string) => metaGet<Page>("ads_archive", { ad_type: "ALL", ad_reached_countries: WHERE, ...params }, token);

/** The competitor's own Facebook Pages: the Pages named like them that turn up in a keyword search, most ads first. */
async function findPages(name: string, token: string) {
  const tally = new Map<string, { id: string; name: string; n: number }>();
  let after: string | undefined;
  // Big brands are mentioned by many creators and retailers: look through up to 300 hits for the brand's own Pages.
  for (let i = 0; i < 3 && (i === 0 || !tally.size); i++) {
    const r = await lib({ search_terms: name.slice(0, 100), ad_active_status: "ACTIVE", limit: "100", fields: "page_id,page_name", ...(after ? { after } : {}) }, token);
    for (const a of r.data ?? []) {
      if (!a.page_id || !a.page_name || !samePage(a.page_name, name)) continue;
      const t = tally.get(a.page_id) ?? { id: a.page_id, name: a.page_name, n: 0 };
      t.n++; tally.set(a.page_id, t);
    }
    after = r.paging?.next ? r.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return [...tally.values()].sort((a, b) => b.n - a.n).slice(0, 4);
}

/** Every live ad from those Pages (up to 300). Falls back to the basic fields if this API version refuses a breakdown field. */
async function pageAds(ids: string[], token: string): Promise<Raw[]> {
  const out: Raw[] = [];
  let after: string | undefined, fields = RICH;
  for (let i = 0; i < 3; i++) {
    let r: Page;
    try { r = await lib({ search_page_ids: JSON.stringify(ids), ad_active_status: "ACTIVE", limit: "100", fields, ...(after ? { after } : {}) }, token); }
    catch (e) {
      if (fields === RICH && /\(100\)/.test((e as Error).message)) { fields = BASE; i--; continue; }
      throw e;
    }
    out.push(...(r.data ?? []));
    after = r.paging?.next ? r.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return out;
}

// ---------------------------------------------------------------- what became of their older ads
const MONTHS = 6, WATCHED = 30, PAGES_A_MONTH = 2, DAY_MS = 86_400_000;
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/**
 * Six samples of the Pages' ads, one a month back from 30 days ago: up to 200 ads that were being shown before each month's end, running
 * or stopped, with their words. Meta lists the newest first, so each sample is the ads started just before that date — and all of them
 * have had 30 days or more to show how long they ran. (Asking for the newest stopped ads instead only returns ads that died young.)
 * If Meta's hourly limit is reached part-way, what was read so far is kept.
 */
async function pastAds(ids: string[], token: string, now = Date.now()): Promise<{ raw: Raw[]; more: boolean }> {
  const raw: Raw[] = [], seen = new Set<string>();
  let more = false;
  for (let m = 0; m < MONTHS; m++) {
    const max = now - (WATCHED + m * 30) * DAY_MS, min = max - 30 * DAY_MS;
    let after: string | undefined;
    for (let i = 0; i < PAGES_A_MONTH; i++) {
      let r: Page;
      try {
        r = await lib({ search_page_ids: JSON.stringify(ids), ad_active_status: "ALL", ad_delivery_date_min: dayOf(min), ad_delivery_date_max: dayOf(max), limit: "100",
          fields: "id,ad_delivery_start_time,ad_delivery_stop_time,ad_creative_bodies,ad_creative_link_titles,eu_total_reach", ...(after ? { after } : {}) }, token);
      } catch (e) { if (!raw.length) throw e; return { raw, more: true }; }
      for (const a of r.data ?? []) if (!seen.has(a.id)) { seen.add(a.id); raw.push(a); }
      after = r.paging?.next ? r.paging.cursors?.after : undefined;
      if (!after) break;
    }
    if (after) more = true;
  }
  return { raw, more };
}

type PastRaw = Pick<Raw, "ad_delivery_start_time" | "ad_delivery_stop_time"> & Partial<Pick<Raw, "id" | "ad_creative_bodies" | "ad_creative_link_titles" | "eu_total_reach">>;
/**
 * How long their older ads ran, counted from each ad's own start and stop day — nothing estimated. Only ads started between seven
 * months and 30 days ago count, so each has been watched for at least 30 days; one still running has run at least as long as it has been
 * live. The ads kept longest come back with their words: the nearest public sign of what worked for them.
 */
export function pastStats(raw: PastRaw[], more = false, now = Date.now()): PastStats {
  const from = now - (WATCHED + MONTHS * 30) * DAY_MS, to = now - WATCHED * DAY_MS;
  const runs: { days: number; open: boolean; start: string; a: PastRaw }[] = [];
  for (const a of raw) {
    const s = Date.parse(a.ad_delivery_start_time ?? ""), e = Date.parse(a.ad_delivery_stop_time ?? "");
    if (Number.isNaN(s) || s < from || s > to) continue;
    const open = Number.isNaN(e) || e > now; // no stop day, or one still ahead: it is running
    if (!open && e < s) continue;
    runs.push({ days: Math.round(((open ? now : e) - s) / DAY_MS) + 1, open, start: dayOf(s), a }); // started and stopped on one day = one day
  }
  const sorted = [...runs].sort((a, b) => a.days - b.days), mid = sorted[Math.floor(sorted.length / 2)];
  const quick = (xs: typeof runs) => xs.filter((r) => !r.open && r.days <= 7).length, long = (xs: typeof runs) => xs.filter((r) => r.days >= 30).length;
  const byMonth = new Map<string, typeof runs>();
  for (const r of runs) byMonth.set(r.start.slice(0, 7), [...(byMonth.get(r.start.slice(0, 7)) ?? []), r]);
  // The ads they kept: longest first, one per message (the same words are often run as many ads).
  const kept: KeptAd[] = [], said = new Set<string>();
  for (const r of [...runs].filter((x) => x.days >= 30).sort((a, b) => b.days - a.days)) {
    const text = (r.a.ad_creative_bodies?.[0] ?? "").replace(/\s+/g, " ").trim(), key = norm(text).slice(0, 60);
    if (!r.a.id || text.length < 12 || said.has(key)) continue;
    said.add(key);
    kept.push({ id: r.a.id, text: text.slice(0, 280), title: r.a.ad_creative_link_titles?.[0]?.slice(0, 90) ?? null, start: r.start, days: r.days, open: r.open, reach: typeof r.a.eu_total_reach === "number" ? r.a.eu_total_reach : null });
    if (kept.length >= 6) break;
  }
  const starts = runs.map((r) => r.start).sort();
  return { ads: runs.length, stopped: runs.filter((r) => !r.open).length, median: mid?.days ?? 0, medianOpen: mid?.open ?? false, quick: quick(runs), long: long(runs),
    since: starts[0] ?? null, until: starts.at(-1) ?? null, more, at: new Date(now).toISOString(),
    months: [...byMonth].sort((a, b) => a[0].localeCompare(b[0])).map(([month, xs]) => ({ month, ads: xs.length, quick: quick(xs), long: long(xs) })), kept, v: 3 };
}

/** Figures from before the six-month read (no monthly samples, no kept ads) are read again. */
export const hasPast = (s: RivalStats) => s.past?.v === 3;

/**
 * Fills in the stopped-ads count for competitors read before Kaviar kept it. It only adds that one figure: the ads already read and
 * what Iris wrote about them stay as they are. Stops at Meta's first refusal and tries again another day.
 */
export async function fillPast(brandId: string): Promise<number> {
  const R = schema.marketResearch;
  const rows = await db.select({ id: R.id, rivals: R.rivals }).from(R).where(and(eq(R.brandId, brandId), sql`jsonb_array_length(${R.rivals}) > 0`)).orderBy(desc(R.updatedAt)).limit(4);
  const todo = rows.filter((r) => r.rivals.some((x) => x.pages?.length && x.stats && !hasPast(x.stats)));
  if (!todo.length) return 0;
  const token = await adLibraryToken(brandId);
  if (!token) return 0;
  let done = 0;
  for (const row of todo) {
    const found = new Map<string, PastStats>();
    for (const x of row.rivals) {
      if (!x.pages?.length || !x.stats || hasPast(x.stats)) continue;
      try { const p = await pastAds(x.pages.map((pg) => pg.id), token); found.set(x.name, pastStats(p.raw, p.more)); }
      catch { break; }
    }
    if (!found.size) continue;
    // Written onto the latest copy of the row, so a pull that finished meanwhile is not undone.
    const [now] = await db.select({ rivals: R.rivals }).from(R).where(eq(R.id, row.id));
    if (!now) continue;
    await db.update(R).set({ rivals: now.rivals.map((x) => (x.stats && !hasPast(x.stats) && found.has(x.name) ? { ...x, stats: { ...x.stats, past: found.get(x.name)! } } : x)) }).where(eq(R.id, row.id));
    done += found.size;
  }
  return done;
}

// ---------------------------------------------------------------- Meta's numbers, per creative
function audienceOf(g: Raw[]): LibAd["audience"] {
  const ages = new Map<string, { f: number; m: number; u: number }>();
  let tot = 0;
  for (const x of g) for (const c of x.age_country_gender_reach_breakdown ?? []) for (const b of c.age_gender_breakdowns ?? []) {
    if (!b.age_range) continue;
    const e = ages.get(b.age_range) ?? { f: 0, m: 0, u: 0 };
    e.f += b.female ?? 0; e.m += b.male ?? 0; e.u += b.unknown ?? 0;
    ages.set(b.age_range, e); tot += (b.female ?? 0) + (b.male ?? 0) + (b.unknown ?? 0);
  }
  if (!tot) return null;
  let top = "", topN = 0, women = 0;
  for (const [age, e] of ages) {
    women += e.f;
    if (e.f > topN) { top = `Women ${age}`; topN = e.f; }
    if (e.m > topN) { top = `Men ${age}`; topN = e.m; }
  }
  return {
    top: top.replace("-", "–"), topShare: topN / tot, women: women / tot,
    ages: [...ages].map(([age, e]) => ({ age: age.replace("-", "–"), share: (e.f + e.m + e.u) / tot })).sort((a, b) => a.age.localeCompare(b.age)),
  };
}
function countriesOf(g: Raw[]): { code: string; reach: number }[] {
  const m = new Map<string, number>();
  for (const x of g) {
    if (x.total_reach_by_location?.length) for (const l of x.total_reach_by_location) m.set(l.key, (m.get(l.key) ?? 0) + (l.value ?? 0));
    else for (const c of x.age_country_gender_reach_breakdown ?? []) if (c.country) m.set(c.country, (m.get(c.country) ?? 0) + (c.age_gender_breakdowns ?? []).reduce((a, b) => a + (b.female ?? 0) + (b.male ?? 0) + (b.unknown ?? 0), 0));
  }
  return [...m].map(([code, reach]) => ({ code, reach })).filter((c) => c.reach > 0).sort((a, b) => b.reach - a.reach).slice(0, 6);
}
function targetOf(a: Raw): LibAd["target"] {
  const ages = a.target_ages?.length ? `${a.target_ages[0]}–${a.target_ages[a.target_ages.length - 1]}${a.target_ages[a.target_ages.length - 1] === "65" ? "+" : ""}` : null;
  const places = (a.target_locations ?? []).filter((l) => !l.excluded && l.name).map((l) => l.name!).slice(0, 5);
  if (!ages && !a.target_gender && !places.length) return null;
  return { ages, gender: a.target_gender ?? null, places };
}
const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];

/** Ads with the same text are one creative, as the Library shows them; the longest-running ad stands for the group. */
export function groupAds(raw: Raw[], name: string): LibAd[] {
  const groups = new Map<string, Raw[]>();
  for (const a of raw) {
    const k = norm(`${a.ad_creative_bodies?.[0] ?? ""}|${a.ad_creative_link_titles?.[0] ?? ""}`) || a.id;
    const g = groups.get(k);
    if (g) g.push(a); else groups.set(k, [a]);
  }
  return [...groups.values()].map((g): LibAd => {
    g.sort((a, b) => (Date.parse(a.ad_delivery_start_time ?? "") || Infinity) - (Date.parse(b.ad_delivery_start_time ?? "") || Infinity));
    const a = g[0];
    const reached = g.filter((x) => typeof x.eu_total_reach === "number");
    return {
      id: a.id, pageId: a.page_id, page: a.page_name ?? name, start: a.ad_delivery_start_time ?? null, stop: a.ad_delivery_stop_time ?? null,
      bodies: (a.ad_creative_bodies ?? []).map((x) => x.slice(0, 700)).slice(0, 3), titles: (a.ad_creative_link_titles ?? []).slice(0, 3),
      descriptions: (a.ad_creative_link_descriptions ?? []).slice(0, 3), captions: (a.ad_creative_link_captions ?? []).slice(0, 3),
      platforms: uniq(g.flatMap((x) => x.publisher_platforms ?? [])), languages: uniq(g.flatMap((x) => x.languages ?? [])),
      reach: reached.length ? reached.reduce((s, x) => s + (x.eu_total_reach ?? 0), 0) : null,
      copies: g.length, ids: g.map((x) => x.id).slice(0, 20),
      audience: audienceOf(g), countries: countriesOf(g), target: targetOf(a), payer: a.beneficiary_payers?.[0]?.payer ?? null, from: "api", media: null,
    };
  }).sort((a, b) => (daysSince(b.start) ?? -1) - (daysSince(a.start) ?? -1) || (b.reach ?? 0) - (a.reach ?? 0));
}

/** A competitor's numbers, counted from the ads themselves — nothing estimated. */
export function statsOf(ads: LibAd[], now = Date.now()): RivalStats {
  const ds = ads.map((a) => daysSince(a.start, now)).filter((d): d is number => d != null).sort((a, b) => a - b);
  const count = (pick: (a: LibAd) => string[]) => { const m: Record<string, number> = {}; for (const a of ads) for (const k of pick(a)) m[k] = (m[k] ?? 0) + 1; return m; };
  const reached = ads.filter((a) => a.reach != null);
  const reach = reached.length ? reached.reduce((s, a) => s + (a.reach ?? 0), 0) : null;
  const withAud = ads.filter((a) => a.audience && (a.reach ?? 0) > 0);
  const wsum = withAud.reduce((s, a) => s + (a.reach ?? 0), 0);
  const cs = new Map<string, number>();
  for (const a of ads) for (const c of a.countries ?? []) cs.set(c.code, (cs.get(c.code) ?? 0) + c.reach);
  return {
    ads: ads.reduce((s, a) => s + (a.copies ?? 1), 0), creatives: ads.length,
    new30: ads.filter((a) => (daysSince(a.start, now) ?? 999) <= 30).reduce((s, a) => s + (a.copies ?? 1), 0),
    longest: ds.at(-1) ?? 0, median: ds.length ? ds[Math.floor(ds.length / 2)] : 0, proven: ds.filter((d) => d >= 30).length,
    reach, formats: count((a) => (a.media?.kind ? [a.media.kind] : [])), platforms: count((a) => a.platforms.map((p) => p.toLowerCase())),
    countries: [...cs].map(([code, r]) => ({ code, reach: r })).sort((a, b) => b.reach - a.reach).slice(0, 5),
    women: wsum ? withAud.reduce((s, a) => s + (a.audience!.women * (a.reach ?? 0)), 0) / wsum : null,
  };
}

// ---------------------------------------------------------------- the creative itself, from Meta's snapshot of the ad
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const unjson = (s: string) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))).replace(/\\\//g, "/").replace(/&amp;/g, "&");
const PROFILE = /[sp]\d{2,3}x\d{2,3}|_s\d{2,3}x\d{2,3}|\/cp0\//;

/** The picture (or a video's cover) in the snapshot page Meta serves for each ad. */
export function mediaFromSnapshot(html: string): { kind: "image" | "video" | "carousel"; url: string; n: number } | null {
  const h = html.replace(/\\\//g, "/");
  const grab = (key: string) => uniq([...h.matchAll(new RegExp(`"${key}"\\s*:\\s*"(https:[^"]+)"`, "g"))].map((m) => unjson(m[1])));
  const posters = grab("video_preview_image_url"), originals = grab("original_image_url"), resized = grab("resized_image_url");
  if (posters.length) return { kind: "video", url: posters[0], n: posters.length };
  const imgs = originals.length ? originals : resized;
  if (imgs.length) return { kind: imgs.length > 1 ? "carousel" : "image", url: imgs[0], n: imgs.length };
  const poster = /<video[^>]*\sposter="([^"]+)"/i.exec(h)?.[1];
  if (poster) return { kind: "video", url: unjson(poster), n: 1 };
  const tags = uniq([...h.matchAll(/<img[^>]*\ssrc="(https:\/\/[^"]*(?:fbcdn|scontent)[^"]*)"/gi)].map((m) => unjson(m[1]))).filter((u) => !PROFILE.test(u));
  if (tags.length) return { kind: tags.length > 1 ? "carousel" : "image", url: tags[0], n: tags.length };
  return null;
}

async function pool<T>(xs: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) await fn(xs[i++]).catch(() => undefined); }));
}

const A = schema.brandAssets;
/** Stored copies of each creative's picture (Meta allows downloading single creatives for analysis). Reuses copies from earlier pulls. */
async function attachMedia(brandId: string, competitor: string, ads: LibAd[], snaps: Map<string, string | undefined>) {
  if (!ads.length) return;
  const have = await db.select({ id: A.id, libId: sql<string>`${A.meta}->>'libId'`, format: sql<string | null>`${A.meta}->>'format'`, n: sql<number | null>`(${A.meta}->>'n')::int` })
    .from(A).where(and(eq(A.brandId, brandId), eq(A.kind, "competitor"), inArray(sql`${A.meta}->>'libId'`, ads.map((a) => a.id))));
  const byLib = new Map(have.map((h) => [h.libId, h]));
  await pool(ads, 6, async (a) => {
    const old = byLib.get(a.id);
    if (old) { a.media = { kind: (old.format as "image" | "video" | "carousel") ?? "image", asset: old.id, n: old.n ?? 1 }; return; }
    const snap = snaps.get(a.id);
    if (!snap) return;
    const page = await fetch(snap, { signal: AbortSignal.timeout(12_000), cache: "no-store", headers: { "user-agent": UA, accept: "text/html" } });
    if (!page.ok) return;
    const m = mediaFromSnapshot(await page.text());
    if (!m) return;
    const img = await fetch(m.url, { signal: AbortSignal.timeout(15_000), cache: "no-store", headers: { "user-agent": UA, accept: "image/*" } });
    if (!img.ok) return;
    const jpg = await toJpeg(Buffer.from(await img.arrayBuffer()), 720);
    if (!jpg) return;
    const [row] = await saveAsset({
      brandId, kind: "competitor", name: `${a.page} · Ad Library ${a.id}`.slice(0, 80), mime: "image/jpeg", size: jpg.length, data: jpg,
      meta: { competitor, libId: a.id, format: m.kind, n: m.n, source: "adlib" },
    });
    a.media = { kind: m.kind, asset: row.id, n: m.n };
  });
}

/** A competitor's live ads that reached the EU/UK — their Pages, every creative with Meta's numbers, and a copy of each picture. */
export async function competitorAds(name: string, token: string, brandId: string): Promise<Pick<RivalAds, "ads" | "pages" | "stats">> {
  let raw: Raw[], pages: { id: string; name: string; n: number }[];
  try {
    pages = await findPages(name, token);
    raw = pages.length ? await pageAds(pages.map((p) => p.id), token) : [];
  } catch (e) { throw libError(e); }
  const snaps = new Map(raw.map((a) => [a.id, a.ad_snapshot_url]));
  const all = groupAds(raw, name);
  const ads = all.slice(0, 40);
  await attachMedia(brandId, name, ads.slice(0, 16), snaps);
  const stats = statsOf(all);
  stats.formats = statsOf(ads).formats;
  // The ads they stopped are a bonus: a refusal here never loses the live ads just read.
  if (pages.length) { const p = await pastAds(pages.map((x) => x.id), token).catch(() => null); if (p) stats.past = pastStats(p.raw, p.more); }
  return { ads, pages: pages.map(({ id, name: n }) => ({ id, name: n })), stats };
}

/** Drops stored creative copies no research of this brand shows any more. */
export async function pruneAdCopies(brandId: string) {
  const rows = await db.select({ rivals: schema.marketResearch.rivals, manual: schema.marketResearch.manual }).from(schema.marketResearch).where(eq(schema.marketResearch.brandId, brandId));
  const keep = new Set(rows.flatMap((r) => [...r.rivals.flatMap((x) => x.ads), ...r.manual.flatMap((m) => [...(m.ads ?? []), { media: { asset: m.id } }])].map((a) => a.media?.asset).filter(Boolean) as string[]));
  const all = await db.select({ id: A.id }).from(A).where(and(eq(A.brandId, brandId), eq(A.kind, "competitor"), sql`${A.meta}->>'source' in ('adlib', 'shot')`));
  const drop = all.map((a) => a.id).filter((id) => !keep.has(id));
  if (drop.length) await deleteAssets(and(eq(A.brandId, brandId), inArray(A.id, drop)));
}
