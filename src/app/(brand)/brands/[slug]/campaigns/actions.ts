"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { layoutBatch } from "@/lib/creative/design";
import { sendShots } from "../creative/shoots/actions";
import { aiReady } from "@/lib/ai/client";
import { deleteAssets, saveAsset } from "@/lib/assets/storage";
import { imageSize } from "@/lib/creative/higgsfield";
import { addOwnPlan, briefView, getPlans, planAds, planBrief, planMarket, productLink, removeOwnPlan, savePlanChoice, saveTarget, setOwnAudience } from "@/lib/growth/plans";
import { makeAd, makeAdSet, metaReady, setCampaignBudget, switchCampaign, type Ready } from "@/lib/meta/place";
import { countriesIn, countryFor, countryNames } from "@/lib/meta/place-rules";
import { placeAdvice } from "@/lib/meta/places";
import type { PlaceAdvice } from "@/lib/meta/places-rules";
import { META_URL_PARAMS } from "@/lib/sync/attribution";
import { readAssets } from "@/lib/assets/storage";
import { createPausedCampaign } from "@/lib/meta/apply";

/** A picture's width and height, in the words an asset keeps them in. */
const dims = (b: Buffer) => { const z = imageSize(b); return z ? { width: z.w, height: z.h } : {}; };

const fresh = (slug: string) => { for (const p of ["campaigns", "today", "plan"]) revalidatePath(`/brands/${slug}/${p}`, p === "campaigns" ? "layout" : "page"); };

/** Say yes to one plan, at the budget and length chosen. Its ads can be made from then on. */
export async function approvePlanFor(slug: string, key: string, budget: number, days: number): Promise<void> {
  const me = await requireMember();
  await savePlanChoice((await getBrand(slug)).id, key, { budget, days, approve: true, by: me.name });
  fresh(slug);
}
/** Change a plan's budget or length without approving it again. */
export async function setPlanBudget(slug: string, key: string, budget: number, days: number): Promise<void> {
  await requireMember();
  await savePlanChoice((await getBrand(slug)).id, key, { budget, days });
  fresh(slug);
}
/** The brand's monthly sales target: falling short of it is a reason to advertise. */
/** The brand's pictures from the Creative studio a campaign's ads can wear: photos shot in Shoots and its own uploads, the campaign's product first. */
export async function studioPhotos(slug: string, key: string): Promise<{ id: string; name: string; ai: boolean; mine: boolean }[]> {
  await requireMember();
  const brand = await getBrand(slug);
  const plans = await getPlans({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone });
  const product = plans.list.find((x) => x.key === key)?.c.product ?? null;
  const A = schema.brandAssets;
  const rows = await db.select({ id: A.id, name: A.name, meta: A.meta }).from(A)
    .where(and(eq(A.brandId, brand.id), eq(A.kind, "imagery"), sql`${A.mime} like 'image/%'`, sql`coalesce(${A.meta}->>'edit', '') <> 'card'`)).orderBy(desc(A.createdAt)).limit(80);
  const list = rows.map((r) => ({ id: r.id, name: r.name, ai: Boolean(r.meta.ai), mine: Boolean(product && r.meta.product === product) }));
  return [...list.filter((x) => x.mine), ...list.filter((x) => !x.mine)];
}

/** Put chosen studio pictures on a campaign's ads, in order (they repeat when there are fewer pictures than ads), and design each card on its picture. */
export async function wearPhotos(slug: string, key: string, ids: string[]): Promise<{ error?: string; done?: number; cards?: number }> {
  await requireMember();
  const brand = await getBrand(slug);
  const plans = await getPlans({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone });
  const p = plans.list.find((x) => x.key === key);
  if (!p?.ads) return { error: "This campaign has no ads yet" };
  if (Object.keys(p.meta?.placed ?? {}).length) return { error: "Its ads are already on Meta — make new ads to change the pictures" };
  const picked = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 12);
  if (!picked.length) return { error: "Pick at least one picture" };
  const r = await sendShots(slug, picked, p.ads.batchId);
  fresh(slug);
  return r.error ? { error: r.error } : { done: r.done, cards: r.cards };
}

