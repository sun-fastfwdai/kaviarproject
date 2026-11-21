import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { decrypt } from "../crypto";
import type { ChangeKind, ChangeTarget } from "../db/schema";
import { metaGet, metaWrite } from "./client";

/**
 * Changing ads on Meta. Kaviar only ever does three things here, each on a campaign it already reads for this brand: pause it, raise
 * its daily budget by a fifth, or move part of one campaign's daily budget to another. Every change is checked against the connected
 * ad account first, read back afterwards, and stored with the values before so it can be undone. Budgets are handled in Meta's own
 * units and only ever scaled, so the currency never has to be converted.
 */
export type WriteTest = { at: string; ok: boolean; steps: { name: string; ok: boolean; note?: string }[] };
export type Access = { connected: boolean; granted: boolean; tested: boolean; canAct: boolean; test: WriteTest | null };
type Conn = { token: string; account: string; granted: boolean; test: WriteTest | null };
type Camp = { id: string; name: string; status: string; daily_budget?: string; account_id: string };
type Prev = NonNullable<ChangeTarget["applied"]>["prev"];
export type ApplyResult = { ok: true; note: string; prev: Prev } | { ok: false; manual: boolean; message: string };

const C = schema.connections;
async function conn(brandId: string): Promise<Conn | null> {
  const [c] = await db.select().from(C).where(and(eq(C.brandId, brandId), eq(C.provider, "meta"))).limit(1);
  if (!c || c.status !== "connected" || !c.accessToken || !c.externalId) return null;
  return { token: decrypt(c.accessToken), account: c.externalId, granted: c.scopes.includes("ads_management"), test: ((c.details as { write?: WriteTest }).write ?? null) };
}

/** Whether Kaviar may change this brand's ads: the permission was granted at login, and the access test passed on this ad account. */
export async function metaAccess(brandId: string): Promise<Access> {
  const c = await conn(brandId).catch(() => null);
  return { connected: Boolean(c), granted: Boolean(c?.granted), tested: Boolean(c?.test?.ok), canAct: Boolean(c?.granted && c.test?.ok), test: c?.test ?? null };
}

/** The permissions the person actually granted — Meta lets them untick any. */
export async function grantedScopes(token: string): Promise<string[]> {
  const r = await metaGet<{ data: { permission: string; status: string }[] }>("me/permissions", {}, token);
  return r.data.filter((x) => x.status === "granted").map((x) => x.permission);
}

const money = (raw: number) => String(Math.max(1, Math.round(raw)));
async function campaign(c: Conn, id: string): Promise<Camp> {
  const x = await metaGet<Camp>(id, { fields: "id,name,status,daily_budget,account_id" }, c.token);
  if (`act_${x.account_id}` !== c.account) throw new Error("That campaign is not in the connected ad account");
  return x;
}
async function set(c: Conn, id: string, field: "status" | "daily_budget", value: string): Promise<void> {
  await metaWrite("POST", id, { [field]: value }, c.token);
  const now = await campaign(c, id);
  if (String(now[field] ?? "") !== value) throw new Error(`Meta did not take the change (${field} is ${now[field] ?? "empty"})`);
}

/** Apply one decided change on Meta. `manual` means it is one Kaviar does not do itself — it stays on the brand's list. */
export async function applyChange(brandId: string, kind: ChangeKind, t: ChangeTarget): Promise<ApplyResult> {
  const c = await conn(brandId);
  if (!c || !c.granted || !c.test?.ok) return { ok: false, manual: true, message: "Kaviar may not change this ad account yet" };
  try {
    if ((kind === "pause" || kind === "hold") && t.campaignId) {
      const cur = await campaign(c, t.campaignId);
      if (cur.status === "PAUSED") return { ok: true, note: "Already paused on Meta", prev: [] };
      await set(c, cur.id, "status", "PAUSED");
      return { ok: true, note: "Paused on Meta", prev: [{ id: cur.id, field: "status", value: cur.status }] };
    }
    if (kind === "scale" && t.campaignId) {
      const cur = await campaign(c, t.campaignId);
      if (!cur.daily_budget) return { ok: false, manual: true, message: "Its budget is set on the ad sets, not the campaign" };
      await set(c, cur.id, "daily_budget", money(Number(cur.daily_budget) * 1.2));
      return { ok: true, note: "Daily budget raised 20% on Meta", prev: [{ id: cur.id, field: "daily_budget", value: cur.daily_budget }] };
    }
    if (kind === "shift" && t.campaignId && t.fromCampaignId && t.share && t.share > 0 && t.share < 1) {
      const [from, to] = await Promise.all([campaign(c, t.fromCampaignId), campaign(c, t.campaignId)]);
      if (!from.daily_budget || !to.daily_budget) return { ok: false, manual: true, message: "These budgets are set on the ad sets, not the campaigns" };
      const move = Math.round(Number(from.daily_budget) * t.share);
      if (move < 1) return { ok: false, manual: true, message: "Too small a move to make" };
      await set(c, from.id, "daily_budget", money(Number(from.daily_budget) - move));
      try { await set(c, to.id, "daily_budget", money(Number(to.daily_budget) + move)); }
      catch (e) { await set(c, from.id, "daily_budget", from.daily_budget).catch(() => undefined); throw e; } // never leave half a move behind
      return { ok: true, note: "Daily budget moved on Meta", prev: [{ id: from.id, field: "daily_budget", value: from.daily_budget }, { id: to.id, field: "daily_budget", value: to.daily_budget }] };
    }
    return { ok: false, manual: true, message: "This one is done by hand" };
  } catch (e) {
    return { ok: false, manual: false, message: e instanceof Error ? e.message.slice(0, 200) : "Meta refused the change" };
  }
}

