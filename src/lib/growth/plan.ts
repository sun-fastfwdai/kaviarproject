/**
 * The spend plan: a budget, split across the campaigns Kaviar proposes, with what should come back — as a range.
 * Pure arithmetic on the brand's data (no model writes a number here), shared by the server and the page so the numbers move as the
 * brand changes an input. With no ad history the result is a scenario built from stated, editable starting assumptions; as results
 * arrive the same sums run on the brand's own rates.
 */
export type Kind = "cold" | "lookalike" | "warm";
/** [cautious, likely, strong] */
export type Tri = [number, number, number];
export type Rates = { cpm: Tri; ctr: Tri; cvr: Record<Kind, Tri> };
export type History = { days: number; spend: number; impressions: number; clicks: number; purchases: number; value: number };
export type Candidate = { key: string; name: string; why: string; kind: Kind; audience: number | null; product: string; price: number; stock: number | null; signal: string | null; rank: number };
export type PlanInput = { budget: number; days: number; goal: "profit" | "revenue" | "customers"; discount: number; margin: number; repeat: number; rates: Rates; candidates: Candidate[]; clicksToLearn?: number };
export type Outcome = { spend: number; seen: number; clicks: number; orders: number; revenue: number; cost: number; profit: number };
export type Row = { c: Candidate; spend: number; share: number; out: [Outcome, Outcome, Outcome]; stockLimited: boolean };
export type Plan = {
  rows: Row[]; unfunded: { c: Candidate; reason: string }[]; total: [Outcome, Outcome, Outcome];
  breakEven: number; roas: Tri; minToLearn: number; cells: number; tooSmall: boolean;
  next: { step: number; revenue: number; profit: number } | null; suggested: number | null; needCvr: number | null;
};

/** Starting assumptions for a brand with no ad history. They are assumptions, shown and editable — not measurements. */
export const START: Rates = { cpm: [26, 18, 13], ctr: [0.008, 0.012, 0.018], cvr: { cold: [0.008, 0.014, 0.024], lookalike: [0.011, 0.019, 0.03], warm: [0.03, 0.05, 0.08] } };
/** 0 scenario (no history) · 1 early · 2 own data. */
export const levelOf = (h: History | null): 0 | 1 | 2 => (!h || h.days < 7 || h.clicks < 200 ? 0 : h.days < 42 ? 1 : 2);
export const LEVEL = ["Scenario", "Early estimate", "From your results"] as const;

/** The brand's own rates take over from the starting assumptions as its history grows; the range narrows with it. */
export function ratesFrom(h: History | null, start: Rates = START): Rates {
  if (levelOf(h) === 0 || !h) return start;
  const w = Math.min(1, h.days / 56), spread = 1.6 - 0.35 * w; // how wide the cautious…strong band stays
  const mix = (own: number, prior: number) => (own > 0 ? own * w + prior * (1 - w) : prior);
  const cpm = mix((h.spend / Math.max(1, h.impressions)) * 1000, start.cpm[1]), ctr = mix(h.clicks / Math.max(1, h.impressions), start.ctr[1]);
  const own = h.purchases / Math.max(1, h.clicks), k = own > 0 ? mix(own, start.cvr.cold[1]) / start.cvr.cold[1] : 1;
  const band = (v: number, up = true): Tri => (up ? [v / spread, v, v * spread] : [v * spread, v, v / spread]);
  return { cpm: band(cpm, false), ctr: band(ctr), cvr: { cold: band(start.cvr.cold[1] * k), lookalike: band(start.cvr.lookalike[1] * k), warm: band(start.cvr.warm[1] * k) } };
}

/** What a campaign returns at a spend, in scenario k (0 cautious, 1 likely, 2 strong). People stop responding as an audience fills up. */
export function outcome(c: Candidate, spend: number, k: 0 | 1 | 2, i: PlanInput): Outcome {
  const price = c.price * (1 - i.discount), unitCost = c.price * (1 - i.margin);
  const impressions = (spend / i.rates.cpm[k]) * 1000, cap = c.audience ? c.audience * 2.5 * Math.max(1, i.days / 7) : Infinity;
  const seen = Number.isFinite(cap) ? cap * (1 - Math.exp(-impressions / cap)) : impressions;
  const clicks = seen * i.rates.ctr[k];
  let orders = clicks * i.rates.cvr[c.kind][k];
  if (c.stock != null) orders = Math.min(orders, c.stock);
  const sold = orders * (1 + i.repeat), revenue = sold * price, cost = sold * unitCost;
  return { spend, seen, clicks, orders, revenue, cost, profit: revenue - cost - spend };
}
const sum = (rows: Row[], k: 0 | 1 | 2): Outcome => rows.reduce((a, r) => ({ spend: a.spend + r.out[k].spend, seen: a.seen + r.out[k].seen, clicks: a.clicks + r.out[k].clicks, orders: a.orders + r.out[k].orders, revenue: a.revenue + r.out[k].revenue, cost: a.cost + r.out[k].cost, profit: a.profit + r.out[k].profit }), { spend: 0, seen: 0, clicks: 0, orders: 0, revenue: 0, cost: 0, profit: 0 });

