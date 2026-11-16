"use server";
import { after } from "next/server";
import { and, asc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { aiReady } from "@/lib/ai/client";
import { getBrand } from "@/lib/queries/brands";
import { buildPanel, runTest } from "@/lib/audience/run";
import { hasOwnData, metaConn, videoRows } from "@/lib/audience/facts";
import { improveFromPanel } from "@/lib/creative/remy";
import { MAX_ADS, MAX_VIDEOS, type PanelKind, type TestItem, type TestSource } from "@/lib/audience/types";

const P = schema.audiencePanels, T = schema.audienceTests;
type Result = { error?: string; id?: string };
const live = (row: { status: string; updatedAt: Date }) => row.status === "running" && Date.now() - row.updatedAt.getTime() < 15 * 60_000;

/** Iris builds (or rebuilds) the panel in the background; the page polls while it says "running". */
export async function startPanel(slug: string, kind: PanelKind): Promise<Result> {
  const me = await requireMember();
  if (!aiReady()) return { error: "Iris needs the Claude API key." };
  if (kind !== "yours" && kind !== "general") return { error: "Pick a panel." };
  const brand = await getBrand(slug);
  if (kind === "yours") { const d = await hasOwnData(brand.id); if (!d.store && !d.ads) return { error: "This brand has no Shopify orders or Meta results yet — use the general audience." }; }
  const [prev] = await db.select().from(P).where(and(eq(P.brandId, brand.id), eq(P.kind, kind)));
  if (prev && live(prev)) return { id: prev.id };
  const [row] = prev ? [prev] : await db.insert(P).values({ brandId: brand.id, kind, createdBy: me.id, startedAt: new Date() }).returning();
  await db.update(P).set({ status: "running", error: null, createdBy: me.id, startedAt: new Date(), finishedAt: null, updatedAt: new Date() }).where(eq(P.id, row.id));
  after(() => buildPanel(row.id));
  return { id: row.id };
}

async function readyPanel(brandId: string, kind: PanelKind) {
  const [p] = await db.select().from(P).where(and(eq(P.brandId, brandId), eq(P.kind, kind)));
  return p?.panel ? p : null;
}

/** Show ads from a Creative studio batch, or videos from Shoots, to the panel. */
export async function startTest(slug: string, kind: PanelKind, source: TestSource): Promise<Result> {
  const me = await requireMember();
  if (!aiReady()) return { error: "The panel needs the Claude API key." };
  const brand = await getBrand(slug);
  const panel = await readyPanel(brand.id, kind);
  if (!panel?.panel) return { error: "Build the panel first." };
  let items: TestItem[] = [], title = "";
  if (source.type === "batch") {
    const [batch] = await db.select().from(schema.adBatches).where(and(eq(schema.adBatches.id, source.batchId), eq(schema.adBatches.brandId, brand.id)));
    if (!batch) return { error: "That batch is gone." };
    const ads = await db.select().from(schema.ads).where(and(eq(schema.ads.batchId, batch.id), ne(schema.ads.status, "rejected"))).orderBy(asc(schema.ads.position)).limit(MAX_ADS);
    if (!ads.length) return { error: "This batch has no ads to test (rejected ones are left out)." };
    title = batch.title;
    items = ads.map((a, i) => ({ key: `ad:${a.id}`, kind: "ad", label: `Ad ${i + 1} · ${a.hook}`.slice(0, 80), adId: a.id, batchId: batch.id, format: a.format, hook: a.hook,
      primaryText: a.primaryText, headline: a.headline, cta: a.cta, offer: a.offer, product: a.product, image: a.imageUrl }));
  } else if (source.type === "videos") {
    const rows = await videoRows(brand.id, source.ids.slice(0, MAX_VIDEOS));
    if (!rows.length) return { error: "Pick at least one video." };
    title = rows.length === 1 ? rows[0].name : `${rows.length} videos from Shoots`;
    items = rows.map((v) => ({ key: `video:${v.id}`, kind: "video", label: v.name.slice(0, 80), assetId: v.id, format: "video", hook: "", primaryText: "", headline: "", cta: "Shop now", offer: "",
      product: v.meta.product ?? null, image: `/api/assets/${v.id}`, seconds: v.meta.seconds }));
  } else return { error: "Pick what to test." };
  const bench = source.bench && kind === "yours" && Boolean(await metaConn(brand.id));
  const focus = source.focus?.trim().slice(0, 300) || undefined;
  const [row] = await db.insert(T).values({
    brandId: brand.id, panelId: panel.id, purpose: "test", title: title.slice(0, 120), source: { ...source, bench, focus } as TestSource,
    // A focused test builds its own people in the background; otherwise it uses the panel as it is now.
    personas: focus ? [] : panel.panel.personas, items, createdBy: me.id, startedAt: new Date(),
  }).returning({ id: T.id });
  after(() => runTest(row.id));
  return { id: row.id };
}

/** Show the panel the brand's past Meta ads and compare its picks with their real click rates. */
export async function startCalibration(slug: string): Promise<Result> {
  const me = await requireMember();
  if (!aiReady()) return { error: "The panel needs the Claude API key." };
  const brand = await getBrand(slug);
  const panel = await readyPanel(brand.id, "yours");
  if (!panel?.panel) return { error: "Build your audience panel first." };
  if (!(await metaConn(brand.id))) return { error: "Connect Meta Ads first — the check reads your past ads and their real results from Meta." };
  if (panel.calibration?.status === "running" && Date.now() - Date.parse(panel.calibration.at) < 15 * 60_000) return { id: panel.calibration.testId };
  const [row] = await db.insert(T).values({
    brandId: brand.id, panelId: panel.id, purpose: "calibration", title: "Check against your real ads", source: { type: "live" }, personas: panel.panel.personas, items: [], createdBy: me.id, startedAt: new Date(),
  }).returning({ id: T.id });
  await db.update(P).set({ calibration: { ...(panel.calibration ?? { n: 0, rho: null, fit: null, ads: [] }), testId: row.id, status: "running", at: new Date().toISOString(), note: undefined } }).where(eq(P.id, panel.id));
  after(() => runTest(row.id));
  return { id: row.id };
}

/** Run a finished test again with the same ads and today's panel. */
export async function rerunTest(slug: string, id: string): Promise<Result> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const [t] = await db.select().from(T).where(and(eq(T.id, id), eq(T.brandId, brand.id)));
  if (!t) return { error: "Test not found." };
  if (live(t)) return { id };
  if (t.purpose === "calibration") return startCalibration(slug);
  const [panel] = await db.select().from(P).where(eq(P.id, t.panelId));
  if (!panel?.panel) return { error: "Build the panel first." };
  const [row] = await db.insert(T).values({
    // A focused test keeps its people, so a second run compares like with like.
    brandId: brand.id, panelId: panel.id, purpose: t.purpose, title: t.title, source: t.source, personas: "focus" in t.source && t.source.focus ? t.personas : panel.panel.personas,
    items: t.items.filter((i) => !i.bench), createdBy: me.id, startedAt: new Date(),
  }).returning({ id: T.id });
  after(() => runTest(row.id));
  return { id: row.id };
}

/** Remy writes two versions of an ad that fix what the panel said held it back. They land in the same batch. */
export async function improveAd(slug: string, testId: string, key: string): Promise<Result & { batchId?: string; added?: number }> {
  await requireMember();
  if (!aiReady()) return { error: "Remy needs the Claude API key." };
  const brand = await getBrand(slug);
  const [t] = await db.select().from(T).where(and(eq(T.id, testId), eq(T.brandId, brand.id)));
  const it = t?.items.find((i) => i.key === key);
  if (!t || !it?.adId) return { error: "Only ads from Creative studio can be improved here." };
  const read = t.result?.read?.items.find((i) => i.key === key);
  const rs = t.reactions.filter((r) => r.item === key);
  const added = await improveFromPanel(it.adId, {
    fix: read?.fix ?? "", liked: [...new Set(rs.map((r) => r.pulled).filter(Boolean))].slice(0, 8),
    putOff: [...new Set(rs.map((r) => r.putOff).filter(Boolean))].slice(0, 10), quotes: (read?.quotes ?? []).map((q) => q.text),
  });
  if (!added) return { error: "Remy couldn’t write new versions — try again." };
  return { batchId: it.batchId, added };
}
