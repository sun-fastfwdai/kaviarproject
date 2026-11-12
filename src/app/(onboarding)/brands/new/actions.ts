"use server";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { env } from "@/lib/env";
import { slugify } from "@/lib/format";
import { resolveShopDomain } from "@/lib/shopify/resolve";
import { toUrl } from "@/lib/ai/site";
import { getDraft, patchOnboarding, readOnboarding } from "@/lib/onboarding/draft";
import { chatTurn, draftPolicy, freshAnalysis, pullImages, runAnalysis, scanSite } from "@/lib/onboarding/iris";
import type { AssetKind } from "@/lib/db/schema";
import type { Basics, Field, Source } from "@/lib/onboarding/types";

export type ActionState = { error?: string; at?: number; ok?: boolean } | undefined;
const fail = (error: string): ActionState => ({ error, at: Date.now() });
const MAX_FILE = 4 * 1024 * 1024; // Vercel caps a request body at 4.5 MB

// ---------------------------------------------------------------- Step 1 · Source

const Start = z.object({
  source: z.enum(["shopify", "website", "ai"]),
  shop: z.string().trim().optional(),
  website: z.string().trim().max(200).optional(),
  name: z.string().trim().max(60).optional(),
  draft: z.string().optional(),
});

/** Creates the draft brand (or updates it) and moves on: Shopify → install, website → basics, Kaviar AI → chat. */
export async function startBrand(_: ActionState, form: FormData): Promise<ActionState> {
  const member = await requireMember();
  const p = Start.safeParse(Object.fromEntries(form));
  if (!p.success) return fail("Check the form.");
  const { source } = p.data;
  let shop: string | null = null, website: string | null = null;
  if (source === "shopify") {
    shop = await resolveShopDomain(p.data.shop);
    if (!shop) return fail("Kaviar couldn’t find a Shopify store there. Use the store’s domain (brand.com) or its .myshopify.com address.");
  }
  if (source === "website") {
    const u = toUrl(p.data.website ?? "");
    if (!u) return fail("Add the brand’s website, like brand.com.");
    website = u.origin;
  }
  if (source === "ai" && !p.data.name) return fail("Add the brand’s name so Kaviar AI knows who it’s helping.");
  if (source === "shopify" && p.data.website) website = toUrl(p.data.website)?.origin ?? null;

  // Without a typed name the draft is "New brand" until Iris reads the site or Shopify names the store.
  const name = p.data.name || "New brand";
  let id = p.data.draft && /^[0-9a-f-]{36}$/i.test(p.data.draft) ? p.data.draft : null;
  if (id) {
    await getDraft(id);
    await db.update(schema.brands).set({ ...(p.data.name ? { name } : {}), ...(website ? { website } : {}) }).where(eq(schema.brands.id, id));
    await patchOnboarding(id, { source, ...(shop ? { shop } : {}) });
  } else {
    const [b] = await db.insert(schema.brands).values({
      slug: `draft-${crypto.randomUUID().slice(0, 8)}`, name, website, createdBy: member.id,
      onboardingStep: 1, onboarding: { source, ...(shop ? { shop } : {}) },
    }).returning({ id: schema.brands.id, slug: schema.brands.slug });
    id = b.id;
  }

  if (source === "shopify") {
    const [b] = await db.select({ slug: schema.brands.slug }).from(schema.brands).where(eq(schema.brands.id, id));
    if (env.shopifyConfigured()) redirect(`/api/shopify/install?brand=${b.slug}&shop=${shop}`);
    await patchOnboarding(id, {}, 2);
    redirect(`/brands/new/${id}/basics`);
  }
  if (source === "website") {
    await patchOnboarding(id, {}, 2);
    redirect(`/brands/new/${id}/basics`);
  }
  redirect(`/brands/new/${id}/source`);
}

export async function sendChat(id: string, text: string): Promise<ActionState> {
  await requireMember();
  await getDraft(id);
  await chatTurn(id, text.trim().slice(0, 1000));
  return undefined;
}

/** "Use recommended path" — follow Kaviar AI's recommendation. */
export async function followRecommendation(id: string): Promise<void> {
  await requireMember();
  await getDraft(id);
  const ob = await readOnboarding(id);
  const path = ob.chat?.recommendation?.path ?? "website";
  if (path === "shopify") {
    await patchOnboarding(id, { source: "shopify" });
    redirect(`/brands/new/${id}/source?pick=shopify`);
  }
  await patchOnboarding(id, { source: "website" }, 2);
  redirect(`/brands/new/${id}/basics`);
}

