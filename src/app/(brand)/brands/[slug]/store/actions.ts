"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { aiReady } from "@/lib/ai/client";
import { getBrand } from "@/lib/queries/brands";
import { runBuild } from "@/lib/store/build";
import type { StoreContent } from "@/lib/db/schema";
import { applyHomepage, installStarter, publishTheme, uploadStarter } from "@/lib/store/themes";
import { Content, SECTIONS, commit, note, revise, undo } from "@/lib/store/revise";

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
  await note(brand.id, { who: "Kaviar", agent: "iris", what: "Started a build", scope: null });
  after(() => runBuild(brand.id).catch((e) => console.error("store build", e)));
  return {};
}

/** Pause stops before the next stage; Resume carries on from there (stages already done are kept). */
export async function pauseBuild(slug: string): Promise<void> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const [b] = await db.select({ tasks: schema.storeBuilds.tasks }).from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brand.id));
  if (!b) return;
  await db.update(schema.storeBuilds).set({ finishedAt: new Date() }).where(eq(schema.storeBuilds.brandId, brand.id));
  await note(brand.id, { who: me.name, agent: "you", what: "Paused the build", scope: null });
  revalidatePath(`/brands/${slug}/store`);
}

export async function resumeBuild(slug: string): Promise<{ error?: string }> {
  const me = await requireMember();
  if (!aiReady()) return { error: "Remy needs the Claude API key to write the store." };
  const brand = await getBrand(slug);
  await db.update(schema.storeBuilds).set({ finishedAt: null }).where(eq(schema.storeBuilds.brandId, brand.id));
  await note(brand.id, { who: me.name, agent: "you", what: "Resumed the build", scope: null });
  after(() => runBuild(brand.id, { resume: true }).catch((e) => console.error("store build", e)));
  return {};
}

/** Redo after an undo: puts back the content the canvas had before the undo (saved as a new revision). */
export async function redoStore(slug: string, content: StoreContent): Promise<{ error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const ok = Content.safeParse(content);
  if (!ok.success) return { error: "Nothing to redo." };
  await commit(brand.id, ok.data, { who: me.name, agent: "you", what: "Redid the last change", scope: null });
  revalidatePath(`/brands/${slug}/store`);
  return {};
}

/** Decisions the team can clear without changing copy: "apps" (merchant approval handled elsewhere), "photos" (skip for now). */
export async function markDecided(slug: string, key: "apps" | "photos"): Promise<void> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const [b] = await db.select({ approved: schema.storeBuilds.approved }).from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brand.id));
  if (!b) return;
  await db.update(schema.storeBuilds).set({ approved: [...new Set([...b.approved, key])] }).where(eq(schema.storeBuilds.brandId, brand.id));
  await note(brand.id, { who: me.name, agent: "you", what: key === "apps" ? "Marked the Shopify apps as handled" : "Skipped the missing product photos for now", scope: null });
  revalidatePath(`/brands/${slug}/store`);
}

/** Retry one stage (e.g. Product pages after adding photos): it and everything after it run again. */
export async function retryStage(slug: string, key: string): Promise<{ error?: string }> {
  await requireMember();
  const brand = await getBrand(slug);
  const [b] = await db.select({ tasks: schema.storeBuilds.tasks }).from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brand.id));
  const i = b?.tasks.findIndex((t) => t.key === key) ?? -1;
  if (!b || i < 0) return { error: "Start the build first." };
  const tasks = b.tasks.map((t, j) => (j >= i ? { ...t, status: "waiting" as const, detail: "" } : t));
  await db.update(schema.storeBuilds).set({ tasks, finishedAt: null }).where(eq(schema.storeBuilds.brandId, brand.id));
  after(() => runBuild(brand.id, { resume: true }).catch((e) => console.error("store build", e)));
  return {};
}

export async function chooseHero(slug: string, hero: string): Promise<void> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const [b] = await db.select({ content: schema.storeBuilds.content, approved: schema.storeBuilds.approved }).from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brand.id));
  if (!b?.content) return;
  await commit(brand.id, { ...b.content, hero: hero.slice(0, 80) }, { who: me.name, agent: "you", what: `Approved the hero headline “${hero.slice(0, 60)}”`, scope: "hero" });
  await db.update(schema.storeBuilds).set({ approved: [...new Set([...b.approved, "hero"])] }).where(eq(schema.storeBuilds.brandId, brand.id));
  revalidatePath(`/brands/${slug}/store`);
}

/** "Ask Remy to change something" — the selected section only, or the whole page. */
export async function reviseStore(slug: string, instruction: string, scope: string | null = null, image?: string): Promise<{ error?: string; summary?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  if (scope && !SECTIONS[scope]) scope = null;
  // An attached screenshot or reference (data URL) goes to Remy with the instruction.
  const ref = image?.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  const r = await revise(brand.id, me.name, instruction, scope, ref ? { mime: ref[1], data: ref[2] } : undefined);
  revalidatePath(`/brands/${slug}/store`);
  return r;
}

/** Changes tab: bring back an earlier revision (saved as a new revision, so it can be undone too). */
export async function restoreRev(slug: string, rev: number): Promise<{ error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const [b] = await db.select({ history: schema.storeBuilds.history }).from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brand.id));
  const h = b?.history.find((x) => x.rev === rev);
  if (!h) return { error: "That revision isn’t kept any more." };
  await commit(brand.id, h.content, { who: me.name, agent: "you", what: `Restored r${rev}`, scope: null });
  revalidatePath(`/brands/${slug}/store`);
  return {};
}

export async function undoStore(slug: string): Promise<{ error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const r = await undo(brand.id, me.name);
  revalidatePath(`/brands/${slug}/store`);
  return r;
}

/** Comment pinned to a section (the canvas comment tool). */
export async function addComment(slug: string, section: string, text: string): Promise<void> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  if (!SECTIONS[section] || !text.trim()) return;
  const [b] = await db.select({ comments: schema.storeBuilds.comments }).from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brand.id));
  if (!b) return;
  await db.update(schema.storeBuilds).set({ comments: [...b.comments, { id: crypto.randomUUID(), at: new Date().toISOString(), who: me.name, section, text: text.trim().slice(0, 500) }].slice(-100) }).where(eq(schema.storeBuilds.brandId, brand.id));
  await note(brand.id, { who: me.name, agent: "you", what: `Commented on ${SECTIONS[section].label}: “${text.trim().slice(0, 60)}”`, scope: section });
  revalidatePath(`/brands/${slug}/store`);
}

export async function resolveComment(slug: string, id: string): Promise<void> {
  await requireMember();
  const brand = await getBrand(slug);
  const [b] = await db.select({ comments: schema.storeBuilds.comments }).from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brand.id));
  if (!b) return;
  await db.update(schema.storeBuilds).set({ comments: b.comments.map((c) => (c.id === id ? { ...c, done: true } : c)) }).where(eq(schema.storeBuilds.brandId, brand.id));
  revalidatePath(`/brands/${slug}/store`);
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