/**
 * Design a campaign's ads as cards — its words set on its picture, a different layout on each — or put the plain pictures back.
 * Not once an ad is on Meta: what is running stays as it was approved.
 */
export async function designAds(slug: string, key: string, on: boolean): Promise<{ error?: string; made?: number }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const plans = await getPlans({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone });
  const p = plans.list.find((x) => x.key === key);
  if (!p?.ads) return { error: "This campaign has no ads yet" };
  if (Object.keys(p.meta?.placed ?? {}).length) return { error: "Its ads are already on Meta — make new ads to change the pictures" };
  const A = schema.ads;
  if (on) {
    if (!aiReady()) return { error: "Remy isn’t switched on for this workspace yet" };
    if (!p.image && !p.ads.thumbs.length) return { error: "These ads have no picture yet — add the product’s photo in Shopify, or a reference picture here" };
    const r = await layoutBatch(brand.id, p.ads.batchId, me.id, undefined, undefined, undefined, undefined, { plan: key, vary: true }).catch(() => ({ made: 0, error: "Remy couldn’t design them just now — try again" }));
    fresh(slug);
    return r.error || !r.made ? { error: r.error ?? "No picture could be designed" } : { made: r.made };
  }
  const rows = await db.select({ id: A.id, imageUrl: A.imageUrl, design: A.design }).from(A).where(and(eq(A.batchId, p.ads.batchId), eq(A.brandId, brand.id)));
  for (const a of rows) {
    const card = a.design?.card;
    if (!card || a.imageUrl !== card) continue;
    await db.update(A).set({ imageUrl: a.design?.image ?? null, design: null, updatedAt: new Date() }).where(eq(A.id, a.id));
    const id = /^\/api\/assets\/([0-9a-f-]{36})$/i.exec(card)?.[1];
    if (id) await deleteAssets(and(eq(schema.brandAssets.id, id), eq(schema.brandAssets.brandId, brand.id))).catch(() => undefined);
  }
  fresh(slug);
  return {};
}

/**
 * Take the set-up Iris worked out: the budget and length, and — for a campaign of the brand's own with no ads yet — who sees it. It is
 * saved, not approved: saying yes to the spend stays the brand's own press.
 */
export async function applySetup(slug: string, key: string, v: { budget: number; days: number; audience?: string }): Promise<{ error?: string }> {
  await requireMember();
  const brand = await getBrand(slug);
  const plans = await getPlans({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone });
  const p = plans.list.find((x) => x.key === key);
  if (!p) return { error: "That campaign is no longer listed." };
  if (p.meta) return { error: "This campaign is on Meta. Change its budget there with “Change it on Meta”." };
  if (v.audience && p.reason === "own" && !p.ads) {
    const a = plans.options.audiences.find((x) => x.key === v.audience);
    if (a) await setOwnAudience(brand.id, key, { who: a.label.split(" · ")[0], kind: a.kind, audience: a.size });
  }
  await savePlanChoice(brand.id, key, { budget: v.budget, days: v.days });
  fresh(slug);
  return {};
}
export async function setSalesTarget(slug: string, target: number | null): Promise<void> {
  await requireMember();
  await saveTarget((await getBrand(slug)).id, target);
  fresh(slug);
}

const NOT_ALLOWED = "Kaviar isn’t allowed to change this ad account yet — allow it in Settings › Integrations.";
const said = (m: string) => (m === "Kaviar may not change this ad account yet" ? NOT_ALLOWED : m);
async function planOf(slug: string, key: string) {
  const brand = await getBrand(slug);
  const plans = await getPlans({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone });
  return { brand, p: plans.list.find((x) => x.key === key) ?? null };
}

