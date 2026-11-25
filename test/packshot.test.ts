import { describe, expect, it } from "vitest";
import { packshotOf, placeProduct } from "@/lib/creative/cutout";

/** A w×h RGBA picture: `bg` everywhere, `fg` inside the box. */
function picture(w: number, h: number, bg: number[], fg: number[], box: { x0: number; y0: number; x1: number; y1: number }) {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1 ? fg : bg, (y * w + x) * 4);
  return px;
}

describe("packshotOf", () => {
  it("finds a product on a see-through background and the box it fills", () => {
    const p = packshotOf(picture(100, 100, [0, 0, 0, 0], [150, 150, 150, 255], { x0: 35, y0: 15, x1: 64, y1: 84 }), 100, 100);
    expect(p?.bg).toBeNull();
    expect(p!.crop.x).toBeCloseTo(0.338, 2);
    expect(p!.crop.w).toBeCloseTo(0.324, 2);
    expect(p!.crop.h).toBeCloseTo(0.724, 2);
  });
  it("finds a product on a white background and keeps that white", () => {
    const p = packshotOf(picture(100, 100, [255, 255, 255, 255], [90, 90, 90, 255], { x0: 30, y0: 20, x1: 69, y1: 89 }), 100, 100);
    expect(p?.bg).toBe("#ffffff");
    expect(p!.crop.y).toBeCloseTo(0.188, 2);
  });
  it("leaves a scene alone: a dark or uneven backdrop is a photo, not a product shot", () => {
    expect(packshotOf(picture(100, 100, [60, 80, 70, 255], [200, 200, 200, 255], { x0: 30, y0: 20, x1: 69, y1: 89 }), 100, 100)).toBeNull();
    const uneven = picture(100, 100, [255, 255, 255, 255], [90, 90, 90, 255], { x0: 30, y0: 20, x1: 69, y1: 89 });
    for (let y = 95; y < 100; y++) for (let x = 95; x < 100; x++) uneven.set([150, 150, 150, 255], (y * 100 + x) * 4);
    expect(packshotOf(uneven, 100, 100)).toBeNull();
  });
  it("leaves a picture the subject fills edge to edge alone", () => {
    expect(packshotOf(picture(100, 100, [255, 255, 255, 255], [90, 90, 90, 255], { x0: 0, y0: 8, x1: 99, y1: 99 }), 100, 100)).toBeNull();
  });
});

describe("placeProduct", () => {
  it("scales the product to fill its box, centred and standing on the floor of it", () => {
    const at = placeProduct({ x: 0.2, y: 0.3, w: 0.6, h: 0.5 }, { x: 0.35, y: 0.15, w: 0.3, h: 0.7 }, 1, 1000, 1000);
    expect(at.clip.height).toBeCloseTo(500);
    expect(at.clip.width).toBeCloseTo(500 * (0.3 / 0.7));
    expect(at.clip.top + at.clip.height).toBeCloseTo(800);
    expect(at.clip.left + at.clip.width / 2).toBeCloseTo(500);
    expect(at.img.left).toBeCloseTo(-0.35 * at.img.width);
  });
  it("draws the whole picture when nothing says where the product is", () => {
    const at = placeProduct({ x: 0, y: 0, w: 1, h: 1 }, null, 1, 800, 1000);
    expect(at.clip.width).toBeCloseTo(800);
    expect(at.img.left).toBeCloseTo(0);
  });
});
