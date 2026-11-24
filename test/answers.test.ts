import { describe, expect, it } from "vitest";
import { linkedTo, named, tally, tracked, type Asked } from "../src/lib/seo/answers-rules";

const ps = tracked("PS", "https://percentscience.com", true), anua = tracked("Anua", "anua.com", false), cosrx = tracked("COSRX", "https://www.cosrx.com/", false);

describe("AI answers", () => {
  it("finds a brand by its name or its site's name, and a short name only when it stands alone", () => {
    expect(named("Try the Percent Science toner for sensitive skin", ps)).toBe(true);
    expect(named("Our pick: PS Marine Purian Toner.", ps)).toBe(true);
    expect(named("These tips help with breakouts", ps)).toBe(false);   // "tips" is not PS
    expect(named("ANUA's heartleaf toner is popular", anua)).toBe(false); // short names are matched as written
    expect(named("Anua Heartleaf 77% Toner", anua)).toBe(true);
    expect(named("the Cosrx snail mucin essence", cosrx)).toBe(true);
  });
  it("counts a link only to the brand's own site", () => {
    expect(linkedTo(["https://www.cosrx.com/products/snail", "https://amazon.com/x"], cosrx)).toBe(true);
    expect(linkedTo(["https://amazon.com/cosrx-snail"], cosrx)).toBe(false);
    expect(linkedTo(["https://shop.percentscience.com/a"], ps)).toBe(true);
  });
  it("tallies who was named across the questions, and the other brands named most", () => {
    const q = (named: string[], linked: string[], others: string[]): Asked => ({ q: "?", named, linked, others, answer: "" });
    const t = tally([q(["Anua", "COSRX"], ["COSRX"], ["CeraVe", "Anua", "La Roche-Posay"]), q(["COSRX"], [], ["CeraVe", "cerave"]), q([], [], ["Paula's Choice"])], [ps, anua, cosrx]);
    expect(t.brands).toEqual([{ name: "PS", you: true, named: 0, linked: 0 }, { name: "COSRX", you: false, named: 2, linked: 1 }, { name: "Anua", you: false, named: 1, linked: 0 }]);
    expect(t.top[0]).toEqual({ name: "CeraVe", n: 2 }); // once per answer, whatever the spelling; Anua is tracked, so not an "other"
    expect(t.top.map((x) => x.name)).not.toContain("Anua");
  });
});
