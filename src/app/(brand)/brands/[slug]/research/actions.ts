"use server";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { aiReady } from "@/lib/ai/client";
import { getBrand } from "@/lib/queries/brands";
import { runResearch } from "@/lib/research/run";
import { adLibraryToken, competitorAds, libError, pruneAdCopies } from "@/lib/research/adlib";
import { readShot } from "@/lib/research/shots";
import { createTestBatch } from "@/lib/creative/remy";
import { MARKETS, marketName, type Decision, type ManualAd, type Part, type Positioning, type RivalAds } from "@/lib/research/types";

const R = schema.marketResearch;
type Result = { error?: string };

async function own(slug: string, id: string) {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const [row] = await db.select().from(R).where(and(eq(R.id, id), eq(R.brandId, brand.id)));
  if (!row) throw new Error("Research not found");
  return { me, brand, row };
}
const busy = (row: typeof R.$inferSelect) => row.status === "running" && Date.now() - row.updatedAt.getTime() < 15 * 60_000;

/** Start (or re-run) research for a product and market. Runs in the background; the page polls while it says "running". */
export async function startResearch(slug: string, subject: string, market: string, parts: Part[] = ["market", "ads", "position", "plan"]): Promise<Result & { id?: string }> {
  const me = await requireMember();
  if (!aiReady()) return { error: "Iris needs the Claude API key." };
  if (!MARKETS.some(([k]) => k === market)) return { error: "Pick a market." };
  const brand = await getBrand(slug);
  const sub = subject.trim().slice(0, 200);
  const [row] = await db.insert(R).values({ brandId: brand.id, subject: sub, market, createdBy: me.id })
    .onConflictDoUpdate({ target: [R.brandId, R.subject, R.market], set: { updatedAt: new Date() } }).returning();
  if (busy(row) && row.steps.length) return { id: row.id };
  const want = parts.filter((p) => ["market", "ads", "position", "plan"].includes(p));
  if (!row.report && !want.includes("market")) want.unshift("market");
  await db.update(R).set({ status: "running", error: null, updatedAt: new Date() }).where(eq(R.id, row.id));
  after(() => runResearch(row.id, want));
  return { id: row.id };
}

/** Accept or reject a buyer group, opportunity or competitor gap — the test plan uses what isn't rejected. */
export async function decide(slug: string, id: string, kind: "segment" | "opportunity" | "gap", itemId: string, status: Decision | null): Promise<void> {
  const { row } = await own(slug, id);
  const mark = <T extends { id: string; status?: Decision }>(xs: T[]) => xs.map((x) => (x.id === itemId ? { ...x, status: status ?? undefined } : x));
  if (kind === "gap") { if (row.adsRead) await db.update(R).set({ adsRead: { ...row.adsRead, gaps: mark(row.adsRead.gaps) } }).where(eq(R.id, id)); return; }
  if (!row.report) return;
  await db.update(R).set({ report: kind === "segment" ? { ...row.report, segments: mark(row.report.segments) } : { ...row.report, opportunities: mark(row.report.opportunities) } }).where(eq(R.id, id));
}

/** Add a competitor by name and pull its ads right away. */
export async function addRival(slug: string, id: string, name: string): Promise<Result> {
  const { row } = await own(slug, id);
  const n = name.trim().slice(0, 80);
  if (n.length < 2) return { error: "Type the brand’s name as it appears on Facebook." };
  const token = await adLibraryToken(row.brandId);
  if (!token) return { error: "Connect Meta Ads on any brand — the Ad Library is read with that login." };
  let entry: RivalAds;
  try { entry = { name: n, ...(await competitorAds(n, token, row.brandId)), at: new Date().toISOString(), added: true }; }
  catch (e) { const le = libError(e); entry = { name: n, ads: [], at: new Date().toISOString(), error: le.message, blocked: le.blocked, added: true }; }
  const [now] = await db.select({ rivals: R.rivals }).from(R).where(eq(R.id, id));
  await db.update(R).set({ rivals: [entry, ...(now?.rivals ?? row.rivals).filter((r) => r.name.toLowerCase() !== n.toLowerCase())].slice(0, 12), updatedAt: new Date() }).where(eq(R.id, id));
  await pruneAdCopies(row.brandId).catch(() => undefined);
  return entry.error ? { error: entry.error } : entry.ads.length ? {} : { error: `No live ads from a Page named “${n}” reached the EU or UK — add a screenshot of their US ads instead.` };
}
export async function removeRival(slug: string, id: string, name: string): Promise<void> {
  const { row } = await own(slug, id);
  await db.update(R).set({ rivals: row.rivals.filter((r) => r.name !== name) }).where(eq(R.id, id));
  await pruneAdCopies(row.brandId).catch(() => undefined);
}

/** Replace one screenshot's entry, reading the latest row so two uploads at once don't overwrite each other. */
async function setShot(id: string, assetId: string, patch: (m: ManualAd) => ManualAd) {
  const [now] = await db.select({ manual: R.manual }).from(R).where(eq(R.id, id));
  await db.update(R).set({ manual: (now?.manual ?? []).map((m) => (m.id === assetId ? patch(m) : m)), updatedAt: new Date() }).where(eq(R.id, id));
}
async function transcribe(brandId: string, id: string, assetId: string, competitor: string): Promise<Result> {
  try {
    const r = await readShot(brandId, assetId, competitor);
    await setShot(id, assetId, (m) => ({ ...m, ads: r.ads, read: "done", readNote: r.note }));
    return r.ads.length ? {} : { error: r.note };
  } catch (e) {
    await setShot(id, assetId, (m) => ({ ...m, read: "error", readNote: "Iris couldn’t read it — try again." }));
    return { error: (e as Error).message.slice(0, 160) };
  }
}

