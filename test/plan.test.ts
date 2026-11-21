import { describe, expect, it } from "vitest";
import { START, levelOf, ordersNeeded, outcome, plan, ratesFrom, type Candidate, type PlanInput } from "@/lib/growth/plan";

const c = (key: string, over: Partial<Candidate> = {}): Candidate => ({ key, name: key, why: "", kind: "cold", audience: 5_000_000, product: "Toner", price: 40, stock: null, signal: null, rank: 0, ...over });
const base: PlanInput = { budget: 3000, days: 28, goal: "profit", discount: 0, margin: 0.6, repeat: 0, rates: START, candidates: [c("a"), c("b", { rank: 1 }), c("c", { rank: 2 })] };

describe("spend plan", () => {
  it("spends the whole budget and never more", () => {
    const p = plan(base);
    expect(p.rows.reduce((a, r) => a + r.spend, 0)).toBeCloseTo(3000, 0);
    expect(p.total[1].spend).toBeCloseTo(3000, 0);
  });
  it("funds only as many campaigns as the budget can read a result from", () => {
    const small = plan({ ...base, budget: 600 });
    expect(small.cells).toBe(1); expect(small.unfunded).toHaveLength(2);
    expect(plan({ ...base, budget: 200 }).tooSmall).toBe(true);
  });
  it("gives a range: cautious below likely below strong", () => {
    const p = plan(base);
    expect(p.total[0].revenue).toBeLessThan(p.total[1].revenue); expect(p.total[1].revenue).toBeLessThan(p.total[2].revenue);
  });
  it("works out break-even from margin and discount, as in the founder's own example", () => {
    expect(plan(base).breakEven).toBeCloseTo(1.667, 2);
    expect(plan({ ...base, discount: 0.3 }).breakEven).toBeCloseTo(2.333, 2);
    expect(ordersNeeded(0.6, 0.3)).toBeCloseTo(2, 5);
  });
  it("never sells more than the stock", () => {
    const p = plan({ ...base, budget: 200000, candidates: [c("a", { stock: 12 })] });
    expect(p.rows[0].out[2].orders).toBeLessThanOrEqual(12); expect(p.rows[0].stockLimited).toBe(true);
  });
  it("slows down as a small audience fills up, and prefers the warmer audience", () => {
    const warm = c("w", { kind: "warm", audience: 3000 });
    const one = outcome(warm, 300, 1, base).orders, two = outcome(warm, 600, 1, base).orders;
    expect(two).toBeLessThan(one * 2);
    expect(plan({ ...base, candidates: [c("a"), warm] }).rows[0].c.key).toBe("w");
  });
  it("moves from the starting assumptions to the brand's own rates as history grows", () => {
    expect(levelOf(null)).toBe(0);
    const h = { days: 60, spend: 6000, impressions: 400_000, clicks: 8000, purchases: 240, value: 12000 };
    expect(levelOf(h)).toBe(2);
    const r = ratesFrom(h);
    expect(r.cpm[1]).toBeCloseTo(15, 0); expect(r.ctr[1]).toBeCloseTo(0.02, 3);
    expect(r.cpm[0]).toBeGreaterThan(r.cpm[2]); // cautious = dearer
  });
});
