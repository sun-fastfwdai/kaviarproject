import { describe, expect, it } from "vitest";
import { forecast, forecastAll, paceText, stockTotals, type StockIn } from "@/lib/store/stock-rules";
import { halves, pctDelta, rolling, sumOf, type Day } from "@/lib/growth/trend";

const p = (over: Partial<StockIn>): StockIn => ({ id: "1", title: "Toner", image: null, price: 30, cost: 10, inventory: 100, units30: 60, ...over });
const TODAY = new Date("2026-11-22T12:00:00Z");

describe("inventory forecast", () => {
  it("works out the pace, how long the stock lasts and the day it runs out", () => {
    const r = forecast(p({ inventory: 100, units30: 60 }), 14, TODAY); // 2 a day → 50 days
    expect([r.pace, r.runway, r.outOn, r.reorderBy, r.state, r.gap]).toEqual([2, 50, "2027-01-11", "2026-12-28", "ok", 0]);
  });
  it("flags what runs out before a restock could arrive, with the days there would be nothing to sell", () => {
    const r = forecast(p({ inventory: 18, units30: 60 }), 14, TODAY); // 9 days of stock, 14 to restock
    expect([r.state, r.gap, r.outOn, r.reorderBy]).toEqual(["risk", 5, "2026-12-01", "2026-11-22"]);
  });
  it("says reorder now when the last day to order is within two weeks", () => {
    expect(forecast(p({ inventory: 40, units30: 60 }), 14, TODAY).state).toBe("low"); // 20 days ≤ 14 + 14
    expect(forecast(p({ inventory: 60, units30: 60 }), 14, TODAY).state).toBe("ok"); // 30 days
    expect(forecast(p({ inventory: 60, units30: 60 }), 30, TODAY).state).toBe("risk"); // a slower supplier changes the answer
  });
  it("counts the money sitting beyond 90 days of sales, at cost when Shopify has it", () => {
    const over = forecast(p({ inventory: 1000, units30: 30 }), 14, TODAY); // 1 a day → 1000 days; 910 units spare at $10
    expect([over.state, over.tied, over.tiedAt]).toEqual(["over", 9100, "cost"]);
    const idle = forecast(p({ inventory: 50, units30: 0, cost: null }), 14, TODAY);
    expect([idle.state, idle.runway, idle.outOn, idle.tied, idle.tiedAt]).toEqual(["idle", null, null, 1500, "price"]);
  });
  it("treats nothing left as sold out, with the whole restock time as the gap if it was selling", () => {
    expect(forecast(p({ inventory: 0, units30: 30 }), 14, TODAY)).toMatchObject({ state: "out", gap: 14, outOn: null });
    expect(forecast(p({ inventory: -3, units30: 0 }), 14, TODAY)).toMatchObject({ state: "out", gap: 0, tied: 0 });
  });
  it("puts the most urgent first and totals each kind", () => {
    const rows = forecastAll([p({ id: "ok", inventory: 100 }), p({ id: "over", inventory: 1000, units30: 30 }), p({ id: "risk", inventory: 18 }), p({ id: "low", inventory: 40 }), p({ id: "out", inventory: 0 }), p({ id: "risk2", inventory: 6 })], 14, TODAY);
    expect(rows.map((r) => r.id)).toEqual(["out", "risk2", "risk", "low", "over", "ok"]);
    expect(stockTotals(rows)).toMatchObject({ soon: 3, reorder: 1, over: 1, tied: 9100, atCost: true });
  });
  it("writes a pace a person can read", () => expect([paceText(0), paceText(0.23), paceText(1.5), paceText(2), paceText(14.4)]).toEqual(["0", "0.23", "1.5", "2", "14"]));
});

describe("today's numbers against the 30 days before", () => {
  const days: Day[] = Array.from({ length: 60 }, (_, i) => ({ day: `d${i}`, revenue: i < 30 ? 100 : 150, orders: i < 30 ? 2 : 2, meta: i < 30 ? 20 : 60, fresh: 1, spend: i < 30 ? 10 : 20 }));
  it("splits the window in two and sums each half", () => {
    const { prev, cur } = halves(days);
    expect([prev.length, cur.length, sumOf(prev, "revenue"), sumOf(cur, "revenue")]).toEqual([30, 30, 3000, 4500]);
    expect(halves(days.slice(1)).cur.length).toBe(29); // an odd window still compares like with like
  });
  it("gives the change as a percent, and says whether it is good news", () => {
    expect(pctDelta(4500, 3000)).toEqual({ text: "50%", dir: "up", good: true });
    expect(pctDelta(230, 736)).toEqual({ text: "69%", dir: "down", good: false });
    expect(pctDelta(104.2, 100)).toEqual({ text: "4.2%", dir: "up", good: true });
    expect(pctDelta(600, 300, null)).toMatchObject({ dir: "up", good: null }); // more ad spend is neither
    expect(pctDelta(100.2, 100)).toMatchObject({ dir: "flat", good: null });
    expect(pctDelta(50, 0)).toBeUndefined(); // nothing to compare with
  });
  it("draws a ratio as the week's average, holding the last known value through a week with no orders", () => {
    const line = rolling(days, "revenue", "orders", 30);
    expect([line.length, line[0], line.at(-1)]).toEqual([30, (100 * 6 + 150) / 14, 75]);
    const quiet = [...days.slice(0, 50), ...days.slice(50).map((d) => ({ ...d, revenue: 0, orders: 0 }))];
    expect(rolling(quiet, "revenue", "orders", 30).at(-1)).toBe(75);
  });
});