/** Put back what a change replaced. */
export async function undoChange(brandId: string, prev: Prev): Promise<{ ok: boolean; message?: string }> {
  const c = await conn(brandId);
  if (!c || !c.granted) return { ok: false, message: "Kaviar may not change this ad account" };
  try { for (const p of prev) await set(c, p.id, p.field, p.value); return { ok: true }; }
  catch (e) { return { ok: false, message: e instanceof Error ? e.message.slice(0, 200) : "Meta refused the change" }; }
}

/**
 * Prove write access on this ad account without touching anything real: make a paused, empty campaign, pause it, change its budget,
 * and delete it. An empty campaign cannot spend. The result is kept on the connection; automatic changes need a pass.
 */
export async function writeTest(brandId: string): Promise<WriteTest> {
  const steps: WriteTest["steps"] = [], add = (name: string, ok: boolean, note?: string) => { steps.push({ name, ok, note }); return ok; };
  const c = await conn(brandId);
  const done = async (ok: boolean): Promise<WriteTest> => {
    const test = { at: new Date().toISOString(), ok, steps };
    if (c) { const [row] = await db.select({ details: C.details }).from(C).where(and(eq(C.brandId, brandId), eq(C.provider, "meta"))); await db.update(C).set({ details: { ...(row?.details ?? {}), write: test } }).where(and(eq(C.brandId, brandId), eq(C.provider, "meta"))); }
    return test;
  };
  if (!c) { add("Meta is connected", false, "Connect Meta Ads first"); return done(false); }
  let id: string | null = null, ok = true;
  const err = (e: unknown) => (e instanceof Error ? e.message.slice(0, 160) : "failed");
  try {
    const granted = await grantedScopes(c.token);
    await db.update(C).set({ scopes: granted }).where(and(eq(C.brandId, brandId), eq(C.provider, "meta")));
    if (!add("Permission to manage ads", granted.includes("ads_management"), granted.includes("ads_management") ? undefined : "Log in with Facebook again and allow it")) return done(false);
    const base = { name: "Kaviar access test — safe to delete", objective: "OUTCOME_TRAFFIC", status: "PAUSED", special_ad_categories: "[]" };
    let budget = true;
    try { id = (await metaWrite<{ id: string }>("POST", `${c.account}/campaigns`, { ...base, daily_budget: "2000", bid_strategy: "LOWEST_COST_WITHOUT_CAP" }, c.token)).id; }
    catch { budget = false; id = (await metaWrite<{ id: string }>("POST", `${c.account}/campaigns`, { ...base, is_adset_budget_sharing_enabled: "false" }, c.token)).id; }
    add("Create a paused test campaign", true);
    try { await set(c, id, "status", "PAUSED"); add("Pause a campaign", true); } catch (e) { ok = add("Pause a campaign", false, err(e)) && ok; }
    if (budget) { try { await set(c, id, "daily_budget", "2400"); add("Change a daily budget", true); } catch (e) { ok = add("Change a daily budget", false, err(e)) && ok; } }
    else add("Change a daily budget", true, "Skipped — this account sets budgets on ad sets");
  } catch (e) { ok = add("Create a paused test campaign", false, err(e)); }
  if (id) { try { await metaWrite("DELETE", id, {}, c.token); add("Delete the test campaign", true); } catch (e) { add("Delete the test campaign", false, `${err(e)} — delete “Kaviar access test” in Ads Manager`); } }
  return done(ok);
}

/** Currencies Meta counts in whole units; every other one is counted in hundredths. */
const WHOLE = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);

/**
 * Create a campaign on Meta, paused, with a daily budget — the first piece of launching from Kaviar. It cannot spend: it is paused and
 * has no ad set or ads yet. Returns its id and the ad account, so the team can open it in Ads Manager.
 */
export async function createPausedCampaign(brandId: string, name: string, daily: number): Promise<{ ok: true; id: string; account: string } | { ok: false; message: string }> {
  const c = await conn(brandId);
  if (!c || !c.granted || !c.test?.ok) return { ok: false, message: "Kaviar may not change this ad account yet" };
  if (!(daily > 0) || daily > 10_000) return { ok: false, message: "Set a daily budget first" };
  try {
    const acct = await metaGet<{ currency: string }>(c.account, { fields: "currency" }, c.token);
    const raw = String(Math.round(daily * (WHOLE.has(acct.currency) ? 1 : 100)));
    const made = await metaWrite<{ id: string }>("POST", `${c.account}/campaigns`, { name: name.slice(0, 200), objective: "OUTCOME_SALES", status: "PAUSED", special_ad_categories: "[]", daily_budget: raw, bid_strategy: "LOWEST_COST_WITHOUT_CAP" }, c.token);
    const now = await campaign(c, made.id);
    if (now.status !== "PAUSED") { await metaWrite("POST", made.id, { status: "PAUSED" }, c.token); }
    return { ok: true, id: made.id, account: c.account.replace(/^act_/, "") };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message.slice(0, 200) : "Meta refused" }; }
}