/** What Meta needs before this plan's ads can go on it, asked from Meta now. Creates nothing. */
export async function metaCheck(slug: string, key: string, country?: string): Promise<{ ready: Ready | null; country: string; link: string | null; advice: PlaceAdvice | null; error?: string }> {
  await requireMember();
  const { brand, p } = await planOf(slug, key);
  if (!p) return { ready: null, country: "US", link: null, advice: null, error: "That plan is no longer there." };
  const market = await planMarket(brand.id);
  // Where to show it: Iris's choice from the store's orders, where it ships, competitors' countries and the researched market —
  // until the brand has chosen, or the ad set already exists.
  const advice = p.meta?.adset ? null : await placeAdvice({ id: brand.id, currency: brand.currency ?? null }, market, p.budget / Math.max(1, p.days)).catch((e) => { console.error("place advice", (e as Error).message.slice(0, 160)); return null; });
  const c = countriesIn(country).join(",") || p.meta?.country || advice?.picks.join(",") || countryFor(market, brand.currency);
  const link = await productLink(brand.id, p.c.product);
  // Once the ad set is on Meta, the check is of the next ad to place: Meta is asked whether it would take it, and nothing is made.
  const m = p.meta, next = m?.adset && m.page && p.ads && link && p.image?.startsWith("https://")
    ? (await planAds(p.ads.batchId).catch(() => [])).find((a) => a.status === "approved" && !m.placed?.[a.id]) ?? null : null;
  const ready = await metaReady(brand.id, m?.campaignId ?? null, c, next && m?.adset && m.page && link && p.image
    ? { adsetId: m.adset, pageId: m.page, picture: p.image, urlTags: META_URL_PARAMS, copy: { text: next.text, headline: next.headline || next.hook, link, cta: next.cta } } : null).catch(() => null);
  return { ready, country: c, link, advice };
}

/** The picture of one ad, as a file: from Kaviar's own storage, or from the store's public address. */
async function pictureOf(brandId: string, src: string | null): Promise<Buffer | null> {
  if (!src) return null;
  const own = /^\/api\/assets\/([0-9a-f-]{36})/.exec(src);
  if (own) return (await readAssets(and(eq(schema.brandAssets.id, own[1]), eq(schema.brandAssets.brandId, brandId)), 1))[0]?.data ?? null;
  if (!src.startsWith("https://")) return null;
  const r = await fetch(src, { cache: "no-store" });
  if (!r.ok || !(r.headers.get("content-type") ?? "").startsWith("image/")) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.length > 0 && buf.length <= 8 * 1024 * 1024 ? buf : null;
}

/**
 * Put a plan on Meta, one piece at a time, so the brand sees each piece land: the campaign (paused, at the plan's daily budget), then
 * one ad set, then each approved ad. Call it again until `done`. What is already there is never made twice — every piece is saved the
 * moment Meta confirms it — so stopping half-way and pressing again carries on from where it stopped.
 * Nothing is spent by this: the campaign stays paused until the brand switches it on.
 */
