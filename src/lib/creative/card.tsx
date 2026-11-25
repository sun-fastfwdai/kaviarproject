/* eslint-disable @next/next/no-img-element -- server-side card rendering (Satori), not a page */
import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { AdDesign, Layer } from "../db/schema";
import { cutoutPng, loadImage } from "../audience/media";
import { behindBand, placeProduct } from "./cutout";

/**
 * Draws an ad design (the Editor's layers over a photo) to a PNG on the server — the same layout rules as the Editor's canvas,
 * with the same fonts: Poppins for sans and display type, DM Serif Display for serif.
 */
const DIR = join(process.cwd(), "src/lib/creative/fonts");
let fonts: Promise<{ name: string; data: ArrayBuffer; weight: 300 | 400 | 500 | 600 | 700; style: "normal" }[]> | null = null;
const loadFonts = () => (fonts ??= Promise.all([
  ["Poppins", "Poppins-Light.ttf", 300], ["Poppins", "Poppins-Medium.ttf", 500], ["Poppins", "Poppins-SemiBold.ttf", 600], ["Poppins", "Poppins-Bold.ttf", 700], ["DM Serif Display", "DMSerifDisplay-Regular.ttf", 400], ["Anton", "Anton-Regular.ttf", 400],
].map(async ([name, file, weight]) => {
  const b = await readFile(join(DIR, file as string));
  return { name: name as string, data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, weight: weight as 300 | 400 | 500 | 600 | 700, style: "normal" as const };
})));

/**
 * The story and reel size (9:16). The feed card sits whole in the middle on a plain field of the photo's own colour: the top and bottom
 * of a story are covered by the app's own buttons, so nothing the ad says is put there.
 */
export async function renderStory(card: Buffer, field: string): Promise<Buffer> {
  const { w: W, h: H } = SIZES["9x16"], h = SIZES["4x5"].h;
  const res = new ImageResponse(
    (<div style={{ width: W, height: H, display: "flex", position: "relative", backgroundColor: field }}>
      <img src={`data:image/png;base64,${card.toString("base64")}`} width={W} height={h} alt="" style={{ position: "absolute", left: 0, top: (H - h) / 2, width: W, height: h }} />
    </div>), { width: W, height: H });
  return Buffer.from(await res.arrayBuffer());
}

const family = (l: Layer) => (l.font === "serif" ? "DM Serif Display" : l.font === "condensed" ? "Anton" : "Poppins");
/** Is this colour light? (decides the tick's colour inside a bullet) */
const lightHex = (c: string) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c.trim()); return m ? (0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16)) / 255 > 0.6 : true; };
const weight = (l: Layer) => (l.font === "serif" || l.font === "condensed" ? 400 : (() => { const w = Math.round((l.weight ?? (l.font === "display" ? 700 : 500)) / 100) * 100; return w <= 300 ? 300 : w <= 500 ? 500 : w >= 700 ? 700 : 600; })());

export const SIZES = { "4x5": { w: 1080, h: 1350 }, "1x1": { w: 1080, h: 1080 }, "9x16": { w: 1080, h: 1920 } } as const;