/** A screenshot of competitors' ads (e.g. US-only ads from the Ad Library website). Iris copies each ad card off it right away. */
export async function addScreenshot(slug: string, id: string, form: FormData): Promise<Result> {
  const { me, row } = await own(slug, id);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a screenshot." };
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return { error: "Screenshots must be PNG, JPG or WebP." };
  if (file.size > 4.3 * 1024 * 1024) return { error: "Keep screenshots under 4 MB." };
  const competitor = String(form.get("competitor") ?? "").trim().slice(0, 80), note = String(form.get("note") ?? "").trim().slice(0, 300);
  const [a] = await db.insert(schema.brandAssets).values({
    brandId: row.brandId, kind: "competitor", name: `${competitor || "Competitor"} · ad screenshot`.slice(0, 60), mime: file.type, size: file.size, data: Buffer.from(await file.arrayBuffer()),
    meta: { note, competitor }, createdBy: me.id,
  }).returning({ id: schema.brandAssets.id });
  const [now] = await db.select({ manual: R.manual }).from(R).where(eq(R.id, id));
  await db.update(R).set({ manual: [{ id: a.id, competitor, note, at: new Date().toISOString() }, ...(now?.manual ?? row.manual)].slice(0, 24), updatedAt: new Date() }).where(eq(R.id, id));
  if (!aiReady()) return {};
  return transcribe(row.brandId, id, a.id, competitor);
}
/** Read a screenshot's ad cards again (or for the first time, for screenshots added before Kaviar read them). */
export async function readScreenshot(slug: string, id: string, assetId: string): Promise<Result> {
  const { row } = await own(slug, id);
  const m = row.manual.find((x) => x.id === assetId);
  if (!m) return { error: "That screenshot is gone." };
  if (!aiReady()) return { error: "Iris needs the Claude API key." };
  const r = await transcribe(row.brandId, id, assetId, m.competitor);
  await pruneAdCopies(row.brandId).catch(() => undefined);
  return r;
}
export async function removeScreenshot(slug: string, id: string, assetId: string): Promise<void> {
  const { row } = await own(slug, id);
  await db.update(R).set({ manual: row.manual.filter((m) => m.id !== assetId) }).where(eq(R.id, id));
  await db.delete(schema.brandAssets).where(and(eq(schema.brandAssets.id, assetId), eq(schema.brandAssets.brandId, row.brandId), eq(schema.brandAssets.kind, "competitor")));
  await pruneAdCopies(row.brandId).catch(() => undefined);
}

/** Re-run part of the research in the background: the ads (pull + read), or just the plan. */
export async function rerun(slug: string, id: string, parts: Part[]): Promise<Result> {
  const { row } = await own(slug, id);
  if (!aiReady()) return { error: "Iris needs the Claude API key." };
  if (busy(row)) return { error: "Iris is still working on this one." };
  await db.update(R).set({ status: "running", updatedAt: new Date() }).where(eq(R.id, id));
  after(() => runResearch(id, parts));
  return {};
}

/** Switch a test cell on or off before building the ads. */
export async function toggleCell(slug: string, id: string, cellId: string): Promise<void> {
  const { row } = await own(slug, id);
  if (!row.plan) return;
  await db.update(R).set({ plan: { ...row.plan, cells: row.plan.cells.map((c) => (c.id === cellId ? { ...c, on: !c.on } : c)) } }).where(eq(R.id, id));
}

/** Remy writes one static ad per cell into a new batch; it opens in Creative studio for review. */
export async function buildTestAds(slug: string, id: string): Promise<Result> {
  const { me, brand, row } = await own(slug, id);
  if (!aiReady()) return { error: "Remy needs the Claude API key." };
  const cells = row.plan?.cells.filter((c) => c.on) ?? [];
  if (!cells.length) return { error: "Switch on at least one test cell." };
  const batch = await createTestBatch(brand.id, me.id, {
    product: row.subject, market: marketName(row.market), summary: row.plan!.summary,
    budget: row.plan!.budget.perDay ? `Budget: about $${row.plan!.budget.perDay}/day for ${row.plan!.budget.days} days.` : "", cells,
  });
  if (!batch) return { error: "Remy couldn’t write the ads right now — try again in a minute." };
  redirect(`/brands/${slug}/creative/${batch}`);
}

/** The team edits the positioning (statement, pillars) or accepts it — agents write from it either way; an edited one is kept on re-runs. */
export async function savePositioning(slug: string, id: string, patch: { statement?: string; pillars?: Positioning["pillars"]; status?: "accepted" | null }): Promise<void> {
  const { row } = await own(slug, id);
  if (!row.positioning) return;
  const next: Positioning = {
    ...row.positioning,
    ...(patch.statement != null ? { statement: patch.statement.slice(0, 400), edited: true } : {}),
    ...(patch.pillars ? { pillars: patch.pillars.slice(0, 4).map((p) => ({ ...p, title: String(p.title).slice(0, 40), message: String(p.message).slice(0, 160), proof: String(p.proof).slice(0, 160) })), edited: true } : {}),
    ...("status" in patch ? { status: patch.status ?? undefined } : {}),
  };
  await db.update(R).set({ positioning: next, updatedAt: new Date() }).where(eq(R.id, id));
}