export async function continueFromSource(id: string): Promise<void> {
  await requireMember();
  await getDraft(id);
  await patchOnboarding(id, {}, 2);
  redirect(`/brands/new/${id}/basics`);
}

const Call = z.object({ email: z.email("Add an email Jina can send the invite to"), slot: z.string().trim().min(1).max(40), note: z.string().trim().max(500).optional() });

/** "Book a 15-min call" — lands in Leads for the brand specialist. */
export async function bookCall(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireMember();
  const b = await getDraft(id);
  const p = Call.safeParse(Object.fromEntries(form));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Check the form.");
  await db.insert(schema.leads).values({
    name: b.name, email: p.data.email, brand: b.name, storeUrl: b.website,
    message: `Onboarding call · ${p.data.slot}${p.data.note ? ` · ${p.data.note}` : ""}`,
  });
  return { ok: true };
}

// ---------------------------------------------------------------- Step 2 · Brand basics

export async function scanBasics(id: string): Promise<ActionState> {
  await requireMember();
  const b = await getDraft(id);
  const ob = await readOnboarding(id);
  const url = b.website ?? (ob.shop ? `https://${ob.shop}` : null);
  if (!url) return undefined;
  const scan = await scanSite(url, { name: b.name === "New brand" ? undefined : b.name });
  await patchOnboarding(id, { scan, ...(scan.ok && !ob.pulled ? { pulled: await pullImages(scan.url) } : {}) });
  return scan.ok ? undefined : fail(scan.error ?? "Iris couldn’t read the site.");
}

const BasicsIn = z.object({
  name: z.string().trim().min(1, "Add the brand name").max(60),
  category: z.string().trim().max(80).default(""),
  website: z.string().trim().max(200).default(""),
  shopName: z.string().trim().toLowerCase().max(60).default(""),
  markets: z.string().default(""),
  language: z.string().trim().max(40).default("English"),
  currency: z.string().trim().length(3),
  timezone: z.string().trim().min(1).max(60).default("UTC"),
});

export async function saveBasics(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireMember();
  const b = await getDraft(id);
  const p = BasicsIn.safeParse(Object.fromEntries(form));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Check the form.");
  const website = p.data.website ? toUrl(p.data.website)?.origin ?? null : null;
  if (p.data.website && !website) return fail("The website should be a public address, like https://brand.com.");
  const basics: Basics = {
    name: p.data.name, category: p.data.category, website: website ?? "", shopName: p.data.shopName.replace(/\.myshopify\.com$/, "").replace(/[^a-z0-9-]/g, ""),
    markets: p.data.markets.split("|").map((m) => m.trim()).filter(Boolean).slice(0, 8), language: p.data.language, currency: p.data.currency.toUpperCase(),
  };
  await db.update(schema.brands).set({
    name: basics.name, category: basics.category || null, website, currency: basics.currency,
    ...(b.timezone === "UTC" ? { timezone: p.data.timezone } : {}),
  }).where(eq(schema.brands.id, id));
  await patchOnboarding(id, { basics }, 3);
  redirect(`/brands/new/${id}/assets`);
}

// ---------------------------------------------------------------- Step 3 · Brand assets

function imageSize(buf: Buffer): { width?: number; height?: number } {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o < buf.length - 9) {
      if (buf[o] !== 0xff) { o++; continue; }
      const m = buf[o + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { height: buf.readUInt16BE(o + 5), width: buf.readUInt16BE(o + 7) };
      o += 2 + buf.readUInt16BE(o + 2);
    }
  }
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP" && buf.toString("ascii", 12, 16) === "VP8X") {
    return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  return {};
}

function sortKind(name: string, mime: string): AssetKind {
  const n = name.toLowerCase();
  if (mime === "application/pdf") return /guide|brand ?book|visual/.test(n) ? "guidelines" : "deck";
  if (mime.startsWith("video/")) return "video";
  if (/logo|wordmark|symbol/.test(n) || mime === "image/svg+xml") return "logo";
  return "imagery";
}

