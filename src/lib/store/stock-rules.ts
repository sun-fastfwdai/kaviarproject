/**
 * Inventory forecast. For each product: how fast it sells (units a day over the last 30 days), how many days the stock on hand lasts at
 * that pace, the day it runs out, and — against how long a restock takes — whether to reorder, when by, or whether too much is sitting.
 * All arithmetic on the store's own orders and stock; nothing is a model's opinion. Pure, so the rules can be tested without a store.
 */
export type Placed = { qty: number; eta: string; at: string }; // a restock the brand has ordered: how many, when it should land, when it was ordered
export type StockIn = { id: string; title: string; image: string | null; price: number | null; cost: number | null; inventory: number; units30: number; sku?: string | null; variants?: number; ordered?: Placed | null };
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
export const STOCK = { windowDays: 30, soonDays: 14, overDays: 180, keepDays: 90, leadDefault: 14, coverDays: 60 } as const; // coverDays: how long a restock should last once it lands
export const STATE_NAME: Record<StockState, string> = { out: "Sold out", risk: "Runs out first", low: "Reorder now", ok: "Healthy", over: "Overstock", idle: "Not selling", none: "No stock" };
const ORDER: StockState[] = ["out", "risk", "low", "over", "idle", "ok", "none"];
export const URGENT: StockState[] = ["out", "risk", "low"];
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
  // What is already on order waits below what still needs a decision.
  const rank = (r: StockRow) => (r.ordered && URGENT.includes(r.state) ? URGENT.length - 0.5 : ORDER.indexOf(r.state));
  return list.map((p) => forecast(p, leadDays, today)).sort((a, b) => rank(a) - rank(b) || ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || (a.state === "over" || a.state === "idle" ? b.tied - a.tied : (a.runway ?? 1e9) - (b.runway ?? 1e9)) || b.units30 - a.units30);
}
export function stockTotals(rows: StockRow[]) {
  const n = (s: StockState[]) => rows.filter((r) => s.includes(r.state) && !r.ordered).length; // on order = dealt with
  const sitting = rows.filter((r) => r.state === "over" || r.state === "idle");
  return { soon: n(["out", "risk"]), reorder: n(["low"]), ordered: rows.filter((r) => r.ordered && URGENT.includes(r.state)).length, over: sitting.length, tied: rows.reduce((t, r) => t + r.tied, 0),
    // Money is only "sitting" at what the stock cost. Where Shopify has no cost for a product, the units are counted instead of pricing them at what they sell for.
    atCost: sitting.length > 0 && sitting.every((r) => r.tiedAt === "cost"), units: Math.round(sitting.reduce((t, r) => t + (r.state === "idle" ? r.inventory : Math.max(0, r.inventory - r.pace * STOCK.keepDays)), 0)) };
}
export const paceText = (pace: number) => (pace <= 0 ? "0" : pace >= 10 ? String(Math.round(pace)) : pace >= 1 ? pace.toFixed(1).replace(/\.0$/, "") : pace.toFixed(2).replace(/0$/, ""));

// ---------------------------------------------------------------- restocking
/** How many to order: enough for the days the restock takes to arrive plus two months of sales after that, less what is on the shelf. */
export function suggestQty(r: { pace: number; inventory: number }, leadDays: number): number {
  return Math.max(1, Math.ceil(r.pace * (leadDays + STOCK.coverDays) - Math.max(0, r.inventory)));
}
/** The day an order of `qty` would itself run out, counting from when it lands. */
export function lastsUntil(r: { pace: number; inventory: number }, qty: number, leadDays: number, today = new Date()): string | null {
  if (!(r.pace > 0)) return null;
  const left = Math.max(0, Math.max(0, r.inventory) - r.pace * leadDays); // what is still on the shelf the day it lands
  return day(today, leadDays + Math.floor((left + qty) / r.pace));
}
/** The order to send a supplier — plain facts from the forecast, for the brand to edit and send themselves. */
export function supplierNote(o: { brand: string; title: string; sku?: string | null; qty: number; left: number; outOn: string | null; needBy: string }): { subject: string; body: string } {
  const nice = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  return { subject: `Reorder: ${o.qty} × ${o.title}`, body: [
    "Hi,", "",
    `We’d like to reorder ${o.qty.toLocaleString("en-US")} units of ${o.title}${o.sku ? ` (SKU ${o.sku})` : ""}.`,
    o.left > 0 && o.outOn ? `We have ${o.left.toLocaleString("en-US")} left and expect to run out around ${nice(o.outOn)}, so we’d need it delivered by ${nice(o.needBy)} if possible.` : `We are out of stock, so we’d need it as soon as possible — by ${nice(o.needBy)} if you can.`,
    "Could you confirm the price, the delivery date and any faster shipping option?", "",
    "Thank you,", o.brand].join("\n") };
}
