"use client";
/* eslint-disable @next/next/no-img-element -- product photos and brand assets */
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveDesign, setAdStatus } from "../actions";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import type { AdDesign, Layer } from "@/lib/db/schema";

type Size = { key: string; label: string; w: number; h: number; note: string };
const SIZES: Size[] = [
  { key: "9x16", label: "9:16", w: 1080, h: 1920, note: "Reels · Stories" },
  { key: "4x5", label: "4:5", w: 1080, h: 1350, note: "Feed" },
  { key: "1x1", label: "1:1", w: 1080, h: 1080, note: "Feed · right column" },
];
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Inter, -apple-system, 'Helvetica Neue', sans-serif";
const uid = () => Math.random().toString(36).slice(2, 9);

export type EditorAd = { id: string; batchId: string; hook: string; primaryText: string; headline: string; cta: string; offer: string; imageUrl: string | null; status: string; design: AdDesign | null };

export function defaultDesign(ad: EditorAd, brand: string): AdDesign {
  const layers: Layer[] = [
    { id: uid(), kind: "text", text: ad.hook, x: 0.07, y: 0.6, w: 0.86, size: 84, font: "serif", color: "#FFFFFF" },
    { id: uid(), kind: "text", text: ad.headline, x: 0.07, y: 0.76, w: 0.8, size: 36, font: "sans", color: "#FFFFFF", weight: 500 },
    { id: uid(), kind: "text", text: brand, x: 0.07, y: 0.88, w: 0.4, size: 34, font: "sans", color: "#FFFFFF", weight: 700 },
    { id: uid(), kind: "button", text: ad.cta, x: 0.62, y: 0.865, w: 0.31, size: 32, font: "sans", color: "#121212", bg: "#FFFFFF", weight: 600, align: "center" },
  ];
  if (ad.offer && !/no offer/i.test(ad.offer)) layers.push({ id: uid(), kind: "badge", text: ad.offer.slice(0, 28), x: 0.07, y: 0.07, w: 0.5, size: 30, font: "sans", color: "#121212", bg: "#FFFFFF", weight: 700 });
  return { image: ad.imageUrl, overlay: 0.5, layers };
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

/** Draw the design at full Meta size and return a PNG blob. */
async function render(d: AdDesign, s: Size): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = s.w; c.height = s.h;
  const ctx = c.getContext("2d")!;
  const g0 = ctx.createLinearGradient(0, 0, s.w, s.h); g0.addColorStop(0, "#EDE9E2"); g0.addColorStop(1, "#D9D3C7");
  ctx.fillStyle = g0; ctx.fillRect(0, 0, s.w, s.h);
  if (d.image) {
    try {
      const img = await load(d.image);
      const r = Math.max(s.w / img.width, s.h / img.height);
      ctx.drawImage(img, (s.w - img.width * r) / 2, (s.h - img.height * r) / 2, img.width * r, img.height * r);
    } catch { /* keep the plain background */ }
  }
  const g = ctx.createLinearGradient(0, s.h * 0.35, 0, s.h);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${d.overlay})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, s.w, s.h);
  for (const l of d.layers) {
    const x = l.x * s.w, y = l.y * s.h, w = l.w * s.w;
    if (l.kind === "logo" && l.src) {
      try { const img = await load(l.src); const h = (w / img.width) * img.height; ctx.drawImage(img, x, y, w, h); } catch { /* skip */ }
      continue;
    }
    ctx.font = `${l.weight ?? 400} ${l.size}px ${l.font === "serif" ? SERIF : SANS}`;
    ctx.textBaseline = "top";
    const lines = wrap(ctx, l.text, l.kind === "text" ? w : w - l.size);
    const lh = l.size * 1.15;
    if (l.kind === "button" || l.kind === "badge") {
      const bw = l.kind === "button" ? w : Math.min(w, ctx.measureText(l.text).width + l.size * 1.2);
      const bh = lh * lines.length + l.size * 0.7;
      ctx.fillStyle = l.bg ?? "#fff";
      ctx.beginPath(); ctx.roundRect(x, y, bw, bh, l.kind === "button" ? bh / 2 : 10); ctx.fill();
      ctx.fillStyle = l.color; ctx.textAlign = "center";
      lines.forEach((t, i) => ctx.fillText(t, x + bw / 2, y + l.size * 0.38 + i * lh));
      ctx.textAlign = "left";
    } else {
      ctx.fillStyle = l.color;
      ctx.shadowColor = "rgba(0,0,0,.3)"; ctx.shadowBlur = 16;
      lines.forEach((t, i) => ctx.fillText(t, l.align === "center" ? x + (w - ctx.measureText(t).width) / 2 : x, y + i * lh));
      ctx.shadowBlur = 0;
    }
  }
  return new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
}

