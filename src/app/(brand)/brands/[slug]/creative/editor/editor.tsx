"use client";
/* eslint-disable @next/next/no-img-element -- product photos and brand assets */
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { askEditor, saveDesign, setAdStatus } from "../actions";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import type { AdDesign, Layer } from "@/lib/db/schema";
import { LAYOUTS, REGIONS, copyOf, isLayout, layoutDesign, toneFor, type Box, type CardCopy, type LayoutKey } from "@/lib/creative/layouts";
import { MASK_W, behindBand, canGoBehind, coverage, placeProduct, subjectMask, type Mask } from "@/lib/creative/cutout";

type Size = { key: string; label: string; w: number; h: number; note: string };
const SIZES: Size[] = [
  { key: "9x16", label: "9:16", w: 1080, h: 1920, note: "Reels · Stories" },
  { key: "4x5", label: "4:5", w: 1080, h: 1350, note: "Feed" },
  { key: "1x1", label: "1:1", w: 1080, h: 1080, note: "Feed · right column" },
];
// The same faces the server draws finished cards with (public/fonts), so the Editor and the PNG match.
const SERIF = "'DM Serif Display', Georgia, serif";
const SANS = "Poppins, Inter, -apple-system, 'Helvetica Neue', sans-serif";
const TALL = "Anton, 'Arial Narrow', sans-serif";
const face = (f: Layer["font"]) => (f === "serif" ? SERIF : f === "condensed" ? TALL : SANS);
const isLight = (c: string) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c.trim()); return m ? (0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16)) / 255 > 0.6 : true; };
const FACES = ["300 20px Poppins", "500 20px Poppins", "600 20px Poppins", "700 20px Poppins", "400 20px 'DM Serif Display'", "400 20px Anton"];
const uid = () => Math.random().toString(36).slice(2, 9);

export type EditorAd = { id: string; batchId: string; hook: string; primaryText: string; headline: string; cta: string; offer: string; imageUrl: string | null; status: string; design: AdDesign | null };

/** A new ad opens in the Bold layout over its picture — white type on soft scrims until the photo has been read for light or dark type. */
export function defaultDesign(ad: EditorAd, brand: string): AdDesign {
  if (ad.design?.video) return ad.design;
  return layoutDesign("bold", copyOf(null, ad, brand), { top: toneFor(null), bottom: toneFor(null) }, ad.imageUrl);
}

/** Text lines wrapped to a width, the same way in the editor and in the exported PNG. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const t = line ? `${line} ${word}` : word;
      if (ctx.measureText(t).width > max && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}

const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = src; });
const weightOf = (l: Layer) => (l.font === "serif" || l.font === "condensed" ? 400 : l.weight ?? (l.font === "display" ? 700 : 500));
const spacingOf = (l: Layer) => (l.tracking ? l.tracking * l.size : l.font === "display" && !l.upper ? -0.02 * l.size : 0);

/** How bright the photo is under a patch of the 4:5 artboard (0 dark – 1 light), to choose light or dark type. Null when the photo can't be read. */
async function brightness(src: string | null, box: Box): Promise<number | null> {
  if (!src) return 0.9;
  try {
    const img = await load(src);
    const c = document.createElement("canvas"); c.width = c.height = 8;
    const ctx = c.getContext("2d")!;
    const r = Math.max(1080 / img.width, 1350 / img.height), ox = (1080 - img.width * r) / 2, oy = (1350 - img.height * r) / 2;
    ctx.drawImage(img, (box.x * 1080 - ox) / r, (box.y * 1350 - oy) / r, (box.w * 1080) / r, (box.h * 1350) / r, 0, 0, 8, 8);
    const px = ctx.getImageData(0, 0, 8, 8).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    return sum / (64 * 255);
  } catch { return null; }
}
/** The photo's subject with its backdrop see-through — drawn over layers set behind the product. Worked out once per photo. */
const cuts = new Map<string, Promise<{ url: string; mask: Mask } | null>>();
function cutOf(src: string): Promise<{ url: string; mask: Mask } | null> {
  let p = cuts.get(src);
  if (!p) {
    p = (async () => {
      try {
        const img = await load(src);
        const mw = MASK_W, mh = Math.max(8, Math.round((MASK_W * img.height) / img.width));
        const small = document.createElement("canvas"); small.width = mw; small.height = mh;
        const sx = small.getContext("2d", { willReadFrequently: true })!;
        sx.drawImage(img, 0, 0, mw, mh);
        const mask = subjectMask(sx.getImageData(0, 0, mw, mh).data, mw, mh);
        const alpha = new ImageData(mw, mh);
        for (let i = 0; i < mw * mh; i++) alpha.data[i * 4 + 3] = Math.round(mask.a[i] * 255);
        sx.putImageData(alpha, 0, 0);
        const w = Math.min(1080, img.width), h = Math.round((w * img.height) / img.width);
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const cx = c.getContext("2d")!;
        cx.drawImage(img, 0, 0, w, h); cx.globalCompositeOperation = "destination-in"; cx.drawImage(small, 0, 0, w, h);
        const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
        return blob ? { url: URL.createObjectURL(blob), mask } : null;
      } catch { return null; } // a photo from another site can't be read
    })();
    cuts.set(src, p);
  }
  return p;
}
/** A layout applied to this ad's words over this photo. A giant word goes behind the product when the photo's backdrop allows it. */
async function laidOut(key: LayoutKey, copy: CardCopy, image: string | null): Promise<AdDesign> {
  const [t, b, cut] = await Promise.all([brightness(image, REGIONS[key].top), brightness(image, REGIONS[key].bottom), key === "bigword" && image ? cutOf(image) : null]);
  return layoutDesign(key, copy, { top: toneFor(t), bottom: toneFor(b) }, image, 1080, 1350, { behind: cut ? canGoBehind(coverage(cut.mask, 0.1, 0.46)) : false });
}

