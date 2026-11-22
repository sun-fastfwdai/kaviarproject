"use server";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { aiReady } from "@/lib/ai/client";
import { getBrand } from "@/lib/queries/brands";
import { signalData } from "@/lib/queries/signals";
import { getNotes } from "@/lib/ai/notes";
import { buildSignals } from "@/lib/signals/build";
import { createBatch, moreVariations, redoAd, type BatchKind } from "@/lib/creative/remy";
import { researchSignals } from "@/lib/research/context";
import type { AdDesign } from "@/lib/db/schema";
import { redrawCard } from "@/lib/creative/design";
import { editWithRemy } from "@/lib/creative/editor-agent";
import { planWithRemy, type PlanBrief, type PlanOption, type PlanReply, type PlanTurn } from "@/lib/creative/planner";

export type State = { error?: string; at?: number; batchId?: string } | undefined;
const fail = (error: string): State => ({ error, at: Date.now() });

const kindOf = (form: FormData): BatchKind => { const k = String(form.get("kind") ?? ""); return k === "static" || k === "video" || k === "ugc" || k === "mixed" ? k : "mixed"; };
/** Every batch is built in Shoots: the pipeline there is laid out for what the batch is made of (static cards, product clips, UGC). */
const shootsFor = (slug: string, batchId: string, kind: BatchKind, extra = "") =>
  `/brands/${slug}/creative/shoots?batch=${batchId}${kind === "mixed" ? "" : `&layout=${kind}`}${extra}`;

/** "Write the ads" from a plan or a signal's page — Remy writes the batch in the chosen format, then the matching pipeline takes over. */
export async function writeAdsFromSignal(slug: string, key: string, _: State, form: FormData): Promise<State> {
  const me = await requireMember();
  if (!aiReady()) return fail("Remy needs the Claude API key to write ads.");
  const brand = await getBrand(slug);
  // A buyer group from market research: Remy writes for them with the research's message (positioning comes in with the market context).
  if (key.startsWith("seg:")) {
    const r = (await researchSignals(brand.id)).find((x) => x.key === key);
    if (!r) return fail("That buyer group isn’t in the research any more.");
    const kind = kindOf(form);
    const id = await createBatch(brand.id, me.id, { signal: { key: r.key, data: `${r.data} — a buyer group from market research`, value: r.value, use: `${r.use}. ${r.why}`, evidence: r.evidence }, count: Number(form.get("count")) || 6, kind });
    if (!id) return fail("Remy couldn’t write ads right now. Try again in a minute.");
    redirect(shootsFor(slug, id, kind, `&signal=${encodeURIComponent(r.key)}${r.product ? `&product=${encodeURIComponent(r.product)}` : ""}`));
  }
  const [d, notes] = await Promise.all([signalData(brand.id, brand.timezone), getNotes(brand.id)]);
  const row = buildSignals(`/brands/${slug}`, brand, d, notes).find((r) => r.key === key);
  if (!row) return fail("That signal doesn’t exist.");
  const count = Number(form.get("count")) || 6;
  const kind = kindOf(form);
  const id = await createBatch(brand.id, me.id, { signal: { key: row.key, data: row.data, value: row.value, use: row.use, evidence: row.evidence }, count, kind });
  if (!id) return fail("Remy couldn’t write ads right now. Try again in a minute.");
  redirect(shootsFor(slug, id, kind, `&signal=${encodeURIComponent(row.key)}`));
}

/** The Plan chat: one form — a plan card's button sends `signal`, the composer sends `idea`. */
export async function startBatch(slug: string, prev: State, form: FormData): Promise<State> {
  const signal = form.get("signal");
  if (typeof signal === "string" && signal) return writeAdsFromSignal(slug, signal, prev, form);
  return writeAdsFromIdea(slug, prev, form);
}

/** "Start your own batch from an idea" on Creative studio. */
export async function writeAdsFromIdea(slug: string, _: State, form: FormData): Promise<State> {
  const me = await requireMember();
  if (!aiReady()) return fail("Remy needs the Claude API key to write ads.");
  const idea = String(form.get("idea") ?? "").trim().slice(0, 600);
  if (idea.length < 8) return fail("Describe the idea in a sentence.");
  const brand = await getBrand(slug);
  const kind = kindOf(form);
  const id = await createBatch(brand.id, me.id, { idea, count: Number(form.get("count")) || 6, kind });
  if (!id) return fail("Remy couldn’t write ads right now. Try again in a minute.");
  redirect(shootsFor(slug, id, kind));
}

async function ownAd(slug: string, adId: string) {
  await requireMember();
  const brand = await getBrand(slug);
  const [ad] = await db.select({ id: schema.ads.id }).from(schema.ads).where(and(eq(schema.ads.id, adId), eq(schema.ads.brandId, brand.id)));
  if (!ad) throw new Error("Ad not found");
  return brand;
}

export async function setAdStatus(slug: string, adId: string, status: "review" | "approved" | "rejected", note?: string): Promise<void> {
  await ownAd(slug, adId);
  await db.update(schema.ads).set({ status, note: status === "rejected" ? (note?.trim().slice(0, 300) || null) : null, updatedAt: new Date() }).where(eq(schema.ads.id, adId));
}