export async function uploadAssets(id: string, kind: AssetKind | "auto", form: FormData): Promise<ActionState> {
  const member = await requireMember();
  await getDraft(id);
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return fail("Pick a file to upload.");
  const skipped: string[] = [];
  for (const f of files.slice(0, 20)) {
    if (f.size > MAX_FILE) { skipped.push(`${f.name} is over 4 MB`); continue; }
    const mime = f.type || "application/octet-stream";
    if (!/^(image\/|video\/|application\/pdf)/.test(mime)) { skipped.push(`${f.name} isn’t an image, video or PDF`); continue; }
    const buf = Buffer.from(await f.arrayBuffer());
    const meta = mime.startsWith("image/") ? imageSize(buf) : mime === "application/pdf" ? { pages: (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length || undefined } : {};
    await db.insert(schema.brandAssets).values({ brandId: id, kind: kind === "auto" ? sortKind(f.name, mime) : kind, name: f.name.slice(0, 120), mime, size: f.size, data: buf, meta, createdBy: member.id });
  }
  return skipped.length ? fail(`${skipped.length} file${skipped.length > 1 ? "s" : ""} skipped — ${skipped[0]}.`) : undefined;
}

export async function removeAsset(id: string, assetId: string): Promise<void> {
  await requireMember();
  await getDraft(id);
  await db.delete(schema.brandAssets).where(and(eq(schema.brandAssets.id, assetId), eq(schema.brandAssets.brandId, id)));
}

export async function setInspiration(id: string, list: string[]): Promise<ActionState> {
  await requireMember();
  await getDraft(id);
  const clean = [...new Set(list.map((u) => toUrl(u)?.hostname.replace(/^www\./, "")).filter(Boolean) as string[])].slice(0, 8);
  if (list.length && clean.length < new Set(list).size) return fail("That doesn’t look like a website address.");
  await patchOnboarding(id, { inspiration: clean });
  return undefined;
}

export async function continueToAnalysis(id: string): Promise<void> {
  await requireMember();
  await getDraft(id);
  await patchOnboarding(id, {}, 4);
  redirect(`/brands/new/${id}/analysis`);
}

// ---------------------------------------------------------------- Step 4 · Analysis

export async function startAnalysis(id: string, again = false): Promise<void> {
  await requireMember();
  await getDraft(id);
  const ob = await readOnboarding(id);
  if (ob.analysis && !again && (!ob.analysis.finishedAt ? Date.now() - Date.parse(ob.analysis.startedAt) < 6 * 60_000 : true)) return;
  await patchOnboarding(id, { analysis: freshAnalysis() }, 4);
  after(() => runAnalysis(id).catch((e) => console.error("analysis", e)));
}

// ---------------------------------------------------------------- Step 5 · Review

export async function saveField(id: string, key: string, value: string): Promise<ActionState> {
  await requireMember();
  await getDraft(id);
  if (!/^[a-zA-Z]{2,24}$/.test(key)) return fail("Unknown field.");
  const v = value.trim().slice(0, 600);
  const field: Field = { value: v, from: "entered", note: null };
  await db.update(schema.brands).set({ onboarding: sql`jsonb_set(${schema.brands.onboarding}, ${`{profile,${key}}`}::text[], ${JSON.stringify(field)}::jsonb, true)` })
    .where(eq(schema.brands.id, id));
  return undefined;
}

export async function irisDraftPolicy(id: string): Promise<ActionState> {
  await requireMember();
  await getDraft(id);
  const text = await draftPolicy(id);
  if (!text) return fail("Iris couldn’t draft it right now. Try again in a minute.");
  const ob = await readOnboarding(id);
  if (!ob.analysis) return undefined;
  await patchOnboarding(id, { analysis: { ...ob.analysis, toAdd: ob.analysis.toAdd.map((t) => (t.key === "policy" ? { ...t, done: true, draft: text } : t)) } });
  return undefined;
}

export async function finishOnboarding(id: string): Promise<void> {
  await requireMember();
  const b = await getDraft(id);
  const base = slugify(b.name) || "brand";
  let slug = base === "new" ? "new-brand" : base;
  for (let i = 2; ; i++) {
    const [taken] = await db.select({ id: schema.brands.id }).from(schema.brands).where(eq(schema.brands.slug, slug)).limit(1);
    if (!taken || taken.id === id) break;
    slug = `${base}-${i}`;
  }
  await db.update(schema.brands).set({ slug, onboardingStep: null }).where(eq(schema.brands.id, id));
  redirect(`/brands/${slug}`);
}

export type { Source };
