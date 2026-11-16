import { describe, expect, it } from "vitest";
import { scoreTest, spearman } from "@/lib/audience/run";
import { isWarm, scoreOf, type Persona, type Reaction, type TestItem } from "@/lib/audience/types";

const person = (id: string, group: string, weight: number): Persona => ({
  id, name: id, age: 30, gender: "Woman", place: "Austin, TX", life: "", group, relation: "Never heard of the brand",
  wants: "", worries: [], budget: "", shops: "", feed: "", trusts: "", weight, basis: "", sources: ["shopify"],
});
const item = (key: string, extra: Partial<TestItem> = {}): TestItem => ({ key, kind: "ad", label: key, format: "static", hook: "", primaryText: "", headline: "", cta: "Shop now", offer: "", product: null, image: null, ...extra });
const react = (p: string, it: string, pass: number, next: Reaction["next"], scroll: Reaction["scroll"] = "stopped to look"): Reaction =>
  ({ p, pass, item: it, scroll, next, believe: "not sure", clear: true, thought: "", pulled: "", putOff: "" });

describe("spearman", () => {
  it("is 1 for the same order and -1 for the reverse", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBe(1);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBe(-1);
  });
  it("handles ties and needs at least 3 points", () => {
    expect(spearman([1, 1, 2], [1, 2, 3])).toBeGreaterThan(0.8);
    expect(spearman([1, 2], [1, 2])).toBeNull();
  });
});

describe("scoreTest", () => {
  const people = [person("a", "Fans", 75), person("b", "Skeptics", 25)];
  const items = [item("x"), item("y"), item("live", { kind: "live", bench: true })];
  const rs = [
    react("a", "x", 0, "tap to find out more"), react("a", "x", 1, "tap and probably buy"),
    react("b", "x", 0, "nothing", "kept scrolling"), react("b", "x", 1, "nothing", "kept scrolling"),
    react("a", "y", 0, "nothing", "glanced"), react("a", "y", 1, "nothing", "glanced"),
    react("b", "y", 0, "nothing", "kept scrolling"), react("b", "y", 1, "nothing", "kept scrolling"),
    react("a", "live", 0, "tap and probably buy"), react("a", "live", 1, "tap and probably buy"),
    react("b", "live", 0, "tap and probably buy"), react("b", "live", 1, "tap and probably buy"),
  ];
  const r = scoreTest(items, people, rs, null);
  const x = r.scores.find((s) => s.key === "x")!;

  it("weights answers by each person's share of the audience", () => {
    expect(x.tap).toBeCloseTo(0.75);
    expect(x.stop).toBeCloseTo(0.75);
    expect(x.buy).toBeCloseTo(0.375);
    expect(x.score).toBe(scoreOf(0.75, 0.75, 0.375));
    expect(x.groups.find((g) => g.group === "Skeptics")?.tap).toBe(0);
    expect(x.fans).toEqual(["a"]);
    expect(x.lost).toEqual(["b"]);
  });
  it("never picks the live benchmark as the winner", () => {
    expect(r.winner).toBe("x");
  });
  it("measures how often a person gave the same answer on the second look", () => {
    expect(r.stability).toBe(1);
  });
  it("estimates click rates only from a good enough match with real results", () => {
    const cal = { testId: "t", status: "done" as const, n: 6, rho: 0.7, fit: { a: Math.log(0.005), b: 0.02, sd: 0.3 }, ads: [], at: "" };
    const withFit = scoreTest(items, people, rs, cal).scores.find((s) => s.key === "x")!;
    expect(withFit.ctr?.[0]).toBeLessThan(withFit.ctr![1]);
    expect(scoreTest(items, people, rs, { ...cal, rho: 0.2 }).scores[0].ctr).toBeNull();
  });
});

describe("isWarm", () => {
  it("spots batches written for people who already know the brand", () => {
    expect(isWarm("Custom audience: past purchasers 60–180 days ago")).toBe(true);
    expect(isWarm("Women 25–44 interested in niche perfume, Advantage+")).toBe(false);
  });
});
