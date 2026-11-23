import { outcome, type Candidate, type PlanInput } from "./plan";

/**
 * Time as a constraint. The same budget and the same stock, spread over different deadlines: what sells, what is left, and what is
 * earned. Profit is the objective; stock and the deadline are the limits. For each deadline the offer (full price, or a discount) is
 * the one that earns the most inside those limits.
 *
 * What is measured and what is assumed is kept apart, because only some of this can be measured for a brand today:
 *   measured — the product's own pace of sales, its stock, its price and margin, and (once ads have run) its own ad rates;
 *   assumed  — how much more a discount sells (`lift`), and the ad rates of a brand with no ad history.
 * Three things move with time. More days sell more at full price without help. The same money over more days is a smaller daily
 * spend, so the first result that can be read comes later. And with room between them, tests can run one after another, each
 * learning from the last, instead of all at once — but their number is bought by the budget, not by time.
 */
export type TimeInput = {
  c: Candidate; budget: number; input: Omit<PlanInput, "candidates">;
  stock: number | null; // units on hand; null when the store doesn't count it
  pace: number; // units a day the product sells with no ads — from its own orders
  minToLearn: number; // money one test needs before its result can be read
  cycle: number; // days one round of testing takes
  lift: number; // how many times its size a discount adds to units sold: 2 means 10% off sells 20% more
  /** The product's own price. An order the ads bring is worth `c.price` — the brand's figure for a whole order, which can hold more than this product — but a unit that sells by itself is worth this. */
  unitPrice?: number;
};
export type TimeRow = {
  days: number; daily: number;
  organic: number; ads: number; // units without ads, and units the ads bring, at full price
  discount: number; sold: number; left: number | null; clears: boolean; // the offer that earns most, what it sells, what is left
  profit: number; fullProfit: number; // with that offer; and at full price, to show what the offer adds
  tests: number; rounds: number; readDay: number | null; // tests the budget buys; how many can follow one another; the day the first one can be read
};
export const DEADLINES = [30, 90, 180];
const OFFERS = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5];

export function timeline(v: TimeInput, deadlines: number[] = DEADLINES): { rows: TimeRow[]; best: number } {
  const order = v.c.price, unit = v.unitPrice ?? order, m = v.input.margin, cap = v.stock ?? Infinity;
  const tests = v.minToLearn > 0 ? Math.floor(v.budget / v.minToLearn) : 0;
  const rows = deadlines.map((days): TimeRow => {
    const organic = Math.min(cap, v.pace * days);
    // The ads' orders at full price: the same money buys the same views, unless a small audience fills up — which more days ease.
    const ads = v.budget > 0 ? outcome({ ...v.c, stock: null }, v.budget, 1, { ...v.input, days, discount: 0, candidates: [] }).orders : 0;
    // What is left of a sale after the goods, at an offer d, is its price × (margin − d). The stock caps both kinds of sale alike.
    const at = (d: number) => { const want = (organic + ads) * (1 + v.lift * d), sold = Math.min(cap, want), k = want > 0 ? sold / (organic + ads) : 0; return { d, sold, profit: k * (organic * unit + ads * order) * (m - d) - v.budget }; };
    // No offer is considered that sells a unit for less than it cost.
    const full = at(0), pick = OFFERS.filter((d) => d < v.input.margin).map(at).reduce((a, b) => (b.profit > a.profit + 0.5 ? b : a), full);
    const daily = v.budget / days, read = daily > 0 && v.minToLearn > 0 ? Math.ceil(v.minToLearn / daily) : null;
    return {
      days, daily, organic, ads, discount: pick.d, sold: pick.sold, left: v.stock == null ? null : Math.max(0, v.stock - pick.sold), clears: v.stock != null && pick.sold >= v.stock - 0.5,
      profit: pick.profit, fullProfit: full.profit, tests, rounds: tests ? Math.max(1, Math.min(tests, Math.floor(days / Math.max(1, v.cycle)))) : 0, readDay: read != null && read <= days ? read : null,
    };
  });
  const best = rows.reduce((b, r, i) => (r.profit > rows[b].profit + 0.5 ? i : b), 0);
  return { rows, best };
}
