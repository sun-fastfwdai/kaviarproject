"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { aiReady, ask } from "@/lib/ai/client";
import { getBrand } from "@/lib/queries/brands";
import { runBuild } from "@/lib/store/build";
import type { StoreContent } from "@/lib/db/schema";

const PAGES = ["home", "products", "collections", "story", "journal", "contact", "faq", "policies"];

export async function saveSetup(slug: string, input: { theme: string; pages: string[]; apps: Record<string, boolean> }): Promise<void> {
  await requireMember();
  const brand = await getBrand(slug);
  const v = { theme: ["kaviar-starter", "dawn", "prestige"].includes(input.theme) ? input.theme : "kaviar-starter", pages: input.pages.filter((p) => PAGES.includes(p)), apps: input.apps, updatedAt: new Date() };
  await db.insert(schema.storeBuilds).values({ brandId: brand.id, ...v }).onConflictDoUpdate({ target: schema.storeBuilds.brandId, set: v });
  revalidatePath(`/brands/${slug}/store`);
}

/** Start (or restart) the build; it runs after the response and the Build screen polls it. */
export async function startBuild(slug: string): Promise<{ error?: string }> {
  await requireMember();
  if (!aiReady()) return { error: "Remy needs the Claude API key to write the store." };
  const brand = await getBrand(slug);
  await db.insert(schema.storeBuilds).values({ brandId: brand.id, startedAt: new Date() }).onConflictDoUpdate({ target: schema.storeBuilds.brandId, set: { startedAt: new Date(), finishedAt: null, tasks: [], approved: [] } });
  after(() => runBuild(brand.id).catch((e) => console.error("store build", e)));
  return {};
}

export async function chooseHero(slug: string, hero: string): Promise<void> {
  await requireMember();
  const brand = await getBrand(slug);
  const [b] = await db.select({ content: schema.storeBuilds.content, approved: schema.storeBuilds.approved }).from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brand.id));
  if (!b?.content) return;
  await db.update(schema.storeBuilds).set({ content: { ...b.content, hero: hero.slice(0, 80) }, approved: [...new Set([...b.approved, "hero"])], updatedAt: new Date() }).where(eq(schema.storeBuilds.brandId, brand.id));
  revalidatePath(`/brands/${slug}/store`);
}

/** "Ask Remy to change something" — he rewrites only what you asked for. */
export async function reviseStore(slug: string, instruction: string): Promise<{ error?: string }> {
  await requireMember();
  const brand = await getBrand(slug);
  const [b] = await db.select({ content: schema.storeBuilds.content }).from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brand.id));
  if (!b?.content) return { error: "Build the store first." };
  const Out = z.object({ content: z.object({
    announcement: z.string(), heroOptions: z.array(z.string()), hero: z.string(), subline: z.string(), cta: z.string(),
    promises: z.array(z.object({ title: z.string(), body: z.string() })), bestsellersTitle: z.string(),
    story: z.object({ title: z.string(), body: z.string() }), faq: z.array(z.object({ q: z.string(), a: z.string() })),
    newsletter: z.object({ title: z.string(), body: z.string() }), nav: z.array(z.string()), aboutPage: z.string(),
  }), changed: z.string().describe("One line: what you changed") });
  const out = await ask("remy", {
    system: "You are Remy, Kaviar's store builder. Apply the team's instruction to the store copy. Change only what the instruction asks; keep everything else exactly as it is. No invented claims, discounts or reviews.",
    content: JSON.stringify({ instruction: instruction.slice(0, 500), current: b.content }),
    schema: Out, maxTokens: 6000,
  });
  if (!out) return { error: "Remy couldn’t make that change right now." };
  await db.update(schema.storeBuilds).set({ content: out.content as StoreContent, updatedAt: new Date() }).where(eq(schema.storeBuilds.brandId, brand.id));
  revalidatePath(`/brands/${slug}/store`);
  return {};
}
