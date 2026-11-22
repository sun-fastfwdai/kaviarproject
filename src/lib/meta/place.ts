import "server-only";
import { metaGet, metaWrite } from "./client";
import { metaConn } from "./apply";
import { adSetParams, creativeParams, problem, type AdCopy } from "./place-rules";

/**
 * Putting a campaign's ads on Meta. Kaviar makes one ad set in the campaign it made earlier, then one ad per approved ad: the picture
 * goes into the ad account's library, the words become a link ad from the brand's own Page, and the ad is filed in the ad set. The
 * campaign itself stays paused, so nothing is shown and nothing is spent until the brand switches it on. Every step is read back, and
 * each returns Meta's own words when it is refused.
 */
export type Named = { id: string; name: string };
export type Ready = {
  account: { ok: boolean; note: string | null }; pages: Named[]; pixels: Named[];
  dry: { ok: boolean; note: string | null } | null; // Meta's answer to the ad set, asked without creating it
};
type Out<T> = ({ ok: true } & T) | { ok: false; message: string };
const STATUS: Record<number, string> = { 2: "Meta has disabled this ad account", 3: "This ad account has an unpaid balance", 7: "Meta is reviewing this ad account", 8: "A payment is still settling on this ad account", 9: "This ad account is in its grace period", 100: "This ad account is being closed", 101: "This ad account is closed" };

/** What Meta needs before ads can be placed: a healthy ad account, a Page to speak as, a pixel that counts purchases. Reads only — plus one dry run that creates nothing. */
export async function metaReady(brandId: string, campaignId: string | null, country: string): Promise<Ready | null> {
  const c = await metaConn(brandId);
  if (!c) return null;
  const acct = await metaGet<{ account_status?: number; disable_reason?: number; business?: { id: string } }>(c.account, { fields: "account_status,disable_reason,business" }, c.token).catch((e) => ({ err: problem(e) }));
  const account = "err" in acct ? { ok: false, note: acct.err } : { ok: (acct.account_status ?? 1) === 1, note: (acct.account_status ?? 1) === 1 ? null : `${STATUS[acct.account_status!] ?? "Meta has this ad account on hold"} — fix it in Ads Manager` };
  const list = (path: string) => metaGet<{ data: Named[] }>(path, { fields: "id,name", limit: "25" }, c.token).then((r) => r.data).catch(() => [] as Named[]);
  let pages = await list(`${c.account}/promote_pages`);
  const biz = "err" in acct ? null : acct.business?.id;
  if (!pages.length && biz) pages = [...(await list(`${biz}/owned_pages`)), ...(await list(`${biz}/client_pages`))];
  const pixels = await list(`${c.account}/adspixels`);
  let dry: Ready["dry"] = null;
  if (campaignId && pixels[0] && c.granted) {
    dry = await metaWrite("POST", `${c.account}/adsets`, { ...adSetParams({ name: "Kaviar check", campaignId, pixelId: pixels[0].id, country }), execution_options: JSON.stringify(["validate_only"]) }, c.token)
      .then(() => ({ ok: true, note: null })).catch((e) => ({ ok: false, note: problem(e) }));
  }
  return { account, pages, pixels, dry };
}

/** The ad set every ad of the plan goes into: people in one country, Meta finds the buyers, counted by purchases on the store. */
export async function makeAdSet(brandId: string, v: { campaignId: string; name: string; pixelId: string; country: string }): Promise<Out<{ id: string }>> {
  const c = await metaConn(brandId);
  if (!c || !c.granted || !c.test?.ok) return { ok: false, message: "Kaviar may not change this ad account yet" };
  try {
    const camp = await metaGet<{ status: string; account_id: string }>(v.campaignId, { fields: "status,account_id" }, c.token);
    if (`act_${camp.account_id}` !== c.account) return { ok: false, message: "That campaign is not in the connected ad account" };
    // The campaign is the one switch: while it is paused, what is inside it cannot run. If someone has already switched it on, the
    // ad set is made paused instead, so placing ads never starts spending by surprise.
    const made = await metaWrite<{ id: string }>("POST", `${c.account}/adsets`, { ...adSetParams(v), status: camp.status === "PAUSED" ? "ACTIVE" : "PAUSED" }, c.token);
    return { ok: true, id: made.id };
  } catch (e) { return { ok: false, message: problem(e) }; }
}

/** One ad: its picture into the account's library, its words as a link ad from the brand's Page, filed in the plan's ad set. */
export async function makeAd(brandId: string, v: { adsetId: string; pageId: string; name: string; copy: AdCopy; picture: Buffer; urlTags: string }): Promise<Out<{ id: string }>> {
  const c = await metaConn(brandId);
  if (!c || !c.granted || !c.test?.ok) return { ok: false, message: "Kaviar may not change this ad account yet" };
  try {
    const up = await metaWrite<{ images?: Record<string, { hash: string }> }>("POST", `${c.account}/adimages`, { bytes: v.picture.toString("base64") }, c.token);
    const hash = Object.values(up.images ?? {})[0]?.hash;
    if (!hash) return { ok: false, message: "Meta didn’t take the picture" };
    const creative = await metaWrite<{ id: string }>("POST", `${c.account}/adcreatives`, creativeParams({ name: v.name, pageId: v.pageId, hash, copy: v.copy, urlTags: v.urlTags }), c.token);
    const ad = await metaWrite<{ id: string }>("POST", `${c.account}/ads`, { name: v.name.slice(0, 200), adset_id: v.adsetId, creative: JSON.stringify({ creative_id: creative.id }), status: "ACTIVE" }, c.token);
    return { ok: true, id: ad.id };
  } catch (e) { return { ok: false, message: problem(e) }; }
}

/** Switch the plan's campaign on for a set number of days — the ad set gets its end date first, so Meta stops by itself — or pause it. */
export async function switchCampaign(brandId: string, v: { campaignId: string; adsetId?: string; on: boolean; days?: number }): Promise<Out<{ until: string | null }>> {
  const c = await metaConn(brandId);
  if (!c || !c.granted || !c.test?.ok) return { ok: false, message: "Kaviar may not change this ad account yet" };
  try {
    const camp = await metaGet<{ status: string; account_id: string }>(v.campaignId, { fields: "status,account_id" }, c.token);
    if (`act_${camp.account_id}` !== c.account) return { ok: false, message: "That campaign is not in the connected ad account" };
    let until: string | null = null;
    if (v.on && v.adsetId && v.days) {
      until = new Date(Date.now() + v.days * 86_400_000).toISOString();
      await metaWrite("POST", v.adsetId, { end_time: String(Math.floor(Date.parse(until) / 1000)), status: "ACTIVE" }, c.token);
    }
    const want = v.on ? "ACTIVE" : "PAUSED";
    if (camp.status !== want) await metaWrite("POST", v.campaignId, { status: want }, c.token);
    const now = await metaGet<{ status: string }>(v.campaignId, { fields: "status" }, c.token);
    if (now.status !== want) return { ok: false, message: `Meta did not take the change (the campaign is ${now.status.toLowerCase()})` };
    return { ok: true, until };
  } catch (e) { return { ok: false, message: problem(e) }; }
}
