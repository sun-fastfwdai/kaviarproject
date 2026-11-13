"use client";
/* eslint-disable @next/next/no-img-element -- product photos and generated media */
import { createContext, useContext } from "react";
import Link from "next/link";
import { BaseEdge, EdgeLabelRenderer, Handle, Position, getBezierPath, useReactFlow, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { CAT, NODES, NODE_H, NODE_W, PORTS, SEL, TOK, cfgOf, type NodeKey } from "./flow";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { ShopifyLogo } from "@/components/logos";
import type { ShootFlow, ShootNode, ShootSource } from "@/lib/db/schema";

export type Check = { labelMatches: boolean; shapeExact: boolean; coloursOnBrand: boolean; noTextOrWatermark: boolean; note: string };
export type Shot = { id: string; kind: "image" | "video"; product: string | null; prompt: string | null; check: Check | null; edit: string | null; seconds: number | null; at: string; engine: string | null; cost: number | null; sound: boolean };
export type Product = { title: string; url: string; price: number | null; stock: number | null };
export type Signal = { key: string; data: string; value: string | null; group: string; evidence: [string, string][] };
export type Lesson = { dimension: string; lesson: string; evidence: string; strength: "Strong" | "Early" | "Weak" };
export type Batch = { id: string; title: string; n: number; signal: string | null };
export type RunState = "queued" | "running" | "done" | "error";

export const passes = (c: Check | null) => Boolean(c && c.labelMatches && c.shapeExact && c.coloursOnBrand && c.noTextOrWatermark);
export const flagOf = (c: Check | null) => (!c ? null : !c.labelMatches ? "label off" : !c.shapeExact ? "shape off" : !c.coloursOnBrand ? "colours off" : !c.noTextOrWatermark ? "added text" : null);
export const usd = (n: number) => `$${n.toFixed(2)}`;
export const clock = (ms: number) => { const t = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
export const agoFrom = (iso: string, now: number) => { const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000)); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
export const short = (t: string) => t.split(/[·(|,-]/)[0].trim().split(/\s+/).slice(0, 3).join(" ");
export const joinSegs = (segs: { text: string }[]) => segs.reduce((acc, s) => acc + (acc && !/\s$/.test(acc) && !/^[\s,.;:!?)]/.test(s.text) ? " " : "") + s.text, "");
export const asset = (id: string) => `/api/assets/${id}`;

/** Everything a node card needs from the studio. */
export type StudioApi = {
  flow: ShootFlow; status: Record<string, RunState>; busy: boolean; now: number; currency: string; brand: string;
  byId: Map<string, Shot>; palette: string[]; look: string | null; tone: string | null; lessons: Lesson[]; batches: Batch[];
  perImage: number; perVideoSecond: number; perSoundSecond: number; engines: { photo: string; video: string; via: string; sound: boolean }; voiceName: (id: string | null) => string | null;
  productFor: (id: string) => Product | null; signalFor: (id: string) => Signal | null; sceneFor: (id: string) => string;
  stale: (id: string) => boolean; changed: (id: string) => boolean; checkedFor: (id: string) => Shot[]; frameFor: (id: string) => string | null;
  sendItems: (id: string) => { photos: string[]; clips: string[] }; pickedFor: (id: string) => string[]; nextStep: (id: string) => string | null;
  patch: (id: string, cfg: Partial<ShootNode["cfg"]>) => void; select: (id: string) => void; writePrompt: (id: string) => void; design: (assetId: string) => void;
  rerunOne: (checkId: string, shotId: string) => void; send: (id: string) => void; focus: (assetId: string) => void;
  characterOf: (id: string | null) => { id: string; name: string; description: string; uploaded: boolean } | null;
  statusAt: Record<string, number>; jobState: Record<string, string>; view: (nodeId: string, assetId: string) => void; expanded: (id: string) => boolean; toggleExpand: (id: string) => void;
};
export const StudioCtx = createContext<StudioApi | null>(null);
const useStudio = () => useContext(StudioCtx)!;

// ---------------------------------------------------------------- small pieces
export function Tile({ k, size = 18, icon }: { k: NodeKey; size?: number; icon?: React.ReactNode }) {
  const d = NODES[k];
  return <span style={{ width: size, height: size, borderRadius: size > 20 ? 8 : 5, background: size > 20 ? "var(--tray)" : `${CAT[d.cat]}1A`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon ?? <Icon name={d.icon} size={size > 20 ? 15 : 11} color={CAT[d.cat]} />}</span>;
}
export function Tag({ t, color = "#8B8883" }: { t: string; color?: string }) {
  return <span className="row" style={{ height: 18, padding: "0 6px", borderRadius: 5, background: "var(--tray)", border: "1px solid var(--line)", fontSize: 10, color: "var(--ink-2)", whiteSpace: "nowrap", gap: 4 }}><span style={{ width: 5, height: 5, borderRadius: 99, background: color }} />{t}</span>;
}
export function Thumb({ id, w, h, kind = "image", flag, star, onClick, ring, title, sound }: { id: string; w: number; h: number; kind?: "image" | "video"; flag?: string | null; star?: boolean; onClick?: () => void; ring?: boolean; title?: string; sound?: boolean }) {
  return (
    <button type="button" title={title} className="nodrag thumb-hover" onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      onMouseEnter={(e) => { const v = e.currentTarget.querySelector("video"); if (v) void v.play().catch(() => undefined); }}
      onMouseLeave={(e) => { const v = e.currentTarget.querySelector("video"); if (v) { v.pause(); v.currentTime = 0; } }}
      style={{ position: "relative", width: w, height: h, borderRadius: 6, overflow: "hidden", flexShrink: 0, padding: 0, background: "var(--tray)", boxShadow: ring ? `0 0 0 2px ${SEL}` : "0 0 0 1px var(--line)", cursor: onClick ? "pointer" : "default" }}>
      {kind === "video"
        ? <video src={asset(id)} muted loop playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <img src={asset(id)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      {kind === "video" && <span className="thumb-play" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 22, height: 22, borderRadius: 99, background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="play" size={9} weight="fill" color="#121212" /></span>}
      {kind === "video" && sound && <span style={{ position: "absolute", right: 3, bottom: 3, width: 16, height: 16, borderRadius: 99, background: "rgba(18,18,18,.6)", display: "flex", alignItems: "center", justifyContent: "center" }} title="Has sound"><Icon name="music" size={9} color="#fff" /></span>}
      <span className="thumb-expand" style={{ position: "absolute", right: 3, top: 3, width: 18, height: 18, borderRadius: 5, background: "rgba(255,255,255,.92)", alignItems: "center", justifyContent: "center" }}><Icon name="arrow-ur" size={10} color="#121212" /></span>
      {flag && <span style={{ position: "absolute", left: 3, top: 3, height: 14, padding: "0 4px", borderRadius: 4, background: "#fff", color: "#B7791F", fontSize: 9, fontWeight: 600, display: "flex", alignItems: "center" }}>{flag}</span>}
      {star && <span style={{ position: "absolute", right: 3, top: 3, width: 16, height: 16, borderRadius: 99, background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="star" size={9} weight="fill" color="#B7791F" /></span>}
    </button>
  );
}
export function Pending({ w, h, label }: { w: number; h: number; label: string }) {
  return <div className="col" style={{ width: w, height: h, borderRadius: 6, background: "rgba(247,246,244,0.85)", boxShadow: "0 0 0 1px var(--line)", alignItems: "center", justifyContent: "center", gap: 3, flexShrink: 0 }}><AgentFace kind="builder" size={16} /><span style={{ fontSize: 9.5, color: "var(--ink-2)" }}>{label}</span></div>;
}
export function Segments({ segs }: { segs: { text: string; source: ShootSource }[] }) {
  return <>{segs.map((s, i) => {
    const gap = i > 0 && !/\s$/.test(segs[i - 1].text) && !/^[\s,.;:!?)]/.test(s.text) ? " " : "";
    return <span key={i}>{gap}{s.source === "none" ? s.text : <span style={{ color: "var(--ink)", borderBottom: `2px solid ${TOK[s.source]}` }}>{s.text}</span>}</span>;
  })}</>;
}
function Empty({ icon, text, w, h }: { icon: "image" | "video"; text: string; w: number | string; h: number }) {
  return <div className="col" style={{ width: w, height: h, borderRadius: 8, border: "1px dashed var(--line-2)", alignItems: "center", justifyContent: "center", gap: 4, textAlign: "center", padding: 8 }}><Icon name={icon} size={16} color="#B5B2AC" /><span className="xs i3">{text}</span></div>;
}

// ---------------------------------------------------------------- ports
const portColor = (k: NodeKey, port: string, out: boolean) => {
  if (out) return k === "character" ? TOK.character : k === "product" ? TOK.product : k === "data" ? TOK.data : k === "brand" || k === "reference" ? TOK.brand : k === "wins" ? TOK.wins : "#B5B2AC";
  if (k === "prompt") return port === "char" ? TOK.character : port === "product" ? TOK.product : port === "data" ? TOK.data : port === "brand" || port === "ref" ? TOK.brand : TOK.wins;
  return "#B5B2AC";
};
const SIDE = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom } as const;
function Ports({ k, hot }: { k: NodeKey; hot: boolean }) {
  const st = (c: string): React.CSSProperties => ({ width: 11, height: 11, borderRadius: 99, background: hot ? c : "#fff", border: `1.5px solid ${c}` });
  return <>
    {PORTS[k].ins.map(([id, side, top]) => <Handle key={`i${id}`} id={id} type="target" position={SIDE[side]} style={{ ...st(portColor(k, id, false)), ...(top != null ? { top } : {}) }} title="Drop a wire here" />)}
    {PORTS[k].outs.map(([id, side]) => <Handle key={`o${id}`} id={id} type="source" position={SIDE[side]} style={st(portColor(k, id, true))} title="Drag to connect" />)}
  </>;
}

// ---------------------------------------------------------------- the node card
export type CanvasNode = Node<Record<string, never>, "shoot">;

export function ShootCanvasNode({ id, selected }: NodeProps<CanvasNode>) {
  const s = useStudio();
  const n = s.flow.nodes.find((x) => x.id === id);
  if (!n) return null;
  const k = n.type, d = NODES[k], c = cfgOf(n), st = s.status[id];
  const product = s.productFor(id);
  const signal = k === "data" ? s.signalFor(id) : null;
  const person = k === "character" ? s.characterOf(c.characterId) : null;
  const title = k === "character" ? person?.name ?? "Pick a person" : k === "product" ? (product ? short(product.title) : "Pick a product") : k === "data" ? signal?.data ?? "No signal" : k === "brand" ? `${s.brand} kit`
    : k === "wins" ? "From Insights" : k === "reference" ? (c.reference ? "Brand photo" : "Pick a photo") : k === "prompt" ? "by Remy" : k === "photo" ? s.engines.photo
    : k === "video" ? s.engines.video : k === "sound" ? "Voice + music" : k === "check" ? "Otto" : "Where results go";
  return (
    <div className="col" style={{ width: s.expanded(id) ? 372 : NODE_W[k], minHeight: NODE_H[k], background: "#fff", borderRadius: 12, cursor: "grab", transition: "width .15s",
      boxShadow: selected ? `0 0 0 2px ${SEL}, 0 10px 28px rgba(18,18,18,0.10)` : st === "running" ? `0 0 0 1.5px ${SEL}, 0 8px 24px rgba(26,167,200,.18)` : "0 0 0 1px var(--line), 0 4px 14px rgba(18,18,18,0.05)",
      ...(st === "queued" ? { outline: "1.5px dashed #C9C5BF", outlineOffset: 2 } : {}) }}>
      <Ports k={k} hot={selected} />
      <div className="row g6" style={{ height: 30, padding: "0 10px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <Tile k={k} icon={k === "product" ? <ShopifyLogo size={11} /> : undefined} />
        <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.04em" }}>{d.kind}</span>
        <span className="xs w5 i1 fill ell">{title}</span>
        {st === "queued" ? <span className="xs i3">queued</span>
          : st === "running" ? <span className="row g4 xs tnum" style={{ color: SEL }}><Icon name="spinner" size={12} className="spin" color={SEL} />{clock(s.now - (s.statusAt[id] ?? s.now))}</span>
          : st === "error" ? <Icon name="warning-circle" size={13} color="#B7791F" /> : st === "done" ? <Icon name="check-circle" size={13} weight="fill" color="#1F8A5B" /> : d.agent ? <AgentFace kind={d.agent} size={16} /> : null}
        {(k === "photo" || k === "video") && <button type="button" className="nodrag hv" title={s.expanded(id) ? "Collapse" : "Expand to see every result"} aria-label="Expand" onClick={(e) => { e.stopPropagation(); s.toggleExpand(id); }}
          style={{ width: 20, height: 20, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", marginLeft: 2 }}><Icon name={s.expanded(id) ? "minus" : "arrow-ur"} size={11} color="#55534F" /></button>}
      </div>
      {st === "running" && <div className="run-bar" />}
      <div className="col g6" style={{ padding: "9px 10px", flex: 1, minHeight: 0 }}>
        <Body n={n} />
      </div>
    </div>
  );
}

function Body({ n }: { n: ShootNode }) {
  const s = useStudio();
  const { id } = n;
  const c = cfgOf(n), st = s.status[id];
  const money = (v: number | null) => (v != null ? new Intl.NumberFormat("en", { style: "currency", currency: s.currency }).format(v) : "no price");

  if (n.type === "product") {
    const p = s.productFor(id);
    return p ? <>
      <div className="row g8"><img src={p.url} alt="" width={44} height={44} style={{ borderRadius: 6, objectFit: "cover", boxShadow: "0 0 0 1px var(--line)", flexShrink: 0 }} />
        <div className="col" style={{ minWidth: 0 }}><span className="xs w5 i1" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.title}</span>
          <span className="xs i3">{money(p.price)}{p.stock != null ? ` · ${p.stock} in stock` : ""}</span></div></div>
      <div className="row g4" style={{ flexWrap: "wrap" }}><Tag t="Shopify photo" color={TOK.product} /><Tag t="price" color={TOK.product} /><Tag t="stock" color={TOK.product} /></div>
      <span className="row g4 xs i3"><Icon name="lock" size={11} color="#1F8A5B" />label + shape locked</span>
    </> : <span className="xs i3" style={{ lineHeight: "16px" }}>No product photos yet — they come from Shopify on the next sync.</span>;
  }

  if (n.type === "character") {
    const p = s.characterOf(c.characterId);
    return p ? <>
      <button type="button" className="nodrag" onClick={(e) => { e.stopPropagation(); s.view(id, p.id); }} title="Open" style={{ borderRadius: 7, overflow: "hidden", boxShadow: "0 0 0 1px var(--line)", padding: 0, background: "var(--tray)" }}>
        <img src={asset(p.id)} alt="" style={{ width: "100%", height: 86, objectFit: "cover", display: "block" }} />
      </button>
      <span className="xs i2" style={{ lineHeight: "15px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.description}</span>
      <span className="row g4 xs i3" style={{ marginTop: "auto" }}><Icon name="lock" size={11} color={TOK.character} />{p.uploaded ? "real creator · with permission" : "same person in every shot"}</span>
    </> : <span className="xs i3" style={{ lineHeight: "16px" }}>Pick or cast a person in the panel — wire this into the Prompt and Photo and they hold the product.</span>;
  }

  if (n.type === "data") {
    const sig = s.signalFor(id);
    if (!sig) return <span className="xs i3" style={{ lineHeight: "16px" }}>Pick a signal in the panel to aim the shoot at the people in it.</span>;
    const m = sig.value?.match(/^([\d.,]+%?)\s+(.*)$/);
    const people = sig.group === "Customers";
    const unit = m ? (people ? "people" : m[2].split(/\s+/)[0]) : "";
    const rest = m ? (people ? m[2] : m[2].split(/\s+/).slice(1).join(" ")) : "";
    return <>
      {m ? <span className="h3 tnum" style={{ lineHeight: "24px" }}>{m[1]} <span className="xs i3" style={{ fontWeight: 400 }}>{unit}</span></span> : null}
      <span className="xs i2" style={{ lineHeight: "16px", display: "-webkit-box", WebkitLineClamp: m ? 2 : 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m ? rest || sig.evidence[0]?.join(" · ") : sig.value}</span>
      {s.changed(id) ? <span className="row g4 xs c-amber" style={{ marginTop: "auto" }}><Icon name="warning-circle" size={11} />changed since the last run</span>
        : <span className="row g4 xs i3" style={{ marginTop: "auto" }}><ShopifyLogo size={10} />{sig.group.toLowerCase()} · live</span>}
    </>;
  }

  if (n.type === "brand") {
    const sw = s.palette.slice(0, 5);
    return <>
      <div className="row g4">{sw.map((x) => <span key={x} style={{ width: 14, height: 14, borderRadius: 99, background: x, boxShadow: "0 0 0 1px var(--line)" }} />)}{s.look && <span className="xs i2 ell" style={{ marginLeft: 4 }}>{s.look}</span>}{!sw.length && !s.look && <span className="xs i3">No palette yet</span>}</div>
      <span className="xs i2 ell">{s.tone ?? "Tone from the brand profile"}</span>
      <span className="xs i3 ell">{c.brandRules.join(" · ") || "no rules"}{c.strict ? "" : " · loose"}</span>
    </>;
  }

  if (n.type === "wins") {
    const ls = s.lessons.filter((l) => !c.strongOnly || l.strength === "Strong");
    return ls.length ? <>{ls.slice(0, 4).map((l) => (
      <div key={l.lesson} className="row between g6" title={`${l.lesson} — ${l.evidence}`}><span className="xs i2 ell">{l.lesson}</span><span className={`xs w5 ${l.strength === "Strong" ? "c-green" : "i3"}`} style={{ flexShrink: 0 }}>{l.strength === "Strong" ? "strong" : "early"}</span></div>))}</>
      : <span className="xs i3" style={{ lineHeight: "16px" }}>Iris writes these once Insights has read the brand’s live ads.</span>;
  }

  if (n.type === "reference") {
    return c.reference ? <div className="row top g8"><Thumb id={c.reference.id} w={40} h={40} /><span className="xs i2" style={{ lineHeight: "15px", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.reference.note}</span></div>
      : <span className="xs i3" style={{ lineHeight: "16px" }}>Pick a brand photo in the panel — Remy borrows its style, light and pose.</span>;
  }

  if (n.type === "prompt") {
    return <>
      <span className="xs i2" style={{ lineHeight: "20px", overflow: "hidden", flex: 1, minHeight: 0, display: "-webkit-box", WebkitLineClamp: 9, WebkitBoxOrient: "vertical" }}>
        {c.segments && c.prompt === joinSegs(c.segments) ? <Segments segs={c.segments} /> : c.prompt || <span className="i3">Wire inputs in, then Run flow — Remy writes this from them. Or write the scene yourself in the panel.</span>}
      </span>
      {s.stale(id) && <span className="xs c-amber">Inputs changed — Remy rewrites it on the next run.</span>}
      <div className="row g8" style={{ flexWrap: "wrap" }}>{(["product", "character", "data", "brand", "wins"] as const).map((k) => <span key={k} className="row g4" style={{ fontSize: 10, color: "var(--ink-3)" }}><span style={{ width: 8, height: 2, background: TOK[k] }} />{k === "wins" ? "Wins" : k === "character" ? "Person" : k[0].toUpperCase() + k.slice(1)}</span>)}</div>
      <button type="button" className="row g4 xs i2 nodrag" disabled={s.busy} onClick={(e) => { e.stopPropagation(); s.select(id); s.writePrompt(id); }} style={{ paddingTop: 6, borderTop: "1px solid var(--line)", textAlign: "left" }}>
        {st === "running" ? <Icon name="spinner" size={11} className="spin" /> : <Icon name="refresh" size={11} color="#55534F" />}{c.prompt ? "Rewrite" : "Write"} · edit by hand</button>
    </>;
  }

  if (n.type === "sound") {
    if (!s.engines.sound) return <>
      <div className="row between"><span className="xs i2">Voice</span><span className="xs i3">—</span></div>
      <div className="row between"><span className="xs i2">Music</span><span className="xs i3">—</span></div>
      <span className="xs i3">Needs Higgsfield · clips are silent</span>
    </>;
    return <>
      <div className="row between g8"><span className="xs i2">Voice</span><span className="xs w5 i1 ell">{c.voice?.trim() ? s.voiceName(c.voiceId) ?? (c.voiceStyle || "warm, natural") : "none"}</span></div>
      <div className="row between g8"><span className="xs i2">Music</span><span className="xs w5 i1 ell">{c.music}</span></div>
      <span className="xs i3 ell" title={c.voice}>{c.voice?.trim() ? `“${c.voice.trim()}”` : `${s.engines.video} makes it with the clip`}</span>
    </>;
  }

  if (n.type === "photo") {
    const out = c.out ?? [];
    const checks = out.map((x) => s.byId.get(x)?.check ?? null);
    const firstPass = out.find((x, i) => passes(checks[i]));
    const big = s.expanded(id), tw = big ? 168 : 82, th = big ? 168 : 74;
    return <>
      <span className="xs i3">{s.sceneFor(id)} · {c.aspect} · × {c.n}{big && out.length ? ` · ${out.length} made` : ""}</span>
      <div className="row top" style={{ flexWrap: "wrap", gap: 6 }}>
        {st === "running" ? Array.from({ length: Math.min(4, c.n) }, (_, i) => <Pending key={i} w={tw} h={th} label="making" />)
          : out.length ? out.slice(0, big ? 12 : 4).map((x) => s.byId.has(x)
            ? <Thumb key={x} id={x} w={tw} h={th} star={x === firstPass} flag={flagOf(s.byId.get(x)!.check)} onClick={() => s.view(id, x)} title="Open" />
            : <Pending key={x} w={tw} h={th} label="saving" />)
          : <Empty icon="image" text="Photos land here. Each keeps the real product." w={170} h={150} />}
      </div>
      <span className="row between xs i3" style={{ marginTop: "auto" }}><span>{usd(c.n * s.perImage)}</span>
        {st === "running" ? <span style={{ color: "#1A8FAB" }}>making {c.n}…</span> : st === "error" ? <span className="c-amber">didn’t run</span> : c.at && out.length ? <span className="c-green">done · {agoFrom(c.at, s.now)}</span> : <span>not run yet</span>}</span>
    </>;
  }

  if (n.type === "video") {
    const out = c.out ?? [], jobs = c.jobs ?? [];
    const frame = s.frameFor(id);
    const big = s.expanded(id), tw = big ? 108 : 56, th = big ? 192 : 104;
    return <>
      <span className="xs i3">{c.move} · {c.seconds}s · {s.engines.via === "Higgsfield" ? (c.res === "480p" ? "draft" : c.res === "1080p" ? "high" : "standard") : c.aspect} · × {c.n}</span>
      <div className="row g4 xs i2"><Icon name="arrow-r" size={11} color="#8B8883" />start frame: {frame ? "a photo from the Photo node" : "wire a Photo node in"}</div>
      <div className="row g6" style={{ flexWrap: "wrap" }}>
        {jobs.map((j) => (
          <div key={j.id} className="col" style={{ width: tw, height: th, borderRadius: 6, background: "rgba(247,246,244,0.85)", boxShadow: `0 0 0 1px ${SEL}`, alignItems: "center", justifyContent: "center", gap: 4, flexShrink: 0, textAlign: "center", padding: 4 }}>
            <AgentFace kind="builder" size={16} mood="focus" />
            <span style={{ fontSize: 9.5, color: "var(--ink-2)", lineHeight: "12px" }}>{s.jobState[j.id] === "queued" ? "in the queue" : "rendering"}</span>
            <span className="tnum" style={{ fontSize: 9.5, color: SEL }}>{clock(s.now - Date.parse(j.at))}</span>
          </div>
        ))}
        {st === "running" && !jobs.length && <Pending w={tw} h={th} label="starting" />}
        {out.slice(0, big ? 8 : Math.max(0, 3 - jobs.length)).map((x) => s.byId.has(x) ? <Thumb key={x} id={x} w={tw} h={th} kind="video" sound={s.byId.get(x)!.sound} onClick={() => s.view(id, x)} title="Play" /> : <Pending key={x} w={tw} h={th} label="saving" />)}
        {!out.length && !jobs.length && st !== "running" && <Empty icon="video" text="A 5–15 s clip from a photo." w={172} h={104} />}
      </div>
      <span className="row between xs i3" style={{ marginTop: "auto" }}><span>{usd(c.n * c.seconds * s.perVideoSecond)}</span>{jobs.length ? <span style={{ color: "#1A8FAB" }}>{jobs.length} rendering · 1–3 min</span> : out.length ? <span className="c-green">{out.length} made</span> : <span>1–3 min each</span>}</span>
    </>;
  }

  if (n.type === "check") {
    const checked = s.checkedFor(id), withCheck = checked.filter((x) => x.check);
    const p = s.productFor(id);
    const rows: [string, (c: Check) => boolean][] = [[`Label matches ${p ? short(p.title) : "the product"}`, (x) => x.labelMatches], ["Shape exact", (x) => x.shapeExact], ["Colours on-brand", (x) => x.coloursOnBrand], ["No text or watermark", (x) => x.noTextOrWatermark]];
    return withCheck.length ? <>
      {rows.map(([t, ok]) => { const good = withCheck.every((x) => ok(x.check!)); return <div key={t} className="row g6"><Icon name={good ? "check-circle" : "info"} size={12} weight={good ? "fill" : "regular"} color={good ? "#1F8A5B" : "#B7791F"} /><span className={`xs ell ${good ? "i2" : "c-amber"}`}>{t}</span></div>; })}
      {checked.map((x, i) => !passes(x.check) && x.check ? <button key={x.id} type="button" onClick={(e) => { e.stopPropagation(); s.rerunOne(id, x.id); }} disabled={s.busy} className="row g6 xs c-amber nodrag" style={{ textAlign: "left" }}><Icon name="info" size={12} color="#B7791F" />Photo {i + 1}: {flagOf(x.check)} → re-run</button> : null).filter(Boolean).slice(0, 2)}
    </> : <span className="xs i3" style={{ lineHeight: "16px" }}>Label · shape · colours · no added text. Otto checks every photo wired in against the real product.</span>;
  }

  // send
  const picked = s.pickedFor(id), items = s.sendItems(id), next = s.nextStep(id);
  const opts = [...s.batches].slice(0, 2);
  return <>
    <div className="col g4 nodrag" onClick={(e) => e.stopPropagation()}>
      {opts.map((b) => (
        <label key={b.id} className="row g6" style={{ cursor: "pointer" }}><input type="radio" name={`send-${id}`} checked={c.send === b.id} onChange={() => s.patch(id, { send: b.id })} style={{ accentColor: "#121212", margin: 0 }} />
          <span className={`xs fill ell ${c.send === b.id ? "w5 i1" : "i2"}`} title={b.title}>{b.title}</span>{c.send === b.id && <span className="xs i3">{picked.length} ready</span>}</label>
      ))}
      <label className="row g6" style={{ cursor: "pointer" }}><input type="radio" name={`send-${id}`} checked={!c.send} onChange={() => s.patch(id, { send: null })} style={{ accentColor: "#121212", margin: 0 }} />
        <span className={`xs fill ${!c.send ? "w5 i1" : "i2"}`}>Brand assets</span>{!c.send && <span className="xs i3">{picked.length + items.clips.length} ready</span>}</label>
    </div>
    {next ? <Link className="btn dark sm nodrag" href={next} onClick={(e) => e.stopPropagation()} style={{ height: 26, justifyContent: "center", marginTop: "auto" }}>Next: design in Editor<Icon name="arrow-r" size={11} color="#fff" /></Link>
      : <button type="button" className="btn dark sm nodrag" disabled={s.busy || !picked.length} onClick={(e) => { e.stopPropagation(); s.send(id); }} style={{ height: 26, justifyContent: "center", marginTop: "auto" }}>
        {c.send ? `Send ${picked.length} to batch` : `Keep ${picked.length} in assets`}</button>}
  </>;
}

// ---------------------------------------------------------------- wires
export type Wire = Edge<{ color: string; dashed?: boolean; hot?: boolean; flow?: boolean }, "wire">;

export function WireEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data }: EdgeProps<Wire>) {
  const { deleteElements } = useReactFlow();
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const on = selected || data?.hot;
  return <>
    <BaseEdge id={id} path={path} interactionWidth={20}
      style={{ stroke: selected || data?.hot || data?.flow ? SEL : data?.color ?? "#C9C5BF", strokeWidth: selected ? 2.6 : on || data?.flow ? 2.2 : 1.5, strokeDasharray: data?.dashed ? "4 4" : undefined, strokeLinecap: "round", opacity: data?.flow ? 0.35 : 1 }} />
    {data?.flow && <>
      <path d={path} fill="none" stroke={SEL} strokeWidth={2.4} strokeLinecap="round" className="wire-flow" style={{ pointerEvents: "none" }} />
      <circle r={4} fill={SEL} style={{ pointerEvents: "none" }}><animateMotion dur="1.3s" repeatCount="indefinite" path={path} /></circle>
    </>}
    <EdgeLabelRenderer>
      {selected ? (
        <button type="button" className="nodrag nopan" title="Remove this wire (Delete)" aria-label="Remove this wire" onClick={() => deleteElements({ edges: [{ id }] })}
          style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, pointerEvents: "all", width: 22, height: 22, borderRadius: 99, background: "#fff", boxShadow: `0 0 0 1.5px ${SEL}, 0 2px 6px rgba(18,18,18,.15)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="x" size={11} color="#121212" />
        </button>
      ) : data?.dashed ? (
        <span className="row g4" style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${lx}px, ${ly - 9}px)`, fontSize: 10, color: "#1F8A5B", background: "#F3F2EF", padding: "0 4px", whiteSpace: "nowrap", pointerEvents: "none" }}>
          <Icon name="lock" size={10} color="#1F8A5B" />product photos as reference
        </span>
      ) : null}
    </EdgeLabelRenderer>
  </>;
}
