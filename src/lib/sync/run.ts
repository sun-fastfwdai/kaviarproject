import "server-only";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { ShopifyAuthError } from "../shopify/oauth";
import { MetaAuthError } from "../meta/client";
import { SHOPIFY_RESOURCES, syncShopifyResource } from "../shopify/sync";
import { ensureWebhooks, type WebhookState } from "../shopify/webhooks";
import { refreshNotes } from "../ai/notes";
import { metaCursorFor, syncMeta } from "../meta/sync";
import type { Provider, SyncTrigger } from "../db/schema";

const T = schema;
const STALE_MS = 45 * 60_000;
const OVERLAP_MS = 5 * 60_000;

export type SyncOutcome = { provider: Provider; status: "success" | "error" | "skipped"; rows?: number; message?: string };

async function cursors(brandId: string, provider: Provider) {
  const rows = await db.select().from(T.syncCursors).where(and(eq(T.syncCursors.brandId, brandId), eq(T.syncCursors.provider, provider)));
  return Object.fromEntries(rows.map((r) => [r.resource, r.cursor]));
}

async function saveCursor(brandId: string, provider: Provider, resource: string, cursor: string) {
  const now = new Date();
  await db
    .insert(T.syncCursors)
    .values({ brandId, provider, resource, cursor, lastSuccessAt: now })
    .onConflictDoUpdate({ target: [T.syncCursors.brandId, T.syncCursors.provider, T.syncCursors.resource], set: { cursor, lastSuccessAt: now } });
}

/** Starts a run row. The partial unique index makes this atomic: a second concurrent run fails to insert. */
async function startRun(brandId: string, provider: Provider, trigger: SyncTrigger, mode: "backfill" | "incremental") {
  await db
    .update(T.syncRuns)
    .set({ status: "error", error: "Timed out", finishedAt: new Date() })
    .where(and(eq(T.syncRuns.brandId, brandId), eq(T.syncRuns.provider, provider), eq(T.syncRuns.status, "running"), lt(T.syncRuns.startedAt, new Date(Date.now() - STALE_MS))));
  try {
    const [run] = await db.insert(T.syncRuns).values({ brandId, provider, trigger, mode }).returning();
    return run;
  } catch (e) {
    // Drizzle wraps the driver error; the Postgres code lives on `cause`.
    const pg = (e as { code?: string; cause?: { code?: string; constraint?: string } });
    if (pg.code === "23505" || pg.cause?.code === "23505" || pg.cause?.constraint === "sync_runs_one_running") return null;
    throw e;
  }
}

async function finishRun(id: string, patch: Partial<typeof T.syncRuns.$inferInsert>) {
  await db.update(T.syncRuns).set({ ...patch, finishedAt: new Date() }).where(eq(T.syncRuns.id, id));
}

/** Pull fresh data from every connected source of a brand. Safe to call often: runs never overlap. */
export async function runBrandSync(brandId: string, trigger: SyncTrigger, only?: Provider[]): Promise<SyncOutcome[]> {
  // Shopify first: it's the source of truth the Meta numbers are checked against.
  const conns = (await db.select().from(T.connections).where(eq(T.connections.brandId, brandId))).sort((a, b) => (a.provider === "shopify" ? -1 : b.provider === "shopify" ? 1 : 0));
  const out: SyncOutcome[] = [];

  for (const conn of conns) {
    const provider = conn.provider;
    if (only && !only.includes(provider)) continue;
    if (conn.status !== "connected") {
      out.push({ provider, status: "skipped", message: `connection is ${conn.status}` });
      continue;
    }
    if (trigger === "webhook") {
      const recent = await db.select({ id: T.syncRuns.id }).from(T.syncRuns)
        .where(and(eq(T.syncRuns.brandId, brandId), eq(T.syncRuns.provider, provider), gt(T.syncRuns.startedAt, new Date(Date.now() - 120_000))))
        .limit(1);
      if (recent.length) {
        out.push({ provider, status: "skipped", message: "synced in the last 2 minutes" });
        continue;
      }
    }

    const cur = await cursors(brandId, provider);
    const mode = Object.keys(cur).length ? "incremental" : "backfill";
    const run = await startRun(brandId, provider, trigger, mode);
    if (!run) {
      out.push({ provider, status: "skipped", message: "already running" });
      continue;
    }

    const detail: Record<string, number> = {};
    try {
      if (provider === "shopify") {
        for (const resource of SHOPIFY_RESOURCES) {
          const startedAt = new Date();
          detail[resource] = await syncShopifyResource(conn, resource, cur[resource] ?? null);
          await saveCursor(brandId, provider, resource, new Date(startedAt.getTime() - OVERLAP_MS).toISOString());
          await db.update(T.syncRuns).set({ detail }).where(eq(T.syncRuns.id, run.id));
        }
      } else {
        Object.assign(detail, await syncMeta(conn, cur.insights ?? null));
        for (const resource of ["campaigns", "ads", "insights"]) await saveCursor(brandId, provider, resource, metaCursorFor(conn));
      }
      const rows = Object.values(detail).reduce((a, b) => a + b, 0);
      await finishRun(run.id, { status: "success", rows, detail });
      if (provider === "shopify") await checkWebhooks(conn);
      await db.update(T.connections).set({ lastError: null, updatedAt: new Date() }).where(eq(T.connections.id, conn.id));
      out.push({ provider, status: "success", rows });
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      const auth = e instanceof ShopifyAuthError || e instanceof MetaAuthError;
      await finishRun(run.id, { status: "error", error: msg.slice(0, 1000), detail });
      await db
        .update(T.connections)
        .set({ lastError: msg.slice(0, 500), updatedAt: new Date(), ...(auth ? { status: "needs_reauth" as const } : {}) })
        .where(eq(T.connections.id, conn.id));
      out.push({ provider, status: "error", message: msg });
    }
  }
  // The agents rewrite their notes when the numbers changed.
  if (out.some((o) => o.status !== "skipped")) await refreshNotes(brandId);
  return out;
}

/** Make sure the store's webhooks exist (once a day, or sooner if some are missing) and record what Shopify says. */
async function checkWebhooks(conn: typeof T.connections.$inferSelect) {
  const prev = (conn.details as { webhooks?: WebhookState }).webhooks;
  const fresh = prev && !prev.missing.length && Date.now() - Date.parse(prev.checkedAt) < 24 * 3600_000;
  const recentFail = prev && prev.missing.length && Date.now() - Date.parse(prev.checkedAt) < 3600_000;
  if (fresh || recentFail) return;
  try {
    const webhooks = await ensureWebhooks(conn.id);
    await db.update(T.connections).set({ details: sql`${T.connections.details} || ${JSON.stringify({ webhooks })}::jsonb` }).where(eq(T.connections.id, conn.id));
    if (webhooks.errors.length) console.warn("shopify webhooks", conn.externalId, webhooks.errors);
  } catch (e) {
    console.warn("shopify webhooks check failed", conn.externalId, (e as Error).message);
  }
}

/** Hourly cron: every brand with at least one live connection. */
export async function runScheduledSync(): Promise<Record<string, SyncOutcome[]>> {
  const rows = await db.execute(sql`select distinct brand_id from connections where status = 'connected'`);
  const result: Record<string, SyncOutcome[]> = {};
  for (const r of rows.rows as { brand_id: string }[]) result[r.brand_id] = await runBrandSync(r.brand_id, "schedule");
  return result;
}
