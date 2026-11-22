import { plan, ratesFrom, type Plan, type PlanInput } from "./plan";
import type { PlanData } from "./plan-data";

/** The plan as the team last set it (or the defaults the Spend plan opens with). */
export function planFor(d: PlanData): { p: Plan; budget: number; days: number; margin: number; input: PlanInput } {
  const s = d.saved ?? {}, budget = s.budget ?? 1500, days = s.days ?? 28, margin = d.margin.value ?? s.margin ?? 0.6;
  const repeat = d.orders.buyers >= 50 ? Math.min(0.5, d.orders.repeaters / d.orders.buyers) : 0;
  const chosen = d.products.find((x) => x.title === s.product) ?? null;
  const avg = d.orders.count >= 10 && d.orders.aov ? Math.round(d.orders.aov) : null; // their real average order, once there are enough
  const candidates = d.candidates.map((c) => ({ ...c, product: chosen?.title ?? c.product, price: s.order && s.order > 0 ? s.order : avg ?? chosen?.price ?? c.price, stock: chosen ? chosen.stock : c.stock }));
  const input: PlanInput = { budget, days, goal: s.goal ?? "profit", discount: s.discount ?? 0, margin, repeat, rates: ratesFrom(d.history), candidates };
  return { p: plan(input), budget, days, margin, input };
}