function allocate(i: PlanInput): { rows: Row[]; unfunded: Plan["unfunded"]; minToLearn: number; cells: number; tooSmall: boolean } {
  const cpc = i.rates.cpm[1] / 1000 / i.rates.ctr[1], minToLearn = Math.ceil(((i.clicksToLearn ?? 300) * cpc) / 10) * 10;
  const value = (o: Outcome) => (i.goal === "profit" ? o.profit : i.goal === "revenue" ? o.revenue : o.orders);
  // Best first: what each returns from the same test-sized spend, then the order research and store data put them in.
  const ranked = [...i.candidates].sort((a, b) => value(outcome(b, minToLearn, 1, i)) - value(outcome(a, minToLearn, 1, i)) || a.rank - b.rank);
  const cells = Math.max(1, Math.min(4, ranked.length, Math.floor(i.budget / minToLearn))), tooSmall = i.budget < minToLearn;
  const funded = ranked.slice(0, cells), spend = funded.map(() => (tooSmall ? i.budget / funded.length : minToLearn));
  // The rest goes a slice at a time to whichever campaign's next dollar brings the most, with no campaign taking over the plan.
  let left = i.budget - spend.reduce((a, b) => a + b, 0);
  const step = Math.max(10, i.budget / 60), cap = funded.length > 1 ? i.budget * 0.6 : i.budget;
  while (left > 0.5) {
    const s = Math.min(step, left);
    let best = -1, gain = -Infinity;
    funded.forEach((c, n) => { if (spend[n] + s > cap + 0.5) return; const g = value(outcome(c, spend[n] + s, 1, i)) - value(outcome(c, spend[n], 1, i)); if (g > gain + 1e-9) { gain = g; best = n; } });
    if (best < 0) break;
    spend[best] += s; left -= s;
  }
  const rows: Row[] = funded.map((c, n) => { const out = [0, 1, 2].map((k) => outcome(c, spend[n], k as 0 | 1 | 2, i)) as Row["out"]; return { c, spend: spend[n], share: i.budget ? spend[n] / i.budget : 0, out, stockLimited: c.stock != null && out[2].orders >= c.stock - 0.5 }; });
  const unfunded = ranked.slice(cells).map((c) => ({ c, reason: `Needs about ${Math.round(minToLearn).toLocaleString("en-US")} more in budget to get a readable result` }));
  return { rows, unfunded, minToLearn, cells, tooSmall };
}

export function plan(i: PlanInput, deep = true): Plan {
  const a = allocate(i), total = [0, 1, 2].map((k) => sum(a.rows, k as 0 | 1 | 2)) as Plan["total"];
  const first = a.rows[0]?.c ?? i.candidates[0], price = (first?.price ?? 1) * (1 - i.discount), unit = price - (first?.price ?? 1) * (1 - i.margin);
  const breakEven = unit > 0 ? price / unit : Infinity;
  const roas = total.map((t) => (t.spend ? t.revenue / t.spend : 0)) as Tri;
  const cpc = i.rates.cpm[1] / 1000 / i.rates.ctr[1], needCvr = unit > 0 ? cpc / (unit * (1 + i.repeat)) : null;
  let next: Plan["next"] = null, suggested: number | null = null;
  if (deep && i.budget > 0) {
    const stepUp = i.budget >= 4000 ? 1000 : 500, more = plan({ ...i, budget: i.budget + stepUp }, false).total[1];
    next = { step: stepUp, revenue: more.revenue - total[1].revenue, profit: more.profit - total[1].profit };
    // The budget that earns the most at the likely rates — where the next dollar stops paying. None when no budget pays yet.
    let bestProfit = 0;
    for (let b = a.minToLearn; b <= Math.max(i.budget * 6, a.minToLearn * 12); b += Math.max(100, a.minToLearn / 2)) { const p = plan({ ...i, budget: b }, false).total[1].profit; if (p > bestProfit + 1) { bestProfit = p; suggested = Math.round(b / 50) * 50; } }
  }
  return { rows: a.rows, unfunded: a.unfunded, total, breakEven, roas, minToLearn: a.minToLearn, cells: a.cells, tooSmall: a.tooSmall, next, suggested, needCvr };
}
/** Profit per order falls faster than the price: how many times the orders a discount needs to earn the same. */
export const ordersNeeded = (margin: number, discount: number) => { const full = margin, cut = margin - discount; return cut > 0 ? full / cut : Infinity; };