/** The design as a PNG. Pictures come from brand assets or public URLs (Shopify CDN); a picture that can't be read leaves the soft background. */
export async function renderDesign(brandId: string, d: AdDesign, size: keyof typeof SIZES = "4x5", photo: { media: string; data: string } | null = null): Promise<Buffer> {
  const { w: W, h: H } = SIZES[size];
  const [f, bg, ...logos] = await Promise.all([loadFonts(), photo ?? loadImage(brandId, d.image), ...d.layers.map((l) => (l.kind === "logo" && l.src ? loadImage(brandId, l.src) : Promise.resolve(null)))]);
  const uri = (x: { media: string; data: string } | null) => (x ? `data:${x.media};base64,${x.data}` : null);
  const bgUri = uri(bg);
  // Type set behind the product: the photo's subject (its backdrop made see-through) is drawn again over those layers.
  // A product shot set in its own box: the type behind it is drawn first, then the product, then the rest — no cut-out needed.
  const fit = bg && d.fit ? d.fit : null;
  const band = bg && !fit ? behindBand(d.layers, W, H) : null;
  const cut = band ? await cutoutPng(Buffer.from(bg!.data, "base64")).catch(() => null) : null;
  const order = cut || fit ? [...d.layers.filter((l) => l.behind), ...d.layers.filter((l) => !l.behind)] : d.layers;
  const firstFront = cut || fit ? order.findIndex((l) => !l.behind) : -1;
  const at = fit ? placeProduct(fit, d.crop, d.crop?.ar ?? 1, W, H) : null;
  const product = at ? (
    <div key="product" style={{ position: "absolute", left: 0, top: 0, width: W, height: H, display: "flex" }}>
      {/* the floor it stands on */}
      <div style={{ position: "absolute", left: at.clip.left - at.clip.width * 0.05, top: at.clip.top + at.clip.height - at.clip.width * 0.07, width: at.clip.width * 1.1, height: at.clip.width * 0.13, borderRadius: "50%", backgroundImage: "radial-gradient(ellipse at center, rgba(40,32,20,.3) 0%, rgba(40,32,20,.1) 45%, rgba(40,32,20,0) 70%)" }} />
      <div style={{ position: "absolute", left: at.clip.left, top: at.clip.top, width: at.clip.width, height: at.clip.height, overflow: "hidden", display: "flex" }}>
        <img src={bgUri!} alt="" width={at.img.width} height={at.img.height} style={{ position: "absolute", left: at.img.left, top: at.img.top, width: at.img.width, height: at.img.height }} />
      </div>
    </div>
  ) : null;
  const res = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative", ...(fit && d.bg ? { backgroundColor: d.bg } : { backgroundImage: "linear-gradient(160deg, #EDE9E2, #D9D3C7)" }) }}>
        {bgUri && !fit && <img src={bgUri} width={W} height={H} alt="" style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }} />}
        {fit && !order.length && product}
        {(d.overlayTop ?? 0) > 0 && <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, backgroundImage: `linear-gradient(180deg, rgba(0,0,0,${d.overlayTop}) 0%, rgba(0,0,0,0) 46%)` }} />}
        {d.overlay > 0 && <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0) 48%, rgba(0,0,0,${d.overlay}) 100%)` }} />}
        {order.flatMap((l, n) => {
          const left = l.x * W, top = l.y * H, width = l.w * W;
          const subject = fit ? (n === firstFront || (firstFront < 0 && n === order.length - 1) ? product : null) : cut && band && (n === firstFront || (firstFront < 0 && n === order.length - 1)) ? (
            <div key="subject" style={{ position: "absolute", left: 0, top: band.y0 * H, width: W, height: (band.y1 - band.y0) * H, overflow: "hidden", display: "flex" }}>
              <img src={`data:image/png;base64,${cut.toString("base64")}`} width={W} height={H} alt="" style={{ position: "absolute", left: 0, top: -band.y0 * H, width: W, height: H, objectFit: "cover" }} />
            </div>
          ) : null;
          const el = (() => {
          if (l.kind === "logo") { const src = uri(logos[d.layers.indexOf(l)]); return src ? <img key={l.id} src={src} alt="" style={{ position: "absolute", left, top, width }} /> : null; }
          const box = l.kind === "button" || l.kind === "badge";
          const al = box ? "center" : l.align ?? "left";
          return (
            <div key={l.id} style={{
              position: "absolute", left, top, ...(l.kind === "badge" ? { maxWidth: width } : { width }), display: "flex", justifyContent: al === "center" ? "center" : al === "right" ? "flex-end" : "flex-start",
              fontFamily: family(l), fontWeight: weight(l), fontSize: l.size, lineHeight: 1.15, color: l.color, textAlign: al, textTransform: l.upper ? "uppercase" : "none",
              letterSpacing: l.tracking ? l.tracking * l.size : l.font === "display" && !l.upper ? -0.02 * l.size : 0, opacity: l.opacity ?? 1, alignItems: "flex-start",
              ...(l.font === "condensed" ? { lineHeight: 1.02 } : {}),
              ...(box ? { backgroundColor: l.bg ?? "#fff", borderRadius: l.kind === "button" || l.role === "benefit" ? 999 : 4, padding: `${l.size * 0.35}px ${l.size * 0.6}px` } : l.shadow === false ? {} : { textShadow: "0 1px 8px rgba(0,0,0,.3)" }),
            }}>
              {l.bullet && !box && (
                <svg width={l.size * 1.15} height={l.size * 1.15} viewBox="0 0 24 24" style={{ marginRight: l.size * 0.42, flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="12" fill={l.color} />
                  <path d="M6.8 12.4l3.4 3.4 7-7.4" fill="none" stroke={lightHex(l.color) ? "#1C1B19" : "#FFFFFF"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <span style={{ display: "flex" }}>{l.text}</span>
            </div>
          );
          })();
          // The subject goes in after the last behind-layer: before the first front layer, or at the very end when every layer is behind.
          return firstFront >= 0 ? [subject, el] : [el, subject];
        })}
      </div>
    ),
    { width: W, height: H, fonts: await f },
  );
  return Buffer.from(await res.arrayBuffer());
}
