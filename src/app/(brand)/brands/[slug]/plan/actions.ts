"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import { savePlan, savedPlan, type SavedPlan } from "@/lib/growth/plan-data";
import { readyTests } from "@/lib/research/context";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { shoot } from "@/lib/creative/shoots";
import { getPlans, planBrief } from "@/lib/growth/plans";
import { REASON_NAME } from "@/lib/growth/plans-rules";
import { buildPipeline } from "../creative/actions";

/** Keep the brand's choices (margin, budget, period, goal, offer) and mark the plan approved. */
export async function approvePlan(slug: string, input: SavedPlan, approve: boolean): Promise<{ ok?: true; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
  const before = (await savedPlan(brand.id)) ?? {};
  const goal = (["profit", "revenue", "customers"] as const).find((g) => g === input.goal);
  await savePlan(brand.id, { ...before, margin: num(input.margin, 0.05, 0.95) ?? before.margin, budget: num(input.budget, 0, 5_000_000) ?? before.budget, days: num(input.days, 7, 90) ?? before.days,
    goal: goal ?? before.goal, discount: num(input.discount, 0, 0.9) ?? before.discount, product: typeof input.product === "string" ? input.product.slice(0, 200) : before.product, order: num(input.order, 1, 100_000) ?? before.order, ...(approve ? { approvedAt: new Date().toISOString(), by: me.name } : {}) });
  revalidatePath(`/brands/${slug}/plan`);
  revalidatePath(`/brands/${slug}/today`);
  return { ok: true };
}

/**
 * The ads for one plan. Ads are never made for their own sake: the plan must exist — which means its reason holds today — and the
 * brand must have approved it. Then Remy writes three for that audience, filed under the plan, and Shoots opens with them.
 */
export async function makeAds(slug: string, key: string, stay = false): Promise<{ error?: string; batchId?: string; note?: string } | undefined> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const [plans, tests] = await Promise.all([getPlans({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone }), readyTests(brand.id).catch(() => [])]);
  const p = plans.list.find((x) => x.key === key);
  if (!p) return { error: "That plan’s reason no longer holds — open Campaigns for today’s plans." };
  if (p.stage === "suggested") return { error: "Approve the plan first — ads are made once you’ve said yes to it." };
  const c = p.c, t = tests.find((x) => x.key === c.signal), brief = await planBrief(brand.id, key);
  const r = await buildPipeline(slug, { format: "static", product: c.product, signal: c.signal ?? key, audience: t?.who ?? `${c.name} — ${c.why}`.slice(0, 200),
    angles: t?.messages?.length ? t.messages : [`${p.title}`.slice(0, 90)], count: 3, look: t?.visual ?? "", adLook: "Ad look · Big word", seconds: 0, why: t?.hypothesis ?? p.why, note: brief.note,
    reason: { data: p.title, value: p.when ?? null, use: `${REASON_NAME[p.reason]} — ${p.why}`, evidence: [["Why now", p.title], ["Detail", p.why], ["Budget", `${p.budget} over ${p.days} days`]] } }, stay);
  if (!stay) return r?.error ? { error: r.error } : undefined;
  if (r?.error || !r?.batchId) return { error: r?.error ?? "Remy couldn’t write the ads right now." };
  // The pictures. With references: the brand's own pictures go on the ads as they are — or, if it asked, new ones are shot in their
  // style from the real product photo. Without references the ads keep the product's Shopify photo.
  let note: string | undefined;
  const refs = brief.refs.length ? await db.select({ id: schema.brandAssets.id }).from(schema.brandAssets).where(and(eq(schema.brandAssets.brandId, brand.id), inArray(schema.brandAssets.id, brief.refs), sql`${schema.brandAssets.mime} like 'image/%'`)) : [];
  const order = brief.refs.filter((id) => refs.some((x) => x.id === id));
  if (order.length) {
    const ads = await db.select({ id: schema.ads.id, hook: schema.ads.hook, image: schema.ads.imageUrl }).from(schema.ads).where(eq(schema.ads.batchId, r.batchId)).orderBy(asc(schema.ads.position));
    if (brief.shoot && p.image) {
      const shots = await Promise.all(ads.map((ad, i) => shoot(brand.id, me.id, { product: c.product, imageUrl: p.image!, aspect: "4:5", n: 1, referenceId: order[i % order.length],
        prompt: `A photograph for a paid social ad of ${c.product}. The ad says: “${ad.hook}”.${brief.note ? ` From the brand: ${brief.note}.` : ""} Match the last reference image for light, mood and composition. No text, no logos added.` }).catch((e) => ({ ids: [] as string[], error: (e as Error).message }))));
      let made = 0;
      for (const [i, sh] of shots.entries()) {
        const id = sh.ids[0];
        if (!id) continue;
        made++;
        await db.update(schema.brandAssets).set({ meta: sql`${schema.brandAssets.meta} || ${JSON.stringify({ plan: key })}::jsonb` }).where(eq(schema.brandAssets.id, id)); // shot for this plan, at the brand's request
        await db.update(schema.ads).set({ imageUrl: `/api/assets/${id}` }).where(eq(schema.ads.id, ads[i].id));
      }
      if (made < ads.length) note = made ? `${made} of ${ads.length} pictures were shot — the rest use the product photo` : `No picture could be shot (${shots.find((x) => x.error)?.error?.slice(0, 80) ?? "the image service didn’t answer"}) — the ads use the product photo`;
    } else for (const [i, ad] of ads.entries()) await db.update(schema.ads).set({ imageUrl: `/api/assets/${order[i % order.length]}` }).where(eq(schema.ads.id, ad.id));
  }
  revalidatePath(`/brands/${slug}/campaigns`, "layout"); revalidatePath(`/brands/${slug}/today`);
  return { batchId: r.batchId, ...(note ? { note } : {}) };
}
