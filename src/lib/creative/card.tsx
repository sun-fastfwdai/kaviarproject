/* eslint-disable @next/next/no-img-element -- server-side card rendering (Satori), not a page */
import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { AdDesign, Layer } from "../db/schema";
import { loadImage } from "../audience/media";

/**
 * Draws an ad design (the Editor's layers over a photo) to a PNG on the server — the same layout rules as the Editor's canvas,
 * with the same fonts: Poppins for sans and display type, DM Serif Display for serif.
 */
const DIR = join(process.cwd(), "src/lib/creative/fonts");
let fonts: Promise<{ name: string; data: ArrayBuffer; weight: 300 | 400 | 500 | 600 | 700; style: "normal" }[]> | null = null;
const loadFonts = () => (fonts ??= Promise.all([
  ["Poppins", "Poppins-Light.ttf", 300], ["Poppins", "Poppins-Medium.ttf", 500], ["Poppins", "Poppins-SemiBold.ttf", 600], ["Poppins", "Poppins-Bold.ttf", 700], ["DM Serif Display", "DMSerifDisplay-Regular.ttf", 400],
].map(async ([name, file, weight]) => {
  const b = await readFile(join(DIR, file as string));
  return { name: name as string, data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, weight: weight as 300 | 400 | 500 | 600 | 700, style: "normal" as const };
})));

const family = (l: Layer) => (l.font === "serif" ? "DM Serif Display" : "Poppins");
const weight = (l: Layer) => (l.font === "serif" ? 400 : (() => { const w = Math.round((l.weight ?? (l.font === "display" ? 700 : 500)) / 100) * 100; return w <= 300 ? 300 : w <= 500 ? 500 : w >= 700 ? 700 : 600; })());

export const SIZES = { "4x5": { w: 1080, h: 1350 }, "1x1": { w: 1080, h: 1080 }, "9x16": { w: 1080, h: 1920 } } as const;

/** The design as a PNG. Pictures come from brand assets or public URLs (Shopify CDN); a picture that can't be read leaves the soft background. */
export async function renderDesign(brandId: string, d: AdDesign, size: keyof typeof SIZES = "4x5"): Promise<Buffer> {
  const { w: W, h: H } = SIZES[size];
  const [f, bg, ...logos] = await Promise.all([loadFonts(), loadImage(brandId, d.image), ...d.layers.map((l) => (l.kind === "logo" && l.src ? loadImage(brandId, l.src) : Promise.resolve(null)))]);
  const uri = (x: { media: string; data: string } | null) => (x ? `data:${x.media};base64,${x.data}` : null);
  const bgUri = uri(bg);
  const res = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative", backgroundImage: "linear-gradient(160deg, #EDE9E2, #D9D3C7)" }}>
        {bgUri && <img src={bgUri} width={W} height={H} alt="" style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }} />}
        {(d.overlayTop ?? 0) > 0 && <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, backgroundImage: `linear-gradient(180deg, rgba(0,0,0,${d.overlayTop}) 0%, rgba(0,0,0,0) 46%)` }} />}
        {d.overlay > 0 && <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0) 48%, rgba(0,0,0,${d.overlay}) 100%)` }} />}
        {d.layers.map((l, i) => {
          const left = l.x * W, top = l.y * H, width = l.w * W;
          if (l.kind === "logo") { const src = uri(logos[i]); return src ? <img key={l.id} src={src} alt="" style={{ position: "absolute", left, top, width }} /> : null; }
          const box = l.kind === "button" || l.kind === "badge";
          const al = box ? "center" : l.align ?? "left";
          return (
            <div key={l.id} style={{
              position: "absolute", left, top, ...(l.kind === "badge" ? { maxWidth: width } : { width }), display: "flex", justifyContent: al === "center" ? "center" : al === "right" ? "flex-end" : "flex-start",
              fontFamily: family(l), fontWeight: weight(l), fontSize: l.size, lineHeight: 1.15, color: l.color, textAlign: al, textTransform: l.upper ? "uppercase" : "none",
              letterSpacing: l.tracking ? l.tracking * l.size : l.font === "display" && !l.upper ? -0.02 * l.size : 0,
              ...(box ? { backgroundColor: l.bg ?? "#fff", borderRadius: l.kind === "button" ? 999 : 4, padding: `${l.size * 0.35}px ${l.size * 0.6}px` } : l.shadow === false ? {} : { textShadow: "0 1px 8px rgba(0,0,0,.3)" }),
            }}>{l.text}</div>
          );
        })}
      </div>
    ),
    { width: W, height: H, fonts: await f },
  );
  return Buffer.from(await res.arrayBuffer());
}
