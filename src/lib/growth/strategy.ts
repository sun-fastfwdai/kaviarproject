import { outcome, type Candidate, type Kind, type Outcome, type PlanInput } from "./plan";

/**
 * The set-up that earns a campaign the most: who sees it, how much is spent and for how long. Pure arithmetic on the same forecast the
 * campaign's own card shows — every audience the brand can choose, every budget in steps of 50, each length — so the answer can be
 * checked by moving the card's own controls. Nothing here is written by a model.
 */
export type Aud = { key: string; label: string; kind: Kind; size: number | null };
export type Setup = { audience: Aud | null; budget: number; days: number; out: [Outcome, Outcome, Outcome] };
export type Strategy = {
  best: Setup;
  pays: boolean; // the likely case leaves money over
  held: boolean; // the budget is kept to one readable test, because the rates are still assumptions
  cvr: number; needCvr: number | null; // share of clickers who buy: what the forecast uses, and what breaking even takes
  tried: number; // how many set-ups were compared
};
const DAYS = [14, 7, 28]; // on a tie the campaign keeps its own length; failing that, two weeks

export function strategy(v: { c: Candidate; audiences: Aud[]; current?: string | null; days?: number; input: Omit<PlanInput, "candidates">; test: number; level: 0 | 1 | 2 }): Strategy {
  const i = (days: number): PlanInput => ({ ...v.input, days, candidates: [] });
  const top = Math.max(v.test * 6, 600), auds: (Aud | null)[] = v.audiences.length ? v.audiences : [null];
  const held = v.level === 0;
  type Pick = { a: Aud | null; b: number; d: number; profit: number };
  const lengths = v.days && DAYS.includes(v.days) ? [v.days, ...DAYS.filter((d) => d !== v.days)] : DAYS;
  let best: Pick | null = null, tried = 0;
  for (const a of auds) {
    const c: Candidate = a ? { ...v.c, kind: a.kind, audience: a.size } : v.c;
    let mine: Pick | null = null;
    for (const d of lengths) {
      // The budget that earns the most at this length; with assumed rates, no more than one readable test.
      let b = 50, profit = -Infinity;
      for (let x = 50; x <= (held ? Math.max(50, v.test) : top); x += 50) { tried++; const p = outcome(c, x, 1, i(d)).profit; if (p > profit + 0.5) { profit = p; b = x; } }
      // A test too small to read teaches nothing: when it pays at all, spend the readable amount.
      if (held && profit > 0 && b < v.test) { const p = outcome(c, v.test, 1, i(d)).profit; if (p > 0) { b = v.test; profit = p; } }
      if (!mine || profit > mine.profit + 1) mine = { a, b, d, profit }; // another length must earn more to replace the first
    }
    // Another audience must earn more too: within a dollar, the campaign keeps who it has.
    const keep = a?.key != null && a.key === v.current;
    if (mine && (!best || mine.profit > best.profit + 1 || (keep && mine.profit > best.profit - 1))) best = mine;
  }
  const a = best!.a, c: Candidate = a ? { ...v.c, kind: a.kind, audience: a.size } : v.c;
  const out = [0, 1, 2].map((k) => outcome(c, best!.b, k as 0 | 1 | 2, i(best!.d))) as Setup["out"];
  const price = c.price * (1 - v.input.discount), unit = price - c.price * (1 - v.input.margin), cpc = v.input.rates.cpm[1] / 1000 / v.input.rates.ctr[1];
  return { best: { audience: a, budget: best!.b, days: best!.d, out }, pays: out[1].profit > 0, held, cvr: v.input.rates.cvr[c.kind][1], needCvr: unit > 0 ? cpc / (unit * (1 + v.input.repeat)) : null, tried };
}