export async function saveAd(slug: string, adId: string, fields: { hook: string; primaryText: string; headline: string; offer: string; cta: string }): Promise<State> {
  await ownAd(slug, adId);
  const clean = (s: string, n: number) => s.trim().slice(0, n);
  if (!fields.hook.trim() || !fields.headline.trim()) return fail("Hook and headline can’t be empty.");
  await db.update(schema.ads).set({
    hook: clean(fields.hook, 120), primaryText: clean(fields.primaryText, 600), headline: clean(fields.headline, 80), offer: clean(fields.offer, 120), cta: clean(fields.cta, 30),
    edited: true, updatedAt: new Date(),
  }).where(eq(schema.ads.id, adId));
  return undefined;
}

export async function redo(slug: string, adId: string): Promise<State> {
  await ownAd(slug, adId);
  return (await redoAd(adId)) ? undefined : fail("Remy couldn’t rewrite it right now.");
}

export async function variations(slug: string, adId: string): Promise<State> {
  await ownAd(slug, adId);
  return (await moreVariations(adId)) ? undefined : fail("Remy couldn’t write variations right now.");
}

export async function deleteBatch(slug: string, batchId: string): Promise<void> {
  await requireMember();
  const brand = await getBrand(slug);
  await db.delete(schema.adBatches).where(and(eq(schema.adBatches.id, batchId), eq(schema.adBatches.brandId, brand.id)));
  redirect(`/brands/${slug}/creative`);
}

/** Save the Editor's layout. The first text layer becomes the ad's hook, and the background its image. */
export async function saveDesign(slug: string, adId: string, design: AdDesign): Promise<State> {
  const brand = await ownAd(slug, adId);
  if (!Array.isArray(design.layers) || design.layers.length > 30) return fail("That layout can’t be saved.");
  const layers = design.layers.map((l) => ({ ...l, text: String(l.text ?? "").slice(0, 300), x: Math.min(1, Math.max(0, Number(l.x))), y: Math.min(1, Math.max(0, Number(l.y))), w: Math.min(1, Math.max(0.05, Number(l.w))), size: Math.min(480, Math.max(0, Number(l.size))) }));
  const image = design.image && /^(https:\/\/|\/api\/assets\/)/.test(design.image) ? design.image : null;
  const head = layers.find((l) => l.kind === "text")?.text;
  const clean: AdDesign = {
    image, overlay: Math.min(0.9, Math.max(0, Number(design.overlay) || 0)), overlayTop: Math.min(0.9, Math.max(0, Number(design.overlayTop) || 0)),
    layers: layers.map((l) => ({ ...l, font: l.font === "serif" || l.font === "display" || l.font === "condensed" ? l.font : "sans", opacity: l.opacity != null ? Math.min(1, Math.max(0.05, Number(l.opacity))) : undefined, bullet: l.bullet ? true : undefined, align: l.align === "center" || l.align === "right" ? l.align : "left", tracking: l.tracking ? Math.min(0.4, Math.max(0, Number(l.tracking))) : undefined })),
    ...(design.layout ? { layout: String(design.layout).slice(0, 20) } : {}), ...(design.copy ? { copy: design.copy } : {}),
  };
  // The ad's picture becomes the finished card (photo + type), drawn on the server with the same fonts as the Editor.
  if (design.video) { // a clip: the Editor keeps its words; the clip itself is made in Shoots
    await db.update(schema.ads).set({ design: { ...clean, image: null, video: design.video }, edited: true, updatedAt: new Date() }).where(eq(schema.ads.id, adId));
    return undefined;
  }
  await db.update(schema.ads).set({ ...(head ? { hook: head.slice(0, 120) } : {}), edited: true, updatedAt: new Date() }).where(eq(schema.ads.id, adId));
  const card = await redrawCard(brand.id, null, adId, clean);
  if (!card) await db.update(schema.ads).set({ design: clean, imageUrl: image }).where(eq(schema.ads.id, adId));
  return undefined;
}

/** The Editor's agent: change one ad's design in words — the selected element, or the whole ad. Returns the new design for the Editor to show (unsaved). */
export async function askEditor(slug: string, adId: string, design: AdDesign, instruction: string, selected: string | null, recent: string[] = []): Promise<{ design?: AdDesign; say: string; shoots?: boolean }> {
  const brand = await ownAd(slug, adId);
  if (!aiReady()) return { say: "Remy needs the Claude API key." };
  if (instruction.trim().length < 2) return { say: "Tell me what to change." };
  if (!Array.isArray(design?.layers) || design.layers.length > 30) return { say: "That layout can’t be edited." };
  const [ad] = await db.select().from(schema.ads).where(eq(schema.ads.id, adId));
  const A = schema.brandAssets;
  const pics = await db.select({ id: A.id, name: A.name, meta: A.meta }).from(A).where(and(eq(A.brandId, brand.id), eq(A.kind, "imagery"), sql`${A.mime} like 'image/%'`, sql`coalesce(${A.meta}->>'edit', '') <> 'card'`)).orderBy(desc(A.createdAt)).limit(14);
  return editWithRemy(brand.id, brand.name, { hook: ad.hook, primaryText: ad.primaryText, headline: ad.headline, cta: ad.cta, offer: ad.offer, product: ad.product }, design, {
    instruction, selected, recent: recent.map((r) => String(r).slice(0, 300)),
    pictures: pics.map((p) => ({ url: `/api/assets/${p.id}`, name: `${p.name}${p.meta.prompt ? ` — ${p.meta.prompt.slice(0, 80)}` : ""}` })),
    palette: (brand.onboarding?.analysis?.palette ?? []).map((c) => `${c.role}: ${c.hex}`),
  });
}