export async function placeStep(slug: string, key: string, pick?: { page?: string; pixel?: string; country?: string }): Promise<{ done?: boolean; next?: string; placed: number; total: number; error?: string }> {
  await requireMember();
  const { brand, p } = await planOf(slug, key);
  if (!p) return { placed: 0, total: 0, error: "That plan is no longer there." };
  const ads = p.ads ? (await planAds(p.ads.batchId)).filter((a) => a.status === "approved") : [], total = ads.length;
  if (!total) return { placed: 0, total, error: "Approve at least one ad first." };
  const count = (m: { placed?: Record<string, string> }) => ads.filter((a) => m.placed?.[a.id]).length;

  if (!p.meta) {
    if (p.stage !== "ready") return { placed: 0, total, error: "Approve at least one ad first." };
    if (!p.approvedAt) return { placed: 0, total, error: "Approve this campaign’s budget first." };
    const daily = Math.max(1, Math.round((p.budget / p.days) * 100) / 100);
    const r = await createPausedCampaign(brand.id, `${brand.name} · ${p.title}`.slice(0, 180), daily);
    if (!r.ok) return { placed: 0, total, error: said(r.message) };
    await savePlanChoice(brand.id, key, { meta: { campaignId: r.id, account: r.account, at: new Date().toISOString(), daily } });
    fresh(slug);
    return { placed: 0, total, next: "Making the ad set" };
  }
  const m = p.meta;
  if (!m.adset) {
    // One or several countries, as the brand chose them ("US" or "US,CA").
    const country = countriesIn(pick?.country).join(",") || countryFor(await planMarket(brand.id), brand.currency);
    const ready = await metaReady(brand.id, null, country);
    if (!ready) return { placed: 0, total, error: "Meta isn’t connected." };
    const page = ready.pages.find((x) => x.id === pick?.page) ?? ready.pages[0], pixel = ready.pixels.find((x) => x.id === pick?.pixel) ?? ready.pixels[0];
    if (!page) return { placed: 0, total, error: "Kaviar can’t see a Facebook Page on this ad account. Ads are shown as coming from a Page — reconnect Meta in Settings › Integrations and include your Page." };
    if (!pixel) return { placed: 0, total, error: "This ad account has no Meta pixel, so Meta can’t count purchases. Add the Facebook & Instagram app in Shopify, then try again." };
    const r = await makeAdSet(brand.id, { campaignId: m.campaignId, name: `${p.title} · ${countryNames(country) || country}`, pixelId: pixel.id, country });
    if (!r.ok) return { placed: 0, total, error: said(r.message) };
    await savePlanChoice(brand.id, key, { meta: { ...m, adset: r.id, page: page.id, pixel: pixel.id, country } });
    fresh(slug);
    return { placed: 0, total, next: `Placing ad 1 of ${total}` };
  }
  const todo = ads.filter((a) => !m.placed?.[a.id]);
  if (!todo.length) return { done: true, placed: total, total };
  const ad = todo[0], link = await productLink(brand.id, p.c.product);
  if (!link) return { placed: count(m), total, error: "Kaviar doesn’t know this product’s page on your store yet — run a sync in Settings, then try again." };
  if (!m.page) return { placed: count(m), total, error: "No Facebook Page was chosen for this campaign." };
  const picture = await pictureOf(brand.id, ad.image).catch(() => null);
  if (!picture) return { placed: count(m), total, error: `“${ad.hook.slice(0, 50)}” has no picture Kaviar can send to Meta. Give it one in the studio.` };
  const r = await makeAd(brand.id, { adsetId: m.adset, pageId: m.page, name: ad.hook.slice(0, 90), picture, urlTags: META_URL_PARAMS, copy: { text: ad.text, headline: ad.headline || ad.hook, link, cta: ad.cta } });
  if (!r.ok) return { placed: count(m), total, error: said(r.message) };
  const placed = { ...(m.placed ?? {}), [ad.id]: r.id };
  await savePlanChoice(brand.id, key, { meta: { ...m, placed } });
  fresh(slug);
  const n = count({ placed });
  return n >= total ? { done: true, placed: n, total } : { placed: n, total, next: `Placing ad ${n + 1} of ${total}` };
}

/** Switch the plan's campaign on — for the plan's number of days, after which Meta stops it by itself — or pause it. This is the step that spends money. */
export async function switchPlan(slug: string, key: string, on: boolean): Promise<{ error?: string }> {
  await requireMember();
  const { brand, p } = await planOf(slug, key);
  const m = p?.meta;
  if (!p || !m) return { error: "This plan has no campaign on Meta yet." };
  if (on && (!m.adset || !Object.keys(m.placed ?? {}).length)) return { error: "Its ads aren’t on Meta yet." };
  const r = await switchCampaign(brand.id, { campaignId: m.campaignId, adsetId: m.adset, on, days: p.days });
  if (!r.ok) return { error: said(r.message) };
  await savePlanChoice(brand.id, key, { meta: { ...m, onAt: on ? new Date().toISOString() : undefined, until: on ? r.until : null } });
  fresh(slug);
  return {};
}

