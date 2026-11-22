"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import { and, eq, sql } from "drizzle-orm";
import { schema } from "@/lib/db";
import { deleteAssets, saveAsset } from "@/lib/assets/storage";
import { imageSize } from "@/lib/creative/higgsfield";
import { addOwnPlan, getPlans, planAds, planBrief, planMarket, productLink, removeOwnPlan, savePlanChoice, saveTarget } from "@/lib/growth/plans";
import { makeAd, makeAdSet, metaReady, switchCampaign, type Ready } from "@/lib/meta/place";
import { COUNTRIES, countryFor } from "@/lib/meta/place-rules";
import { META_URL_PARAMS } from "@/lib/sync/attribution";
import { readAssets } from "@/lib/assets/storage";
import { createPausedCampaign } from "@/lib/meta/apply";

const fresh = (slug: string) => { for (const p of ["campaigns", "today"]) revalidatePath(`/brands/${slug}/${p}`, p === "campaigns" ? "layout" : "page"); };

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
export async function metaCheck(slug: string, key: string, country?: string): Promise<{ ready: Ready | null; country: string; link: string | null; error?: string }> {
  await requireMember();
  const { brand, p } = await planOf(slug, key);
  if (!p) return { ready: null, country: "US", link: null, error: "That plan is no longer there." };
  const c = country && COUNTRIES.some(([k]) => k === country) ? country : p.meta?.country ?? countryFor(await planMarket(brand.id), brand.currency);
  const [ready, link] = await Promise.all([metaReady(brand.id, p.meta?.campaignId ?? null, c).catch(() => null), productLink(brand.id, p.c.product)]);
  return { ready, country: c, link };
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
    const daily = Math.max(1, Math.round((p.budget / p.days) * 100) / 100);
    const r = await createPausedCampaign(brand.id, `${brand.name} · ${p.title}`.slice(0, 180), daily);
    if (!r.ok) return { placed: 0, total, error: said(r.message) };
    await savePlanChoice(brand.id, key, { meta: { campaignId: r.id, account: r.account, at: new Date().toISOString(), daily } });
    fresh(slug);
    return { placed: 0, total, next: "Making the ad set" };
  }
  const m = p.meta;
  if (!m.adset) {
    const country = pick?.country && COUNTRIES.some(([k]) => k === pick.country) ? pick.country : countryFor(await planMarket(brand.id), brand.currency);
    const ready = await metaReady(brand.id, null, country);
    if (!ready) return { placed: 0, total, error: "Meta isn’t connected." };
    const page = ready.pages.find((x) => x.id === pick?.page) ?? ready.pages[0], pixel = ready.pixels.find((x) => x.id === pick?.pixel) ?? ready.pixels[0];
    if (!page) return { placed: 0, total, error: "Kaviar can’t see a Facebook Page on this ad account. Ads are shown as coming from a Page — reconnect Meta in Settings › Integrations and include your Page." };
    if (!pixel) return { placed: 0, total, error: "This ad account has no Meta pixel, so Meta can’t count purchases. Add the Facebook & Instagram app in Shopify, then try again." };
    const r = await makeAdSet(brand.id, { campaignId: m.campaignId, name: `${p.title} · ${COUNTRIES.find(([k]) => k === country)?.[1] ?? country}`, pixelId: pixel.id, country });
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
  const [row] = await saveAsset({ brandId: brand.id, kind: "imagery", name: f.name.slice(0, 120), mime: f.type, size: f.size, data: buf, meta: { ...(imageSize(buf) ?? {}), plan: key, ref: true }, createdBy: me.id });
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
