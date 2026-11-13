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
import { applyHomepage, installStarter, publishTheme, uploadStarter } from "@/lib/store/themes";

const PAGES = ["home", "products", "collections", "story", "journal", "contact", "faq", "policies"];

export async function saveSetup(slug: string, input: { theme: string; pages: string[]; apps: Record<string, boolean> }): Promise<void> {
  await requireMember();
  const brand = await getBrand(slug);
  const v = { theme: input.theme === "kaviar-starter" || /^shopify:gid:\/\/shopify\/OnlineStoreTheme\/\d+$/.test(input.theme) ? input.theme : "kaviar-starter", pages: input.pages.filter((p) => PAGES.includes(p)), apps: input.apps, updatedAt: new Date() };
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

async function shopifyConn(slug: string) {
  await requireMember();
  const brand = await getBrand(slug);
  const conn = (await db.select().from(schema.connections).where(eq(schema.connections.brandId, brand.id))).find((x) => x.provider === "shopify" && x.status === "connected");
  if (!conn) throw new Error("Connect the brand’s Shopify store first.");
  return { brand, conn };
}
const fail = (e: unknown) => ({ error: (e as Error).message.replace(/access denied|ACCESS_DENIED/i, "Shopify refused — the Kaviar app needs permission to manage themes") });

/** Owners upload a new Kaviar Starter zip; it goes to Supabase Storage for every brand. */
export async function uploadStarterZip(form: FormData): Promise<{ error?: string }> {
  const me = await requireMember();
  if (me.role !== "owner") return { error: "Only owners can replace Kaviar Starter." };
  const f = form.get("zip");
  if (!(f instanceof File) || !f.name.endsWith(".zip")) return { error: "Pick the theme’s .zip file." };
  try { await uploadStarter(Buffer.from(await f.arrayBuffer())); } catch (e) { return fail(e); }
  revalidatePath("/brands");
  return {};
}

export async function installKaviarStarter(slug: string): Promise<{ error?: string }> {
  try {
    const { brand, conn } = await shopifyConn(slug);
    const t = await installStarter(conn.id, brand.name);
    await db.update(schema.storeBuilds).set({ theme: `shopify:${t.id}`, updatedAt: new Date() }).where(eq(schema.storeBuilds.brandId, brand.id));
    revalidatePath(`/brands/${slug}/store`);
    return {};
  } catch (e) { return fail(e); }
}

export async function applyToTheme(slug: string): Promise<{ error?: string }> {
  try {
    const { brand, conn } = await shopifyConn(slug);
    const [b] = await db.select().from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brand.id));
    if (!b?.content) return { error: "Build the store first." };
    if (!b.theme.startsWith("shopify:")) return { error: "Install Kaviar Starter or pick a theme from the store first." };
    await applyHomepage(conn.id, b.theme.slice(8), b.content);
    await db.update(schema.storeBuilds).set({ approved: [...new Set([...b.approved, "applied"])], updatedAt: new Date() }).where(eq(schema.storeBuilds.brandId, brand.id));
    revalidatePath(`/brands/${slug}/store`);
    return {};
  } catch (e) { return fail(e); }
}

/** Board 06b: publish only after typing the brand name; the old theme stays as a backup. */
export async function publishStore(slug: string, confirm: string): Promise<{ error?: string }> {
  try {
    const { brand, conn } = await shopifyConn(slug);
    if (confirm.trim().toLowerCase() !== brand.name.trim().toLowerCase()) return { error: `Type “${brand.name}” to confirm.` };
    const [b] = await db.select().from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brand.id));
    if (!b?.theme.startsWith("shopify:")) return { error: "Nothing installed to publish yet." };
    await publishTheme(conn.id, b.theme.slice(8));
    await db.update(schema.storeBuilds).set({ approved: [...new Set([...b.approved, "published"])], updatedAt: new Date() }).where(eq(schema.storeBuilds.brandId, brand.id));
    revalidatePath(`/brands/${slug}/store`);
    return {};
  } catch (e) { return fail(e); }
}
