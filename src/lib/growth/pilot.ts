import type { ChangeKind } from "../db/schema";

/**
 * Autopilot: Kaviar checks every brand's ads, orders and stock each morning and works out what to change. The brand chooses how much
 * of that Kaviar may decide on its own. Shared by the server (the daily run) and the screens that show it.
 */
export type Mode = "ask" | "protect" | "full";
export const MODES: Record<Mode, { name: string; line: string; kinds: ChangeKind[] }> = {
  ask: { name: "Ask me first", line: "Kaviar finds the changes. You decide each one.", kinds: [] },
  protect: { name: "Protect my money", line: "Kaviar decides the safe ones itself: pausing what loses money on both Meta’s count and yours, and ads for products selling out. It never raises spend.", kinds: ["pause", "hold"] },
  full: { name: "Full autopilot", line: "Kaviar also moves budget to the winners. New ads and new tests still wait for you.", kinds: ["pause", "hold", "shift", "scale"] },
};
/** One check: what was looked at, what it found, what it decided under the brand's mode, and which earlier changes it judged. */
export type Run = {
  at: string; day: string; by: "schedule" | "team";
  watched: { campaigns: number; ads: number; products: number };
  found: { kind: ChangeKind; title: string }[]; auto: string[]; applied?: string[]; judged: { title: string; verdict: "worked" | "didnt" }[];
  note?: string; // not a check: something else worth a line in the log, e.g. the team changed the mode
};
export type Pilot = { mode: Mode; since: string | null; runs: Run[]; canAct: boolean; granted: boolean; connected: boolean; test: { at: string; ok: boolean; steps: { name: string; ok: boolean; note?: string }[] } | null };
