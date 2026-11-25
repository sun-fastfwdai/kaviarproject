import { describe, expect, it } from "vitest";
import { PASS_SCORE, RUBRIC, better, cleanScores, flagOf, passes, totalOf, type AdCheck } from "@/lib/creative/rubric";

const full = Object.fromEntries(RUBRIC.map((r) => [r.key, r.max]));
const check = (x: Partial<AdCheck> = {}): AdCheck => ({ labelMatches: true, shapeExact: true, coloursOnBrand: true, noTextOrWatermark: true, compliant: true, note: "", scores: cleanScores(full, true, true), ...x });

describe("the ad rubric", () => {
  it("adds up to 100 and passes at 85", () => {
    expect(RUBRIC.reduce((a, r) => a + r.max, 0)).toBe(100);
    expect(PASS_SCORE).toBe(85);
    expect(totalOf(cleanScores(full, true, true))).toBe(100);
  });
  it("keeps every score inside its own range", () => {
    const s = cleanScores({ accuracy: 40, stopping: -3, composition: 12.6, typography: Number.NaN }, true, true);
    expect(s).toMatchObject({ accuracy: 25, stopping: 0, composition: 13, typography: 0, originality: 0 });
  });
  it("never lets a wrong product or a broken rule score well", () => {
    expect(cleanScores(full, false, true).accuracy).toBe(12);
    expect(cleanScores(full, true, false).compliance).toBe(0);
  });
  it("needs the score, the real product and supported claims together", () => {
    expect(passes(check())).toBe(true);
    expect(passes(check({ scores: cleanScores({ ...full, stopping: 4 }, true, true) }))).toBe(false); // 84
    expect(passes(check({ labelMatches: false }))).toBe(false);
    expect(passes(check({ compliant: false }))).toBe(false);
    expect(passes(null)).toBe(false);
  });
  it("still passes a plain photo, which has no score", () => {
    expect(passes({ labelMatches: true, shapeExact: true, coloursOnBrand: true, noTextOrWatermark: true, note: "" })).toBe(true);
  });
  it("names what held an ad back", () => {
    expect(flagOf(check())).toBeNull();
    expect(flagOf(check({ shapeExact: false }))).toBe("shape off");
    expect(flagOf(check({ compliant: false }))).toBe("claim to fix");
    expect(flagOf(check({ scores: cleanScores({ ...full, stopping: 0 }, true, true) }))).toBe("80 of 100");
  });
  it("keeps the better of two renders", () => {
    const low = check({ scores: cleanScores({ ...full, stopping: 0 }, true, true) }), high = check();
    expect(better(low, high)).toBe(high);
    expect(better(high, low)).toBe(high);
    // A pretty ad with the wrong product loses to a plainer one with the right product.
    const wrong = check({ labelMatches: false });
    expect(better(wrong, low)).toBe(low);
    expect(better(low, null)).toBe(low);
  });
});
