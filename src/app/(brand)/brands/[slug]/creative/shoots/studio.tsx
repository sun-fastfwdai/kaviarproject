"use client";
/* eslint-disable @next/next/no-img-element -- product photos and generated media */
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { deleteShot, designFromShot, readReference, runCheck, runEdit, runShoot, runVideo, saveFlow, sendShots, suggestPrompt } from "./actions";
import { BOX, CANVAS, CAT, FIELDS, LIBRARY, MOVES, NODES, SCENES, SEL, TEMPLATES, TOK, WIRES, templateName, type NodeKey } from "./flow";
import { ShootBar } from "./bar";
import { reviewCount } from "../tabs";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { ShopifyLogo } from "@/components/logos";
import type { ShootFlow, ShootSource } from "@/lib/db/schema";

type Check = { labelMatches: boolean; shapeExact: boolean; coloursOnBrand: boolean; noTextOrWatermark: boolean; note: string };
export type Shot = { id: string; kind: "image" | "video"; product: string | null; prompt: string | null; check: Check | null; edit: string | null; seconds: number | null; at: string };
type Product = { title: string; url: string; price: number | null; stock: number | null };
type Signal = { key: string; data: string; value: string | null; group: string; evidence: [string, string][] };
type Lesson = { dimension: string; lesson: string; evidence: string; strength: "Strong" | "Early" | "Weak" };
type Batch = { id: string; title: string; n: number; signal: string | null };
type Status = Partial<Record<NodeKey, "running" | "done" | "error">>;
type Edit = "remove-bg" | "extend" | "relight";

const passes = (c: Check | null) => Boolean(c && c.labelMatches && c.shapeExact && c.coloursOnBrand && c.noTextOrWatermark);
const flagOf = (c: Check | null) => (!c ? null : !c.labelMatches ? "label off" : !c.shapeExact ? "shape off" : !c.coloursOnBrand ? "colours off" : !c.noTextOrWatermark ? "added text" : null);
const usd = (n: number) => `$${n.toFixed(2)}`;
const agoFrom = (iso: string, now: number) => { const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000)); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const short = (t: string) => t.split(/[·(|,-]/)[0].trim().split(/\s+/).slice(0, 3).join(" ");
const joinSegs = (segs: { text: string }[]) => segs.reduce((acc, s) => acc + (acc && !/\s$/.test(acc) && !/^[\s,.;:!?)]/.test(s.text) ? " " : "") + s.text, "");
const asset = (id: string) => `/api/assets/${id}`;

