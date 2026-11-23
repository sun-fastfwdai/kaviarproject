import { describe, expect, it } from "vitest";
import { START, type Candidate, type PlanInput } from "../src/lib/growth/plan";
import { strategy, type Aud } from "../src/lib/growth/strategy";

const input: Omit<PlanInput, "candidates"> = { budget: 0, days: 14, goal: "profit", discount: 0, margin: 0.6, repeat: 0, rates: START };
const c = (price: number): Candidate => ({ key: "own:1", name: "x", why: "", kind: "cold", audience: null, product: "Toner", price, stock: 500, signal: "own:1", rank: 0 });
const auds: Aud[] = [{ key: "buyers", label: "People who bought before · 756", kind: "warm", size: 756 }, { key: "new", label: "New people", kind: "cold", size: null }];

describe("strategy", () => {
  it("says so when nothing pays: a $25 order cannot cover a $107 cost per order", () => {
    const s = strategy({ c: c(25), audiences: [auds[1]], input, test: 450, level: 0 });
    expect(s.pays).toBe(false);
    expect(s.best.budget).toBe(50); // the least it can lose
    expect(s.needCvr).toBeCloseTo(0.1, 2); // 1.50 a click ÷ 15 left per order
    expect(s.cvr).toBeCloseTo(0.014, 3);
  });
  it("with assumed rates, holds the budget to one readable test", () => {
    const s = strategy({ c: c(225), audiences: [auds[1]], input, test: 450, level: 0 });
    expect(s.pays).toBe(true);
    expect(s.held).toBe(true);
    expect(s.best.budget).toBe(450);
    expect(s.best.out[1].profit).toBeGreaterThan(0);
  });
  it("picks the audience that earns more, and keeps the current one on a tie", () => {
    const s = strategy({ c: c(225), audiences: auds, current: "new", input, test: 450, level: 0 });
    // 756 past buyers buy more often per click, but there are few of them: whichever leaves more at the same spend wins.
    const warm = strategy({ c: c(225), audiences: [auds[0]], input, test: 450, level: 0 }).best.out[1].profit;
    const cold = strategy({ c: c(225), audiences: [auds[1]], input, test: 450, level: 0 }).best.out[1].profit;
    expect(s.best.audience?.key).toBe(warm > cold + 1 ? "buyers" : "new");
    expect(s.best.out[1].profit).toBeCloseTo(Math.max(warm, cold), 0);
  });
  it("changes nothing that earns the same: an open audience keeps the campaign's own length", () => {
    for (const days of [7, 14, 28]) expect(strategy({ c: c(225), audiences: [auds[1]], current: "new", days, input, test: 450, level: 0 }).best.days).toBe(days);
  });
  it("with the brand's own rates, goes past one test when more spend still pays", () => {
    const s = strategy({ c: c(225), audiences: [auds[1]], input, test: 450, level: 2 });
    expect(s.held).toBe(false);
    expect(s.best.budget).toBeGreaterThan(450);
  });
});