/**
 * Change the budget or length of a plan whose campaign is already on Meta. The campaign's daily budget is changed there first; the plan
 * is only updated once Meta confirms it. If it is running to an end date, that date moves with the new length.
 */
export async function changeBudgetOnMeta(slug: string, key: string, budget: number, days: number): Promise<{ error?: string }> {
  await requireMember();
  const { brand, p } = await planOf(slug, key), m = p?.meta;
  if (!p || !m) return { error: "This plan has no campaign on Meta." };
  if (!(budget >= 50) || !(days >= 3)) return { error: "Set a budget of at least 50 over at least 3 days." };
  const daily = Math.max(1, Math.round((budget / days) * 100) / 100);
  const until = m.onAt ? new Date(Date.parse(m.onAt) + days * 86_400_000).toISOString() : null;
  if (until && Date.parse(until) < Date.now() + 3_600_000) return { error: "That length has already passed for this campaign — pick a longer one, or pause it." };
  const r = await setCampaignBudget(brand.id, { campaignId: m.campaignId, daily, adsetId: m.adset, until });
  if (!r.ok) return { error: said(r.message) };
  await savePlanChoice(brand.id, key, { budget, days, meta: { ...m, daily, ...(until ? { until } : {}) } });
  fresh(slug);
  return {};
}

/** A campaign of the brand's own: what to sell, to whom, for how much. Starting it approves it. */
export async function createOwnPlan(slug: string, v: { name: string; product: string; audience: string; budget: number; days: number }): Promise<{ key?: string; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const plans = await getPlans({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone });
  const product = plans.options.products.find((x) => x.title === v.product), who = plans.options.audiences.find((x) => x.key === v.audience);
  if (!product) return { error: "Pick a product." };
  if (!who) return { error: "Pick who should see it." };
  if (!(v.budget >= 50)) return { error: "Set a budget of at least 50." };
  const name = v.name.trim().slice(0, 80) || `${product.title} · ${who.label.split(" · ")[0]}`;
  const key = await addOwnPlan(brand.id, { name, product: product.title, who: who.label.split(" · ")[0], kind: who.kind, audience: who.size, by: me.name }, v.budget, v.days);
  fresh(slug);
  return { key };
}
export async function deleteOwnPlan(slug: string, key: string): Promise<void> {
  await requireMember();
  if (!key.startsWith("own:")) return;
  await removeOwnPlan((await getBrand(slug)).id, key);
  fresh(slug);
}

// ---------------------------------------------------------------- what the brand gives Remy to work from
const MAX_REF = 4 * 1024 * 1024; // a request can't carry more than 4.5 MB

/** A reference picture for one plan: the brand's own photo, a look it likes. Kept with the plan and with Brand assets. */
export async function addReference(slug: string, key: string, form: FormData): Promise<{ id?: string; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug), f = form.get("file");
  if (!(f instanceof File) || !f.size) return { error: "Pick a picture." };
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return { error: `${f.name} isn’t a PNG, JPG or WebP picture.` };
  if (f.size > MAX_REF) return { error: `${f.name} is over 4 MB.` };
  const b = await planBrief(brand.id, key);
  if (b.refs.length >= 8) return { error: "Eight references at most — remove one first." };
  const buf = Buffer.from(await f.arrayBuffer());
  const [row] = await saveAsset({ brandId: brand.id, kind: "imagery", name: f.name.slice(0, 120), mime: f.type, size: f.size, data: buf, meta: { ...dims(buf), plan: key, ref: true }, createdBy: me.id });
  await savePlanChoice(brand.id, key, { brief: { ...b, refs: [...b.refs, row.id] } });
  fresh(slug);
  return { id: row.id };
}
export async function removeReference(slug: string, key: string, id: string): Promise<void> {
  await requireMember();
  const brand = await getBrand(slug), b = await planBrief(brand.id, key);
  if (!b.refs.includes(id)) return;
  await savePlanChoice(brand.id, key, { brief: { ...b, refs: b.refs.filter((x) => x !== id) } });
  // The file goes too, unless an ad is already using it.
  await deleteAssets(and(eq(schema.brandAssets.id, id), eq(schema.brandAssets.brandId, brand.id), sql`${schema.brandAssets.meta}->>'ref' = 'true'`, sql`not exists (select 1 from ads a where a.image_url = '/api/assets/' || ${id})`));
  fresh(slug);
}
/** The brand's own words for the campaign, and whether new pictures should be shot in the references' style. */
export async function saveBrief(slug: string, key: string, note: string, shoot: boolean): Promise<void> {
  await requireMember();
  const brand = await getBrand(slug), b = await planBrief(brand.id, key);
  await savePlanChoice(brand.id, key, { brief: { ...b, note: note.trim().slice(0, 600), shoot } });
  fresh(slug);
}

