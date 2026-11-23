import { describe, expect, it } from "vitest";
import { START } from "../src/lib/growth/plan";
import { timeline, type TimeInput } from "../src/lib/growth/timeline";

const c = { key: "x", name: "New people", why: "", kind: "cold" as const, audience: null, product: "Toner", price: 50, stock: null, signal: null, rank: 0 };
const base: TimeInput = { c, budget: 900, input: { budget: 900, days: 14, goal: "profit", discount: 0, margin: 0.6, repeat: 0, rates: START }, stock: 400, pace: 1, minToLearn: 450, cycle: 7, lift: 2 };

describe("the same budget over different deadlines", () => {
  it("more days sell more at full price without help — and never more than the stock", () => {
    const { rows } = timeline(base);
    expect(rows.map((r) => Math.round(r.organic))).toEqual([30, 90, 180]);
    expect(timeline({ ...base, stock: 60 }).rows.map((r) => Math.round(r.organic))).toEqual([30, 60, 60]);
    for (const r of timeline({ ...base, stock: 60 }).rows) expect(r.sold).toBeLessThanOrEqual(60);
  });
  it("the ads bring the same orders from the same money when the audience is large", () => {
    const { rows } = timeline(base);
    expect(rows[0].ads).toBeCloseTo(rows[2].ads, 5);
  });
  it("a short deadline with stock to spare leans on an offer; once the stock would sell anyway, the offer is dropped", () => {
    const short = timeline(base).rows[0];
    expect(short.discount).toBeGreaterThan(0);
    expect(short.profit).toBeGreaterThan(short.fullProfit);
    const long = timeline({ ...base, stock: 100 }).rows[2]; // 180 a day at pace 1 sells all 100 at full price
    expect(long.discount).toBe(0);
    expect(long.clears).toBe(true);
    expect(long.left).toBe(0);
  });
  it("never offers a discount that sells a unit below its cost", () => {
    for (const r of timeline({ ...base, input: { ...base.input, margin: 0.12 }, lift: 6 }).rows) expect(r.discount).toBeLessThan(0.12);
  });
  it("the budget buys the tests; time only lets them follow one another, and delays the first readable result", () => {
    const { rows } = timeline(base, [7, 30, 180]);
    expect(rows.map((r) => r.tests)).toEqual([2, 2, 2]);
    expect(rows.map((r) => r.rounds)).toEqual([1, 2, 2]);
    expect(rows.map((r) => r.readDay)).toEqual([4, 15, 90]);
    const thin = timeline({ ...base, budget: 300 }).rows[0];
    expect(thin.tests).toBe(0);
    expect(thin.rounds).toBe(0);
    expect(thin.readDay).toBeNull(); // the money runs out before a result can be read
  });
  it("names the deadline that earns the most", () => {
    const t = timeline(base);
    expect(t.rows[t.best].profit).toBe(Math.max(...t.rows.map((r) => r.profit)));
  });
  it("works without a stock count: nothing is 'left', nothing 'clears'", () => {
    const r = timeline({ ...base, stock: null }).rows[1];
    expect(r.left).toBeNull();
    expect(r.clears).toBe(false);
  });
});
