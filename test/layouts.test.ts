import { describe, expect, it } from "vitest";
import { AD_LOOKS, LAYOUTS, copyOf, layoutDesign, toneFor } from "@/lib/creative/layouts";

const copy = { headline: "Why This Eye Balm?", subline: "The balm that helps tired eyes look brighter and more awake.", tagline: "One swipe delivers.", note: "Your quick fix.", brand: "Hey Bud", cta: "Shop now", word: "Glow", benefits: ["Brightens tired eyes", "One swipe", "No sting"] };
const light = toneFor(0.9), dark = toneFor(0.2);

describe("toneFor", () => {
  it("puts dark type on light photos and white type on dark ones", () => {
    expect(light).toEqual({ color: "#1C1B19", shadow: false, scrim: 0 });
    expect(dark).toEqual({ color: "#FFFFFF", shadow: true, scrim: 0 });
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
