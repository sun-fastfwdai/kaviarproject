import { describe, expect, it } from "vitest";
import { forecast, inDays, moments, rankPlans, salesReason, stageOf, stepsOf, type PlanAds, type PlanCard } from "@/lib/growth/plans-rules";
import { START, type Candidate } from "@/lib/growth/plan";

const c: Candidate = { key: "lapsed", name: "Win back lapsed buyers", why: "", kind: "warm", audience: 3000, product: "Toner", price: 30, stock: 500, signal: "lapsed", rank: 0 };
const input = { budget: 0, days: 14, goal: "profit" as const, discount: 0, margin: 0.6, repeat: 0, rates: START };
const ads = (o: Partial<PlanAds> = {}): PlanAds => ({ batchId: "b", review: 0, approved: 0, tested: false, thumbs: [], ...o });
const card = (o: Partial<PlanCard> = {}): PlanCard => ({ key: "k", reason: "lapsed", title: "t", why: "w", c, image: null, budget: 450, days: 14, out: forecast(c, 450, 14, input), stage: "suggested", ads: null, urgent: false, approvedAt: null, ...o });

describe("the shopping calendar", () => {
  it("finds Black Friday as the day after the fourth Thursday of November, and counts the days to it", () => {
    const m = moments(new Date("2026-11-23T08:00:00Z"));
    expect(m.map((x) => [x.name, x.date, x.days])).toEqual([["Black Friday", "2026-11-27", 4], ["Christmas", "2026-12-25", 32]]);
    expect(moments(new Date("2025-11-20T08:00:00Z"))[0]).toMatchObject({ name: "Black Friday", date: "2025-11-28" });
  });
  it("works out the Sundays and Mondays that move each year, for the United States only", () => {
    const may = moments(new Date("2026-05-01T08:00:00Z"));
    expect(may.map((x) => [x.name, x.date])).toEqual([["Mother’s Day", "2026-05-10"], ["Memorial Day", "2026-05-25"]]);
    expect(moments(new Date("2026-05-01T08:00:00Z"), "GB")).toEqual([]);
    expect(moments(new Date("2026-06-01T08:00:00Z")).map((x) => x.date)).toEqual(["2026-06-21", "2026-07-04"]); // Father's Day, then the Fourth
  });
  it("carries into January and leaves out what has passed or is too far off", () => {
    expect(moments(new Date("2026-12-26T08:00:00Z")).map((x) => x.name)).toEqual(["New Year"]);
    expect(moments(new Date("2026-03-01T08:00:00Z"))).toEqual([]);
    expect([inDays(0), inDays(1), inDays(4)]).toEqual(["today", "tomorrow", "in 4 days"]);
  });
});

describe("when sales are a reason to advertise", () => {
  it("with no target: only a real drop on the 30 days before", () => {
    expect(salesReason(230, 736)).toMatchObject({ on: true, why: "Sales down 69% on the 30 days before" });
    expect(salesReason(900, 1000).on).toBe(false); // 10% is noise
    expect(salesReason(1200, 1000).on).toBe(false);
    expect(salesReason(500, 0).on).toBe(false); // nothing to compare with
  });
  it("with a target: short of it is the reason, whatever last month did", () => {
    expect(salesReason(736, 500, 5000)).toMatchObject({ on: true, why: "15% of your monthly target" });
    expect(salesReason(5200, 9000, 5000).on).toBe(false);
  });
});

describe("one plan", () => {
  it("moves through its stages by what has been decided and what its ads need", () => {
    expect(stageOf(false, null)).toBe("suggested");
    expect(stageOf(true, null)).toBe("approved");
    expect(stageOf(true, ads({ review: 3 }))).toBe("review");
    expect(stageOf(true, ads({ review: 1, approved: 2 }))).toBe("review");
    expect(stageOf(false, ads({ approved: 3 }))).toBe("ready"); // approved ads can go live; the shopper test never blocks a launch
    expect(stageOf(true, ads({ approved: 3, tested: true }))).toBe("ready");
    expect(stageOf(true, ads({ approved: 3 }), true)).toBe("live");
  });
  it("has its own six steps, with the one it is waiting on", () => {
    const s = stepsOf(card());
    expect(s.steps.map((x) => x.key)).toEqual(["why", "budget", "ads", "test", "launch", "results"]);
    expect([s.now, s.steps[1].done, s.steps[1].note]).toEqual(["budget", false, "Waiting for your yes"]);
    expect(stepsOf(card({ stage: "approved" })).now).toBe("ads");
    const r = stepsOf(card({ stage: "review", ads: ads({ review: 3 }) }));
    expect([r.now, r.steps[2].note, r.steps[1].done, r.steps[1].note]).toEqual(["ads", "3 ads to review", false, "Not approved yet"]); // ads made before anyone approved
    expect(stepsOf(card({ stage: "approved", approvedAt: "2026-11-22T10:00:00Z", approvedBy: "Kris Singh" })).steps[1]).toMatchObject({ done: true, note: "Approved by Kris · Nov 22" });
    const ready = stepsOf(card({ stage: "ready", ads: ads({ approved: 3 }) }));
    expect([ready.now, ready.steps[3].note, ready.steps[3].optional, ready.steps[2].done]).toEqual(["launch", "Optional", true, true]);
    const live = stepsOf(card({ stage: "live", ads: ads({ approved: 3, tested: true }) }));
    expect([live.now, live.steps[4].done, live.steps[4].note, live.steps[3].done]).toEqual(["results", true, "Made on Meta", true]);
  });
  it("forecasts on its own budget: more spend brings more back, never past the stock", () => {
    const [lo, mid, hi] = forecast(c, 450, 14, input), more = forecast(c, 900, 14, input)[1];
    expect(lo.revenue).toBeLessThan(mid.revenue); expect(mid.revenue).toBeLessThan(hi.revenue);
    expect(more.revenue).toBeGreaterThan(mid.revenue);
    expect(forecast({ ...c, stock: 2 }, 5000, 14, input)[2].orders).toBe(2);
  });
  it("puts a holiday days away first, then plans stopped mid-way, then the rest", () => {
    const list = rankPlans([card({ key: "live", stage: "live" }), card({ key: "sales", reason: "sales" }), card({ key: "stock", reason: "overstock" }), card({ key: "review", stage: "review", ads: ads({ review: 3 }) }), card({ key: "xmas", reason: "holiday" }), card({ key: "mine", reason: "own" }), card({ key: "bf", reason: "holiday", urgent: true }), card({ key: "ready", stage: "ready" })]);
    expect(list.map((p) => p.key)).toEqual(["bf", "ready", "review", "mine", "xmas", "stock", "sales", "live"]); // what is already on Meta needs nothing from the brand
  });
});
