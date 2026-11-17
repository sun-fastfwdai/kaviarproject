import { describe, expect, it } from "vitest";
import { AD_LOOKS, LAYOUTS, LOOK_GROUPS, copyOf, isLayout, layoutDesign, lookNamed, toneFor } from "@/lib/creative/layouts";

const copy = { headline: "Why This Eye Balm?", subline: "The balm that helps tired eyes look brighter and more awake.", tagline: "One swipe delivers.", note: "Your quick fix.", brand: "Hey Bud", cta: "Shop now", word: "Glow", benefits: ["Brightens tired eyes", "One swipe", "No sting"] };
const light = toneFor(0.9), dark = toneFor(0.2);

describe("toneFor", () => {
  it("puts dark type on light photos and white type on dark ones", () => {
    expect(light).toMatchObject({ color: "#1C1B19", shadow: false, scrim: 0 });
    expect(dark).toMatchObject({ color: "#FFFFFF", shadow: true, scrim: 0 });
  });
  it("adds a scrim behind white type on mid-tone photos, and when the photo can't be read", () => {
    expect(toneFor(0.42).scrim).toBeGreaterThan(0);
    expect(toneFor(null).scrim).toBeGreaterThan(0);
  });
});

describe("layoutDesign", () => {
  it("keeps every layer inside the artboard for every layout", () => {
    for (const l of LAYOUTS) {
      const d = layoutDesign(l.key, copy, { top: light, bottom: dark }, "/api/assets/x");
      expect(d.layout).toBe(l.key);
      expect(d.layers.length).toBeGreaterThan(0);
      for (const layer of d.layers) {
        expect(layer.x).toBeGreaterThanOrEqual(0); expect(layer.x + layer.w).toBeLessThanOrEqual(1.001);
        expect(layer.y).toBeGreaterThan(0); expect(layer.y).toBeLessThan(0.97);
      }
    }
  });
  it("stacks the subline under a long headline without overlap", () => {
    const d = layoutDesign("bold", { ...copy, headline: "One Balm. Multiple Fixes For Tired Eyes." }, { top: light, bottom: light }, null);
    const head = d.layers.find((l) => l.role === "headline")!, sub = d.layers.find((l) => l.role === "subline")!;
    expect(sub.y * 1350).toBeGreaterThan(head.y * 1350 + head.size * 1.15 * 2);
  });
  it("colours top and bottom type from their own patches of photo, and darkens only where white type needs it", () => {
    const d = layoutDesign("bold", copy, { top: light, bottom: toneFor(0.42) }, null);
    expect(d.layers.find((l) => l.role === "headline")!.color).toBe("#1C1B19");
    expect(d.layers.find((l) => l.role === "tagline")!.color).toBe("#FFFFFF");
    expect(d.overlayTop).toBe(0);
    expect(d.overlay).toBeGreaterThan(0);
  });
  it("sets the poster headline as one or two rows that fit the width", () => {
    const one = layoutDesign("poster", { ...copy, headline: "Sunscreen Day" }, { top: dark, bottom: dark }, null).layers.filter((l) => l.role === "headline");
    expect(one.map((l) => l.text)).toEqual(["Sunscreen Day"]);
    expect(one[0].size * 13 * 0.47).toBeLessThanOrEqual(0.92 * 1080);
    const two = layoutDesign("poster", { ...copy, headline: "Calm Skin, No Burn" }, { top: dark, bottom: dark }, null).layers.filter((l) => l.role === "headline");
    expect(two.map((l) => l.text)).toEqual(["Calm Skin,", "No Burn"]);
    expect(two[1].y).toBeGreaterThan(two[0].y);
    expect(two[1].y * 1350 + two[1].size).toBeLessThan(1350 - 40);
  });
  it("puts the chips layout's key words on chips that carry their own text colour", () => {
    const d = layoutDesign("chips", copy, { top: dark, bottom: dark, chip: "#F59B1C" }, null);
    const chips = d.layers.filter((l) => l.kind === "badge");
    expect(chips.map((l) => l.role)).toEqual(["tagline", "note"]);
    expect(chips.every((l) => l.bg === "#F59B1C" && l.color === "#1C1B19")).toBe(true);
    expect(layoutDesign("chips", copy, { top: dark, bottom: dark, chip: "#123456" }, null).layers.find((l) => l.kind === "badge")!.color).toBe("#FFFFFF");
  });
  it("stacks a lead-in, one huge word and a third line without overlap", () => {
    const d = layoutDesign("stack", { ...copy, headline: "Your Daily", word: "Shield", tagline: "Gel SPF50+" }, { top: dark, bottom: dark }, null);
    const [lead, word, tag] = ["headline", "word", "tagline"].map((r) => d.layers.find((l) => l.role === r)!);
    expect(word.text).toBe("SHIELD");
    expect(word.size).toBeGreaterThan(lead.size * 2);
    expect(word.y * 1350).toBeGreaterThanOrEqual(lead.y * 1350 + lead.size);
    expect(tag.y * 1350).toBeGreaterThanOrEqual(word.y * 1350 + word.size);
  });
  it("sets the giant word behind the product when the photo allows it: bigger, lower, solid", () => {
    const over = layoutDesign("bigword", copy, { top: toneFor(0.7), bottom: light }, null).layers.find((l) => l.role === "word")!;
    const behind = layoutDesign("bigword", copy, { top: toneFor(0.7), bottom: light }, null, 1080, 1350, { behind: true }).layers.find((l) => l.role === "word")!;
    expect(over.behind).toBeUndefined();
    expect(behind.behind).toBe(true);
    expect(behind.color).toBe("#FFFFFF");
    expect(behind.y).toBeGreaterThan(over.y);
    expect(behind.opacity).toBeGreaterThan(over.opacity!);
  });
  it("splits the luxe headline into a light line and a bold line", () => {
    const heads = layoutDesign("luxe", { ...copy, headline: "New Year New Skin" }, { top: dark, bottom: dark }, null).layers.filter((l) => l.role === "headline");
    expect(heads.map((l) => l.text)).toEqual(["New Year", "New Skin"]);
    expect(heads.map((l) => l.weight)).toEqual([300, 700]);
  });
});