// ---------------------------------------------------------------- small pieces (module level, per the lint rules)
function Tile({ k, size = 18, icon }: { k: NodeKey; size?: number; icon?: React.ReactNode }) {
  const d = NODES[k];
  return <span style={{ width: size, height: size, borderRadius: size > 20 ? 8 : 5, background: size > 20 ? "var(--tray)" : `${CAT[d.cat]}1A`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon ?? <Icon name={d.icon} size={size > 20 ? 15 : 11} color={CAT[d.cat]} />}</span>;
}

function Node({ k, title, on, onPick, status, children, icon }: { k: NodeKey; title: string; on: boolean; onPick: (k: NodeKey) => void; status?: Status[NodeKey]; children: React.ReactNode; icon?: React.ReactNode }) {
  const [x, y, w, h] = BOX[k];
  const d = NODES[k];
  return (
    <div role="button" tabIndex={0} aria-label={d.name} onClick={(e) => { e.stopPropagation(); onPick(k); }} onKeyDown={(e) => { if (e.key === "Enter") onPick(k); }} className="col"
      style={{ position: "absolute", left: x, top: y, width: w, height: h, background: "#fff", borderRadius: 12, overflow: "hidden", cursor: "pointer",
        boxShadow: on ? `0 0 0 2px ${SEL}, 0 10px 28px rgba(18,18,18,0.10)` : "0 0 0 1px var(--line), 0 4px 14px rgba(18,18,18,0.05)" }}>
      <div className="row g6" style={{ height: 30, padding: "0 10px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <Tile k={k} icon={icon} />
        <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.04em" }}>{d.kind}</span>
        <span className="xs w5 i1 fill ell">{title}</span>
        {status === "running" ? <Icon name="spinner" size={13} className="spin" color={SEL} /> : status === "error" ? <Icon name="warning-circle" size={13} color="#B7791F" /> : d.agent ? <AgentFace kind={d.agent} size={16} /> : null}
      </div>
      <div className="col g6" style={{ padding: "9px 10px", flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

function Tag({ t, color = "#8B8883" }: { t: string; color?: string }) {
  return <span className="row" style={{ height: 18, padding: "0 6px", borderRadius: 5, background: "var(--tray)", border: "1px solid var(--line)", fontSize: 10, color: "var(--ink-2)", whiteSpace: "nowrap", gap: 4 }}><span style={{ width: 5, height: 5, borderRadius: 99, background: color }} />{t}</span>;
}

function Field({ label, sub, children }: { label: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return <div className="col g4" style={{ flexShrink: 0 }}><span className="xs w5 i3">{label}</span>{children}{sub ? <span className="xs i3">{sub}</span> : null}</div>;
}

function Pills<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="row g4" role="radiogroup" aria-label={label} style={{ flexWrap: "wrap" }}>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={v === value} onClick={() => onChange(v)} className="row"
          style={{ height: 26, padding: "0 9px", borderRadius: 7, fontSize: 11.5, ...(v === value ? { background: "var(--ink)", color: "#fff" } : { border: "1px solid var(--line-2)", color: "var(--ink-2)", background: "#fff" }) }}>{l}</button>
      ))}
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ width: 28, height: 16, borderRadius: 99, background: on ? "#121212" : "var(--line-2)", position: "relative", flexShrink: 0 }}>
      <span style={{ position: "absolute", left: on ? 14 : 2, top: 2, width: 12, height: 12, borderRadius: 99, background: "#fff", transition: "left .15s" }} />
    </button>
  );
}

function Picker({ value, options, onChange, icon, label }: { value: string; options: [string, string][]; onChange: (v: string) => void; icon?: React.ReactNode; label: string }) {
  const cur = options.find(([v]) => v === value)?.[1] ?? "—";
  return (
    <label className="row g8" style={{ height: 34, padding: "0 10px", border: "1px solid var(--line-2)", borderRadius: 8, position: "relative", flexShrink: 0, cursor: "pointer" }}>
      {icon}<span className="sm i1 fill ell">{cur}</span><Icon name="chev-d" size={12} color="#8B8883" />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function Thumb({ id, w, h, kind = "image", flag, star, onClick, ring, title }: { id: string; w: number; h: number; kind?: "image" | "video"; flag?: string | null; star?: boolean; onClick?: () => void; ring?: boolean; title?: string }) {
  return (
    <button type="button" title={title} onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      style={{ position: "relative", width: w, height: h, borderRadius: 6, overflow: "hidden", flexShrink: 0, padding: 0, background: "var(--tray)", boxShadow: ring ? `0 0 0 2px ${SEL}` : "0 0 0 1px var(--line)", cursor: onClick ? "pointer" : "default" }}>
      {kind === "video"
        ? <video src={asset(id)} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <img src={asset(id)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      {kind === "video" && <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 20, height: 20, borderRadius: 99, background: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="play" size={9} weight="fill" color="#121212" /></span>}
      {flag && <span style={{ position: "absolute", left: 3, top: 3, height: 14, padding: "0 4px", borderRadius: 4, background: "#fff", color: "#B7791F", fontSize: 9, fontWeight: 600, display: "flex", alignItems: "center" }}>{flag}</span>}
      {star && <span style={{ position: "absolute", right: 3, top: 3, width: 16, height: 16, borderRadius: 99, background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="star" size={9} weight="fill" color="#B7791F" /></span>}
    </button>
  );
}

function Pending({ w, h, label }: { w: number; h: number; label: string }) {
  return <div className="col" style={{ width: w, height: h, borderRadius: 6, background: "rgba(247,246,244,0.85)", boxShadow: "0 0 0 1px var(--line)", alignItems: "center", justifyContent: "center", gap: 3, flexShrink: 0 }}><AgentFace kind="builder" size={16} /><span style={{ fontSize: 9.5, color: "var(--ink-2)" }}>{label}</span></div>;
}

function Port({ x, y, color, filled }: { x: number; y: number; color: string; filled?: boolean }) {
  return <span style={{ position: "absolute", left: x - 5, top: y - 5, width: 10, height: 10, borderRadius: 99, background: filled ? color : "#fff", boxShadow: `0 0 0 1.5px ${color}`, pointerEvents: "none" }} />;
}

function Segments({ segs }: { segs: { text: string; source: ShootSource }[] }) {
  return <>{segs.map((s, i) => {
    const gap = i > 0 && !/\s$/.test(segs[i - 1].text) && !/^[\s,.;:!?)]/.test(s.text) ? " " : "";
    return <span key={i}>{gap}{s.source === "none" ? s.text : <span style={{ color: "var(--ink)", borderBottom: `2px solid ${TOK[s.source]}` }}>{s.text}</span>}</span>;
  })}</>;
}

// ---------------------------------------------------------------- the studio
export function ShootStudio(props: {
  slug: string; base: string; brand: string; currency: string; autoRun: boolean; initial: ShootFlow; preset: boolean; savedAt: string | null; savedBy: string | null;
  perImage: number; perVideoSecond: number; month: { photos: number; clips: number; cost: number }; toReview: number;
  batches: Batch[]; signals: Signal[]; palette: string[]; look: string | null; tone: string | null; lessons: Lesson[]; products: Product[]; refs: { id: string; name: string }[]; shots: Shot[];
}) {
  const { slug, base, perImage, perVideoSecond, products, signals, shots, batches, refs } = props;
  const router = useRouter();
  const pathname = usePathname();
  const [flow, setFlow] = useState<ShootFlow>(props.initial);
  const [past, setPast] = useState<ShootFlow[]>([]);
  const [sel, setSel] = useState<NodeKey>("data");
  const [tool, setTool] = useState<"select" | "hand">("select");
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState<Status>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ at: string | null; by: string | null; saving: boolean }>({ at: props.savedAt, by: props.savedBy, saving: false });
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [newRule, setNewRule] = useState("");
  const [sent, setSent] = useState<{ batch: string; ad: string | null } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, start] = useTransition();
  const flowRef = useRef(flow);
  const dirty = useRef(props.preset); // a handoff preset (?batch=…&signal=…) is saved straight away
  const view = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const pan = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const ran = useRef(false);

  // ---- derived
  const product = products.find((p) => p.url === flow.product) ?? products[0] ?? null;
  const signal = signals.find((s) => s.key === flow.template) ?? null;
  const has = (k: NodeKey) => !flow.off.includes(k);
  const byId = new Map(shots.map((s) => [s.id, s]));
  const lessons = props.lessons.filter((l) => !flow.strongOnly || l.strength === "Strong");
  const lastPhotos = flow.last?.photos ?? [];
  const lastClips = flow.last?.clips ?? [];
  const checked = lastPhotos.map((id) => byId.get(id)).filter((s): s is Shot => Boolean(s));
  const passed = checked.filter((s) => passes(s.check)).map((s) => s.id);
  const picked = (flow.picked ?? passed).filter((id) => lastPhotos.includes(id) || byId.has(id));
  const best = passed[0] ?? lastPhotos[0] ?? null;
  const startFrame = flow.video.from && byId.has(flow.video.from) ? flow.video.from : best;
  const photosCost = flow.n * perImage;
  const videoCost = has("video") ? flow.video.seconds * perVideoSecond * flow.video.n : 0;
  const runCost = photosCost + videoCost;
  const rules = flow.rules.filter((r) => r.on).map((r) => r.text);
  const inputsKey = JSON.stringify([product?.title, flow.template, rules, flow.brandRules, flow.strict, lessons.map((l) => l.lesson), has("reference") ? flow.reference?.note : null, flow.scene, flow.length]);
  const stale = Boolean(flow.prompt) && flow.promptFor !== inputsKey;
  const changed = Boolean(flow.rerun && flow.last?.value && signal?.value && signal.value !== flow.last.value);
  const name = `${templateName(flow.template)}${product ? ` · ${short(product.title)}` : ""}`;
  const batchOpts = [...batches].sort((a, b) => Number(b.signal === flow.template) - Number(a.signal === flow.template));
  const target = batches.find((b) => b.id === flow.send) ?? null;
  const nextStep = sent && sent.batch === flow.send && sent.ad ? `${base}/creative/editor?ad=${sent.ad}` : null;

  // ---- flow edits: undoable, saved for the whole team a moment later
  const update = (fn: (f: ShootFlow) => ShootFlow, undoable = true) => {
    setFlow((f) => {
      const next = fn(f);
      if (undoable) setPast((p) => [...p.slice(-29), f]);
      return next;
    });
    dirty.current = true;
  };
  const patch = (p: Partial<ShootFlow>, undoable = true) => update((f) => ({ ...f, ...p }), undoable);
  const undo = () => { const prev = past.at(-1); if (!prev) return; setPast(past.slice(0, -1)); setFlow(prev); dirty.current = true; };

  useEffect(() => { flowRef.current = flow; }, [flow]);
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      setSaved((s) => ({ ...s, saving: true }));
      saveFlow(slug, flowRef.current).then((r) => setSaved({ at: r.at, by: null, saving: false })).catch(() => setSaved((s) => ({ ...s, saving: false })));
    }, 700);
    return () => clearTimeout(t);
  }, [flow, slug]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  // Fit the board to the canvas width (never above 100%).
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setZoom((z) => (z === 1 || z < 0.6 ? Math.max(0.6, Math.min(1, Math.floor(((e.contentRect.width - 24) / CANVAS.w) * 20) / 20)) : z)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- running
  const mark = (k: NodeKey, v: Status[NodeKey]) => setStatus((s) => ({ ...s, [k]: v }));
  const fail = (k: NodeKey, m: string) => { mark(k, "error"); setMsg(m); };

  const write = async (): Promise<string | null> => {
    if (!product) return null;
    mark("prompt", "running");
    const f = flowRef.current;
    const r = await suggestPrompt(slug, {
      product: product.title, scene: f.scene, length: f.length, signal: signal ? { data: signal.data, value: signal.value, evidence: signal.evidence } : null,
      rules, brandRules: f.brandRules, strict: f.strict, lessons: lessons.map((l) => `${l.dimension}: ${l.lesson}`),
      reference: has("reference") && f.reference ? { note: f.reference.note, close: f.reference.close } : null,
    });
    if (!r.out) { fail("prompt", r.error ?? "Remy couldn’t write the prompt."); return null; }
    const text = joinSegs(r.out.segments);
    patch({ prompt: text, segments: r.out.segments, promptFor: inputsKey, ...(f.rules.length ? {} : { rules: r.out.rules.map((t) => ({ text: t, on: true })) }) }, false);
    mark("prompt", "done");
    return text;
  };

  const photosAndChecks = async (text: string, n: number): Promise<{ ids: string[]; flagged: number } | null> => {
    if (!product) return null;
    mark("photo", "running");
    const r = await runShoot(slug, { product: product.title, imageUrl: product.url, prompt: text, aspect: flowRef.current.aspect, n });
    if (!r.ids?.length) { fail("photo", r.error ?? "No photos came back."); return null; }
    if (r.error) setMsg(r.error);
    mark("photo", "done");
    router.refresh();
    if (!has("check")) return { ids: r.ids, flagged: 0 };
    mark("check", "running");
    const checks = await Promise.all(r.ids.map((id) => runCheck(slug, id, product.url, product.title)));
    mark("check", checks.some((c) => !c.check) ? "error" : "done");
    router.refresh();
    return { ids: r.ids, flagged: checks.filter((c) => c.check && !passes(c.check)).length };
  };

  const clips = async (text: string, from: string | null): Promise<string[]> => {
    if (!from) { fail("video", "Make photos first — a clip starts from one."); return []; }
    mark("video", "running");
    const f = flowRef.current;
    const move = MOVES.find(([m]) => m === f.video.move)?.[1] ?? "";
    const out = await Promise.all(Array.from({ length: f.video.n }, () => runVideo(slug, { fromAssetId: from, prompt: `${move} ${text}`.slice(0, 1200), seconds: f.video.seconds, aspect: f.video.aspect })));
    const ids = out.flatMap((o) => (o.id ? [o.id] : []));
    if (!ids.length) fail("video", out[0]?.error ?? "No clip came back."); else { mark("video", "done"); if (out.some((o) => o.error)) setMsg(out.find((o) => o.error)!.error!); }
    router.refresh();
    return ids;
  };

  /** Run flow: Remy's prompt → photos → Otto's checks → a clip from the best photo. */
  const runFlow = () => start(async () => {
    if (!product) { setMsg("Sync products with photos from Shopify first."); return; }
    setMsg(null); setStatus({});
    const f = flowRef.current;
    const text = f.prompt.trim().length >= 10 && f.promptFor === inputsKey ? f.prompt : await write();
    if (!text) return;
    const p = await photosAndChecks(text, f.n);
    if (!p) return;
    patch({ picked: null, last: { at: new Date().toISOString(), photos: p.ids, clips: [], flagged: p.flagged, cost: p.ids.length * perImage, value: signal?.value ?? null } }, false);
    if (has("video")) {
      // The clip starts from the best photo Otto passed (we only know after the checks land).
      const ids = await clips(text, f.video.from && p.ids.includes(f.video.from) ? f.video.from : p.ids[0]);
      update((g) => ({ ...g, last: g.last ? { ...g.last, clips: ids, cost: g.last.cost + ids.length * g.video.seconds * perVideoSecond } : g.last }), false);
    }
    setNow(Date.now());
  });

  const runPhotoNode = () => start(async () => {
    setMsg(null);
    const text = flowRef.current.prompt.trim().length >= 10 && !stale ? flowRef.current.prompt : await write();
    if (!text) return;
    const p = await photosAndChecks(text, flowRef.current.n);
    if (p) patch({ picked: null, last: { at: new Date().toISOString(), photos: p.ids, clips: lastClips, flagged: p.flagged, cost: p.ids.length * perImage, value: signal?.value ?? null } }, false);
  });
  const runVideoNode = () => start(async () => {
    setMsg(null);
    const text = flowRef.current.prompt || `${product?.title ?? "The product"} in a calm everyday scene.`;
    const ids = await clips(text, startFrame);
    if (ids.length) update((g) => ({ ...g, last: { at: new Date().toISOString(), photos: g.last?.photos ?? [], clips: [...ids, ...(g.last?.clips ?? [])].slice(0, 6), flagged: g.last?.flagged ?? 0, cost: (g.last?.cost ?? 0) + ids.length * g.video.seconds * perVideoSecond, value: g.last?.value ?? null } }), false);
  });
  const rerunOne = (id: string) => start(async () => {
    setMsg(null);
    const p = await photosAndChecks(flowRef.current.prompt, 1);
    if (p) update((g) => ({ ...g, picked: null, last: g.last ? { ...g.last, photos: g.last.photos.map((x) => (x === id ? p.ids[0] : x)), flagged: Math.max(0, g.last.flagged - 1 + p.flagged), cost: g.last.cost + perImage } : g.last }), false);
  });
  const recheck = (id: string) => start(async () => {
    if (!product) return;
    mark("check", "running");
    const r = await runCheck(slug, id, product.url, product.title);
    mark("check", r.check ? "done" : "error");
    if (r.error) setMsg(r.error);
    router.refresh();
  });
  const edit = (id: string, kind: Edit) => start(async () => {
    setMsg(null); mark("photo", "running");
    const r = await runEdit(slug, id, kind);
    if (!r.id) { fail("photo", r.error ?? "The edit failed."); return; }
    mark("photo", "done");
    update((g) => ({ ...g, last: g.last ? { ...g.last, photos: [r.id!, ...g.last.photos].slice(0, 8), cost: g.last.cost + perImage } : { at: new Date().toISOString(), photos: [r.id!], clips: [], flagged: 0, cost: perImage, value: signal?.value ?? null } }), false);
    setFocus(r.id); router.refresh();
  });
  const send = () => start(async () => {
    const r = await sendShots(slug, picked, flow.send);
    if (flow.send && r.done) setSent({ batch: flow.send, ad: r.firstAd ?? null });
    setMsg(r.error ?? (flow.send ? `${r.done} photo${r.done === 1 ? " is" : "s are"} now the ads’ photos in “${target?.title}”.` : `${r.done} photo${r.done === 1 ? "" : "s"} kept in brand assets — they’re in the Editor’s Media panel.`));
    router.refresh();
  });
  const design = (id: string) => start(() => designFromShot(slug, id));
  const pickReference = (id: string) => start(async () => {
    patch({ reference: { id, note: "Remy is reading this photo…", close: flowRef.current.reference?.close ?? false } });
    const r = await readReference(slug, id);
    update((g) => ({ ...g, reference: { id, note: r.note ?? r.error ?? "", close: g.reference?.close ?? false } }), false);
  });

  // Started from the node-types page's Run flow.
  useEffect(() => {
    if (!props.autoRun || ran.current) return;
    ran.current = true;
    router.replace(pathname);
    runFlow();
  });

  const pickNode = (k: NodeKey) => { setSel(k); setMenu(false); };
  const addNode = (k: NodeKey) => { if (!has(k)) patch({ off: flow.off.filter((x) => x !== k) }); pickNode(k); };
  const removeNode = (k: NodeKey) => { patch({ off: [...flow.off, k] }); setSel("prompt"); setMenu(false); };

  // ---------------------------------------------------------------- left: node library
  const q = query.trim().toLowerCase();
  const library = (
    <aside className="col" style={{ width: 212, flexShrink: 0, borderRight: "1px solid var(--line)", background: "#fff", padding: "12px 10px", gap: 2, overflowY: "auto" }} aria-label="Nodes">
      <div className="row between" style={{ padding: "0 6px 6px", flexShrink: 0 }}><span className="sm w5">Nodes</span><Link className="lnk xs i2 row g4" href={`${base}/creative/shoots/nodes`}>What each does<Icon name="arrow-r" size={11} color="#55534F" /></Link></div>
      <label className="input sm" style={{ height: 30, margin: "0 2px 4px", flexShrink: 0 }}>
        <Icon name="search" size={13} color="#8B8883" />
        <input ref={search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Add a node" aria-label="Add a node" style={{ border: 0, outline: 0, background: "transparent", font: "inherit", fontSize: 12, width: "100%" }} />
      </label>
      {LIBRARY.map(([g, c, keys]) => {
        const rows = keys.filter((k) => !q || `${NODES[k].name} ${NODES[k].does}`.toLowerCase().includes(q));
        if (!rows.length && !(g === "Make" && (!q || "edit remove bg extend relight".includes(q)))) return null;
        return (
          <div key={g} className="col" style={{ gap: 2 }}>
            <span className="row g6" style={{ fontSize: 10.5, fontWeight: 500, color: "var(--ink-3)", padding: "6px 6px 2px" }}><span className="dot" style={{ width: 6, height: 6, background: CAT[c] }} />{g}</span>
            {rows.map((k) => (
              <button key={k} type="button" onClick={() => addNode(k)} className="row g8 hv" title={has(k) ? `Select ${NODES[k].name}` : `Add ${NODES[k].name} to the canvas`}
                style={{ height: 38, padding: "0 6px", borderRadius: 8, flexShrink: 0, textAlign: "left", background: sel === k ? "var(--tray)" : undefined }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: `${CAT[c]}1A`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={NODES[k].icon} size={13} color={CAT[c]} /></span>
                <span className="col fill" style={{ minWidth: 0 }}><span className="xs w5 i1">{NODES[k].name}</span><span className="i3 ell" style={{ fontSize: 10.5 }}>{NODES[k].lib}</span></span>
                <Icon name="plus" size={12} color="#B5B2AC" />
              </button>
            ))}
            {g === "Make" && (!q || "edit remove bg extend relight".includes(q)) && <>
              <span className="row g6" style={{ fontSize: 10.5, fontWeight: 500, color: "var(--ink-3)", padding: "6px 6px 2px" }}><span className="dot" style={{ width: 6, height: 6, background: CAT.edit }} />Edit</span>
              <div className="row g4" style={{ flexWrap: "wrap", padding: "2px 6px 4px" }}>
                {([["remove-bg", "Remove bg"], ["extend", "Extend"], ["relight", "Relight"], [null, "Upscale"], [null, "Recut"]] as const).map(([k, l]) => (
                  <button key={l} type="button" disabled={!k} title={k ? `${l} a photo — pick one in the Photo panel` : "Not available yet"} onClick={() => { setSel("photo"); if (!focus && lastPhotos[0]) setFocus(lastPhotos[0]); }}
                    className="row" style={{ height: 22, padding: "0 7px", borderRadius: 6, border: "1px solid var(--line-2)", fontSize: 10.5, color: k ? "var(--ink-2)" : "var(--ink-4)", whiteSpace: "nowrap", background: "#fff" }}>{l}</button>
                ))}
              </div>
            </>}
          </div>
        );
      })}
    </aside>
  );

  // ---------------------------------------------------------------- canvas
  const ports: React.ReactNode[] = [];
  const paths: React.ReactNode[] = [];
  const outP = (k: NodeKey, dy?: number) => { const [x, y, w, h] = BOX[k]; return [x + w, y + (dy ?? h / 2)] as const; };
  const inP = (k: NodeKey, dy?: number | null) => { const [x, y, , h] = BOX[k]; return [x, y + (dy ?? h / 2)] as const; };
  WIRES.forEach(([a, b, dy, kind], i) => {
    if (!has(a) || !has(b)) return;
    const [x1, y1] = outP(a); const [x2, y2] = inP(b, dy);
    const hot = sel === a || sel === b;
    const col = hot ? SEL : kind === "make" || kind === "fin" ? "#C9C5BF" : TOK[kind];
    paths.push(<path key={`w${i}`} d={`M${x1} ${y1} C${x1 + 42} ${y1}, ${x2 - 42} ${y2}, ${x2} ${y2}`} stroke={col} strokeWidth={hot ? 2.2 : 1.5} fill="none" strokeLinecap="round" strokeOpacity={hot || kind === "make" || kind === "fin" ? 1 : 0.75} />);
    ports.push(<Port key={`a${i}`} x={x1} y={y1} color={col} filled={hot} />, <Port key={`b${i}`} x={x2} y={y2} color={col} filled={hot} />);
  });
  const drop = (a: NodeKey, b: NodeKey, key: string) => {
    if (!has(a) || !has(b)) return;
    const [ax, ay, aw, ah] = BOX[a]; const [, by] = BOX[b];
    const x = ax + aw / 2; const hot = sel === b && a === "photo";
    const col = hot ? SEL : "#C9C5BF";
    paths.push(<path key={key} d={`M${x} ${ay + ah} L${x} ${by}`} stroke={col} strokeWidth={hot ? 2.2 : 1.5} fill="none" />);
    ports.push(<Port key={`${key}a`} x={x} y={ay + ah} color={col} filled={hot} />, <Port key={`${key}b`} x={x} y={by} color={col} filled={hot} />);
  };
  drop("photo", "video", "start"); drop("check", "send", "send");
  {
    const [x1, y1] = outP("product", 40); const [x2, y2] = inP("photo", 40);
    paths.push(<path key="lock" d={`M${x1} ${y1} C${x1 + 90} ${y1}, ${x2 - 90} ${y2}, ${x2} ${y2}`} stroke={TOK.product} strokeWidth={1.5} strokeDasharray="4 4" fill="none" />);
    ports.push(<Port key="lockp" x={x2} y={y2} color={TOK.product} />);
  }
  const height = has("reference") ? CANVAS.hRef : CANVAS.h;
  const numMatch = signal?.value?.match(/^([\d.,]+%?)\s+(.*)$/);
  // "2,987 bought 60–180 days ago" → 2,987 people · bought 60–180 days ago (customer signals count people).
  const people = signal?.group === "Customers";
  const unit = numMatch ? (people ? "people" : numMatch[2].split(/\s+/)[0]) : "";
  const rest = numMatch ? (people ? numMatch[2] : numMatch[2].split(/\s+/).slice(1).join(" ")) : "";
  const swatches = props.palette.length ? props.palette.slice(0, 5) : [];
  const checkRows: [string, (c: Check) => boolean][] = [[`Label matches ${product ? short(product.title) : "the product"}`, (c) => c.labelMatches], ["Shape exact", (c) => c.shapeExact], ["Colours on-brand", (c) => c.coloursOnBrand], ["No text or watermark", (c) => c.noTextOrWatermark]];
  const withCheck = checked.filter((s) => s.check);

  const canvas = (
    <section className="col fill" style={{ minWidth: 0, background: "#fff" }} aria-label="Canvas">
      <div className="row g10" style={{ height: 44, flexShrink: 0, padding: "0 14px", borderBottom: "1px solid var(--line)", background: "#fff" }}>
        <div className="row g2" style={{ padding: 3, borderRadius: 9, background: "var(--tray)" }}>
          {([["pointer", "select", "Select"], ["hand", "hand", "Pan the canvas"], ["plus", "plus", "Add a node"]] as const).map(([i, k, l]) => {
            const on = k === tool;
            return <button key={k} type="button" title={l} aria-label={l} aria-pressed={on} onClick={() => (k === "plus" ? search.current?.focus() : setTool(k))}
              style={{ width: 28, height: 26, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", ...(on ? { background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" } : {}) }}><Icon name={i} size={14} color={on ? "#121212" : "#8B8883"} /></button>;
          })}
        </div>
        <button type="button" className="hv" title="Undo" aria-label="Undo" disabled={!past.length} onClick={undo} style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", opacity: past.length ? 1 : 0.4 }}><Icon name="undo" size={14} color="#55534F" /></button>
        <label className="chip" style={{ height: 28, fontSize: 12, position: "relative" }}>
          <Icon name="layers" size={13} />Template<span className="v">{templateName(flow.template)}</span><Icon name="chev-d" size={11} color="#8B8883" />
          <select aria-label="Template" value={flow.template ?? ""} onChange={(e) => patch({ template: e.target.value || null, rules: [], segments: null })} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>
            {signals.filter((s) => TEMPLATES[s.key]).map((s) => <option key={s.key} value={s.key}>{TEMPLATES[s.key]} — {s.data}</option>)}
            <option value="">Product shoot — no data signal</option>
          </select>
        </label>
        <span className="row g6 xs i3" title={saved.by ? `Last saved by ${saved.by}` : undefined}>
          {saved.saving ? <><Icon name="spinner" size={12} className="spin" />Saving…</> : <><Icon name="check-circle" size={12} weight="fill" color="#1F8A5B" />Saved · {flow.last ? `ran ${agoFrom(flow.last.at, now)}` : "not run yet"}</>}
        </span>
        <div className="fill" />
        {msg && <span className="xs c-amber ell" style={{ maxWidth: 260 }} title={msg}>{msg}</span>}
        <span className="row g6 xs i2">{([["in", "Inputs"], ["make", "Make"], ["fin", "Finish"]] as const).map(([c, t]) => <span key={c} className="row g4"><span className="dot" style={{ width: 6, height: 6, background: CAT[c] }} />{t}</span>)}</span>
        <span className="row g6 xs i3 tnum">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} style={{ display: "flex" }}><Icon name="minus" size={12} color="#8B8883" /></button>
          {Math.round(zoom * 100)}%
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))} style={{ display: "flex" }}><Icon name="plus" size={12} color="#8B8883" /></button>
        </span>
      </div>
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <div ref={view} onClick={() => setMenu(false)}
          onPointerDown={(e) => { if (tool === "hand" && view.current) { pan.current = { x: e.clientX, y: e.clientY, l: view.current.scrollLeft, t: view.current.scrollTop }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } }}
          onPointerMove={(e) => { if (pan.current && view.current) { view.current.scrollLeft = pan.current.l - (e.clientX - pan.current.x); view.current.scrollTop = pan.current.t - (e.clientY - pan.current.y); } }}
          onPointerUp={() => { pan.current = null; }}
          style={{ position: "absolute", inset: 0, overflow: "auto", backgroundColor: "#F3F2EF", backgroundImage: "radial-gradient(#DEDBD6 1px, transparent 1px)", backgroundSize: "18px 18px", cursor: tool === "hand" ? "grab" : "default" }}>
          <div style={{ width: CANVAS.w * zoom, height: (height + 70) * zoom }}>
            <div style={{ position: "relative", width: CANVAS.w, height, transform: `scale(${zoom})`, transformOrigin: "top left", pointerEvents: tool === "hand" ? "none" : undefined }}>
              <svg width={CANVAS.w} height={height} style={{ position: "absolute", left: 0, top: 0 }} aria-hidden>{paths}</svg>
              <span className="row g4" style={{ position: "absolute", left: 268, top: 24, fontSize: 10, color: "#1F8A5B", background: "#F3F2EF", padding: "0 4px" }}><Icon name="lock" size={10} color="#1F8A5B" />product photos as reference</span>

              <Node k="product" title={product ? short(product.title) : "Pick a product"} on={sel === "product"} onPick={pickNode} icon={<ShopifyLogo size={11} />}>
                {product ? <>
                  <div className="row g8"><img src={product.url} alt="" width={44} height={44} style={{ borderRadius: 6, objectFit: "cover", boxShadow: "0 0 0 1px var(--line)", flexShrink: 0 }} />
                    <div className="col" style={{ minWidth: 0 }}><span className="xs w5 i1" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{product.title}</span>
                      <span className="xs i3">{product.price != null ? new Intl.NumberFormat("en", { style: "currency", currency: props.currency }).format(product.price) : "no price"}{product.stock != null ? ` · ${product.stock} in stock` : ""}</span></div></div>
                  <div className="row g4" style={{ flexWrap: "wrap" }}><Tag t="Shopify photo" color={TOK.product} /><Tag t="price" color={TOK.product} /><Tag t="stock" color={TOK.product} /></div>
                  <span className="row g4 xs i3"><Icon name="lock" size={11} color="#1F8A5B" />label + shape locked</span>
                </> : <span className="xs i3" style={{ lineHeight: "16px" }}>No product photos yet — they come from Shopify on the next sync.</span>}
              </Node>

              <Node k="data" title={signal?.data ?? "No signal"} on={sel === "data"} onPick={pickNode}>
                {signal ? <>
                  {numMatch ? <span className="h3 tnum" style={{ lineHeight: "24px" }}>{numMatch[1]} <span className="xs i3" style={{ fontWeight: 400 }}>{unit}</span></span> : null}
                  <span className="xs i2" style={{ lineHeight: "16px", display: "-webkit-box", WebkitLineClamp: numMatch ? 2 : 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{numMatch ? rest || signal.evidence[0]?.join(" · ") : signal.value}</span>
                  {changed ? <span className="row g4 xs c-amber" style={{ marginTop: "auto" }}><Icon name="warning-circle" size={11} />changed since the last run</span>
                    : <span className="row g4 xs i3" style={{ marginTop: "auto" }}><ShopifyLogo size={10} />{signal.group.toLowerCase()} · live</span>}
                </> : <span className="xs i3" style={{ lineHeight: "16px" }}>A general product shoot. Pick a template to aim it at the people in a signal.</span>}
              </Node>

              <Node k="brand" title={`${props.brand} kit`} on={sel === "brand"} onPick={pickNode}>
                <div className="row g4">{swatches.map((c) => <span key={c} style={{ width: 14, height: 14, borderRadius: 99, background: c, boxShadow: "0 0 0 1px var(--line)" }} />)}{props.look && <span className="xs i2 ell" style={{ marginLeft: 4 }}>{props.look}</span>}{!swatches.length && !props.look && <span className="xs i3">No palette yet</span>}</div>
                <span className="xs i2 ell">{props.tone ?? "Tone from the brand profile"}</span>
                <span className="xs i3 ell">{flow.brandRules.join(" · ") || "no rules"}{flow.strict ? "" : " · loose"}</span>
              </Node>

              <Node k="wins" title={lessons.length ? "From Insights" : "What wins"} on={sel === "wins"} onPick={pickNode}>
                {lessons.length ? lessons.slice(0, 4).map((l) => (
                  <div key={l.lesson} className="row between g6" title={`${l.lesson} — ${l.evidence}`}><span className="xs i2 ell">{l.lesson}</span><span className={`xs w5 ${l.strength === "Strong" ? "c-green" : "i3"}`} style={{ flexShrink: 0 }}>{l.strength === "Strong" ? "strong" : "early"}</span></div>
                )) : <span className="xs i3" style={{ lineHeight: "16px" }}>Iris writes these once Insights has read the brand’s live ads.</span>}
              </Node>

              {has("reference") && (
                <Node k="reference" title={flow.reference ? "Brand photo" : "Pick a photo"} on={sel === "reference"} onPick={pickNode}>
                  {flow.reference ? <div className="row top g8"><Thumb id={flow.reference.id} w={40} h={40} /><span className="xs i2" style={{ lineHeight: "15px", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{flow.reference.note}</span></div>
                    : <span className="xs i3" style={{ lineHeight: "16px" }}>Pick a brand photo in the panel — Remy borrows its style, light and pose.</span>}
                </Node>
              )}

              <Node k="prompt" title="by Remy" on={sel === "prompt"} onPick={pickNode} status={status.prompt === "running" ? "running" : undefined}>
                <span className="xs i2" style={{ lineHeight: "20px", overflow: "hidden", flex: 1, minHeight: 0 }}>
                  {flow.segments && flow.prompt === joinSegs(flow.segments) ? <Segments segs={flow.segments} /> : flow.prompt || <span className="i3">Run the flow and Remy writes this from the inputs — or write the scene yourself in the panel.</span>}
                </span>
                {stale && <span className="xs c-amber">Inputs changed — Remy rewrites it on the next run.</span>}
                <div className="row g8" style={{ flexWrap: "wrap" }}>{(["product", "data", "brand", "wins"] as const).map((k) => <span key={k} className="row g4" style={{ fontSize: 10, color: "var(--ink-3)" }}><span style={{ width: 8, height: 2, background: TOK[k] }} />{k === "wins" ? "Wins" : k[0].toUpperCase() + k.slice(1)}</span>)}</div>
                <button type="button" disabled={busy || !product} onClick={(e) => { e.stopPropagation(); setSel("prompt"); start(async () => { await write(); }); }} className="row g4 xs i2" style={{ paddingTop: 6, borderTop: "1px solid var(--line)", textAlign: "left" }}>
                  <Icon name="refresh" size={11} color="#55534F" />{flow.prompt ? "Rewrite" : "Write"} · edit by hand</button>
              </Node>

              {has("sound") && (
                <Node k="sound" title="Voice + music" on={sel === "sound"} onPick={pickNode}>
                  <div className="row between"><span className="xs i2">Voice</span><span className="xs i3">—</span></div>
                  <div className="row between"><span className="xs i2">Music</span><span className="xs i3">—</span></div>
                  <span className="xs i3">ElevenLabs · not connected yet</span>
                </Node>
              )}

              <Node k="photo" title="FLUX Kontext" on={sel === "photo"} onPick={pickNode} status={status.photo === "running" ? "running" : status.photo === "error" ? "error" : undefined}>
                <span className="xs i3">{flow.scene} · {flow.aspect} · × {flow.n}</span>
                <div className="row top" style={{ flexWrap: "wrap", gap: 6 }}>
                  {status.photo === "running" ? Array.from({ length: Math.min(4, flow.n) }, (_, i) => <Pending key={i} w={82} h={74} label="making" />)
                    : lastPhotos.length ? lastPhotos.slice(0, 4).map((id) => byId.has(id)
                      ? <Thumb key={id} id={id} w={82} h={74} star={id === passed[0]} flag={flagOf(byId.get(id)!.check)} onClick={() => design(id)} title="Open in the Editor" />
                      : <Pending key={id} w={82} h={74} label="loading" />)
                    : <div className="col" style={{ width: 170, height: 154, borderRadius: 8, border: "1px dashed var(--line-2)", alignItems: "center", justifyContent: "center", gap: 4, textAlign: "center", padding: 10 }}>
                        <Icon name="image" size={18} color="#B5B2AC" /><span className="xs i3">Photos land here. Each keeps the real product.</span></div>}
                </div>
                <span className="row between xs i3" style={{ marginTop: "auto" }}><span>{usd(photosCost)}</span>
                  {status.photo === "running" ? <span style={{ color: "#1A8FAB" }}>making {flow.n}…</span> : flow.last && lastPhotos.length ? <span className="c-green">done · {agoFrom(flow.last.at, now)}</span> : <span>not run yet</span>}</span>
              </Node>

              {has("video") && (
                <Node k="video" title="Kling" on={sel === "video"} onPick={pickNode} status={status.video === "running" ? "running" : status.video === "error" ? "error" : undefined}>
                  <span className="xs i3">{flow.video.move} · {flow.video.seconds}s · {flow.video.aspect} · × {flow.video.n}</span>
                  <div className="row g4 xs i2"><Icon name="arrow-r" size={11} color="#8B8883" />start frame: {startFrame ? `Photo ${Math.max(1, lastPhotos.indexOf(startFrame) + 1)}` : "the best photo"}</div>
                  <div className="row g6">
                    {status.video === "running" && <Pending w={56} h={104} label="rendering" />}
                    {lastClips.slice(0, status.video === "running" ? 2 : 3).map((id) => byId.has(id) ? <Thumb key={id} id={id} w={56} h={104} kind="video" onClick={() => { setSel("video"); setFocus(id); }} /> : <Pending key={id} w={56} h={104} label="loading" />)}
                    {!lastClips.length && status.video !== "running" && <div className="col" style={{ width: 172, height: 104, borderRadius: 8, border: "1px dashed var(--line-2)", alignItems: "center", justifyContent: "center", gap: 4, textAlign: "center", padding: 8 }}>
                      <Icon name="video" size={16} color="#B5B2AC" /><span className="xs i3">A 5–10 s clip from the best photo.</span></div>}
                  </div>
                  <span className="row between xs i3" style={{ marginTop: "auto" }}><span>{usd(videoCost)}</span>{status.video === "running" ? <span style={{ color: "#1A8FAB" }}>{flow.video.n} rendering</span> : lastClips.length ? <span className="c-green">{lastClips.length} made</span> : <span>1–3 min each</span>}</span>
                </Node>
              )}

              <Node k="check" title="Otto" on={sel === "check"} onPick={pickNode} status={status.check === "running" ? "running" : undefined} icon={undefined}>
                {withCheck.length ? <>
                  {checkRows.map(([t, ok]) => { const good = withCheck.every((s) => ok(s.check!)); return <div key={t} className="row g6"><Icon name={good ? "check-circle" : "info"} size={12} weight={good ? "fill" : "regular"} color={good ? "#1F8A5B" : "#B7791F"} /><span className={`xs ell ${good ? "i2" : "c-amber"}`}>{t}</span></div>; })}
                  {checked.map((s, i) => !passes(s.check) && s.check ? <button key={s.id} type="button" onClick={(e) => { e.stopPropagation(); rerunOne(s.id); }} disabled={busy} className="row g6 xs c-amber" style={{ textAlign: "left" }}><Icon name="info" size={12} color="#B7791F" />Photo {i + 1}: {flagOf(s.check)} → re-run</button> : null).filter(Boolean).slice(0, 2)}
                </> : <span className="xs i3" style={{ lineHeight: "16px" }}>Label · shape · colours · no added text. Otto checks every photo against the real product.</span>}
              </Node>

              <Node k="send" title="Where results go" on={sel === "send"} onPick={pickNode}>
                <div className="col g4" onClick={(e) => e.stopPropagation()}>
                  {batchOpts.slice(0, 2).map((b) => (
                    <label key={b.id} className="row g6" style={{ cursor: "pointer" }}><input type="radio" name="send-node" checked={flow.send === b.id} onChange={() => patch({ send: b.id })} style={{ accentColor: "#121212", margin: 0 }} />
                      <span className={`xs fill ell ${flow.send === b.id ? "w5 i1" : "i2"}`} title={b.title}>{b.title}</span>{flow.send === b.id && <span className="xs i3">{picked.length} ready</span>}</label>
                  ))}
                  <label className="row g6" style={{ cursor: "pointer" }}><input type="radio" name="send-node" checked={flow.send === null} onChange={() => patch({ send: null })} style={{ accentColor: "#121212", margin: 0 }} />
                    <span className={`xs fill ${flow.send === null ? "w5 i1" : "i2"}`}>Brand assets</span>{flow.send === null && <span className="xs i3">{picked.length} ready</span>}</label>
                </div>
                {nextStep ? <Link className="btn dark sm" href={nextStep} onClick={(e) => e.stopPropagation()} style={{ height: 26, justifyContent: "center", marginTop: "auto" }}>Next: design in Editor<Icon name="arrow-r" size={11} color="#fff" /></Link>
                  : <button type="button" className="btn dark sm" disabled={busy || !picked.length} onClick={(e) => { e.stopPropagation(); send(); }} style={{ height: 26, justifyContent: "center", marginTop: "auto" }}>
                  {flow.send ? `Send ${picked.length} to batch` : `Keep ${picked.length} in assets`}</button>}
              </Node>
              {ports}
            </div>
          </div>
        </div>
        <div className="row g8" style={{ position: "absolute", left: 18, bottom: 16, padding: "8px 12px", background: "#fff", borderRadius: 10, boxShadow: "0 0 0 1px var(--line)", maxWidth: "calc(100% - 36px)" }}>
          <AgentFace kind="builder" size={18} mood={busy ? "focus" : "happy"} />
          {busy ? <span className="xs i2"><span className="w5 i1">Running:</span> {status.prompt === "running" ? "Remy is writing the prompt…" : status.photo === "running" ? `making ${flow.n} photos…` : status.check === "running" ? "Otto is checking the photos…" : status.video === "running" ? "the clip is rendering (1–3 min)…" : "working…"}</span>
            : flow.last ? <span className="xs i2"><span className="w5 i1">Last run:</span> {flow.last.photos.length} photo{flow.last.photos.length === 1 ? "" : "s"}{flow.last.clips.length ? ` + ${flow.last.clips.length} clip${flow.last.clips.length === 1 ? "" : "s"}` : ""} · {flow.last.flagged ? `${flow.last.flagged} flagged by Otto` : "all passed Otto"} · {usd(flow.last.cost)}</span>
            : <span className="xs i2"><span className="w5 i1">Not run yet:</span> Run flow makes {flow.n} photos{has("video") ? ` and ${flow.video.n} clip` : ""} for about {usd(runCost)}</span>}
          {changed && !busy && <button type="button" className="btn sm" onClick={runFlow}><Icon name="refresh" size={11} />The number changed — run again</button>}
        </div>
      </div>
    </section>
  );

  // ---------------------------------------------------------------- right: inspector (defines the selected node)
  const d = NODES[sel];
  const focusShot = focus ? byId.get(focus) ?? null : null;
  const earlier = shots.filter((s) => s.kind === "image" && !lastPhotos.includes(s.id));
  const togglePick = (id: string) => patch({ picked: picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id] });

  const inspector = (
    <aside className="col" style={{ width: 292, flexShrink: 0, borderLeft: "1px solid var(--line)", background: "#fff", padding: "14px 16px", gap: 12, overflowY: "auto" }} aria-label="Inspector">
      <div className="row g10" style={{ flexShrink: 0, position: "relative" }}>
        <Tile k={sel} size={32} icon={sel === "product" ? <ShopifyLogo size={15} /> : undefined} />
        <div className="col fill" style={{ minWidth: 0 }}><span className="sm w5 i1">{d.name}</span><span className="xs i3 ell">{d.sub}</span></div>
        <button type="button" aria-label="More" onClick={() => setMenu(!menu)} className="hv" style={{ width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="more" size={16} color="#8B8883" /></button>
        {menu && (
          <div className="col" style={{ position: "absolute", right: 0, top: 30, zIndex: 5, width: 200, padding: 4, background: "#fff", borderRadius: 10, boxShadow: "0 0 0 1px var(--line), 0 8px 24px rgba(18,18,18,.12)" }}>
            <Link className="row g8 sm hv" style={{ height: 32, padding: "0 8px", borderRadius: 6 }} href={`${base}/creative/shoots/nodes`}><Icon name="info" size={13} />What this node does</Link>
            {sel === "data" && signal && <Link className="row g8 sm hv" style={{ height: 32, padding: "0 8px", borderRadius: 6 }} href={`${base}/signals/${signal.key}`}><Icon name="lightning" size={13} />Open the signal</Link>}
            {d.optional && <button type="button" className="row g8 sm hv" style={{ height: 32, padding: "0 8px", borderRadius: 6, textAlign: "left" }} onClick={() => removeNode(sel)}><Icon name="x" size={13} />Take off the canvas</button>}
          </div>
        )}
      </div>
      <span className="xs i2" style={{ lineHeight: "17px", flexShrink: 0, padding: "8px 10px", borderRadius: 8, background: "var(--tray)" }}>{d.does}</span>

      {sel === "product" && <>
        <Field label="Product" sub="Active products with a Shopify photo, most in stock first">
          <Picker label="Product" value={product?.url ?? ""} options={products.map((p) => [p.url, p.title])} onChange={(v) => patch({ product: v })}
            icon={product ? <img src={product.url} alt="" width={20} height={20} style={{ borderRadius: 4, objectFit: "cover" }} /> : undefined} />
        </Field>
        {product && <div className="col" style={{ flexShrink: 0 }}>
          <span className="xs w5 i3" style={{ paddingBottom: 4 }}>What Cleo brings in</span>
          {([["Price", product.price != null ? new Intl.NumberFormat("en", { style: "currency", currency: props.currency }).format(product.price) : "—"], ["In stock", product.stock != null ? String(product.stock) : "—"], ["Photo", "Shopify’s main photo"]] as const).map(([a, b]) => (
            <div key={a} className="row between" style={{ height: 26, borderTop: "1px solid var(--line)" }}><span className="xs i2">{a}</span><span className="xs w5 i1">{b}</span></div>))}
        </div>}
        <div className="row top g8" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", flexShrink: 0 }}><Icon name="lock" size={13} color="#1F8A5B" /><span className="xs i2" style={{ lineHeight: "16px" }}><b className="w5 i1">Label + shape locked.</b> Every photo and clip starts from this real photo, so the product looks like what arrives.</span></div>
        <Link className="lnk xs i2 row g4" href={`${base}/shopify?tab=products`}>See all products<Icon name="arrow-r" size={11} /></Link>
      </>}

      {sel === "data" && <>
        <Field label="Signal" sub={signal ? `Shopify ${signal.group.toLowerCase()} · from the latest sync` : "No signal — a general product shoot"}>
          <Picker label="Signal" value={flow.template ?? ""} onChange={(v) => patch({ template: v || null, rules: [], segments: null })} icon={<Icon name="lightning" size={13} color={CAT.in} />}
            options={[...signals.map((s) => [s.key, s.data] as [string, string]), ["", "No signal"]]} />
        </Field>
        {signal && <div className="col" style={{ flexShrink: 0 }}>
          <span className="xs w5 i3" style={{ paddingBottom: 4 }}>What the data says{numMatch ? ` · ${numMatch[1]} ${unit}` : ""}</span>
          {signal.evidence.map(([a, b]) => <div key={a} className="row between g8" style={{ minHeight: 26, borderTop: "1px solid var(--line)" }}><span className="xs i2">{a}</span><span className="xs w5 i1" style={{ textAlign: "right" }}>{b}</span></div>)}
        </div>}
        {signal && FIELDS[signal.key] && <Field label="Where it comes from"><div className="row g4" style={{ flexWrap: "wrap" }}>{FIELDS[signal.key].map((f) => <Tag key={f} t={f} color={TOK.data} />)}</div></Field>}
        <div className="col" style={{ flexShrink: 0 }}>
          <div className="row between" style={{ paddingBottom: 4 }}><span className="xs w5 i3">How it shapes the shoot</span><span className="row g4 xs i2"><AgentFace kind="builder" size={14} mood="happy" />Remy</span></div>
          {flow.rules.map((r, i) => (
            <div key={i} className="row top g8" style={{ padding: "7px 0", borderTop: "1px solid var(--line)" }}>
              <button type="button" role="checkbox" aria-checked={r.on} aria-label={r.text} onClick={() => patch({ rules: flow.rules.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) })} style={{ display: "flex" }}>
                <Icon name={r.on ? "check-circle" : "circle"} size={13} weight={r.on ? "fill" : "regular"} color={r.on ? TOK.data : "#B5B2AC"} /></button>
              <span className={`xs fill ${r.on ? "i1" : "i3"}`} style={{ lineHeight: "16px" }}>{r.text}</span>
              <button type="button" aria-label="Remove rule" onClick={() => patch({ rules: flow.rules.filter((_, j) => j !== i) })} style={{ display: "flex" }}><Icon name="x" size={11} color="#B5B2AC" /></button>
            </div>
          ))}
          {!flow.rules.length && <span className="xs i3" style={{ padding: "7px 0", borderTop: "1px solid var(--line)", lineHeight: "16px" }}>Remy writes these from the signal on the next run — or add your own.</span>}
          <form className="row g4" style={{ paddingTop: 6 }} onSubmit={(e) => { e.preventDefault(); if (newRule.trim()) { patch({ rules: [...flow.rules, { text: newRule.trim().slice(0, 80), on: true }] }); setNewRule(""); } }}>
            <Icon name="plus" size={11} color="#55534F" /><input value={newRule} onChange={(e) => setNewRule(e.target.value)} placeholder="Add a rule" aria-label="Add a rule" className="xs" style={{ border: 0, outline: 0, flex: 1, font: "inherit", fontSize: 11.5 }} />
          </form>
        </div>
        <div className="col g4" style={{ flexShrink: 0, marginTop: "auto", paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          <div className="row g8"><span className="xs i1 fill">Re-run when the number changes</span><Switch label="Re-run when the number changes" on={flow.rerun} onChange={(v) => patch({ rerun: v })} /></div>
          <span className="xs i3" style={{ lineHeight: "15px" }}>{changed ? "It changed since the last run — run again to match." : "Kaviar flags this shoot when the number moves; nothing is spent until someone runs it."}</span>
        </div>
      </>}

      {sel === "brand" && <>
        <Field label="Colours" sub={props.look ?? undefined}>
          <div className="row g6">{swatches.map((c) => <span key={c} title={c} style={{ width: 24, height: 24, borderRadius: 99, background: c, boxShadow: "0 0 0 1px var(--line)" }} />)}{!swatches.length && <span className="xs i3">The brand analysis hasn’t found a palette yet.</span>}</div>
        </Field>
        <Field label="Tone"><span className="xs i1">{props.tone ?? "Not set in the brand profile"}</span></Field>
        <Field label="Follow the kit"><Pills label="Follow the kit" value={flow.strict ? "strict" : "loose"} options={[["strict", "Strict"], ["loose", "Loose"]]} onChange={(v) => patch({ strict: v === "strict" })} /></Field>
        <div className="col" style={{ flexShrink: 0 }}>
          <span className="xs w5 i3" style={{ paddingBottom: 4 }}>Rules for every shoot</span>
          {flow.brandRules.map((r, i) => <div key={i} className="row g8" style={{ minHeight: 28, borderTop: "1px solid var(--line)" }}><Icon name="blocked" size={12} color="#B7791F" /><span className="xs i1 fill">{r}</span><button type="button" aria-label="Remove rule" onClick={() => patch({ brandRules: flow.brandRules.filter((_, j) => j !== i) })} style={{ display: "flex" }}><Icon name="x" size={11} color="#B5B2AC" /></button></div>)}
          <form className="row g4" style={{ paddingTop: 6 }} onSubmit={(e) => { e.preventDefault(); const v = (new FormData(e.currentTarget).get("r") as string).trim(); if (v) { patch({ brandRules: [...flow.brandRules, v.slice(0, 60)] }); e.currentTarget.reset(); } }}>
            <Icon name="plus" size={11} color="#55534F" /><input name="r" placeholder="Add a rule, e.g. no models’ faces" aria-label="Add a brand rule" style={{ border: 0, outline: 0, flex: 1, font: "inherit", fontSize: 11.5 }} />
          </form>
        </div>
      </>}

      {sel === "wins" && <>
        <div className="row g8" style={{ flexShrink: 0 }}><span className="xs i1 fill">Strong lessons only</span><Switch label="Strong lessons only" on={flow.strongOnly} onChange={(v) => patch({ strongOnly: v })} /></div>
        {props.lessons.length ? props.lessons.map((l) => (
          <div key={l.lesson} className="col g2" style={{ padding: "8px 0", borderTop: "1px solid var(--line)", flexShrink: 0, opacity: flow.strongOnly && l.strength !== "Strong" ? 0.45 : 1 }}>
            <span className="row between"><span className="eyebrow">{l.dimension}</span><span className={`xs w5 ${l.strength === "Strong" ? "c-green" : "i3"}`}>{l.strength}</span></span>
            <span className="xs i1" style={{ lineHeight: "16px" }}>{l.lesson}</span><span className="xs i3" style={{ lineHeight: "15px" }}>{l.evidence}</span>
          </div>
        )) : <span className="xs i3" style={{ lineHeight: "16px" }}>No lessons yet. Iris writes them from the live Meta ads and the team’s reviews of Remy’s drafts.</span>}
        <Link className="lnk xs i2 row g4" href={`${base}/creative/insights`}>Open Insights<Icon name="arrow-r" size={11} /></Link>
      </>}

      {sel === "reference" && <>
        <Field label="Brand photo" sub={refs.length ? "From the brand’s uploads" : undefined}>
          {refs.length ? <div className="row g6" style={{ flexWrap: "wrap" }}>{refs.slice(0, 12).map((r) => <Thumb key={r.id} id={r.id} w={56} h={56} ring={flow.reference?.id === r.id} onClick={() => pickReference(r.id)} title={r.name} />)}</div>
            : <span className="xs i3" style={{ lineHeight: "16px" }}>No brand photos uploaded yet — add lifestyle shots in the brand’s assets during onboarding.</span>}
        </Field>
        {flow.reference && <Field label="What Remy borrows"><span className="xs i1" style={{ lineHeight: "16px", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)" }}>{flow.reference.note}</span></Field>}
        <Field label="How closely to follow"><Pills label="How closely to follow" value={flow.reference?.close ? "close" : "loose"} options={[["loose", "Loosely"], ["close", "Closely"]]} onChange={(v) => flow.reference && patch({ reference: { ...flow.reference, close: v === "close" } })} /></Field>
      </>}

      {sel === "prompt" && <>
        <Field label="Prompt" sub={flow.segments && flow.prompt === joinSegs(flow.segments) ? "Written by Remy · edit it and it’s yours" : flow.prompt ? "Edited by hand" : undefined}>
          <textarea value={flow.prompt} rows={8} onChange={(e) => patch({ prompt: e.target.value, promptFor: inputsKey }, false)} placeholder="Describe the scene, or let Remy write it from the inputs."
            style={{ border: "1px solid var(--line-2)", borderRadius: 8, padding: 8, resize: "vertical", font: "inherit", fontSize: 12, lineHeight: "17px" }} />
        </Field>
        <Field label="Length"><Pills label="Length" value={flow.length} options={[["short", "Short"], ["medium", "Medium"], ["detailed", "Detailed"]]} onChange={(v) => patch({ length: v })} /></Field>
        {flow.segments && flow.prompt === joinSegs(flow.segments) && <div className="col" style={{ flexShrink: 0 }}>
          <span className="xs w5 i3" style={{ paddingBottom: 4 }}>Where each phrase came from</span>
          {(["product", "data", "brand", "wins"] as const).map((k) => { const s = flow.segments!.filter((x) => x.source === k); return s.length ? (
            <div key={k} className="row top g8" style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}><span style={{ width: 10, height: 2, background: TOK[k], marginTop: 7, flexShrink: 0 }} /><span className="xs i3" style={{ width: 52, flexShrink: 0 }}>{k === "data" ? "Data" : k === "wins" ? "Wins" : k[0].toUpperCase() + k.slice(1)}</span><span className="xs i1" style={{ lineHeight: "16px" }}>{s.map((x) => x.text.trim()).join(" · ")}</span></div>) : null; })}
        </div>}
        <button type="button" className="btn dark" disabled={busy || !product} onClick={() => start(async () => { await write(); })} style={{ justifyContent: "center", flexShrink: 0 }}>
          {status.prompt === "running" ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : <Icon name="refresh" size={12} color="#fff" />}{flow.prompt ? "Rewrite with Remy" : "Write with Remy"}</button>
      </>}

      {sel === "photo" && <>
        <Field label="Model" sub="Keeps the real product from the Shopify photo"><div className="row g8" style={{ height: 34, padding: "0 10px", border: "1px solid var(--line-2)", borderRadius: 8 }}><Icon name="sparkle" size={13} color={CAT.make} /><span className="sm i1">FLUX Kontext</span><span className="xs i3">via AI Gateway</span></div></Field>
        <Field label="Scene"><Pills label="Scene" value={flow.scene} options={SCENES.map((s) => [s, s])} onChange={(v) => patch({ scene: v })} /></Field>
        <div className="row g6" style={{ flexShrink: 0 }}><Pills label="Size" value={flow.aspect} options={[["4:5", "4:5"], ["9:16", "9:16"], ["1:1", "1:1"]]} onChange={(v) => patch({ aspect: v })} /><span className="fill" /><Pills label="Count" value={flow.n} options={[[1, "× 1"], [2, "× 2"], [4, "× 4"]]} onChange={(v) => patch({ n: v })} /></div>
        {(lastPhotos.length > 0 || earlier.length > 0) && <Field label={focusShot ? "Selected photo" : "Pick a photo to edit, design or send"}>
          {focusShot && focusShot.kind === "image" && <div className="col g6">
            <img src={asset(focusShot.id)} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 8, background: "var(--tray)" }} />
            {focusShot.check && <span className={`xs ${passes(focusShot.check) ? "c-green" : "c-amber"}`}>Otto: {focusShot.check.note}</span>}
            <div className="row g4" style={{ flexWrap: "wrap" }}>
              <button type="button" className="btn dark sm" disabled={busy} onClick={() => design(focusShot.id)}><Icon name="pen" size={12} color="#fff" />Design in Editor</button>
              <button type="button" className="btn sm" onClick={() => togglePick(focusShot.id)}>{picked.includes(focusShot.id) ? "Unpick" : "Pick to send"}</button>
              {has("video") && <button type="button" className="btn sm" onClick={() => patch({ video: { ...flow.video, from: focusShot.id } })}>Start the clip here</button>}
            </div>
            <span className="xs w5 i3">Edit it · {usd(perImage)} each, the original stays</span>
            <div className="row g4" style={{ flexWrap: "wrap" }}>
              {([["remove-bg", "Remove bg"], ["extend", "Extend to 9:16"], ["relight", "Relight"]] as const).map(([k, l]) => <button key={k} type="button" className="btn sm" disabled={busy} onClick={() => edit(focusShot.id, k)}><Icon name="brush" size={12} />{l}</button>)}
            </div>
            <span className="row g10 xs"><a className="lnk i2" href={asset(focusShot.id)} download>Download</a><button type="button" className="lnk i3" onClick={() => start(async () => { await deleteShot(slug, focusShot.id); setFocus(null); update((g) => ({ ...g, last: g.last ? { ...g.last, photos: g.last.photos.filter((x) => x !== focusShot.id) } : g.last }), false); router.refresh(); })}>Delete</button></span>
          </div>}
          <div className="row g4" style={{ flexWrap: "wrap" }}>{[...lastPhotos.filter((id) => byId.has(id)), ...earlier.map((s) => s.id)].slice(0, 24).map((id) => <Thumb key={id} id={id} w={56} h={56} ring={focus === id} flag={flagOf(byId.get(id)?.check ?? null)} onClick={() => setFocus(id)} />)}</div>
          {earlier.length > 0 && <span className="xs i3">{earlier.length} earlier · all are in the Editor’s Media panel too</span>}
        </Field>}
        <div className="col g6" style={{ flexShrink: 0, marginTop: "auto" }}>
          <button type="button" className="btn dark" disabled={busy || !product} onClick={runPhotoNode} style={{ justifyContent: "center" }}><Icon name="play" size={12} weight="fill" color="#fff" />Run this node · {usd(photosCost)}</button>
          <span className="xs i3" style={{ textAlign: "center" }}>about 20 seconds · product stays locked</span>
        </div>
      </>}

      {sel === "video" && <>
        <Field label="Model"><div className="row g8" style={{ height: 34, padding: "0 10px", border: "1px solid var(--line-2)", borderRadius: 8 }}><Icon name="sparkle" size={13} color={CAT.make} /><span className="sm i1">Kling</span><span className="xs i3">image to video</span></div></Field>
        <Field label="Start frame" sub={lastPhotos.length > 1 ? "Click another photo to start from it" : undefined}>
          {startFrame ? <div className="col g6"><div className="row g8"><Thumb id={startFrame} w={40} h={50} /><div className="col"><span className="xs w5 i1">Photo {Math.max(1, lastPhotos.indexOf(startFrame) + 1)} · {flow.scene}</span><span className="xs i3">from the Photo node</span></div></div>
            {lastPhotos.length > 1 && <div className="row g4" style={{ flexWrap: "wrap" }}>{lastPhotos.filter((id) => byId.has(id)).map((id) => <Thumb key={id} id={id} w={34} h={34} ring={id === startFrame} onClick={() => patch({ video: { ...flow.video, from: id } })} />)}</div>}</div>
            : <span className="xs i3">Run the Photo node first — the clip starts from its best photo.</span>}
        </Field>
        <div className="col g6" style={{ flexShrink: 0 }}><span className="xs w5 i3">Camera move</span>
          <div className="row top" style={{ flexWrap: "wrap", gap: 8 }}>{MOVES.map(([m], i) => (
            <button key={m} type="button" onClick={() => patch({ video: { ...flow.video, move: m } })} className="col g2" style={{ width: 76, textAlign: "left" }}>
              <div style={{ position: "relative", width: 76, height: 50, borderRadius: 7, overflow: "hidden", background: "var(--tray)", boxShadow: flow.video.move === m ? `0 0 0 2px ${SEL}` : "0 0 0 1px var(--line)" }}>
                {(startFrame || product) && <img src={startFrame ? asset(startFrame) : product!.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: ["50% 50%", "20% 50%", "80% 30%", "50% 80%", "50% 40%", "50% 60%"][i], transform: `scale(${[1.15, 1, 1.6, 1.05, 1.3, 1][i]})` }} />}
              </div>
              <span style={{ fontSize: 10.5, ...(flow.video.move === m ? { color: "var(--ink)", fontWeight: 500 } : { color: "var(--ink-2)" }) }}>{m}</span>
            </button>))}</div>
        </div>
        <div className="row g6" style={{ flexShrink: 0, flexWrap: "wrap" }}>
          <Pills label="Length" value={flow.video.seconds} options={[[5, "5s"], [10, "10s"]]} onChange={(v) => patch({ video: { ...flow.video, seconds: v } })} />
          <Pills label="Size" value={flow.video.aspect} options={[["9:16", "9:16"], ["1:1", "1:1"]]} onChange={(v) => patch({ video: { ...flow.video, aspect: v } })} />
          <span className="fill" /><Pills label="Count" value={flow.video.n} options={[[1, "× 1"], [2, "× 2"], [3, "× 3"]]} onChange={(v) => patch({ video: { ...flow.video, n: v } })} />
        </div>
        <Field label="Sound" sub={has("sound") ? "from the Voice + music node" : undefined}><span className="xs i2">Silent — voice and music need ElevenLabs</span></Field>
        {lastClips.length > 0 && <Field label="Clips">{lastClips.filter((id) => byId.has(id)).map((id) => <video key={id} src={asset(id)} controls muted playsInline style={{ width: "100%", maxHeight: 260, borderRadius: 8, background: "#000", outline: focus === id ? `2px solid ${SEL}` : undefined }} />)}</Field>}
        <div className="col g6" style={{ flexShrink: 0, marginTop: "auto" }}>
          <button type="button" className="btn dark" disabled={busy || !startFrame} onClick={runVideoNode} style={{ justifyContent: "center" }}><Icon name="play" size={12} weight="fill" color="#fff" />Run this node · {usd(videoCost || flow.video.seconds * perVideoSecond * flow.video.n)}</button>
          <span className="xs i3" style={{ textAlign: "center" }}>about 2 minutes · product stays locked</span>
        </div>
      </>}

      {sel === "sound" && <>
        <div className="row g8" style={{ padding: "10px 12px", borderRadius: 10, background: "var(--amber-bg)", flexShrink: 0 }}><Icon name="plug" size={14} color="#B7791F" /><span className="xs" style={{ color: "#7A5414", lineHeight: "16px" }}>ElevenLabs isn’t connected to Kaviar yet. Until it is, clips come out silent — add music when uploading to Meta.</span></div>
        <Field label="What it will do"><span className="xs i2" style={{ lineHeight: "16px" }}>Remy writes a short voice-over from the prompt, ElevenLabs reads it in the brand’s language, and a music bed dips under the voice.</span></Field>
      </>}

      {sel === "check" && <>
        {checked.length ? checked.map((s, i) => (
          <div key={s.id} className="row top g8" style={{ padding: "8px 0", borderTop: "1px solid var(--line)", flexShrink: 0 }}>
            <Thumb id={s.id} w={40} h={48} onClick={() => { setSel("photo"); setFocus(s.id); }} />
            <div className="col g2 fill" style={{ minWidth: 0 }}>
              <span className="xs w5 i1">Photo {i + 1} {s.check ? (passes(s.check) ? <span className="c-green">· passed</span> : <span className="c-amber">· {flagOf(s.check)}</span>) : <span className="i3">· not checked</span>}</span>
              <span className="xs i3" style={{ lineHeight: "15px" }}>{s.check?.note ?? "Otto hasn’t looked at this one yet."}</span>
              <span className="row g8 xs">{s.check && !passes(s.check) && <button type="button" className="lnk i2" disabled={busy} onClick={() => rerunOne(s.id)}>Re-run · {usd(perImage)}</button>}<button type="button" className="lnk i3" disabled={busy} onClick={() => recheck(s.id)}>Check again</button></span>
            </div>
          </div>
        )) : <span className="xs i3" style={{ lineHeight: "16px" }}>Run the flow and Otto checks each photo next to the real product: label, bottle shape, colours, and no added text or watermark.</span>}
        {checked.length > 0 && <span className="xs i2">{passed.length} passed · {checked.length - passed.length} flagged — flagged photos aren’t sent unless you pick them.</span>}
      </>}

      {sel === "send" && <>
        <Field label="Destination" sub={flow.send ? "They become the batch’s ad photos, in order" : "Kept for the Editor’s Media panel"}>
          <Picker label="Destination" value={flow.send ?? ""} onChange={(v) => patch({ send: v || null })} icon={<Icon name="squares" size={13} color={CAT.fin} />}
            options={[...batchOpts.map((b) => [b.id, `${b.title} · ${b.n} ads`] as [string, string]), ["", "Brand assets"]]} />
        </Field>
        <Field label={`Photos to send · ${picked.length}`} sub="Otto pre-picks the ones that pass. Click to change.">
          {lastPhotos.length ? <div className="row g4" style={{ flexWrap: "wrap" }}>{lastPhotos.filter((id) => byId.has(id)).map((id) => <Thumb key={id} id={id} w={56} h={56} ring={picked.includes(id)} flag={flagOf(byId.get(id)!.check)} onClick={() => togglePick(id)} />)}</div>
            : <span className="xs i3">Nothing made yet.</span>}
        </Field>
        <div className="col g6" style={{ flexShrink: 0, marginTop: "auto" }}>
          <button type="button" className="btn dark" disabled={busy || !picked.length} onClick={send} style={{ justifyContent: "center" }}>{flow.send ? `Send ${picked.length} to batch` : `Keep ${picked.length} in brand assets`}</button>
          {nextStep && <Link className="btn" href={nextStep} style={{ justifyContent: "center" }}>Next: design in Editor<Icon name="arrow-r" size={12} /></Link>}
          {target && <Link className="lnk xs i2" href={`${base}/creative/${target.id}`} style={{ textAlign: "center" }}>Open “{target.title}”</Link>}
        </div>
      </>}
    </aside>
  );

  return (
    <>
      <ShootBar base={base} name={name} spend={props.month.cost} counts={reviewCount(props.toReview)}>
        <button type="button" className="btn dark sm" disabled={busy || !product} onClick={runFlow} title="Prompt → photos → Otto’s checks → clip">
          {busy ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : <Icon name="play" size={12} weight="fill" color="#fff" />}{busy ? "Running…" : `Run flow · ≈ ${usd(runCost)}`}</button>
      </ShootBar>
      <div className="row fill stretch" style={{ minHeight: 0 }}>{library}{canvas}{inspector}</div>
    </>
  );
}
