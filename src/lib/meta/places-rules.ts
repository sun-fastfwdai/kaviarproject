import { COUNTRIES } from "./place-rules";

/**
 * Where a campaign should be shown, worked out from what Kaviar holds — never a guess:
 *   the market the research (and so the ads' message) was written for · where the store's orders went · where the store ships ·
 *   which countries competitors' ads target (Meta shares this for ads shown in the UK and EU only) · what the brand's own ads sold there.
 * The order is fixed and explained on screen; the brand can always change the choice.
 */

/** Assumed: what one country needs a day before Meta has enough to learn from. Shown as an assumption wherever it is used. */
export const PER_COUNTRY = 10;

export type PlaceFacts = { code: string; orders: number; ships: boolean | null; rivalAds: number; rivalBrands: number; purchases: number; spend: number };
export type Place = PlaceFacts & { name: string; market: boolean; pick: boolean; why: string[] };
export type PlaceAdvice = { places: Place[]; picks: string[]; room: number; orders: number; rivals: number };

const nameOf = (code: string) => COUNTRIES.find(([k]) => k === code)?.[1] ?? code;

export function choosePlaces(v: { facts: PlaceFacts[]; market: string | null; home: string; daily: number; rivals: number }): PlaceAdvice {
  const market = (v.market ?? "").trim().toUpperCase();
  const known = new Map(v.facts.filter((f) => COUNTRIES.some(([k]) => k === f.code)).map((f) => [f.code, f]));
  // The researched market and the store's home country are always considered, with or without numbers of their own.
  for (const code of [market, v.home]) if (COUNTRIES.some(([k]) => k === code) && !known.has(code)) known.set(code, { code, orders: 0, ships: null, rivalAds: 0, rivalBrands: 0, purchases: 0, spend: 0 });
  const all = [...known.values()];
  const orders = all.reduce((a, f) => a + f.orders, 0), rivalAds = all.reduce((a, f) => a + f.rivalAds, 0);

  // 1 the researched market · 2 where the store already sells (a tenth of its orders, two at least) · 3 where competitors advertise
  // (two of them, or a quarter of their ads) · 4 anything else with a number. Inside a step: more orders, then more competitor ads.
  const tier = (f: PlaceFacts) => f.code === market ? 0 : f.orders >= Math.max(2, orders * 0.1) ? 1 : f.rivalBrands >= 2 || (rivalAds > 0 && f.rivalAds / rivalAds >= 0.25) ? 2 : f.orders || f.rivalAds || f.purchases ? 3 : f.code === v.home ? 4 : 5;
  const ranked = all.filter((f) => tier(f) < 5).sort((a, b) => tier(a) - tier(b) || b.orders - a.orders || b.purchases - a.purchases || b.rivalAds - a.rivalAds || a.code.localeCompare(b.code));
  const room = Math.max(1, Math.floor(v.daily / PER_COUNTRY));
  // Never a country the store doesn't ship to; never one that is only "has a number" (step 4).
  let picks = ranked.filter((f) => f.ships !== false && tier(f) <= 2).slice(0, room).map((f) => f.code);
  if (!picks.length) picks = ranked.filter((f) => f.ships !== false).slice(0, 1).map((f) => f.code);
  if (!picks.length) picks = [COUNTRIES.some(([k]) => k === v.home) ? v.home : "US"];

  const places = ranked.slice(0, 6).map((f): Place => ({
    ...f, name: nameOf(f.code), market: f.code === market, pick: picks.includes(f.code),
    why: [
      f.ships === false ? "You don’t ship here" : null,
      f.code === market ? "Researched here" : null,
      f.orders ? `${f.orders} of ${orders} orders` : null,
      f.purchases ? `${f.purchases} sold by your ads` : null,
      f.rivalBrands ? `${f.rivalBrands} of ${v.rivals} competitors advertise here` : null,
    ].filter((x): x is string => Boolean(x)),
  }));
  return { places, picks, room, orders, rivals: v.rivals };
}