/** One turn of the Plan conversation: Remy asks what's missing, or returns the brief and the pipeline it will set up. */
export async function planTurn(slug: string, turns: PlanTurn[], options: { plans: PlanOption[]; buyers: PlanOption[] }): Promise<PlanReply | { error: string }> {
  await requireMember();
  if (!aiReady()) return { error: "Remy needs the Claude API key." };
  const brand = await getBrand(slug);
  const clean = turns.slice(-14).map((t) => ({ who: t.who === "remy" ? "remy" as const : "you" as const, text: String(t.text).slice(0, 700) }));
  const cut = (xs: PlanOption[]) => (Array.isArray(xs) ? xs : []).slice(0, 8).map((o) => ({ key: String(o.key).slice(0, 80), title: String(o.title).slice(0, 120), why: String(o.why).slice(0, 400) }));
  const r = await planWithRemy(brand.id, clean, { plans: cut(options.plans), buyers: cut(options.buyers) });
  return r ?? { error: "Remy couldn’t answer just now — try again." };
}

/** The plan is agreed: Remy writes the batch, and Shoots opens with the pipeline laid out for it. */
export async function buildPipeline(slug: string, brief: PlanBrief, stay = false): Promise<State> {
  const me = await requireMember();
  if (!aiReady()) return fail("Remy needs the Claude API key to write ads.");
  const brand = await getBrand(slug);
  const format = (["static", "video", "ugc", "full"] as const).find((f) => f === brief.format) ?? "static";
  const count = [3, 6, 9].includes(brief.count) ? brief.count : 6;
  const angles = (Array.isArray(brief.angles) ? brief.angles : []).map((a) => String(a).slice(0, 90)).slice(0, 4);
  const product = String(brief.product ?? "").slice(0, 200), audience = String(brief.audience ?? "").slice(0, 200), look = String(brief.look ?? "").slice(0, 200);
  const direction = `Plan agreed with the team — ${format === "full" ? "a full video ad" : `${format} ads`}${product ? ` for ${product}` : ""}${audience ? `, for ${audience}` : ""}. Messages to test: ${angles.join("; ") || "your best angles"}.${look ? ` Look: ${look}.` : ""}`;
  const said = String(brief.note ?? "").trim().slice(0, 600), told = said ? `${direction} The brand’s own notes for this campaign, to follow closely: “${said}”.` : direction;
  // The buyer or plan it's for, re-read from the brand's own data.
  let signal: { key: string; data: string; value: string | null; use: string; evidence: [string, string][] } | undefined;
  const key = String(brief.signal ?? "");
  if (key.startsWith("seg:")) {
    const r = (await researchSignals(brand.id)).find((x) => x.key === key);
    if (r) signal = { key: r.key, data: `${r.data} — a buyer group from market research`, value: r.value, use: `${r.use}. ${r.why}`, evidence: r.evidence };
  } else if (key) {
    const [d, notes] = await Promise.all([signalData(brand.id, brand.timezone), getNotes(brand.id)]);
    const row = buildSignals(`/brands/${slug}`, brand, d, notes).find((r) => r.key === key);
    if (row) signal = { key: row.key, data: row.data, value: row.value, use: row.use, evidence: row.evidence };
  }
  if (!signal && key && brief.reason) signal = { key, data: String(brief.reason.data).slice(0, 300), value: brief.reason.value, use: String(brief.reason.use).slice(0, 300), evidence: (brief.reason.evidence ?? []).slice(0, 6) };
  const kind: BatchKind = format === "full" ? "video" : format;
  const id = await createBatch(brand.id, me.id, { ...(signal ? { signal } : { idea: told }), direction: told, count, kind });
  if (!id) return fail("Remy couldn’t write the ads right now. Try again in a minute.");
  if (stay) return { at: Date.now(), batchId: id }; // asked for from a plan's own page: the ads appear there, nobody is sent to Shoots
  const q = new URLSearchParams({ batch: id, layout: format, n: String(count), plan: "1" });
  if (signal) q.set("signal", signal.key);
  if (product) q.set("product", product);
  if (format === "static" && brief.adLook) q.set("look", String(brief.adLook).slice(0, 60));
  if (format !== "static" && brief.seconds) q.set("secs", String(Math.min(30, Math.max(5, Math.round(brief.seconds)))));
  redirect(`/brands/${slug}/creative/shoots?${q}`);
}
