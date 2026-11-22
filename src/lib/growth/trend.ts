/**
 * The numbers at the top of Today: each one for the last 30 days, against the 30 days before, with its line. Pure arithmetic on one row
 * a day, so it can be tested without a store.
 */
export type Day = { day: string; revenue: number; orders: number; meta: number; fresh: number; spend: number };
export type Delta = { text: string; dir: "up" | "down" | "flat"; good: boolean | null }; // good: null when more is neither better nor worse (ad spend)
/**
 * One block of the board at the top of Today. `kind` picks its place: the hero (sales, with the big chart), the score (the tall one with
 * the ring), or an ordinary block. Colour is never decoration: `tone` tints a block only when its state is good news or needs attention.
 */
export type Tile = {
  label: string; value: string; unit?: string; sub?: string; delta?: Delta; href: string; hint?: string;
  spark?: number[]; chart?: "line" | "bars"; icon?: string; kind?: "hero" | "score"; tone?: "good" | "warn";
  points?: { label: string; text: string }[]; // each day's date and value in words, for reading the chart
  tag?: { text: string; tone: "good" | "bad" | "flat" }; meter?: number; parts?: { label: string; value: string }[];
};

type K = "revenue" | "orders" | "meta" | "fresh" | "spend";
export const sumOf = (d: Day[], k: K) => d.reduce((n, x) => n + x[k], 0);
/** The window split in two: the earlier half and the later half. */
export function halves(days: Day[]): { prev: Day[]; cur: Day[] } {
  const n = Math.floor(days.length / 2);
  return { prev: days.slice(days.length - 2 * n, days.length - n), cur: days.slice(days.length - n) };
}
/** Percent change, or nothing when there is no earlier figure to compare with. */
export function pctDelta(cur: number, prev: number, moreIsGood: boolean | null = true): Delta | undefined {
  if (!(prev > 0)) return undefined;
  const p = ((cur - prev) / prev) * 100, a = Math.abs(p), dir = a < 0.5 ? "flat" : p > 0 ? "up" : "down";
  return { text: `${a >= 100 ? Math.round(a) : a >= 10 ? a.toFixed(0) : a.toFixed(1).replace(/\.0$/, "")}%`, dir, good: dir === "flat" || moreIsGood == null ? null : (p > 0) === moreIsGood };
}
/** A ratio (sales per order, sales per ad dollar) as a smooth line: each point is the ratio over the week ending that day. */
export function rolling(days: Day[], top: K, bottom: K, shown: number, span = 7): number[] {
  const out: number[] = [];
  let last = 0;
  for (let i = days.length - shown; i < days.length; i++) {
    const w = days.slice(Math.max(0, i - span + 1), i + 1), b = sumOf(w, bottom);
    if (b > 0) last = sumOf(w, top) / b;
    out.push(last);
  }
  return out;
}