function Artboard({ d, s, scale, sel, onSelect, onMove, brand }: { d: AdDesign; s: Size; scale: number; sel: string | null; onSelect: (id: string | null) => void; onMove: (id: string, x: number, y: number) => void; brand: string }) {
  const W = s.w * scale, H = s.h * scale;
  const drag = useRef<{ id: string; sx: number; sy: number; lx: number; ly: number } | null>(null);
  return (
    <div className="col g6" style={{ alignItems: "center" }}>
      <span className="xs i3">{s.label} · {s.note}</span>
      <div onPointerDown={(e) => { if (e.target === e.currentTarget) onSelect(null); }}
        onPointerMove={(e) => { const g = drag.current; if (!g) return; onMove(g.id, Math.min(0.98, Math.max(0, g.lx + (e.clientX - g.sx) / W)), Math.min(0.98, Math.max(0, g.ly + (e.clientY - g.sy) / H))); }}
        onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}
        style={{ position: "relative", width: W, height: H, overflow: "hidden", borderRadius: 8, background: "linear-gradient(160deg,#EDE9E2,#D9D3C7)", boxShadow: "0 0 0 1px var(--line), 0 6px 20px rgba(18,18,18,.08)", touchAction: "none", userSelect: "none" }}>
        {d.image && <img src={d.image} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,${d.overlay}) 100%)`, pointerEvents: "none" }} />
        {s.key === "9x16" && <><div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "14%", background: "repeating-linear-gradient(45deg, rgba(235,122,60,.08) 0 6px, transparent 6px 12px)", pointerEvents: "none" }} /><div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "20%", background: "repeating-linear-gradient(45deg, rgba(235,122,60,.08) 0 6px, transparent 6px 12px)", pointerEvents: "none" }} /></>}
        {d.layers.map((l) => {
          const common: React.CSSProperties = { position: "absolute", left: `${l.x * 100}%`, top: `${l.y * 100}%`, cursor: "move", outline: sel === l.id ? "1.5px solid #1AA7C8" : "none", outlineOffset: 2 };
          const start = (e: React.PointerEvent) => { e.stopPropagation(); onSelect(l.id); drag.current = { id: l.id, sx: e.clientX, sy: e.clientY, lx: l.x, ly: l.y }; };
          if (l.kind === "logo") return l.src ? <img key={l.id} src={l.src} alt="logo" draggable={false} onPointerDown={start} style={{ ...common, width: `${l.w * 100}%` }} /> : null;
          const fs = l.size * scale;
          const box = l.kind === "button" || l.kind === "badge";
          return (
            <div key={l.id} onPointerDown={start} style={{ ...common, width: l.kind === "badge" ? "auto" : `${l.w * 100}%`, maxWidth: `${l.w * 100}%`, fontFamily: l.font === "serif" ? SERIF : SANS, fontSize: fs, lineHeight: 1.15, fontWeight: l.weight ?? 400, color: l.color,
              textAlign: box ? "center" : l.align ?? "left", ...(box ? { background: l.bg, borderRadius: l.kind === "button" ? 999 : 4, padding: `${fs * 0.35}px ${fs * 0.6}px` } : { textShadow: "0 1px 8px rgba(0,0,0,.3)" }), whiteSpace: "pre-wrap" }}>
              {l.text || (l.kind === "text" ? brand : "")}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Editor({ slug, brand, ad, ads, palette, products, media, logos, otherHooks }: {
  slug: string; brand: string; ad: EditorAd; ads: { id: string; hook: string }[]; palette: string[];
  products: { title: string; url: string }[]; media: { name: string; url: string; ai: boolean }[]; logos: { name: string; url: string }[]; otherHooks: string[];
}) {
  const router = useRouter();
  const [d, setD] = useState<AdDesign>(() => ad.design ?? defaultDesign(ad, brand));
  const [sel, setSel] = useState<string | null>(d.layers[0]?.id ?? null);
  const [panel, setPanel] = useState<"text" | "products" | "media" | "logos" | "elements">("text");
  const [dirty, setDirty] = useState(false);
  const [busy, start] = useTransition();
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const layer = d.layers.find((l) => l.id === sel) ?? null;
  const set = (next: AdDesign) => { setD(next); setDirty(true); };
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
        const blob = await render(d, s);
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
    ["Has a button or call to action", d.layers.some((l) => l.kind === "button")],
    ["Uses a product photo", Boolean(d.image)],
    ["Headline under 8 words", !head || head.text.trim().split(/\s+/).length <= 8],
    ["Readable — text size 28 px or more", d.layers.filter((l) => l.kind !== "logo").every((l) => l.size >= 28)],
  ];

  const tile = (url: string, label: string, on: () => void, badge?: string) => (
    <button key={url} type="button" onClick={on} title={label} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", border: d.image === url ? "2px solid var(--ink)" : "1px solid var(--line)", padding: 0, cursor: "pointer", background: "var(--tray)" }}>
      <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
            {([["text", "Text", "file"], ["products", "Products", "box"], ["media", "Media", "image"], ["logos", "Logos", "pencil"], ["elements", "Elements", "layers"]] as const).map(([k, l, i]) => (
              <button key={k} type="button" onClick={() => setPanel(k)} className="col g2" style={{ alignItems: "center", padding: "8px 0", borderRadius: 8, background: panel === k ? "#fff" : "transparent", boxShadow: panel === k ? "0 0 0 1px var(--line)" : "none", cursor: "pointer" }}>
                <Icon name={i} size={16} /><span style={{ fontSize: 10 }}>{l}</span></button>
            ))}
          </div>
          <div className="col g8 fill" style={{ padding: 12, overflowY: "auto", minWidth: 0 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>{products.map((p) => tile(p.url, p.title, () => set({ ...d, image: p.url })))}</div>
              {products.length === 0 && <span className="xs i3">No product photos synced yet.</span>}
            </>}
            {panel === "media" && <>
              <span className="sm w5">Media</span><span className="xs i3">Brand imagery and photos made in Shoots.</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>{media.map((m) => tile(m.url, m.name, () => set({ ...d, image: m.url }), m.ai ? "AI" : undefined))}</div>
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

        <div className="fill" style={{ overflow: "auto", background: "var(--tray)", backgroundImage: "radial-gradient(#D9D6D1 1px, transparent 1px)", backgroundSize: "16px 16px" }}>
          <div className="row top g24" style={{ padding: 28, justifyContent: "center", flexWrap: "wrap" }}>
            {SIZES.map((s) => <Artboard key={s.key} d={d} s={s} scale={0.18} sel={sel} onSelect={setSel} onMove={(id, x, y) => upd(id, { x, y })} brand={brand} />)}
          </div>
          <p className="xs i3" style={{ textAlign: "center" }}>Drag any layer. The striped bands on 9:16 are where Reels covers text.</p>
        </div>

        <aside className="col g10" style={{ width: 290, flexShrink: 0, borderLeft: "1px solid var(--line)", padding: 14, overflowY: "auto" }}>
          {layer ? <>
            <span className="row between"><span className="sm w5">Layer · {layer.kind === "text" ? "Text" : layer.kind === "button" ? "Button" : layer.kind === "badge" ? "Badge" : "Logo"}</span>
              <button type="button" className="btn quiet sm" onClick={() => remove(layer.id)}><Icon name="x" size={12} />Remove</button></span>
            {layer.kind !== "logo" && <>
              <div className="input" style={{ height: "auto", padding: 6 }}><textarea rows={3} value={layer.text} onChange={(e) => upd(layer.id, { text: e.target.value })} style={{ border: 0, outline: 0, resize: "none", width: "100%", font: "inherit", fontSize: 13 }} /></div>
              <div className="row g6">
                <div className="seg">{(["serif", "sans"] as const).map((f) => <button key={f} type="button" className={`o${layer.font === f ? " on" : ""}`} onClick={() => upd(layer.id, { font: f })} style={{ fontFamily: f === "serif" ? SERIF : SANS }}>{f === "serif" ? "Serif" : "Sans"}</button>)}</div>
                <label className="chip" style={{ height: 30 }}>Size<input type="number" min={18} max={160} value={layer.size} onChange={(e) => upd(layer.id, { size: Number(e.target.value) || 30 })} style={{ width: 48, border: 0, outline: 0, font: "inherit" }} /></label>
              </div>
              <div className="col g4"><span className="xs i3">Colour</span>
                <div className="row g6">{colors.map((c) => <button key={c} type="button" onClick={() => upd(layer.id, { color: c })} aria-label={c} style={{ width: 22, height: 22, borderRadius: 99, background: c, border: layer.color === c ? "2px solid #1AA7C8" : "1px solid var(--line-2)", cursor: "pointer" }} />)}</div></div>
              {(layer.kind === "button" || layer.kind === "badge") && <div className="col g4"><span className="xs i3">Fill</span>
                <div className="row g6">{colors.map((c) => <button key={c} type="button" onClick={() => upd(layer.id, { bg: c })} aria-label={`fill ${c}`} style={{ width: 22, height: 22, borderRadius: 6, background: c, border: layer.bg === c ? "2px solid #1AA7C8" : "1px solid var(--line-2)", cursor: "pointer" }} />)}</div></div>}
              <label className="col g4"><span className="xs i3">Width · {Math.round(layer.w * 100)}%</span><input type="range" min={0.15} max={0.95} step={0.01} value={layer.w} onChange={(e) => upd(layer.id, { w: Number(e.target.value) })} /></label>
            </>}
            {layer.kind === "logo" && <label className="col g4"><span className="xs i3">Size · {Math.round(layer.w * 100)}%</span><input type="range" min={0.1} max={0.6} step={0.01} value={layer.w} onChange={(e) => upd(layer.id, { w: Number(e.target.value) })} /></label>}
            {layer.kind === "text" && otherHooks.length > 0 && <>
              <span className="row g6 xs i3" style={{ paddingTop: 6 }}><AgentFace kind="builder" size={14} />Remy’s other hooks</span>
              {otherHooks.slice(0, 5).map((h) => (
                <div key={h} className="row between g6 xs" style={{ padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 8 }}><span className="i1">{h}</span><button type="button" className="btn quiet sm" onClick={() => upd(layer.id, { text: h })}>Use</button></div>
              ))}
            </>}
          </> : <span className="xs i3">Select a layer on any size to edit it.</span>}
          <div className="col g6" style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10, marginTop: 6 }}>
            <span className="row g8"><AgentFace kind="qa" size={16} /><span className="sm w5 fill">Otto checks</span><span className="xs i3">{checks.filter(([, ok]) => ok).length} / {checks.length}</span></span>
            {checks.map(([k, ok]) => <span key={k} className={`row g6 xs ${ok ? "i2" : "c-amber"}`}><Icon name={ok ? "check-circle" : "warning-circle"} size={13} weight={ok ? "fill" : "regular"} color={ok ? "#1F8A5B" : "#B7791F"} />{k}</span>)}
          </div>
        </aside>
      </div>
    </div>
  );
}
