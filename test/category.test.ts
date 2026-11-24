import { describe, expect, it } from "vitest";
import { category } from "../src/lib/research/category";
import type { PastStats } from "../src/lib/research/types";

const past = (ads: number, long: number, quick: number, decide: number | null): PastStats => ({ ads, stopped: ads, median: 9, medianOpen: false, quick, long, since: null, until: null, more: true, at: "2026-11-24T00:00:00Z", decide, v: 5 });

describe("category", () => {
  it("turns six months of competitors' ads into how many ads to write and how long a round lasts", () => {
    // The three competitors read for PS on 24 Nov 2026.
    const c = category([past(1200, 595, 204, 12), past(1200, 117, 837, 2), past(1124, 50, 458, 6)])!;
    expect(c).toMatchObject({ brands: 3, ads: 3524, kept: 762, oneIn: 5, make: 5, decide: 6, round: 6 });
    expect(c.keepRate).toBeCloseTo(0.216, 3);
    expect(c.quickRate).toBeCloseTo(0.425, 3);
  });
  it("never writes fewer than three ads or more than six", () => {
    expect(category([past(400, 300, 20, 20)])!.make).toBe(3); // they keep 3 in 4: one ad would do, but three are needed to compare
    expect(category([past(400, 8, 300, 2)])!.make).toBe(6);   // they keep 1 in 50: more than six would starve each ad of spend
    expect(category([past(400, 0, 400, 1)])).toMatchObject({ make: 6, oneIn: null, round: 3 }); // a round is never under three days
  });
  it("needs enough ads to say anything", () => {
    expect(category([past(20, 10, 5, 4), null, undefined])).toBeNull();
    expect(category([])).toBeNull();
  });
});