/** Draw the design at full Meta size and return a PNG blob. */
async function render(d: AdDesign, s: Size, cut: string | null = null): Promise<Blob> {
  await Promise.all(FACES.map((f) => document.fonts.load(f).catch(() => undefined)));
  const c = document.createElement("canvas");
  c.width = s.w; c.height = s.h;
  const ctx = c.getContext("2d")! as CanvasRenderingContext2D & { letterSpacing?: string };
  const g0 = ctx.createLinearGradient(0, 0, s.w, s.h); g0.addColorStop(0, "#EDE9E2"); g0.addColorStop(1, "#D9D3C7");
  ctx.fillStyle = g0; ctx.fillRect(0, 0, s.w, s.h);
  if (d.image) {
    try {
      const img = await load(d.image);
      const r = Math.max(s.w / img.width, s.h / img.height);
      ctx.drawImage(img, (s.w - img.width * r) / 2, (s.h - img.height * r) / 2, img.width * r, img.height * r);
    } catch { /* keep the plain background */ }
  }
  if ((d.overlayTop ?? 0) > 0) { const g = ctx.createLinearGradient(0, 0, 0, s.h * 0.46); g.addColorStop(0, `rgba(0,0,0,${d.overlayTop})`); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, s.w, s.h * 0.46); }
  if (d.overlay > 0) { const g = ctx.createLinearGradient(0, s.h * 0.48, 0, s.h); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${d.overlay})`); ctx.fillStyle = g; ctx.fillRect(0, s.h * 0.48, s.w, s.h * 0.52); }
  // Layers set behind the product go down first; then the photo's subject is drawn over them, then everything else.
  const band = cut ? behindBand(d.layers, s.w, s.h) : null;
  const order = band ? [...d.layers.filter((l) => l.behind), ...d.layers.filter((l) => !l.behind)] : d.layers, firstFront = band ? order.findIndex((l) => !l.behind) : -1;
  const subject = async () => {
    try {
      const img = await load(cut!), r = Math.max(s.w / img.width, s.h / img.height);
      ctx.save(); ctx.beginPath(); ctx.rect(0, band!.y0 * s.h, s.w, (band!.y1 - band!.y0) * s.h); ctx.clip();
      ctx.drawImage(img, (s.w - img.width * r) / 2, (s.h - img.height * r) / 2, img.width * r, img.height * r); ctx.restore();
    } catch { /* the type stays in front */ }
  };
  for (const [n, l] of order.entries()) {
    if (band && n === firstFront) await subject();
    const x = l.x * s.w, y = l.y * s.h, w = l.w * s.w;
    if (l.kind === "logo" && l.src) {
      try { const img = await load(l.src); const h = (w / img.width) * img.height; ctx.drawImage(img, x, y, w, h); } catch { /* skip */ }
      continue;
    }
    ctx.font = `${weightOf(l)} ${l.size}px ${face(l.font)}`;
    ctx.letterSpacing = `${spacingOf(l)}px`;
    ctx.textBaseline = "top";
    const txt = l.upper ? l.text.toUpperCase() : l.text;
    const lines = wrap(ctx, txt, l.kind === "text" ? w : w - l.size);
    const lh = l.size * 1.15;
    if (l.kind === "button" || l.kind === "badge") {
      const bw = l.kind === "button" ? w : Math.min(w, ctx.measureText(txt).width + l.size * 1.2);
      const bh = lh * lines.length + l.size * 0.7;
      ctx.fillStyle = l.bg ?? "#fff";
      ctx.beginPath(); ctx.roundRect(x, y, bw, bh, l.kind === "button" || l.role === "benefit" ? bh / 2 : 10); ctx.fill();
      ctx.fillStyle = l.color; ctx.textAlign = "center";
      lines.forEach((t, i) => ctx.fillText(t, x + bw / 2, y + l.size * 0.38 + i * lh));
      ctx.textAlign = "left";
    } else {
      ctx.fillStyle = l.color;
      ctx.globalAlpha = l.opacity ?? 1;
      if (l.shadow !== false) { ctx.shadowColor = "rgba(0,0,0,.3)"; ctx.shadowBlur = 16; }
      const pad = l.bullet ? l.size * 1.57 : 0, tl = l.bullet ? wrap(ctx, txt, w - pad) : lines, step = l.font === "condensed" ? l.size * 1.02 : lh;
      if (l.bullet) {
        const r = l.size * 0.575;
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(x + r, y + r, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = isLight(l.color) ? "#1C1B19" : "#FFFFFF"; ctx.lineWidth = r * 0.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.moveTo(x + r * 0.57, y + r * 1.03); ctx.lineTo(x + r * 0.85, y + r * 1.32); ctx.lineTo(x + r * 1.43, y + r * 0.7); ctx.stroke();
      }
      tl.forEach((t, i) => { const tw = ctx.measureText(t).width; ctx.fillText(t, pad + (l.align === "center" ? x + (w - pad - tw) / 2 : l.align === "right" ? x + w - pad - tw : x), y + i * step + l.size * 0.07); });
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
  }
  if (band && firstFront < 0) await subject();
  return new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
}

const STRIPES = "repeating-linear-gradient(45deg, rgba(235,122,60,.10) 0 6px, transparent 6px 12px)";
function Artboard({ d, s, scale, sel, onSelect, onMove, brand, cut }: { d: AdDesign; s: Size; scale: number; sel: string | null; onSelect: (id: string | null) => void; onMove: (id: string, x: number, y: number) => void; brand: string; cut?: string | null }) {
  const W = s.w * scale, H = s.h * scale;
  const band = cut ? behindBand(d.layers, s.w, s.h) : null;
  const drag = useRef<{ id: string; sx: number; sy: number; lx: number; ly: number } | null>(null);
  return (
    <div className="col g6" style={{ alignItems: "center" }}>
      <span className="xs i3">{s.label} · {s.note}</span>
      <div onPointerDown={(e) => { if (e.target === e.currentTarget) onSelect(null); }}
        onPointerMove={(e) => { const g = drag.current; if (!g) return; onMove(g.id, Math.min(0.98, Math.max(0, g.lx + (e.clientX - g.sx) / W)), Math.min(0.98, Math.max(0, g.ly + (e.clientY - g.sy) / H))); }}
        onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}
        style={{ position: "relative", width: W, height: H, overflow: "hidden", borderRadius: 8, background: d.fit && d.bg ? d.bg : "linear-gradient(160deg,#EDE9E2,#D9D3C7)", boxShadow: "0 0 0 1px var(--line), 0 6px 20px rgba(18,18,18,.08)", touchAction: "none", userSelect: "none" }}>
        {d.video ? <video src={d.video} muted loop autoPlay playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
          : d.image && (d.fit
            ? (() => { const at = placeProduct(d.fit, d.crop, d.crop?.ar ?? 1, W, H); return (
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
                <div style={{ position: "absolute", left: at.clip.left - at.clip.width * 0.05, top: at.clip.top + at.clip.height - at.clip.width * 0.07, width: at.clip.width * 1.1, height: at.clip.width * 0.13, borderRadius: "50%", background: "radial-gradient(ellipse at center, rgba(40,32,20,.3) 0%, rgba(40,32,20,.1) 45%, rgba(40,32,20,0) 70%)" }} />
                <div style={{ position: "absolute", ...at.clip, overflow: "hidden" }}><img src={d.image} alt="" draggable={false} style={{ position: "absolute", ...at.img, maxWidth: "none" }} /></div>
              </div>); })()
            : <img src={d.image} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />)}
        {(d.overlayTop ?? 0) > 0 && <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(0,0,0,${d.overlayTop}) 0%, rgba(0,0,0,0) 46%)`, pointerEvents: "none" }} />}
        {d.overlay > 0 && <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(0,0,0,0) 48%, rgba(0,0,0,${d.overlay}) 100%)`, pointerEvents: "none" }} />}
        {s.key === "9x16" && <><div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "14%", background: STRIPES, pointerEvents: "none" }} /><div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "20%", background: STRIPES, pointerEvents: "none" }} /></>}
        {band && cut && <div style={{ position: "absolute", left: 0, right: 0, top: `${band.y0 * 100}%`, height: `${(band.y1 - band.y0) * 100}%`, overflow: "hidden", pointerEvents: "none", zIndex: 2 }}>
          <img src={cut} alt="" draggable={false} style={{ position: "absolute", left: 0, top: -band.y0 * H, width: W, height: H, objectFit: "cover" }} /></div>}
        {d.layers.map((l) => {
          const common: React.CSSProperties = { position: "absolute", left: `${l.x * 100}%`, top: `${l.y * 100}%`, cursor: "move", outline: sel === l.id ? "1.5px solid #1AA7C8" : "none", outlineOffset: 2, ...(band || d.fit ? { zIndex: l.behind ? 1 : 3 } : {}) };
          const start = (e: React.PointerEvent) => { e.stopPropagation(); onSelect(l.id); drag.current = { id: l.id, sx: e.clientX, sy: e.clientY, lx: l.x, ly: l.y }; };
          if (l.kind === "logo") return l.src ? <img key={l.id} src={l.src} alt="logo" draggable={false} onPointerDown={start} style={{ ...common, width: `${l.w * 100}%` }} /> : null;
          const fs = l.size * scale;
          const box = l.kind === "button" || l.kind === "badge";
          return (
            <div key={l.id} onPointerDown={start} style={{ ...common, width: l.kind === "badge" ? "auto" : `${l.w * 100}%`, maxWidth: `${l.w * 100}%`, fontFamily: face(l.font), fontSize: fs, lineHeight: 1.15, fontWeight: weightOf(l), color: l.color,
              letterSpacing: spacingOf(l) * scale, textTransform: l.upper ? "uppercase" : "none", opacity: l.opacity ?? 1, ...(l.font === "condensed" ? { lineHeight: 1.02 } : {}),
              ...(l.bullet && !box ? { display: "flex", alignItems: "flex-start", gap: fs * 0.42 } : {}),
              textAlign: box ? "center" : l.align ?? "left", ...(box ? { background: l.bg, borderRadius: l.kind === "button" || l.role === "benefit" ? 999 : 4, padding: `${fs * 0.35}px ${fs * 0.6}px` } : l.shadow === false ? {} : { textShadow: "0 1px 8px rgba(0,0,0,.3)" }), whiteSpace: "pre-wrap" }}>
              {l.bullet && !box && <svg width={fs * 1.15} height={fs * 1.15} viewBox="0 0 24 24" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="12" fill={l.color} /><path d="M6.8 12.4l3.4 3.4 7-7.4" fill="none" stroke={isLight(l.color) ? "#1C1B19" : "#FFFFFF"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              {l.bullet && !box ? <span>{l.text}</span> : l.text || (l.kind === "text" ? brand : "")}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A layout as a tiny wireframe: where its type sits on the card. [x, y, w, h, strong] in % of the card. */
const WIRE: Record<LayoutKey, [number, number, number, number, boolean][]> = {
  bold: [[14, 8, 72, 9, true], [26, 21, 48, 3, false], [28, 84, 44, 5, true], [34, 92, 32, 2.5, false]],
  bigword: [[8, 6, 84, 22, false], [8, 48, 22, 4, true], [70, 58, 22, 4, true], [24, 84, 52, 5, true], [32, 92, 36, 2.5, false]],
  benefits: [[8, 8, 46, 6, true], [8, 16, 40, 6, false], [8, 30, 4, 4, true], [15, 30.5, 30, 3, false], [8, 38, 4, 4, true], [15, 38.5, 26, 3, false], [8, 46, 4, 4, true], [15, 46.5, 32, 3, false], [8, 87, 26, 6, true]],
  statement: [[10, 6, 80, 10, true], [16, 18, 68, 10, true], [22, 30, 56, 10, true], [28, 43, 44, 2.5, false], [8, 92, 24, 3, false], [38, 92, 24, 3, false], [68, 92, 24, 3, false]],
  poster: [[8, 6, 24, 2.5, false], [6, 72, 88, 17, true], [22, 92, 56, 2.5, false]],
  chips: [[8, 6, 24, 2.5, false], [8, 12, 46, 8, true], [8, 23, 36, 6, false], [8, 82, 40, 3, true], [8, 88, 34, 5, false]],
  stack: [[30, 6, 40, 4, false], [12, 12, 76, 15, true], [32, 29, 36, 4, false], [8, 92, 36, 2.5, false], [68, 92, 24, 2.5, false]],
  editorial: [[8, 8, 52, 10, true], [8, 20, 40, 10, true], [8, 34, 34, 2.5, false], [8, 90, 36, 3, false]],
  luxe: [[32, 7, 36, 2.5, false], [22, 70, 56, 6, false], [16, 78, 68, 6, true], [30, 88, 40, 2.5, false]],
  minimal: [[18, 9, 64, 5, true], [28, 16, 44, 5, true], [36, 92, 28, 2.5, false]],
  caption: [[8, 8, 50, 5, true], [8, 16, 40, 2.5, false], [8, 20, 34, 2.5, false], [8, 80, 44, 3.5, true], [8, 87, 24, 6, true]],
};

export function Editor({ slug, brand, ad, ads, palette, products, media, logos, otherHooks }: {
  slug: string; brand: string; ad: EditorAd; ads: { id: string; hook: string }[]; palette: string[];
  products: { title: string; url: string }[]; media: { name: string; url: string; ai: boolean }[]; logos: { name: string; url: string }[]; otherHooks: string[];
}) {
  const router = useRouter();
  const [d, setD] = useState<AdDesign>(() => ad.design ?? defaultDesign(ad, brand));
  const [sel, setSel] = useState<string | null>(d.layers[0]?.id ?? null);
  const [panel, setPanel] = useState<"layouts" | "text" | "products" | "media" | "logos" | "elements">("layouts");
  const [chat, setChat] = useState<{ who: "you" | "remy"; text: string; undo?: AdDesign; shoots?: boolean }[]>([]);
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const thread = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, start] = useTransition();
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const layer = d.layers.find((l) => l.id === sel) ?? null;
  const set = (next: AdDesign) => { setD(next); setDirty(true); };
  const [opened] = useState(d); // the design as the ad opened, to tell whether anything changed since
  // Type behind the product: the photo's subject, worked out once per photo when a layer needs it.
  const [cut, setCut] = useState<{ src: string; url: string } | null>(null);
  const needsCut = Boolean(d.image) && d.layers.some((l) => l.behind);
  useEffect(() => {
    const src = d.image;
    if (!src || !needsCut || cut?.src === src) return;
    let live = true;
    void cutOf(src).then((c) => { if (live && c) setCut({ src, url: c.url }); });
    return () => { live = false; };
  }, [d.image, needsCut, cut]);
  const cutUrl = needsCut && cut && cut.src === d.image ? cut.url : null;
  // The canvas: all three sizes side by side, or one size up close; zoom with the buttons or ⌘/Ctrl + scroll.
  const stage = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<string>("all");
  const [zoom, setZoom] = useState(0.22);
  const clampZ = (z: number) => Math.min(1, Math.max(0.08, z));
  const fit = (v: string) => {
    const el = stage.current;
    if (!el) return;
    const shown = SIZES.filter((x) => v === "all" || x.key === v), w = shown.reduce((a, x) => a + x.w, 0), h = Math.max(...shown.map((x) => x.h));
    setZoom(clampZ(Math.min((el.clientWidth - 56 - (shown.length - 1) * 24) / w, (el.clientHeight - 120) / h)));
  };
  useEffect(() => { fit("all"); }, []);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); setZoom((z) => clampZ(z * (e.deltaY < 0 ? 1.08 : 0.925))); };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const isClip = Boolean(d.video);
  const logosOf = (x: AdDesign) => x.layers.filter((l) => l.kind === "logo");
  const nameOf = (l: Layer) => (l.role ? l.role.charAt(0).toUpperCase() + l.role.slice(1) : l.kind === "text" ? "Text" : l.kind === "button" ? "Button" : l.kind === "badge" ? "Badge" : "Logo");
  /** Switch layout: the ad's words stay, the type moves and picks light or dark for the photo under it. */
  const applyLayout = async (key: LayoutKey, image: string | null = d.image) => {
    const next = { ...(await laidOut(key, copyOf(d, ad, brand), image)), ...(d.look ? { look: d.look } : {}) };
    set({ ...next, layers: [...next.layers, ...logosOf(d)], card: d.card });
    setSel(null);
  };
  /** A new photo behind the ad: a laid-out ad is laid out again for it, so the type stays readable. */
  const pickImage = (url: string) => { if (isLayout(d.layout)) void applyLayout(d.layout, url); else set({ ...d, image: url }); };
  const askRemy = async (text: string) => {
    const q = text.trim();
    if (!q || asking) return;
    setAsk(""); setAsking(true);
    const before = d;
    setChat((c) => [...c, { who: "you", text: layer ? `${nameOf(layer)} — ${q}` : q }]);
    try {
      const r = await askEditor(slug, ad.id, d, q, sel, chat.slice(-6).map((m) => `${m.who === "you" ? "Team" : "Remy"}: ${m.text}`));
      if (r.design) { set(r.design); if (sel && !r.design.layers.some((l) => l.id === sel)) setSel(null); }
      setChat((c) => [...c, { who: "remy", text: r.say, undo: r.design ? before : undefined, shoots: r.shoots }]);
    } catch { setChat((c) => [...c, { who: "remy", text: "I couldn’t make that change just now — try again." }]); }
    setAsking(false);
  };
  // A new ad: read the photo once to choose light or dark type (until then it shows white type on soft scrims).
  useEffect(() => {
    if (ad.design) return;
    let live = true;
    void laidOut("bold", copyOf(null, ad, brand), ad.imageUrl).then((n) => { if (live) setD((cur) => (cur === opened ? n : cur)); });
    return () => { live = false; };
  }, [ad, brand, opened]);
  useEffect(() => { thread.current?.scrollTo({ top: thread.current.scrollHeight }); }, [chat, asking]);
  const upd = (id: string, patch: Partial<Layer>) => set({ ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const add = (l: Omit<Layer, "id">) => { const n = { ...l, id: uid() }; set({ ...d, layers: [...d.layers, n] }); setSel(n.id); };
  const remove = (id: string) => { set({ ...d, layers: d.layers.filter((l) => l.id !== id) }); setSel(null); };
  const idx = ads.findIndex((a) => a.id === ad.id);
  const colors = [...new Set(["#FFFFFF", "#121212", ...palette])].slice(0, 7);

  // Ask before leaving with unsaved changes.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = (approve = false) => start(async () => {
    const r = await saveDesign(slug, ad.id, d);
    if (r?.error) { setMsg(r.error); return; }
    if (approve) await setAdStatus(slug, ad.id, "approved");
    setDirty(false); setMsg(approve ? "Saved and approved." : "Saved."); router.refresh();
  });
  const download = async () => {
    setExporting(true); setMsg(null);
    try {
      for (const s of SIZES) {
        const blob = await render(d, s, cutUrl);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `${brand}-${ad.hook}`.toLowerCase().replace(/[^\w]+/g, "-").slice(0, 50) + `-${s.key}.png`; a.click();
        URL.revokeObjectURL(url);
      }
      setMsg("Downloaded 3 PNGs (1080 px) — upload them in Ads Manager.");
    } catch { setMsg("Couldn’t export — the photo’s host may block downloads. Pick a photo from Products or Media."); }
    setExporting(false);
  };

  // Otto's checks for the layout.
  const head = d.layers.find((l) => l.kind === "text");
  const checks: [string, boolean][] = [
    ["Text inside 9:16 safe zones", d.layers.filter((l) => l.kind !== "logo").every((l) => l.y >= 0.14 && l.y <= 0.8 || l.kind === "badge" && l.y < 0.14 && l.y > 0.02)],
    ["One clear headline (60 px or more)", d.layers.some((l) => l.kind === "text" && l.size >= 60)],
    ["Uses a product photo", Boolean(d.image)],
    ["Headline under 8 words", !head || head.text.trim().split(/\s+/).length <= 8],
    ["Readable — text size 28 px or more", d.layers.filter((l) => l.kind !== "logo").every((l) => l.size >= 28)],
  ];

  const tile = (url: string, label: string, on: () => void, badge?: string) => (
    <button key={url} type="button" onClick={on} title={label} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", border: d.image === url ? "2px solid var(--ink)" : "1px solid var(--line)", padding: 0, cursor: "pointer", background: "var(--tray)" }}>
      <img src={url.startsWith("/api/assets/") ? `${url}?w=480` : url} alt={label} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      {badge && <span className="pill" style={{ position: "absolute", left: 4, bottom: 4, height: 16, fontSize: 9.5 }}>{badge}</span>}
    </button>
  );

  return (
    <div className="col fill" style={{ minHeight: 0 }}>
      <div className="row g8" style={{ padding: "8px 16px", borderBottom: "1px solid var(--line)" }}>
        <Link className="btn quiet sm" href={`/brands/${slug}/creative/${ad.batchId}`}><Icon name="arrow-l" size={12} />Batch</Link>
        <span className="sm w5 i1 ell" style={{ maxWidth: 280 }}>{ad.hook}</span>
        <span className="row g4 xs i3">
          {idx > 0 && <Link className="btn quiet sm ic" href={`?ad=${ads[idx - 1].id}`} aria-label="Previous ad"><Icon name="chev-l" size={12} /></Link>}
          Ad {idx + 1} of {ads.length}
          {idx < ads.length - 1 && <Link className="btn quiet sm ic" href={`?ad=${ads[idx + 1].id}`} aria-label="Next ad"><Icon name="chev-r" size={12} /></Link>}
        </span>
        <span className="fill" />
        {msg && <span className="xs i2">{msg}</span>}
        {dirty && <span className="xs c-amber">Unsaved</span>}
        <button type="button" className="btn sm" disabled={exporting} onClick={download}>{exporting ? <Icon name="spinner" size={12} className="spin" /> : <Icon name="download" size={12} />}Download PNGs</button>
        <button type="button" className="btn sm" disabled={busy || !dirty} onClick={() => save(false)}>Save</button>
        <button type="button" className="btn dark sm" disabled={busy} onClick={() => save(true)}><Icon name="check" size={12} color="#fff" />Save & approve</button>
        {/* Next step in the studio flow: Plan → Shoots → Editor → Ads → Insights */}
        {idx < ads.length - 1
          ? <Link className="btn sm" href={`?ad=${ads[idx + 1].id}`}>Next ad<Icon name="arrow-r" size={12} /></Link>
          : <Link className="btn sm" href={`/brands/${slug}/creative/${ad.batchId}`}>Review in Ads<Icon name="arrow-r" size={12} /></Link>}
      </div>
      <div className="row fill stretch" style={{ minHeight: 0 }}>
        <aside className="row stretch" style={{ width: 300, flexShrink: 0, borderRight: "1px solid var(--line)" }}>
          <div className="col g4" style={{ width: 64, padding: "10px 6px", borderRight: "1px solid var(--line)", background: "var(--tray)" }}>
            {([["layouts", "Layouts", "squares"], ["text", "Text", "file"], ["products", "Products", "box"], ["media", "Media", "image"], ["logos", "Logos", "pencil"], ["elements", "Elements", "layers"]] as const).map(([k, l, i]) => (
              <button key={k} type="button" onClick={() => setPanel(k)} className="col g2" style={{ alignItems: "center", padding: "8px 0", borderRadius: 8, background: panel === k ? "#fff" : "transparent", boxShadow: panel === k ? "0 0 0 1px var(--line)" : "none", cursor: "pointer" }}>
                <Icon name={i} size={16} /><span style={{ fontSize: 10 }}>{l}</span></button>
            ))}
          </div>
          <div className="col g8 fill" style={{ padding: 12, overflowY: "auto", minWidth: 0 }}>
            {panel === "layouts" && <>
              <span className="sm w5">Layouts</span>
              <span className="xs i3" style={{ lineHeight: "16px" }}>{isClip ? "This ad is a clip — its picture and captions are made in Shoots." : "Your words stay; the type moves and picks light or dark for the photo under it."}</span>
              {!isClip && LAYOUTS.map((l) => (
                <button key={l.key} type="button" onClick={() => void applyLayout(l.key)} className="row g10" style={{ padding: 8, borderRadius: 10, textAlign: "left", background: "#fff", cursor: "pointer", boxShadow: d.layout === l.key ? "0 0 0 1.5px var(--ink)" : "0 0 0 1px var(--line)" }}>
                  <span style={{ position: "relative", width: 52, height: 65, borderRadius: 5, background: "linear-gradient(160deg,#E7E2DA,#CFC8BB)", flexShrink: 0, overflow: "hidden" }}>
                    {WIRE[l.key].map(([x, y, w, h, strong], i) => <span key={i} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, borderRadius: 2, background: strong ? "#121212" : "rgba(18,18,18,.42)" }} />)}
                  </span>
                  <span className="col g2 fill" style={{ minWidth: 0 }}><span className="xs w5 i1">{l.name}</span><span className="xs i3" style={{ lineHeight: "15px" }}>{l.hint}</span></span>
                </button>
              ))}
            </>}
            {panel === "text" && <>
              <span className="sm w5">Text</span>
              <button type="button" className="card" onClick={() => add({ kind: "text", text: "Add a headline", x: 0.07, y: 0.5, w: 0.86, size: 72, font: "serif", color: "#FFFFFF" })} style={{ padding: 10, textAlign: "left", fontFamily: SERIF, fontSize: 18, cursor: "pointer" }}>Add a headline</button>
              <button type="button" className="card" onClick={() => add({ kind: "text", text: "Add a subline", x: 0.07, y: 0.7, w: 0.8, size: 36, font: "sans", color: "#FFFFFF", weight: 500 })} style={{ padding: 10, textAlign: "left", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Add a subline</button>
              <button type="button" className="card" onClick={() => add({ kind: "text", text: "Small print", x: 0.07, y: 0.78, w: 0.8, size: 28, font: "sans", color: "#FFFFFF" })} style={{ padding: 10, textAlign: "left", fontSize: 11, cursor: "pointer" }}>Add small print</button>
              <span className="row g6 xs i3" style={{ paddingTop: 6 }}><AgentFace kind="builder" size={14} />Remy’s lines for this ad</span>
              {[ad.headline, ad.primaryText.split(/(?<=[.!?])\s/)[0], ad.offer && !/no offer/i.test(ad.offer) ? ad.offer : null].filter(Boolean).map((t) => (
                <button key={t} type="button" className="row between g6 xs" onClick={() => add({ kind: "text", text: t!, x: 0.07, y: 0.72, w: 0.86, size: 34, font: "sans", color: "#FFFFFF", weight: 500 })} style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, textAlign: "left", cursor: "pointer" }}>
                  <span className="i1">{t}</span><Icon name="plus" size={12} /></button>
              ))}
            </>}
            {panel === "products" && <>
              <span className="sm w5">Products</span><span className="xs i3">Real photos from Shopify. Click to use as the background.</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>{products.map((p) => tile(p.url, p.title, () => pickImage(p.url)))}</div>
              {products.length === 0 && <span className="xs i3">No product photos synced yet.</span>}
            </>}
            {panel === "media" && <>
              <span className="sm w5">Media</span><span className="xs i3">Brand imagery and photos made in Shoots.</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>{media.map((m) => tile(m.url, m.name, () => pickImage(m.url), m.ai ? "AI" : undefined))}</div>
              {media.length === 0 && <span className="xs i3">Nothing yet. <Link className="lnk" href={`/brands/${slug}/creative/shoots`}>Make photos in Shoots</Link>.</span>}
            </>}
            {panel === "logos" && <>
              <span className="sm w5">Logos</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>{logos.map((l) => (
                <button key={l.url} type="button" onClick={() => add({ kind: "logo", text: "", src: l.url, x: 0.07, y: 0.06, w: 0.28, size: 0, font: "sans", color: "#fff" })} style={{ aspectRatio: "1", border: "1px solid var(--line)", borderRadius: 8, background: "#9C968C", padding: 8, cursor: "pointer" }}><img src={l.url} alt={l.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} /></button>
              ))}</div>
              {logos.length === 0 && <span className="xs i3">No logo uploaded. Add one in the brand’s onboarding assets.</span>}
            </>}
            {panel === "elements" && <>
              <span className="sm w5">Elements</span>
              <button type="button" className="btn sm" onClick={() => add({ kind: "badge", text: ad.offer && !/no offer/i.test(ad.offer) ? ad.offer.slice(0, 24) : "New", x: 0.07, y: 0.07, w: 0.5, size: 30, font: "sans", color: "#121212", bg: "#FFFFFF", weight: 700 })}>Offer badge</button>
              <button type="button" className="btn sm" onClick={() => add({ kind: "button", text: ad.cta, x: 0.62, y: 0.865, w: 0.31, size: 32, font: "sans", color: "#121212", bg: "#FFFFFF", weight: 600, align: "center" })}>Button · {ad.cta}</button>
              <label className="col g4" style={{ paddingTop: 8 }}><span className="xs i3">Darken photo · {Math.round(d.overlay * 100)}%</span>
                <input type="range" min={0} max={0.9} step={0.05} value={d.overlay} onChange={(e) => set({ ...d, overlay: Number(e.target.value) })} /></label>
            </>}
          </div>
        </aside>

        <div ref={stage} className="fill" style={{ position: "relative", overflow: "auto", background: "var(--tray)", backgroundImage: "radial-gradient(#D9D6D1 1px, transparent 1px)", backgroundSize: "16px 16px" }}>
          <div className="row g8" style={{ position: "sticky", top: 0, left: 0, zIndex: 5, padding: "10px 14px", pointerEvents: "none" }}>
            <div className="seg" style={{ pointerEvents: "auto", background: "#fff" }}>
              {[["all", "All sizes"], ...SIZES.map((x) => [x.key, x.label])].map(([k, n]) => <button key={k} type="button" className={`o${view === k ? " on" : ""}`} onClick={() => { setView(k); fit(k); }}>{n}</button>)}
            </div>
            <span className="fill" />
            <div className="row g2" style={{ pointerEvents: "auto", height: 30, padding: "0 4px", borderRadius: 8, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
              <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => setZoom((z) => clampZ(z / 1.2))} style={{ width: 26, height: 26, borderRadius: 6, cursor: "pointer" }}><Icon name="minus" size={13} /></button>
              <span className="xs tnum i2" style={{ width: 40, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
              <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => setZoom((z) => clampZ(z * 1.2))} style={{ width: 26, height: 26, borderRadius: 6, cursor: "pointer" }}><Icon name="plus" size={13} /></button>
              <button type="button" className="xs i2" title="Fit the canvas" onClick={() => fit(view)} style={{ height: 26, padding: "0 8px", borderRadius: 6, cursor: "pointer", borderLeft: "1px solid var(--line)" }}>Fit</button>
            </div>
          </div>
          <div className="row top g24" style={{ padding: "8px 28px 20px", width: "max-content", minWidth: "100%", justifyContent: "center" }}>
            {SIZES.filter((x) => view === "all" || x.key === view).map((x) => <Artboard key={x.key} d={d} s={x} scale={zoom} sel={sel} onSelect={setSel} onMove={(id, px, py) => upd(id, { x: px, y: py })} brand={brand} cut={cutUrl} />)}
          </div>
          <p className="xs i3" style={{ textAlign: "center", paddingBottom: 16 }}>Drag any layer · zoom with the buttons or ⌘/Ctrl + scroll. The striped bands on 9:16 are where Reels covers text.</p>
        </div>

        <aside className="col" style={{ width: 320, flexShrink: 0, borderLeft: "1px solid var(--line)", minHeight: 0 }}>
          <div className="col g10 fill" style={{ padding: 14, overflowY: "auto", minHeight: 0 }}>
          {layer ? <>
            <span className="row between"><span className="sm w5">Layer · {layer.kind === "text" ? "Text" : layer.kind === "button" ? "Button" : layer.kind === "badge" ? "Badge" : "Logo"}</span>
              <button type="button" className="btn quiet sm" onClick={() => remove(layer.id)}><Icon name="x" size={12} />Remove</button></span>
            {layer.kind !== "logo" && <>
              <div className="input" style={{ height: "auto", padding: 6 }}><textarea rows={3} value={layer.text} onChange={(e) => upd(layer.id, { text: e.target.value })} style={{ border: 0, outline: 0, resize: "none", width: "100%", font: "inherit", fontSize: 13 }} /></div>
              <div className="row g6">
                <div className="seg">{(["display", "serif", "sans", "condensed"] as const).map((f) => <button key={f} type="button" className={`o${layer.font === f ? " on" : ""}`} onClick={() => upd(layer.id, { font: f })} style={{ fontFamily: face(f), fontWeight: f === "display" ? 700 : 500 }}>{f === "serif" ? "Serif" : f === "display" ? "Bold" : f === "condensed" ? "Tall" : "Sans"}</button>)}</div>
                <label className="chip" style={{ height: 30 }}>Size<input type="number" min={18} max={480} value={layer.size} onChange={(e) => upd(layer.id, { size: Number(e.target.value) || 30 })} style={{ width: 48, border: 0, outline: 0, font: "inherit" }} /></label>
              </div>
              <div className="col g4"><span className="xs i3">Colour</span>
                <div className="row g6">{colors.map((c) => <button key={c} type="button" onClick={() => upd(layer.id, { color: c })} aria-label={c} style={{ width: 22, height: 22, borderRadius: 99, background: c, border: layer.color === c ? "2px solid #1AA7C8" : "1px solid var(--line-2)", cursor: "pointer" }} />)}</div></div>
              {(layer.kind === "button" || layer.kind === "badge") && <div className="col g4"><span className="xs i3">Fill</span>
                <div className="row g6">{colors.map((c) => <button key={c} type="button" onClick={() => upd(layer.id, { bg: c })} aria-label={`fill ${c}`} style={{ width: 22, height: 22, borderRadius: 6, background: c, border: layer.bg === c ? "2px solid #1AA7C8" : "1px solid var(--line-2)", cursor: "pointer" }} />)}</div></div>}
              <label className="col g4"><span className="xs i3">Width · {Math.round(layer.w * 100)}%</span><input type="range" min={0.15} max={0.95} step={0.01} value={layer.w} onChange={(e) => upd(layer.id, { w: Number(e.target.value) })} /></label>
            </>}
            {layer.kind === "text" && <div className="row g6" style={{ flexWrap: "wrap" }}>
              <div className="seg">{(["left", "center", "right"] as const).map((a) => <button key={a} type="button" className={`o${(layer.align ?? "left") === a ? " on" : ""}`} onClick={() => upd(layer.id, { align: a })}>{a === "left" ? "Left" : a === "center" ? "Centre" : "Right"}</button>)}</div>
              <button type="button" className={`chip${layer.upper ? "" : " dash"}`} style={{ height: 30 }} onClick={() => upd(layer.id, { upper: !layer.upper, tracking: layer.upper ? undefined : layer.tracking ?? 0.08 })}>CAPS</button>
              {layer.font === "sans" && <div className="seg">{([[300, "Light"], [500, "Regular"], [600, "Semi"]] as const).map(([w, n]) => <button key={w} type="button" className={`o${(layer.weight ?? 500) === w ? " on" : ""}`} onClick={() => upd(layer.id, { weight: w })}>{n}</button>)}</div>}
              <button type="button" className={`chip${layer.shadow === false ? " dash" : ""}`} style={{ height: 30 }} onClick={() => upd(layer.id, { shadow: layer.shadow === false })}>Shadow</button>
              <button type="button" className={`chip${layer.behind ? "" : " dash"}`} style={{ height: 30 }} title="The product in the photo covers this text where they overlap — works on a plain backdrop" onClick={() => upd(layer.id, { behind: layer.behind ? undefined : true })}>Behind product</button>
            </div>}
            {layer.kind === "logo" && <label className="col g4"><span className="xs i3">Size · {Math.round(layer.w * 100)}%</span><input type="range" min={0.1} max={0.6} step={0.01} value={layer.w} onChange={(e) => upd(layer.id, { w: Number(e.target.value) })} /></label>}
            {layer.kind === "text" && otherHooks.length > 0 && <>
              <span className="row g6 xs i3" style={{ paddingTop: 6 }}><AgentFace kind="builder" size={14} />Remy’s other hooks</span>
              {otherHooks.slice(0, 5).map((h) => (
                <div key={h} className="row between g6 xs" style={{ padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 8 }}><span className="i1">{h}</span><button type="button" className="btn quiet sm" onClick={() => upd(layer.id, { text: h })}>Use</button></div>
              ))}
            </>}
          </> : isClip ? <span className="xs i2" style={{ lineHeight: "17px" }}>This ad is a clip from Shoots. Check it in each size here; its picture, captions and end card are made in Shoots.</span> : <>
            <span className="sm w5">The whole ad</span>
            <span className="xs i3" style={{ lineHeight: "16px" }}>Click any element to edit it — or ask Remy below. Darken the photo behind white type:</span>
            <label className="col g4"><span className="xs i3">Behind the top · {Math.round((d.overlayTop ?? 0) * 100)}%</span><input type="range" min={0} max={0.7} step={0.02} value={d.overlayTop ?? 0} onChange={(e) => set({ ...d, overlayTop: Number(e.target.value) })} /></label>
            <label className="col g4"><span className="xs i3">Behind the bottom · {Math.round(d.overlay * 100)}%</span><input type="range" min={0} max={0.7} step={0.02} value={d.overlay} onChange={(e) => set({ ...d, overlay: Number(e.target.value) })} /></label>
          </>}
          <div className="col g6" style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10, marginTop: 6 }}>
            <span className="row g8"><AgentFace kind="qa" size={16} /><span className="sm w5 fill">Otto checks</span><span className="xs i3">{checks.filter(([, ok]) => ok).length} / {checks.length}</span></span>
            {checks.map(([k, ok]) => <span key={k} className={`row g6 xs ${ok ? "i2" : "c-amber"}`}><Icon name={ok ? "check-circle" : "warning-circle"} size={13} weight={ok ? "fill" : "regular"} color={ok ? "#1F8A5B" : "#B7791F"} />{k}</span>)}
          </div>
          </div>
          {!isClip && (
            <div className="col g8" style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
              {(chat.length > 0 || asking) && (
                <div ref={thread} className="col g8" style={{ maxHeight: 210, overflowY: "auto" }}>
                  {chat.map((m, i) => m.who === "you"
                    ? <div key={i} className="row" style={{ justifyContent: "flex-end" }}><span className="xs" style={{ maxWidth: "88%", padding: "7px 10px", borderRadius: "12px 12px 3px 12px", background: "var(--ink)", color: "#fff", lineHeight: "17px" }}>{m.text}</span></div>
                    : <div key={i} className="row top g6"><AgentFace kind="builder" size={18} />
                        <span className="col g4 fill" style={{ minWidth: 0 }}><span className="xs i1" style={{ lineHeight: "17px" }}>{m.text}</span>
                          {(m.undo || m.shoots) && <span className="row g10">
                            {m.undo && <button type="button" className="lnk xs i3" onClick={() => { set(m.undo!); setChat((c) => c.map((x, j) => (j === i ? { ...x, undo: undefined, text: `${x.text} (undone)` } : x))); }}>Undo</button>}
                            {m.shoots && <Link className="lnk xs" href={`/brands/${slug}/creative/shoots?batch=${ad.batchId}`}>Open Shoots</Link>}
                          </span>}
                        </span>
                      </div>)}
                  {asking && <div className="row g6 xs i3"><AgentFace kind="builder" size={18} mood="focus" /><Icon name="spinner" size={12} className="spin" />Remy is looking at the ad…</div>}
                </div>
              )}
              {chat.length === 0 && !asking && (
                <div className="row g4" style={{ flexWrap: "wrap" }}>
                  {(layer ? ["Make it bigger", "Shorter wording", "Make it stand out more"] : ["Try another layout", "Make the headline stand out", "Make it feel more premium"]).map((t) => (
                    <button key={t} type="button" className="xs i2" onClick={() => void askRemy(t)} style={{ height: 24, padding: "0 9px", borderRadius: 99, boxShadow: "0 0 0 1px var(--line)", background: "var(--tray)" }}>{t}</button>
                  ))}
                </div>
              )}
              <form onSubmit={(e) => { e.preventDefault(); void askRemy(ask); }} className="col g6" style={{ padding: "8px 10px", borderRadius: 12, boxShadow: "0 0 0 1px var(--line-2)" }}>
                {layer && <span className="row g4"><span className="pill blue" style={{ height: 20, fontSize: 10.5, maxWidth: "100%" }}><span className="ell">Changing: {nameOf(layer)}{layer.text ? ` · “${layer.text.slice(0, 22)}${layer.text.length > 22 ? "…" : ""}”` : ""}</span>
                  <button type="button" aria-label="Change the whole ad instead" onClick={() => setSel(null)} style={{ display: "inline-flex" }}><Icon name="x" size={10} /></button></span></span>}
                <textarea value={ask} onChange={(e) => setAsk(e.target.value)} rows={2} maxLength={600} disabled={asking} placeholder={layer ? "Ask Remy to change this element…" : "Ask Remy to change this ad…"}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void askRemy(ask); } }}
                  style={{ border: 0, outline: 0, resize: "none", font: "inherit", fontSize: 12.5, lineHeight: "18px", width: "100%", background: "transparent" }} />
                <div className="row g6"><span className="row g4 xs i3 fill"><AgentFace kind="builder" size={14} />Remy{layer ? " · this element" : " · whole ad"}</span>
                  <button type="submit" aria-label="Ask Remy" disabled={asking || ask.trim().length < 2} style={{ width: 26, height: 26, borderRadius: 99, background: ask.trim().length >= 2 && !asking ? "var(--ink)" : "var(--tray-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="arrow-up" size={12} color={ask.trim().length >= 2 && !asking ? "#fff" : "#8B8883"} /></button></div>
              </form>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