// ---------------------------------------------------------------- the studio: "make ads for this"
export type StudioPlan = { key: string; title: string; product: string; image: string | null; onMeta: boolean; approved: boolean; budget: number; days: number };
export type StudioAds = { plan: StudioPlan; ads: Awaited<ReturnType<typeof planAds>>; brief: Awaited<ReturnType<typeof briefView>>; batchId: string | null; placed: Record<string, string> };
/**
 * Where ads asked for in the studio belong. Every ad belongs to a campaign, so Kaviar finds it: the campaign named, or the one this
 * product already has. With several, Remy asks which — the occasion changes what the ads say. With none, a campaign of the brand's own
 * is started for the product, not approved: the brand asked for ads, not for spend, and its budget gets its yes on its own page.
 */
export async function studioTarget(slug: string, v: { plan?: string; product?: string; fresh?: boolean }): Promise<{ key: string; title: string; product: string; started?: boolean } | { ask: { key: string; title: string; sub: string }[]; product: string } | { error: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const plans = await getPlans({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone });
  const named = v.plan ? plans.list.find((x) => x.key === v.plan) : undefined;
  if (named && !named.meta && !v.fresh) return { key: named.key, title: named.title, product: named.c.product };
  const product = plans.options.products.find((x) => x.title === (v.product ?? named?.c.product));
  if (!product) return { error: "Pick a product first — type @." };
  const open = plans.list.filter((x) => x.c.product === product.title && !x.meta);
  if (!v.fresh && open.length === 1) return { key: open[0].key, title: open[0].title, product: product.title };
  if (!v.fresh && open.length > 1) return { product: product.title, ask: open.slice(0, 4).map((x) => ({ key: x.key, title: x.title,
    sub: [x.reason === "own" ? "Your campaign" : x.reason === "holiday" ? "Holiday" : x.reason === "lapsed" ? "Buyers gone quiet" : x.reason === "overstock" ? "Stock sitting" : "New buyers", x.when, x.ads ? `${x.ads.review + x.ads.approved} ads already` : null].filter(Boolean).join(" · ") })) };
  const key = await addOwnPlan(brand.id, { name: product.title.slice(0, 80), product: product.title, who: "New people", kind: "cold", audience: null, by: me.name }, plans.minBudget, 14, false);
  fresh(slug);
  return { key, title: product.title, product: product.title, started: true };
}
/** One campaign's ads and what Remy works from, for the studio's thread. */
export async function studioAds(slug: string, key: string): Promise<StudioAds | null> {
  await requireMember();
  const brand = await getBrand(slug);
  const p = (await getPlans({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone })).list.find((x) => x.key === key);
  if (!p) return null;
  const [ads, brief] = await Promise.all([p.ads ? planAds(p.ads.batchId).catch(() => []) : Promise.resolve([]), briefView(brand.id, key)]);
  return { plan: { key: p.key, title: p.title, product: p.c.product, image: p.image, onMeta: Boolean(p.meta), approved: Boolean(p.approvedAt), budget: p.budget, days: p.days }, ads, brief, batchId: p.ads?.batchId ?? null, placed: p.meta?.placed ?? {} };
}
