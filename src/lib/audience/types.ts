import { SOURCE_NAME, type DataSource } from "../research/types";

/**
 * Audience test: a panel of small agents built to behave like the people a brand's Meta ads reach,
 * so the team can show ads to them — and read why they'd stop, tap or scroll past — before any budget is spent.
 */

/** "yours": built from the brand's Shopify and Meta data (plus research). "general": typical shoppers for the category. */
export type PanelKind = "yours" | "general";
export const PANEL_NAME: Record<PanelKind, string> = { yours: "Your audience", general: "General audience" };
export const PANEL_SIZE = 12;
/** Each person looks at the feed twice, in opposite orders, so where an ad sits in the feed doesn't decide its score. */
export const PASSES = 2;
export const MAX_ADS = 8;
export const MAX_VIDEOS = 4;

export type ASource = DataSource | "general";
export const ASOURCE_NAME: Record<ASource, string> = { ...SOURCE_NAME, general: "Typical shoppers" };

export const RELATIONS = ["Never heard of the brand", "Seen the brand, never bought", "Bought once", "Buys again", "Buys from a competitor"] as const;
export type Relation = (typeof RELATIONS)[number];

export type Persona = {
  id: string; name: string; age: number; gender: string; place: string; life: string; group: string; relation: Relation;
  wants: string; worries: string[]; budget: string; shops: string; feed: string; trusts: string;
  weight: number; basis: string; sources: ASource[];
};
export type PanelBody = { summary: string; facts: { text: string; source: ASource }[]; personas: Persona[]; at: string };

/** How well the panel's picks match the brand's real Meta results: the panel looks at past ads, and we compare with their click rates. */
export type Calibration = {
  testId: string; status: "running" | "done" | "error"; n: number; rho: number | null;
  fit: { a: number; b: number; sd: number } | null; // ln(click rate) ≈ a + b × panel score, when the match is good enough
  ads: { key: string; name: string; ctr: number; score: number }[]; at: string; note?: string;
};

// What each person answers for each ad — anchored choices, not made-up percentages.
export const SCROLL = ["kept scrolling", "glanced", "stopped to look", "read or watched it all"] as const;
export const NEXT = ["nothing", "might remember the brand", "tap to find out more", "tap and probably buy"] as const;
export const BELIEVE = ["don't believe it", "not sure", "believe it"] as const;
export type Reaction = {
  p: string; pass: number; item: string; scroll: (typeof SCROLL)[number]; next: (typeof NEXT)[number]; believe: (typeof BELIEVE)[number];
  clear: boolean; thought: string; pulled: string; putOff: string;
};

/** One thing shown to the panel: an ad from Creative studio, a video from Shoots, or one of the brand's live Meta ads. */
export type TestItem = {
  key: string; kind: "ad" | "video" | "live"; label: string; adId?: string; batchId?: string; assetId?: string; metaAdId?: string;
  format: string; hook: string; primaryText: string; headline: string; cta: string; offer: string; product: string | null;
  image: string | null; seconds?: number; bench?: boolean;
  real?: { ctr: number; impressions: number; clicks: number; purchases: number; spend: number; roas: number | null };
};
/** `focus`: show the ads only to people from this audience (Iris builds them for the test), e.g. a win-back batch's past buyers. */
export type TestSource = { type: "batch"; batchId: string; bench: boolean; focus?: string } | { type: "videos"; ids: string[]; bench: boolean; focus?: string } | { type: "live" };
/** Batches written for people who already know the brand: showing them to a cold panel would mislead. */
export const isWarm = (audience: string) => /past (buyers|purchasers|customers)|purchasers|customers|lapsed|win.?back|retarget|visitors|abandon|cart|repeat|subscribers|engaged/i.test(audience);

export type ItemScore = {
  key: string; score: number; stop: number; tap: number; buy: number; clear: number; trust: number; answers: number;
  ctr: [number, number] | null; groups: { group: string; weight: number; stop: number; tap: number }[]; fans: string[]; lost: string[];
};
export type Verdict = "Lead" | "Keep" | "Fix" | "Drop";
export type TestRead = {
  headline: string; summary: string; next: string[];
  items: { key: string; verdict: Verdict; why: string; fix: string; quotes: { p: string; text: string }[] }[];
  groups: { group: string; insight: string }[];
};
export type TestResult = { scores: ItemScore[]; winner: string | null; stability: number | null; read: TestRead | null; calibrated: boolean };

/** 0–100: stopping counts, tapping counts most, "probably buy" adds a little on top. */
export const scoreOf = (stop: number, tap: number, buy: number) => Math.round(100 * (0.3 * stop + 0.5 * tap + 0.2 * buy));
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const ctrText = (r: [number, number]) => `${(r[0] * 100).toFixed(1)}–${(r[1] * 100).toFixed(1)}%`;
/** How far to trust the match with real results. */
export const matchWord = (rho: number | null) => (rho == null ? "Not enough ads" : rho >= 0.6 ? "Good" : rho >= 0.35 ? "Fair" : "Weak");
