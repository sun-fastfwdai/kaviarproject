import type { PastStats } from "./types";

/**
 * What a brand's competitors do with their ads, taken together — and the two decisions Kaviar makes from it:
 *  · how many ads to write for a campaign: enough that one is likely worth keeping, at the rate competitors keep theirs;
 *  · how long a round of testing takes: as long as competitors give an ad before they drop it.
 * Counted from the Ad Library's start and stop days over six months. Nothing here is estimated or written by a model.
 */
export type Category = {
  brands: number; ads: number; kept: number; // competitors with enough ads to count, the ads counted, and how many ran 30+ days
  keepRate: number; oneIn: number | null; quickRate: number; // the share kept, as "1 in N", and the share stopped within a week
  decide: number | null; // days they give an ad before dropping it: the middle competitor's figure
  make: number; round: number | null; // ads to write for one campaign; days in one round of testing
};
export const MAKE = { min: 3, max: 6, fallback: 3 }, ROUND = { min: 3, max: 14 };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function category(pasts: (PastStats | null | undefined)[]): Category | null {
  const ok = pasts.filter((p): p is PastStats => Boolean(p && p.ads >= 50));
  if (!ok.length) return null;
  const sum = (f: (p: PastStats) => number) => ok.reduce((n, p) => n + f(p), 0);
  const ads = sum((p) => p.ads), kept = sum((p) => p.long), keepRate = kept / ads;
  // One competitor, one vote: a brand that runs ten times the ads does not set the pace for the others.
  const ds = ok.map((p) => p.decide).filter((d): d is number => typeof d === "number" && d > 0).sort((a, b) => a - b);
  const decide = ds.length ? ds[Math.floor((ds.length - 1) / 2)] : null;
  return {
    brands: ok.length, ads, kept, keepRate, oneIn: keepRate > 0 ? Math.max(1, Math.round(1 / keepRate)) : null, quickRate: sum((p) => p.quick) / ads, decide,
    // Enough ads that one is likely a keeper — never fewer than three (to compare) or more than six (each must still get enough spend to be read).
    make: clamp(keepRate > 0 ? Math.ceil(1 / keepRate) : MAKE.max, MAKE.min, MAKE.max),
    round: decide != null ? clamp(decide, ROUND.min, ROUND.max) : null,
  };
}
