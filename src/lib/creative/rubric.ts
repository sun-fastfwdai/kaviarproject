/**
 * How Otto scores a finished ad: seven things a creative director judges, 100 points in all. An ad goes forward at 85 or more, and only
 * when the product is the real one and nothing on it breaks advertising rules — those two are never traded against a good-looking picture.
 * A judgment of design quality, not a forecast of sales.
 */
export const RUBRIC = [
  { key: "accuracy", name: "Product and brand accuracy", max: 25 },
  { key: "stopping", name: "Scroll-stopping", max: 20 },
  { key: "composition", name: "Composition", max: 15 },
  { key: "typography", name: "Typography and readability", max: 15 },
  { key: "originality", name: "Originality", max: 10 },
  { key: "conversion", name: "Conversion", max: 10 },
  { key: "compliance", name: "Advertising compliance", max: 5 },
] as const;
export type RubricKey = (typeof RUBRIC)[number]["key"];
export type Scores = Record<RubricKey, number>;
export const PASS_SCORE = 85;

/** What the check of one picture holds. `scores` only on a finished ad. */
export type AdCheck = {
  labelMatches: boolean; shapeExact: boolean; coloursOnBrand: boolean; noTextOrWatermark: boolean; note: string;
  compliant?: boolean; scores?: Scores; fixes?: string[];
};

/** Each score as a whole number inside its own range. A wrong product can't score above half on accuracy; a broken rule scores 0 on compliance. */
export function cleanScores(raw: Partial<Record<RubricKey, number>>, productExact: boolean, compliant: boolean): Scores {
  const out = {} as Scores;
  for (const r of RUBRIC) {
    const v = Number(raw[r.key]);
    let n = Number.isFinite(v) ? Math.min(r.max, Math.max(0, Math.round(v))) : 0;
    if (r.key === "accuracy" && !productExact) n = Math.min(n, 12);
    if (r.key === "compliance" && !compliant) n = 0;
    out[r.key] = n;
  }
  return out;
}
export const totalOf = (s: Scores) => RUBRIC.reduce((a, r) => a + (s[r.key] ?? 0), 0);

const productExact = (c: AdCheck) => c.labelMatches && c.shapeExact && c.coloursOnBrand;
/** A picture goes forward when the product is right, no stray text or broken rule, and — for a finished ad — it scores 85 or more. */
export const passes = (c: AdCheck | null | undefined) =>
  Boolean(c && productExact(c) && c.noTextOrWatermark && c.compliant !== false && (!c.scores || totalOf(c.scores) >= PASS_SCORE));
/** The one thing that held a picture back, in two words. */
export const flagOf = (c: AdCheck | null | undefined) =>
  !c ? null : !c.labelMatches ? "label off" : !c.shapeExact ? "shape off" : !c.coloursOnBrand ? "colours off" : !c.noTextOrWatermark ? "added text"
    : c.compliant === false ? "claim to fix" : c.scores && totalOf(c.scores) < PASS_SCORE ? `${totalOf(c.scores)} of 100` : null;
/** Of two checks of the same ad, the one to keep: a pass beats a fail, then the higher score. */
export const better = (a: AdCheck | null, b: AdCheck | null) => {
  if (!a || !b) return a ? a : b;
  if (passes(a) !== passes(b)) return passes(a) ? a : b;
  if (productExact(a) !== productExact(b)) return productExact(a) ? a : b;
  return (b.scores ? totalOf(b.scores) : 0) > (a.scores ? totalOf(a.scores) : 0) ? b : a;
};
