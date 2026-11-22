/**
 * Inventory forecast. For each product: how fast it sells (units a day over the last 30 days), how many days the stock on hand lasts at
 * that pace, the day it runs out, and — against how long a restock takes — whether to reorder, when by, or whether too much is sitting.
 * All arithmetic on the store's own orders and stock; nothing is a model's opinion. Pure, so the rules can be tested without a store.
 */
export type StockIn = { id: string; title: string; image: string | null; price: number | null; cost: number | null; inventory: number; units30: number };
export type StockState = "out" | "risk" | "low" | "ok" | "over" | "idle" | "none"; // none: nothing in stock and nothing sold — not a product running out, just one that isn't stocked
export type StockRow = StockIn & {
  pace: number; // units a day
  runway: number | null; // days the stock lasts at that pace; null when nothing sold
  outOn: string | null; reorderBy: string | null; // dates (YYYY-MM-DD): when it runs out, and the last day to order so the restock lands in time
  gap: number; // days with nothing to sell if the order went in today
  state: StockState;
  tied: number; // money sitting in stock beyond 90 days of sales (at cost when known, else at the selling price)
  tiedAt: "cost" | "price" | null;
};
export const STOCK = { windowDays: 30, soonDays: 14, overDays: 180, keepDays: 90, leadDefault: 14 } as const;
export const STATE_NAME: Record<StockState, string> = { out: "Sold out", risk: "Runs out first", low: "Reorder now", ok: "Healthy", over: "Overstock", idle: "Not selling", none: "No stock" };
const ORDER: StockState[] = ["out", "risk", "low", "over", "idle", "ok", "none"];
const day = (from: Date, add: number) => new Date(from.getTime() + add * 86_400_000).toISOString().slice(0, 10);

export function forecast(p: StockIn, leadDays: number, today = new Date()): StockRow {
  const pace = p.units30 / STOCK.windowDays, inv = Math.max(0, p.inventory), runway = pace > 0 ? inv / pace : null, days = runway == null ? null : Math.floor(runway);
  const state: StockState = inv <= 0 ? (pace > 0 ? "out" : "none") : runway == null ? "idle" : runway <= leadDays ? "risk" : runway <= leadDays + STOCK.soonDays ? "low" : runway > STOCK.overDays ? "over" : "ok";
  const spare = state === "over" ? inv - pace * STOCK.keepDays : state === "idle" ? inv : 0, each = p.cost ?? p.price ?? 0;
  return { ...p, pace, runway, state,
    outOn: days == null || inv <= 0 ? null : day(today, days), reorderBy: days == null || inv <= 0 ? null : day(today, Math.max(0, days - leadDays)),
    gap: inv <= 0 && pace > 0 ? leadDays : runway == null ? 0 : Math.max(0, Math.ceil(leadDays - runway)),
    tied: Math.round(Math.max(0, spare) * each), tiedAt: spare > 0 && each > 0 ? (p.cost != null ? "cost" : "price") : null };
}
/** Most urgent first; within a state, the one that runs out soonest (or holds the most money). */
export function forecastAll(list: StockIn[], leadDays: number, today = new Date()): StockRow[] {
  return list.map((p) => forecast(p, leadDays, today)).sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || (a.state === "over" || a.state === "idle" ? b.tied - a.tied : (a.runway ?? 1e9) - (b.runway ?? 1e9)) || b.units30 - a.units30);
}
export function stockTotals(rows: StockRow[]) {
  const n = (s: StockState[]) => rows.filter((r) => s.includes(r.state)).length;
  const sitting = rows.filter((r) => r.state === "over" || r.state === "idle");
  return { soon: n(["out", "risk"]), reorder: n(["low"]), over: sitting.length, tied: rows.reduce((t, r) => t + r.tied, 0),
    // Money is only "sitting" at what the stock cost. Where Shopify has no cost for a product, the units are counted instead of pricing them at what they sell for.
    atCost: sitting.length > 0 && sitting.every((r) => r.tiedAt === "cost"), units: Math.round(sitting.reduce((t, r) => t + (r.state === "idle" ? r.inventory : Math.max(0, r.inventory - r.pace * STOCK.keepDays)), 0)) };
}
export const paceText = (pace: number) => (pace <= 0 ? "0" : pace >= 10 ? String(Math.round(pace)) : pace >= 1 ? pace.toFixed(1).replace(/\.0$/, "") : pace.toFixed(2).replace(/0$/, ""));