describe("copyOf", () => {
  const ad = { hook: "Hook", headline: "Ad headline", cta: "Shop now", offer: "No offer" };
  it("reads the words back from the layers, so edits survive a layout switch", () => {
    const d = layoutDesign("luxe", copy, { top: dark, bottom: dark }, null);
    d.layers = d.layers.map((l) => (l.role === "subline" ? { ...l, text: "Edited by the team" } : l));
    const c = copyOf(d, ad, "Brand");
    expect(c.headline).toBe("Why This Eye Balm?");
    expect(c.subline).toBe("Edited by the team");
    expect(c.tagline).toBe("One swipe delivers."); // not shown in luxe, kept from the design's copy
  });
  it("falls back to the ad's own words", () => {
    expect(copyOf(null, ad, "Brand")).toMatchObject({ headline: "Hook", subline: "Ad headline", tagline: "", brand: "Brand" });
  });
});

describe("ad looks", () => {
  it("each names a layout that exists and says where the type goes", () => {
    for (const l of AD_LOOKS) { expect(LAYOUTS.some((x) => x.key === l.layout)).toBe(true); expect(l.room.length).toBeGreaterThan(20); }
  });
});

describe("ad looks", () => {
  it("offers product-only and with-a-person styles, each composed for a real layout", () => {
    for (const g of LOOK_GROUPS) expect(AD_LOOKS.filter((l) => l.group === g).length).toBeGreaterThanOrEqual(6);
    expect(new Set(AD_LOOKS.map((l) => l.key)).size).toBe(AD_LOOKS.length);
    for (const l of AD_LOOKS) { expect(isLayout(l.layout)).toBe(true); expect(Boolean(l.person)).toBe(l.group === "With a person"); expect(l.camera.length).toBeGreaterThan(30); }
  });
  it("finds a look from a tapped answer or a typed sentence", () => {
    expect(lookNamed("Sky hold")?.key).toBe("sky");
    expect(lookNamed("Which ad style? Reach to camera")?.key).toBe("reach");
    expect(lookNamed("Ad look · Big word")?.key).toBe("bigword");
    expect(lookNamed("something else")).toBeNull();
  });
});

describe("subject mask", () => {
  it("finds a product on a plain backdrop and leaves the backdrop see-through, soft shadows included", async () => {
    const { subjectMask, coverage, canGoBehind, behindBand } = await import("@/lib/creative/cutout");
    const w = 60, h = 80, px = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, shade = 1 - 0.08 * (y / h); // a backdrop that darkens slightly toward the floor
      let c = [160 * shade, 215 * shade, 205 * shade];
      if (x >= 22 && x < 38 && y >= 24 && y < 70) c = y < 32 ? [20, 20, 20] : [250, 250, 250]; // black cap, white bottle
      else if (x >= 38 && x < 44 && y >= 50 && y < 70) c = c.map((v) => v * 0.9); // a soft shadow beside it
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
    const m = subjectMask(px, w, h), at = (x: number, y: number) => m.a[y * w + x];
    expect(at(30, 28)).toBeGreaterThan(0.9); expect(at(30, 50)).toBeGreaterThan(0.9);
    expect(at(8, 40)).toBeLessThan(0.05); expect(at(41, 60)).toBeLessThan(0.3);
    expect(canGoBehind(coverage(m, 0.1, 0.45))).toBe(true);
    expect(canGoBehind(coverage(m, 0, 0.2))).toBe(false); // nothing overlaps there
    expect(behindBand([{ y: 0.1, size: 440, text: "GLOW", w: 0.96, behind: true }, { y: 0.9, size: 40, text: "x", w: 0.5 }], 1080, 1350)!.y0).toBeCloseTo(0.09);
  });
});
