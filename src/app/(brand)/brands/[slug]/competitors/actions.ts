"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import { addRival, removeRival, runBench } from "@/lib/seo/bench";
import { addOwnPlan, getPlans, savePlanChoice } from "@/lib/growth/plans";
import { runAnswers } from "@/lib/seo/answers";
import { aiReady } from "@/lib/ai/client";

const fresh = (slug: string) => { for (const p of ["competitors", "seo", "today"]) revalidatePath(`/brands/${slug}/${p}`); };

/** Ask the assistant the brand's buyer questions and count who it names. About a minute; the same questions as last time. */
export async function askAssistant(slug: string): Promise<{ error?: string }> {
  const me = await requireMember();
  if (!aiReady()) return { error: "The assistant isn’t switched on for this workspace yet" };
  const brand = await getBrand(slug);
  try { const r = await runAnswers({ id: brand.id, name: brand.name, category: brand.category ?? null }, me.name); if (!r.error) revalidatePath(`/brands/${slug}/competitors`); return r; }
  catch (e) { console.error("ai answers", (e as Error).message.slice(0, 200)); return { error: "The assistant couldn’t be asked just now — try again" }; }
}

/** The products a campaign can be started for — the same ones "New campaign" offers. */
export async function versionProducts(slug: string): Promise<{ title: string; price: number; stock: number; image: string | null }[]> {
  await requireMember();
  const brand = await getBrand(slug);
  return (await getPlans({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone })).options.products;
}
/**
 * "Make our version" of an ad a competitor kept running: starts a campaign of the brand's own for the product picked, with the idea as
 * Remy's brief — the idea, never their wording. It is not approved: the brand asked for ads, not for spend.
 */
export async function makeOurVersion(slug: string, v: { competitor: string; text: string; days: number; product: string }): Promise<{ key?: string; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const plans = await getPlans({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone });
  const product = plans.options.products.find((x) => x.title === v.product);
  if (!product) return { error: "Pick a product" };
  const said = v.text.replace(/\s+/g, " ").trim().slice(0, 300), who = v.competitor.trim().slice(0, 60);
  if (said.length < 12) return { error: "That ad has no words to work from" };
  const key = await addOwnPlan(brand.id, { name: `Our version · ${who}’s ${Math.round(v.days)}-day ad`.slice(0, 80), product: product.title, who: "New people", kind: "cold", audience: null, by: me.name }, plans.minBudget, 14, false);
  await savePlanChoice(brand.id, key, { brief: { refs: [], shoot: false, note: `${who} kept an ad with this message running ${Math.round(v.days)} days: “${said}”. Write our own version of the idea for ${product.title}, in our voice. Do not copy their wording or their claims.`.slice(0, 600) } });
  for (const p of ["campaigns", "today", "plan"]) revalidatePath(`/brands/${slug}/${p}`, p === "campaigns" ? "layout" : "page");
  return { key };
}

/** Read the brand's public site and each competitor's again, now. */
export async function readRivals(slug: string): Promise<{ error?: string }> {
  await requireMember();
  const brand = await getBrand(slug);
  try { const r = await runBench({ id: brand.id, name: brand.name }); fresh(slug); return { error: r.error }; }
  catch (e) { console.error("bench", (e as Error).message.slice(0, 200)); return { error: "Kaviar couldn’t read the sites just now — try again" }; }
}
export async function addCompetitor(slug: string, name: string, url: string): Promise<{ error?: string }> {
  await requireMember();
  try { const r = await addRival((await getBrand(slug)).id, name, url); fresh(slug); return r; }
  catch (e) { console.error("bench add", (e as Error).message.slice(0, 200)); return { error: "That website couldn’t be read" }; }
}
export async function removeCompetitor(slug: string, url: string): Promise<void> {
  await requireMember();
  await removeRival((await getBrand(slug)).id, url);
  fresh(slug);
}
