"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import { and, eq, sql } from "drizzle-orm";
import { schema } from "@/lib/db";
import { deleteAssets, saveAsset } from "@/lib/assets/storage";
import { imageSize } from "@/lib/creative/higgsfield";
import { addOwnPlan, getPlans, planBrief, removeOwnPlan, savePlanChoice, saveTarget } from "@/lib/growth/plans";
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

/**
 * Put a plan on Meta: Kaviar makes the campaign there — paused, named after the plan, at the plan's daily budget — and remembers it,
 * so the plan's results and Autopilot follow that campaign. It cannot spend until the brand adds the ads and switches it on in Meta.
 */
export async function launchPlan(slug: string, key: string): Promise<{ error?: string }> {
  await requireMember();
  const brand = await getBrand(slug);
  const plans = await getPlans({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone });
  const p = plans.list.find((x) => x.key === key);
  if (!p) return { error: "That plan is no longer there." };
  if (p.meta) return { error: "This plan already has its campaign on Meta." };
  if (p.stage !== "ready") return { error: "Approve at least one ad first." };
  const daily = Math.max(1, Math.round((p.budget / p.days) * 100) / 100);
  const r = await createPausedCampaign(brand.id, `${brand.name} · ${p.title}`.slice(0, 180), daily);
  if (!r.ok) return { error: r.message === "Kaviar may not change this ad account yet" ? "Kaviar isn’t allowed to change this ad account yet — allow it in Settings › Integrations." : r.message };
  await savePlanChoice(brand.id, key, { meta: { campaignId: r.id, account: r.account, at: new Date().toISOString(), daily } });
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
