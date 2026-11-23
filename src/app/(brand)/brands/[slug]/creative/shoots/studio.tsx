"use client";
/* eslint-disable @next/next/no-img-element -- product photos and generated media */
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Background, BackgroundVariant, Panel, ReactFlow, ReactFlowProvider, useReactFlow, useViewport, type Connection, type Edge, type EdgeChange, type NodeChange, type OnConnectEnd } from "@xyflow/react";
import { createCharacter, cutFinal, deleteShot, designFromShot, makeKeyframes, planShots, pollVideo, writeStory, suggestCasting, readReference, runCheck, runEdit, runShoot, runVideo, saveFlow, sendShots, storeReference, suggestPrompt, uploadReference } from "./actions";
import { Combo } from "./combo";
import { ResultViewer } from "./viewer";
import { ALLOWED, CAT, DEFAULTS, clipCost, clipModel, type ClipModel, FIELDS, LIBRARY, MUSIC, NODES, NODE_W, SCENE_GROUPS, TEMPLATES, TOK, applyPreset, cfgOf, defaultFlow, edgeOf, flowSignal, fullAdFlow, isUgc, newId, renderTime, runCost, soundDirection, templateName, ugcFlow, wireColor, type NodeKey } from "./flow";
import { CharacterPicker, type Character } from "./character-ui";
import { VoicePicker, type Voice } from "./voice-ui";
import { ProductCombo } from "./product-combo";
import { ShotList } from "./shot-list";
import { Field, Pills } from "./bits";
import { CutPanel, SceneRenderPanel, StoryPanel } from "./story-ui";
import { scenePrompt, sceneSound } from "@/lib/creative/story";
import { STYLE, STYLES, autoShots, autoStyle, directionText, fitTimes, planLines, sameWords } from "@/lib/creative/director";
import { StudioCtx, ShootCanvasNode, WireEdge, Tag, Thumb, Tile, agoFrom, asset, flagOf, joinSegs, passes, short, usd,
  type Batch, type CanvasNode, type Check, type Lesson, type Product, type RunState, type Shot, type Signal, type StudioApi, type Wire } from "./canvas-nodes";
import { ShootBar } from "./bar";
import { reviewCount } from "../tabs";
import { Icon } from "@/components/icon";
import { LookGallery } from "@/components/look-art";
import { AgentFace } from "@/components/agent";
import { ShopifyLogo } from "@/components/logos";
import type { PromptIn } from "@/lib/creative/shoots";
import type { ShootFlow, ShootNode, ShootNodeCfg, ShotPlan } from "@/lib/db/schema";

export type { Shot } from "./canvas-nodes";
type Edit = "remove-bg" | "extend" | "relight";
const nodeTypes = { shoot: ShootCanvasNode };
const edgeTypes = { wire: WireEdge };
const DRAG = "application/x-kaviar-node";

// ---------------------------------------------------------------- graph helpers (pure)
const find = (g: ShootFlow, id: string | null) => (id ? g.nodes.find((n) => n.id === id) ?? null : null);
const inc = (g: ShootFlow, id: string) => g.edges.filter((e) => e.to === id).map((e) => find(g, e.from)).filter((x): x is ShootNode => Boolean(x));
const outs = (g: ShootFlow, id: string) => g.edges.filter((e) => e.from === id).map((e) => find(g, e.to)).filter((x): x is ShootNode => Boolean(x));
function up(g: ShootFlow, id: string, t: NodeKey, seen = new Set<string>()): ShootNode | null {
  for (const s of inc(g, id)) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    if (s.type === t) return s;
    const r = up(g, s.id, t, seen);
    if (r) return r;
  }
  return null;
}
const valid = (g: ShootFlow, src: string | null, dst: string | null, ignore?: string) => {
  const a = find(g, src), b = find(g, dst);
  return Boolean(a && b && a.id !== b.id && ALLOWED[a.type].includes(b.type) && !g.edges.some((e) => e.from === a.id && e.to === b.id && e.id !== ignore));
};
const uniq = (xs: string[]) => [...new Set(xs)];

// ---------------------------------------------------------------- inspector controls
function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} style={{ width: 28, height: 16, borderRadius: 99, background: on ? "#121212" : "var(--line-2)", position: "relative", flexShrink: 0 }}>
      <span style={{ position: "absolute", left: on ? 14 : 2, top: 2, width: 12, height: 12, borderRadius: 99, background: "#fff", transition: "left .15s" }} />
    </button>
  );
}
function MenuItem({ icon, children, onClick, href }: { icon: Parameters<typeof Icon>[0]["name"]; children: React.ReactNode; onClick?: () => void; href?: string }) {
  const st: React.CSSProperties = { height: 32, padding: "0 8px", borderRadius: 6, textAlign: "left" };
  return href ? <Link className="row g8 sm hv" style={st} href={href}><Icon name={icon} size={13} />{children}</Link>
    : <button type="button" className="row g8 sm hv" style={st} onClick={onClick}><Icon name={icon} size={13} />{children}</button>;
}

type Props = {
  slug: string; base: string; brand: string; currency: string; autoRun: boolean; initial: ShootFlow; preset: boolean; planned?: "static" | "video" | "ugc" | "full" | null; savedAt: string | null; savedBy: string | null;
  perImage: number; perVideoSecond: number; month: { photos: number; clips: number; cost: number }; toReview: number;
  examples?: Record<string, string>;
  engines: { photo: string; photoModel: string; photoModels: { key: string; name: string; note: string; price: number }[]; video: string; via: string; sound: boolean; perSoundSecond: number; res: Record<"480p" | "720p" | "1080p", number>; model: string; models: ClipModel[] }; voices: Voice[]; characters: (Character & { at: string })[];
  batches: Batch[]; signals: Signal[]; palette: string[]; look: string | null; tone: string | null; lessons: Lesson[]; products: Product[]; refs: { id: string; name: string }[]; store: { url: string; name: string }[]; shots: Shot[];
};

/** Board 17c · Shoots: a real node canvas — drag nodes, draw and remove wires, and Run flow follows the wires. */
/** Arriving from Plan: what Remy set up, and what happens next. */
const PLANNED: Record<"static" | "video" | "ugc" | "full", string> = {
  static: "Remy laid out the static-ad pipeline from your plan: Prompt → Photos → Otto’s check. Press Run flow, then send the photos to the Editor — each ad opens there as a designed card.",
  video: "Remy laid out the video pipeline from your plan: a start photo, then the clip. Press Run flow; the clips go to the batch’s ads when you send them.",
  ugc: "Remy laid out the UGC pipeline from your plan: your creator holds the product, then talks to camera. Pick the person, press Run flow, then send the clips to the batch.",
  full: "Remy laid out the full-ad pipeline from your plan: Storyboard → scene clips → Final cut. Write the storyboard, render the scenes, then send the finished ad to the batch.",
};

/** The scene picker: plain scenes as pills; the static ad looks as a gallery of pictures, product-only and with a person. */
function ScenePick({ value, onChange, examples }: { value: string; onChange: (v: string) => void; examples?: Record<string, string> }) {
  return <>{SCENE_GROUPS.map(([g, list]) => (
    <div key={g} className="col g4" style={{ paddingBottom: 4 }}>
      <span className="xs i3">{g}</span>
      {g === "Static ad looks" ? <LookGallery value={value} examples={examples} onPick={onChange} compact /> : <Pills label={`Scene · ${g}`} value={value} options={list.map((x) => [x, x])} onChange={onChange} />}
    </div>
  ))}</>;
}

export function ShootStudio(props: Props) {
  return <ReactFlowProvider><Studio {...props} /></ReactFlowProvider>;
}

function Studio(props: Props) {
  const { slug, base, perImage, perVideoSecond, products, signals, shots, batches, store } = props;
  // The brand photos a Reference can use: the brand's uploads, plus any it adds or takes from its store while it is here.
  const [refs, setRefs] = useState(props.refs);
  const refFile = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const rf = useReactFlow<CanvasNode, Wire>();
  const { zoom } = useViewport();
  const [flow, setFlowState] = useState<ShootFlow>(props.initial);
  const [past, setPast] = useState<ShootFlow[]>([]);
  const [sel, setSel] = useState<string | null>(() => props.initial.nodes.find((n) => n.type === "data")?.id ?? props.initial.nodes[0]?.id ?? null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [tool, setTool] = useState<"select" | "hand">("select");
  const [status, setStatus] = useState<Record<string, RunState>>({});
  const [msg, setMsg] = useState<string | null>(props.planned ? PLANNED[props.planned] : null);
  const [kept, setKept] = useState<number | null>(null); // files just kept in brand assets — shown with the way there
  const [saved, setSaved] = useState<{ at: string | null; by: string | null; saving: boolean }>({ at: props.savedAt, by: props.savedBy, saving: false });
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [newRule, setNewRule] = useState("");
  const [sent, setSent] = useState<Record<string, { batch: string; ad: string | null }>>({});
  const [dims, setDims] = useState<Record<string, { width: number; height: number }>>({});
  const [fresh, setFresh] = useState<Record<string, Check>>({});
  const [quick, setQuick] = useState<{ x: number; y: number; at: { x: number; y: number }; from: string; dir: "out" | "in" } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Long runs don't use a transition: a transition would hold every refresh (new photos) until the whole run ends.
  const [running, setRunning] = useState(false);
  const [navPending, startNav] = useTransition();
  const busy = running || navPending;
  const go = (fn: () => Promise<unknown>) => { setRunning(true); fn().catch((e: Error) => setMsg((e?.message ?? "Something went wrong.").slice(0, 160))).finally(() => setRunning(false)); };
  const [statusAt, setStatusAt] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [freshChars, setFreshChars] = useState<(Character & { at: string })[]>([]);
  const freshRef = useRef<(Character & { at: string })[]>([]);
  const errorsRef = useRef<Record<string, string>>({});
  const [jobState, setJobState] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<{ node: string; id: string } | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [planning, setPlanning] = useState<string[]>([]); // Video nodes Remy is planning shots for
  const [working, setWorking] = useState<Record<string, "write" | "frames" | null>>({}); // Storyboard nodes: writing or making keyframes
  const autoCut = useRef<Set<string>>(new Set()); // Video nodes whose finished scenes were already cut this session
  const flowRef = useRef(flow);
  const dirty = useRef(props.preset); // a handoff preset (?batch=…&signal=…) is saved straight away
  const search = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const ran = useRef(false);
  const dragging = useRef(false);
  const reconnected = useRef(true);

  // ---- every change goes through here: undoable, saved for the whole team a moment later
  const update = (fn: (f: ShootFlow) => ShootFlow, undoable = true) => {
    const prev = flowRef.current, next = fn(prev);
    if (next === prev) return;
    flowRef.current = next;
    if (undoable) setPast((p) => [...p.slice(-39), prev]);
    setFlowState(next);
    dirty.current = true;
  };
  const patchNode = (id: string, cfg: Partial<ShootNodeCfg>, undoable = true) =>
    update((f) => ({ ...f, nodes: f.nodes.map((n) => (n.id === id ? { ...n, cfg: { ...n.cfg, ...cfg } } : n)) }), undoable);
  const undo = () => { const prev = past.at(-1); if (!prev) return; setPast(past.slice(0, -1)); flowRef.current = prev; setFlowState(prev); dirty.current = true; };

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      setSaved((s) => ({ ...s, saving: true }));
      saveFlow(slug, flowRef.current).then((r) => setSaved({ at: r.at, by: null, saving: false })).catch(() => setSaved((s) => ({ ...s, saving: false })));
    }, 700);
    return () => clearTimeout(t);
  }, [flow, slug]);
  const jobsKey = flow.nodes.flatMap((n) => (n.cfg.jobs ?? []).map((j) => j.id)).join(",");
  const live = running || Boolean(jobsKey);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), live ? 1000 : 30_000); return () => clearInterval(t); }, [live]);

  // ---- clips rendering on Higgsfield: ask every few seconds, save each one when it's done
  const polling = useRef(false);
  useEffect(() => {
    if (!jobsKey) return;
    let alive = true;
    const tick = async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        for (const n of flowRef.current.nodes) for (const j of n.cfg.jobs ?? []) {
          const r = await pollVideo(slug, j);
          if (!alive) return;
          if (r.state) setJobState((x) => ({ ...x, [j.id]: r.state! }));
          if (!r.id && !r.error) continue;
          const cur = find(flowRef.current, n.id);
          if (!cur) continue;
          const c = cfgOf(cur), left = (c.jobs ?? []).filter((x) => x.id !== j.id);
          patchNode(n.id, { jobs: left, ...(r.id ? { out: [r.id, ...c.out.filter((x) => x !== r.id)].slice(0, 12), at: new Date().toISOString(), ...(j.scene ? { sceneOut: { ...(c.sceneOut ?? {}), [j.scene]: r.id } } : {}) } : {}) }, false);
          if (r.id) {
            update((f) => (f.last ? { ...f, last: { ...f.last, clips: f.last.clips + 1, cost: f.last.cost + clipCost(clipModel(props.engines, perVideoSecond, j.model).rate, j.seconds, j.res, j.sound) } } : f), false);
            router.refresh();
          }
          if (r.error) setMsg(r.error);
          if (!left.length) { setStatus((x) => ({ ...x, [n.id]: r.error ? "error" : "done" })); }
          // The last scene of a storyboard landed: cut the ad straight away if a Final cut node is wired.
          if (!left.length && j.scene && r.id) {
            const cutN = outs(flowRef.current, n.id).find((x) => x.type === "cut");
            if (cutN && !autoCut.current.has(n.id)) { autoCut.current.add(n.id); void cutRun(cutN.id).catch((e: Error) => setMsg(e.message)); }
          }
        }
      } finally { polling.current = false; }
    };
    const t = setInterval(() => { void tick(); }, 5000);
    const first = setTimeout(() => { void tick(); }, 1500);
    return () => { alive = false; clearInterval(t); clearTimeout(first); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-poll only when the set of jobs changes
  }, [jobsKey, slug]);

  // ---- derived from the graph
  const allChars = [...props.characters, ...freshChars.filter((f) => !props.characters.some((c) => c.id === f.id))];
  const charById = (id: string | null | undefined) => (id ? allChars.find((x) => x.id === id) ?? freshRef.current.find((x) => x.id === id) ?? null : null);
  const byId = useMemo(() => new Map(shots.map((s) => [s.id, s])), [shots]);
  const checkOf = (id: string) => byId.get(id)?.check ?? fresh[id] ?? null;
  const productOf = (g: ShootFlow, id: string): Product | null => {
    const n = find(g, id);
    const p = n?.type === "product" ? n : up(g, id, "product");
    if (!p) return null;
    const c = cfgOf(p);
    return (c.item && c.item.url === c.product ? c.item : null) ?? products.find((x) => x.url === c.product) ?? products[0] ?? null;
  };
  const signalOf = (g: ShootFlow, id: string): Signal | null => {
    const n = find(g, id);
    const d = n?.type === "data" ? n : up(g, id, "data");
    return d ? signals.find((s) => s.key === cfgOf(d).signal) ?? null : null;
  };
  const lessonsOf = (w: ShootNode) => props.lessons.filter((l) => !cfgOf(w).strongOnly || l.strength === "Strong");
  /** The Storyboard behind a node: itself, wired in directly, or behind its Video node (for a Final cut). */
  const storyNodeOf = (g: ShootFlow, id: string): ShootNode | null => {
    const n = find(g, id);
    if (!n) return null;
    if (n.type === "story") return n;
    const direct = inc(g, id).find((x) => x.type === "story");
    if (direct) return direct;
    for (const v of inc(g, id).filter((x) => x.type === "video")) { const st = inc(g, v.id).find((x) => x.type === "story"); if (st) return st; }
    return null;
  };
  const promptOf = (g: ShootFlow, id: string) => { const n = find(g, id); return !n ? null : n.type === "prompt" ? n : inc(g, id).find((x) => x.type === "prompt") ?? up(g, id, "prompt"); };
  const promptIn = (g: ShootFlow, P: ShootNode): PromptIn => {
    const ins = inc(g, P.id), c = cfgOf(P);
    const d = ins.find((n) => n.type === "data"), b = ins.find((n) => n.type === "brand"), w = ins.find((n) => n.type === "wins"), r = ins.find((n) => n.type === "reference");
    const ch = ins.find((n) => n.type === "character"), person = ch ? charById(cfgOf(ch).characterId) : null;
    const sig = d ? signals.find((s) => s.key === cfgOf(d).signal) : null;
    const ref = r ? cfgOf(r).reference : null;
    return {
      product: productOf(g, P.id)?.title ?? "", scene: c.scene, length: c.length, signal: sig ? { data: sig.data, value: sig.value, evidence: sig.evidence } : null,
      rules: d ? cfgOf(d).rules.filter((x) => x.on).map((x) => x.text) : [], brandRules: b ? cfgOf(b).brandRules : [], strict: b ? cfgOf(b).strict : false,
      lessons: w ? lessonsOf(w).map((l) => `${l.dimension}: ${l.lesson}`) : [], reference: ref ? { note: ref.note, close: ref.close } : null,
      character: person ? { name: person.name, description: person.description } : null,
    };
  };
  const keyOf = (g: ShootFlow, P: ShootNode) => JSON.stringify(promptIn(g, P));
  const staleOf = (g: ShootFlow, P: ShootNode) => { const c = cfgOf(P); return Boolean(c.prompt) && c.promptFor !== keyOf(g, P); };
  const frameOf = (g: ShootFlow, vid: string, extra?: Map<string, Check>) => {
    const V = find(g, vid);
    if (!V) return null;
    const c = cfgOf(V), ph = inc(g, vid).find((n) => n.type === "photo"), ids = ph ? cfgOf(ph).out : [];
    if (c.from && (ids.includes(c.from) || byId.has(c.from))) return c.from;
    return ids.find((x) => passes(extra?.get(x) ?? checkOf(x))) ?? ids[0] ?? null;
  };
  const checkedFor = (cid: string) => uniq(inc(flow, cid).filter((n) => n.type === "photo").flatMap((n) => cfgOf(n).out)).map((x) => byId.get(x)).filter((x): x is Shot => Boolean(x));
  const sendItems = (sid: string) => {
    const photos: string[] = [], clips: string[] = [];
    for (const s of inc(flow, sid)) {
      if (s.type === "check") for (const x of inc(flow, s.id)) { if (x.type === "photo") photos.push(...cfgOf(x).out.filter((a) => passes(checkOf(a)))); if (x.type === "video") clips.push(...cfgOf(x).out); }
      if (s.type === "photo") photos.push(...cfgOf(s).out);
      if (s.type === "video") clips.push(...cfgOf(s).out);
    }
    return { photos: uniq(photos).filter((x) => byId.has(x)), clips: uniq(clips).filter((x) => byId.has(x)) };
  };
  const pickedFor = (sid: string) => { const n = find(flow, sid); if (!n) return []; const c = cfgOf(n); return c.picked ? c.picked.filter((x) => byId.has(x)) : sendItems(sid).photos; };
  // The run's output is ready and a batch is waiting for it: offer the next step right in the status bar.
  /** Every photo wired toward a Send node — the ones Otto flagged too. */
  const allPhotos = (sid: string) => uniq(inc(flow, sid).flatMap((x) => (x.type === "check" ? inc(flow, x.id).filter((y) => y.type === "photo").flatMap((y) => cfgOf(y).out) : x.type === "photo" ? cfgOf(x).out : []))).filter((x) => byId.has(x));
  const toEditor = (() => {
    for (const S of flow.nodes.filter((x) => x.type === "send" && cfgOf(x).send)) {
      const it = sendItems(S.id), k = pickedFor(S.id).length + it.clips.length;
      if (k) return { id: S.id, n: k, flagged: false };
      // Otto flagged every photo: the team can still take them into the Editor and judge for themselves.
      if (allPhotos(S.id).length) return { id: S.id, n: allPhotos(S.id).length, flagged: true };
    }
    return null;
  })();
  // No batch is waiting (results go to brand assets): the best photo can still open in the Editor as a new ad.
  const toDesign = (() => {
    if (toEditor) return null;
    const ids = uniq(flow.nodes.filter((x) => x.type === "photo").flatMap((x) => cfgOf(x).out)).filter((x) => byId.has(x));
    return ids.find((x) => passes(checkOf(x))) ?? ids[0] ?? null;
  })();
  const changedOf = (did: string) => { const n = find(flow, did); if (!n) return false; const c = cfgOf(n), sig = signalOf(flow, did); return Boolean(c.rerun && c.value && sig?.value && sig.value !== c.value); };

  const firstProduct = flow.nodes.find((n) => n.type === "product");
  const headProduct = firstProduct ? productOf(flow, firstProduct.id) : null;
  const name = `${templateName(flowSignal(flow))}${headProduct ? ` · ${short(headProduct.title)}` : ""}`;
  const cost = runCost(flow, perImage, (m) => clipModel(props.engines, perVideoSecond, m).rate);
  const anyChanged = flow.nodes.some((n) => n.type === "data" && changedOf(n.id));

  // ---- running (Run flow follows the wires: prompts → photos → Otto → clips)
  const mark = (id: string, v: RunState) => { setStatus((s) => ({ ...s, [id]: v })); if (v === "running") setStatusAt((t) => ({ ...t, [id]: Date.now() })); };
  const fail = (id: string, m: string) => { mark(id, "error"); errorsRef.current = { ...errorsRef.current, [id]: m }; setErrors(errorsRef.current); setMsg(m); };

  const write = async (pid: string): Promise<string | null> => {
    let P = find(flowRef.current, pid);
    if (!P) return null;
    const input = promptIn(flowRef.current, P);
    if (!input.product) { fail(pid, "Wire a Product node into the Prompt — Remy writes the scene around it."); return null; }
    mark(pid, "running");
    const r = await suggestPrompt(slug, input);
    if (!r.out) { fail(pid, r.error ?? "Remy couldn’t write the prompt."); return null; }
    const d = inc(flowRef.current, pid).find((n) => n.type === "data");
    if (d && !cfgOf(d).rules.length && r.out.rules.length) patchNode(d.id, { rules: r.out.rules.map((t) => ({ text: t, on: true })) }, false);
    P = find(flowRef.current, pid)!;
    const text = joinSegs(r.out.segments);
    patchNode(pid, { prompt: text, segments: r.out.segments, promptFor: keyOf(flowRef.current, P), voiceLine: r.out.voiceLine }, false);
    mark(pid, "done");
    return text;
  };

  const photoRun = async (xid: string, checks: Map<string, Check>) => {
    const g = flowRef.current, X = find(g, xid);
    if (!X) return null;
    const prod = productOf(g, xid);
    if (!prod) { fail(xid, "Wire a Product node into this Photo node — directly or through the Prompt."); return null; }
    const P = promptOf(g, xid);
    let text: string | null;
    if (P) { const c = cfgOf(P); text = c.prompt.trim().length >= 10 && !staleOf(g, P) ? c.prompt : await write(P.id); }
    else text = `${prod.title} in a calm, natural everyday scene.`;
    if (!text) return null;
    const c = cfgOf(X);
    mark(xid, "running");
    const refNode = P ? inc(g, P.id).find((x) => x.type === "reference") : null;
    const chNode = up(g, xid, "character");
    const r = await runShoot(slug, { product: prod.title, imageUrl: prod.url, prompt: text, aspect: c.aspect, n: c.n, referenceId: refNode ? cfgOf(refNode).reference?.id ?? null : null, characterId: chNode ? cfgOf(chNode).characterId : null, model: c.model ?? null });
    if (!r.ids?.length) { fail(xid, r.error ?? "No photos came back."); return null; }
    if (r.error) setMsg(r.error);
    const ids = r.ids;
    patchNode(xid, { out: ids, at: new Date().toISOString() }, false);
    mark(xid, "done");
    router.refresh();
    let flagged = 0;
    const ck = outs(flowRef.current, xid).filter((n) => n.type === "check");
    if (ck.length) {
      ck.forEach((k) => mark(k.id, "running"));
      const res = await Promise.all(ids.map((id) => runCheck(slug, id, prod.url, prod.title)));
      res.forEach((x, i) => { if (x.check) checks.set(ids[i], x.check); });
      setFresh((f) => ({ ...f, ...Object.fromEntries([...checks]) }));
      flagged = res.filter((x) => x.check && !passes(x.check)).length;
      ck.forEach((k) => mark(k.id, res.some((x) => !x.check) ? "error" : "done"));
      router.refresh();
    }
    return { ids, flagged };
  };

  // ---- video direction: the shooting style (auto = from the scene and who's in it) and Remy's shot list
  const directionOf = (g: ShootFlow, vid: string, who: (id: string | null) => Character | null = (id) => allChars.find((x) => x.id === id) ?? null) => {
    const V = find(g, vid), c = V ? cfgOf(V) : cfgOf({ id: vid, type: "video", x: 0, y: 0, cfg: {} });
    const P = promptOf(g, vid), ch = up(g, vid, "character"), scene = P ? cfgOf(P).scene : "";
    const auto = !c.style || c.style === "auto" || !STYLE[c.style], withPerson = Boolean(ch) || isUgc(scene), autoKey = autoStyle(scene, withPerson);
    const key = auto ? autoKey : c.style;
    const snd = inc(g, vid).find((x) => x.type === "sound");
    // The words said on camera: the Voice + music node's line, or the one Remy wrote with the prompt for a person on camera.
    const voice = snd ? (cfgOf(snd).voice?.trim() || (P && (ch || isUgc(scene)) ? cfgOf(P).voiceLine?.trim() ?? "" : "")) : "";
    const person = ch ? who(cfgOf(ch).characterId) : null;
    return { key, auto, autoKey, withPerson, scene, person, voice, snd, frame: (P && cfgOf(P).prompt) || "", product: productOf(g, vid)?.title ?? "the product", seconds: c.seconds, count: c.shotCount ?? null };
  };
  const planFits = (p: ShotPlan | null | undefined, d: ReturnType<typeof directionOf>): p is ShotPlan =>
    Boolean(p && p.style === d.key && p.seconds === d.seconds && (!d.count || p.shots.length === d.count));
  const planFor = async (vid: string): Promise<{ plan?: ShotPlan; error?: string }> => {
    const d = directionOf(flowRef.current, vid, charById);
    setPlanning((x) => [...x, vid]);
    try {
      const r = await planShots(slug, { style: d.key, seconds: d.seconds, count: d.count, frame: d.frame, product: d.product, scene: d.scene, character: d.person ? { name: d.person.name, description: d.person.description } : null, voice: d.voice });
      if (r.plan) patchNode(vid, { plan: r.plan }, false);
      return r;
    } finally { setPlanning((x) => x.filter((y) => y !== vid)); }
  };
  // Editing a shot's line rewrites the voice line, so the shot list and the Voice + music node never disagree.
  const editPlan = (vid: string, p: ShotPlan, save: boolean) => {
    patchNode(vid, { plan: p }, save);
    const d = directionOf(flowRef.current, vid), said = planLines(p);
    if (d.snd && said && !sameWords(said, d.voice)) patchNode(d.snd.id, { voice: said.slice(0, 140) }, false);
  };

  const videoRun = async (vid: string, checks: Map<string, Check>) => {
    const g = flowRef.current, V = find(g, vid);
    if (!V) return { ids: [] as string[], jobs: 0 };
    const from = frameOf(g, vid, checks);
    if (!from) {
      const ph = inc(g, vid).find((x) => x.type === "photo");
      fail(vid, ph ? (errorsRef.current[ph.id] ? "No photo to start from — the Photo node didn’t run (see its note)." : "Run the Photo node first — a clip starts from one of its photos.") : "Wire a Photo node into this one (its bottom port to this node’s top).");
      return { ids: [] as string[], jobs: 0 };
    }
    const c = cfgOf(V), P = promptOf(g, vid);
    const text = (P && cfgOf(P).prompt) || `${productOf(g, vid)?.title ?? "The product"} in a calm everyday scene.`;
    mark(vid, "running");
    let snd = inc(g, vid).find((x) => x.type === "sound");
    // A person on camera with nothing to say: use the line Remy wrote with the prompt.
    if (snd && !cfgOf(snd).voice?.trim() && P && cfgOf(P).voiceLine && (up(g, vid, "character") || isUgc(cfgOf(P).scene))) {
      patchNode(snd.id, { voice: cfgOf(P).voiceLine }, false);
      snd = find(flowRef.current, snd.id) ?? snd;
    }
    // Direction: Remy's shot list for this style and length (planned now if there isn't one yet).
    const d = directionOf(flowRef.current, vid, charById);
    let plan = cfgOf(find(flowRef.current, vid)!).plan;
    if (!planFits(plan, d)) plan = (await planFor(vid)).plan ?? null;
    const lines = Boolean(plan && d.voice && sameWords(planLines(plan), d.voice));
    const st = STYLE[d.key];
    const direction = plan ? directionText(plan, { lines }) : `${st.look}. Camera: ${st.camera}. Light: ${st.light}. Edit: ${st.edit}.`;
    const sound = props.engines.sound && snd ? soundDirection(cfgOf(snd), lines) : null;
    const res = await Promise.all(Array.from({ length: c.n }, () => runVideo(slug, { model: c.model ?? null, fromAssetId: from, prompt: `${direction}\nThe start photo: ${text}`.slice(0, 3200), seconds: c.seconds, aspect: c.aspect === "1:1" ? "1:1" : "9:16", sound, voiceId: snd ? cfgOf(snd).voiceId : null, res: c.res, characterId: (() => { const ch = up(g, vid, "character"); return ch ? cfgOf(ch).characterId : null; })() })));
    const ids = res.flatMap((o) => (o.id ? [o.id] : [])), jobs = res.flatMap((o) => (o.job ? [o.job] : []));
    if (!ids.length && !jobs.length) { fail(vid, res[0]?.error ?? "No clip came back."); return { ids, jobs: 0 }; }
    if (res.some((o) => o.error)) setMsg(res.find((o) => o.error)!.error!);
    const cur = cfgOf(find(flowRef.current, vid)!);
    // Higgsfield renders in the background: the node shows the jobs and the canvas polls them.
    patchNode(vid, { ...(jobs.length ? { jobs: [...(cur.jobs ?? []), ...jobs] } : {}), ...(ids.length ? { out: [...ids, ...cur.out].slice(0, 8), at: new Date().toISOString() } : {}) }, false);
    mark(vid, jobs.length ? "running" : "done");
    router.refresh();
    return { ids, jobs: jobs.length };
  };

  // ---- full ads: Storyboard → keyframes → one clip per scene → Final cut
  const storyWrite = async (sid: string): Promise<boolean> => {
    const g = flowRef.current, S = find(g, sid);
    if (!S) return false;
    const c = cfgOf(S), prod = productOf(g, sid), sig = signalOf(g, sid), b = up(g, sid, "brand"), ch = up(g, sid, "character");
    mark(sid, "running"); setWorking((w) => ({ ...w, [sid]: "write" }));
    try {
      const r = await writeStory(slug, {
        product: prod ? { title: prod.title, price: prod.price } : null, length: c.adLength, framework: c.framework, look: c.look, hookCount: c.hookCount,
        characterId: ch ? cfgOf(ch).characterId : null, signal: sig ? { data: sig.data, value: sig.value, evidence: sig.evidence } : null, brandRules: b ? cfgOf(b).brandRules : [],
      });
      if (!r.story) { fail(sid, r.error ?? "No storyboard came back."); return false; }
      patchNode(sid, { storyboard: r.story }, false);
      mark(sid, "done");
      return true;
    } finally { setWorking((w) => ({ ...w, [sid]: null })); }
  };
  const storyFrames = async (sid: string, ids?: string[]): Promise<boolean> => {
    const g = flowRef.current, S = find(g, sid), sb = S ? cfgOf(S).storyboard : null;
    if (!S || !sb) return false;
    const prod = productOf(g, sid);
    if (!prod) { fail(sid, "Wire a Product node into the Storyboard — keyframes start from its photo."); return false; }
    const want = ids ?? sb.scenes.filter((x) => !x.frame).map((x) => x.id);
    if (!want.length) return true;
    const ch = up(g, sid, "character");
    mark(sid, "running"); setWorking((w) => ({ ...w, [sid]: "frames" }));
    try {
      const r = await makeKeyframes(slug, { story: sb, sceneIds: want, product: { title: prod.title, url: prod.url }, characterId: ch ? cfgOf(ch).characterId : null });
      const cur = cfgOf(find(flowRef.current, sid)!).storyboard ?? sb;
      patchNode(sid, { storyboard: { ...cur, scenes: cur.scenes.map((x) => (r.frames[x.id] ? { ...x, frame: r.frames[x.id] } : x)) } }, false);
      if (r.error) fail(sid, r.error); else mark(sid, "done");
      router.refresh();
      return Object.keys(r.frames).length > 0;
    } finally { setWorking((w) => ({ ...w, [sid]: null })); }
  };
  const scenesRun = async (vid: string, only?: string[]): Promise<{ jobs: number; ids: string[] }> => {
    const S = storyNodeOf(flowRef.current, vid);
    if (!S || !cfgOf(S).storyboard) { fail(vid, "Write the storyboard first — wire a Storyboard node into this one."); return { jobs: 0, ids: [] }; }
    mark(vid, "running");
    if (cfgOf(S).storyboard!.scenes.some((x) => !x.frame)) await storyFrames(S.id);
    const g = flowRef.current, sb = cfgOf(find(g, S.id)!).storyboard!, c = cfgOf(find(g, vid)!);
    const todo = sb.scenes.filter((x) => x.frame && (!only || only.includes(x.id)));
    if (!todo.length) { fail(vid, "No keyframes to start from — see the Storyboard node."); return { jobs: 0, ids: [] }; }
    const snd = inc(g, vid).find((x) => x.type === "sound"), voiceId = snd ? cfgOf(snd).voiceId : null;
    const ch = up(g, S.id, "character") ?? inc(g, vid).find((x) => x.type === "character"), characterId = ch ? cfgOf(ch).characterId : null;
    const res = await Promise.all(todo.map((x) => runVideo(slug, { model: c.model ?? null,
      fromAssetId: x.frame!, prompt: scenePrompt(sb, x).slice(0, 3200), seconds: x.seconds, aspect: "9:16",
      sound: props.engines.sound ? sceneSound(sb, x, Boolean(voiceId && x.line)) : null, voiceId: x.line ? voiceId : null, res: c.res, characterId: x.person ? characterId : null, scene: x.id,
    })));
    const jobs = res.flatMap((o) => (o.job ? [o.job] : [])), direct: Record<string, string> = {};
    res.forEach((o, i) => { if (o.id) direct[todo[i].id] = o.id; });
    if (!jobs.length && !Object.keys(direct).length) { fail(vid, res.find((o) => o.error)?.error ?? "No clip came back."); return { jobs: 0, ids: [] }; }
    if (res.some((o) => o.error)) setMsg(res.find((o) => o.error)!.error!);
    const cur = cfgOf(find(flowRef.current, vid)!);
    patchNode(vid, { jobs: [...(cur.jobs ?? []), ...jobs], sceneOut: { ...(cur.sceneOut ?? {}), ...direct }, ...(Object.keys(direct).length ? { out: [...Object.values(direct), ...cur.out].slice(0, 12), at: new Date().toISOString() } : {}) }, false);
    mark(vid, jobs.length ? "running" : "done");
    autoCut.current.delete(vid);
    router.refresh();
    return { jobs: jobs.length, ids: Object.values(direct) };
  };
  const cutRun = async (cid: string) => {
    const g = flowRef.current, C = find(g, cid);
    if (!C) return;
    const V = inc(g, cid).find((x) => x.type === "video"), S = storyNodeOf(g, cid), sb = S ? cfgOf(S).storyboard : null;
    if (!V || !S || !sb) { fail(cid, "Wire the Storyboard’s Video node into this one."); return; }
    const so = cfgOf(V).sceneOut ?? {}, missing = sb.scenes.filter((x) => !so[x.id]);
    if (missing.length) { fail(cid, `${missing.length} scene${missing.length > 1 ? "s aren’t" : " isn’t"} rendered yet — run the Video node.`); return; }
    const c = cfgOf(C), prod = productOf(g, S.id);
    mark(cid, "running");
    const r = await cutFinal(slug, {
      scenes: sb.scenes.map((x) => ({ clip: so[x.id], seconds: x.seconds, text: x.line.trim() || x.caption })), captions: c.captions, sound: c.keepSound, endCard: c.endCard,
      end: sb.end, product: prod ? { title: prod.title, url: prod.url } : null, title: sb.title,
    });
    if (!r.id) { fail(cid, r.error ?? "The cut didn’t come back."); return; }
    patchNode(cid, { out: [r.id, ...cfgOf(find(flowRef.current, cid)!).out].slice(0, 6), at: new Date().toISOString() }, false);
    mark(cid, "done");
    router.refresh();
    setMsg(`Your ${r.seconds ?? ""}s ad is cut — play or download it in the Final cut node.`);
  };
  const cutStatus = (cid: string) => {
    const V = inc(flow, cid).find((x) => x.type === "video"), S = storyNodeOf(flow, cid), sb = S ? cfgOf(S).storyboard : null;
    if (!V || !sb) return { ready: 0, total: 0 };
    const so = cfgOf(V).sceneOut ?? {};
    return { ready: sb.scenes.filter((x) => so[x.id]).length, total: sb.scenes.length };
  };

  const runFlow = () => go(async () => {
    setMsg(null);
    const g = flowRef.current;
    const photos = g.nodes.filter((n) => n.type === "photo"), videos = g.nodes.filter((n) => n.type === "video"), stories = g.nodes.filter((n) => n.type === "story");
    if (!photos.length && !videos.length && !stories.length) { setMsg("Add a Photo node — it’s what makes the pictures."); return; }
    // Everything this run will touch starts as queued, so the canvas shows the order the work moves in.
    const queue: Record<string, RunState> = {};
    for (const n of [...photos, ...videos]) { queue[n.id] = "queued"; const P = promptOf(g, n.id); if (P) queue[P.id] = "queued"; }
    for (const n of g.nodes.filter((x) => x.type === "story" || x.type === "cut")) queue[n.id] = "queued";
    for (const n of g.nodes.filter((x) => x.type === "check" && inc(g, x.id).some((y) => y.type === "photo"))) queue[n.id] = "queued";
    for (const n of g.nodes.filter((x) => x.type === "character" && !cfgOf(x).characterId && g.edges.some((e) => e.from === x.id))) queue[n.id] = "queued";
    setStatus(queue); errorsRef.current = {}; setErrors({});
    // Smart defaults: a Character node nobody filled in gets a person cast from the audience and the product.
    for (const ch of g.nodes.filter((x) => x.type === "character" && !cfgOf(x).characterId && g.edges.some((e) => e.from === x.id))) {
      mark(ch.id, "running");
      const d = g.nodes.find((x) => x.type === "data"), sg = d ? signals.find((y) => y.key === cfgOf(d).signal) : null;
      const prod = productOf(g, outs(g, ch.id)[0]?.id ?? ch.id) ?? headProduct;
      const cast = props.characters[0] && !g.nodes.some((x) => x.type === "character" && cfgOf(x).characterId === props.characters[0].id)
        ? { name: props.characters[0].name, description: props.characters[0].description, id: props.characters[0].id }
        : await suggestCasting(slug, { signal: sg ? `${sg.data}: ${sg.value ?? ""}` : null, product: prod?.title ?? null }).then((r) => (r.description ? { name: r.name ?? "Character", description: r.description, id: null } : null));
      if (!cast) { fail(ch.id, "Remy couldn’t cast anyone — pick or describe a person in the panel."); continue; }
      let id = cast.id;
      if (!id) {
        const made = await createCharacter(slug, { name: cast.name, description: cast.description });
        if (!made.id) { fail(ch.id, made.error ?? "The character sheet didn’t come back."); continue; }
        id = made.id;
        const fresh = { id, name: cast.name, description: cast.description, uploaded: false, at: new Date().toISOString() };
        freshRef.current = [...freshRef.current, fresh];
        setFreshChars((x) => [...x, fresh]);
      }
      patchNode(ch.id, { characterId: id }, false);
      mark(ch.id, "done");
      router.refresh();
    }
    // Storyboards: Remy writes the ad (or rewrites it for a new length), then a keyframe for every scene.
    for (const S of flowRef.current.nodes.filter((x) => x.type === "story")) {
      const sb = cfgOf(S).storyboard;
      if (!sb || sb.length !== cfgOf(S).adLength) { if (!(await storyWrite(S.id))) continue; }
      if (cfgOf(find(flowRef.current, S.id)!).storyboard!.scenes.some((x) => !x.frame)) await storyFrames(S.id);
      else mark(S.id, "done");
    }
    const checks = new Map<string, Check>();
    let p = 0, cl = 0, flagged = 0, spent = 0;
    for (const X of photos) { const r = await photoRun(X.id, checks); if (r) { p += r.ids.length; flagged += r.flagged; spent += r.ids.length * perImage; } }
    let rendering = 0;
    for (const V of videos) {
      const r = storyNodeOf(flowRef.current, V.id) ? await scenesRun(V.id) : await videoRun(V.id, checks);
      cl += r.ids.length; rendering += r.jobs; spent += r.ids.length * cfgOf(V).seconds * perVideoSecond;
    }
    // Final cuts whose scenes are all in (clips that came back directly) cut now; the rest cut themselves when the last scene lands.
    for (const C of flowRef.current.nodes.filter((x) => x.type === "cut")) { const st = cutStatus(C.id); if (st.total && st.ready === st.total && !rendering) await cutRun(C.id); }
    if (rendering) setMsg(`${rendering} clip${rendering > 1 ? "s are" : " is"} rendering — usually ${renderTime(Math.max(...videos.map((V) => cfgOf(V).seconds)))}. Keep working; ${rendering > 1 ? "they" : "it"} will appear in the Video node.`);
    for (const d of flowRef.current.nodes.filter((n) => n.type === "data")) { const sig = signals.find((s) => s.key === cfgOf(d).signal); if (sig) patchNode(d.id, { value: sig.value }, false); }
    if (p || cl) update((f) => ({ ...f, last: { at: new Date().toISOString(), photos: p, clips: cl, flagged, cost: spent } }), false);
    setNow(Date.now());
  });
  const runNode = (id: string) => go(async () => {
    setMsg(null);
    const n = find(flowRef.current, id);
    if (n?.type === "photo") await photoRun(id, new Map());
    else if (n?.type === "video" && storyNodeOf(flowRef.current, id)) { const r = await scenesRun(id); if (r.jobs) setMsg(`${r.jobs} scenes are rendering — usually 3–6 minutes. The Final cut runs by itself when they’re in.`); }
    else if (n?.type === "video") { const r = await videoRun(id, new Map()); if (r.jobs) setMsg(`The clip is rendering — usually ${renderTime(cfgOf(n).seconds)}. It appears in the Video node.`); }
    else if (n?.type === "story") { if (!cfgOf(n).storyboard) await storyWrite(id); else await storyFrames(id); }
    else if (n?.type === "cut") await cutRun(id);
    else if (n?.type === "prompt") await write(id);
  });
  const rerunOne = (checkId: string, shotId: string) => go(async () => {
    const g = flowRef.current;
    const X = inc(g, checkId).find((n) => n.type === "photo" && cfgOf(n).out.includes(shotId));
    const prod = X ? productOf(g, X.id) : null;
    if (!X || !prod) return;
    const P = promptOf(g, X.id);
    const text = (P && cfgOf(P).prompt) || `${prod.title} in a calm everyday scene.`;
    mark(X.id, "running");
    const r = await runShoot(slug, { product: prod.title, imageUrl: prod.url, prompt: text, aspect: cfgOf(X).aspect, n: 1 });
    if (!r.ids?.length) { fail(X.id, r.error ?? "No photo came back."); return; }
    const nid = r.ids[0];
    patchNode(X.id, { out: cfgOf(find(flowRef.current, X.id)!).out.map((x) => (x === shotId ? nid : x)) }, false);
    mark(X.id, "done"); mark(checkId, "running");
    const k = await runCheck(slug, nid, prod.url, prod.title);
    if (k.check) setFresh((f) => ({ ...f, [nid]: k.check! }));
    mark(checkId, k.check ? "done" : "error");
    router.refresh();
  });
  const recheck = (shotId: string, nodeId: string) => go(async () => {
    const prod = productOf(flowRef.current, nodeId);
    if (!prod) return;
    mark(nodeId, "running");
    const r = await runCheck(slug, shotId, prod.url, prod.title);
    if (r.check) setFresh((f) => ({ ...f, [shotId]: r.check! }));
    mark(nodeId, r.check ? "done" : "error");
    if (r.error) setMsg(r.error);
    router.refresh();
  });
  const edit = (photoId: string, shotId: string, kind: Edit) => go(async () => {
    setMsg(null); mark(photoId, "running");
    const r = await runEdit(slug, shotId, kind);
    if (!r.id) { fail(photoId, r.error ?? "The edit failed."); return; }
    mark(photoId, "done");
    patchNode(photoId, { out: [r.id, ...cfgOf(find(flowRef.current, photoId)!).out].slice(0, 8) }, false);
    setFocus(r.id); router.refresh();
  });
  const send = (sid: string, flaggedToo = false) => go(async () => {
    const n = find(flowRef.current, sid);
    if (!n) return;
    const c = cfgOf(n), picked = flaggedToo ? allPhotos(sid) : pickedFor(sid), target = batches.find((b) => b.id === c.send);
    setKept(null);
    if (c.send) setMsg("Sending to the Editor — Remy is laying out each ad…");
    // The look the photos were shot in (the Prompt node's scene) tells Remy which layout they were composed for.
    const look = flowRef.current.nodes.filter((x) => x.type === "prompt").map((x) => cfgOf(x).scene).find((x) => x.startsWith("Ad look")) ?? null;
    const r = await sendShots(slug, picked, c.send, sendItems(sid).clips, look);
    if (c.send && r.done) setSent((s) => ({ ...s, [sid]: { batch: c.send!, ad: r.firstAd ?? null } }));
    setMsg(r.error ?? (c.send ? `${r.done} ad${r.done === 1 ? "" : "s"} in “${target?.title}” ${r.done === 1 ? "has its" : "have their"} visuals${r.cards ? ` — ${r.cards} laid out as cards` : ""}. Opening the Editor…` : null));
    if (!r.error && !c.send) setKept(r.done ?? 0);
    // The pipeline's output goes to the Editor: refine each ad there, then review in Ads.
    if (c.send && r.done && r.firstAd) { router.push(`${base}/creative/editor?ad=${r.firstAd}`); return; }
    router.refresh();
  });
  const design = (id: string) => startNav(() => designFromShot(slug, id));
  // A pipeline that came from Plan runs straight through: once the photos pass Otto, Remy designs the ads and the Editor opens.
  // (Once per run — coming back to this page doesn't lay the ads out again over the team's edits.)
  const lastRun = flow.last?.at ?? null, handOff = toEditor && !toEditor.flagged ? toEditor.id : null;
  useEffect(() => {
    if (props.planned !== "static" || busy || !handOff || !lastRun || Date.now() - Date.parse(lastRun) > 180_000) return;
    const key = `kv-handoff:${lastRun}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch { return; }
    send(handOff);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires when a run finishes and its photos are in
  }, [lastRun, handOff, busy]);
  const addReference = (rid: string, get: () => Promise<{ id?: string; name?: string; error?: string }>) => go(async () => {
    const r = await get();
    if (!r.id) { setMsg(r.error ?? "That photo couldn’t be added."); return; }
    setRefs((l) => (l.some((x) => x.id === r.id) ? l : [{ id: r.id!, name: r.name ?? "Photo" }, ...l]));
    pickReference(rid, r.id);
  });
  const pickReference = (rid: string, assetId: string) => go(async () => {
    patchNode(rid, { reference: { id: assetId, note: "Remy is reading this photo…", close: cfgOf(find(flowRef.current, rid)!).reference?.close ?? false } });
    const r = await readReference(slug, assetId);
    patchNode(rid, { reference: { id: assetId, note: r.note ?? r.error ?? "", close: cfgOf(find(flowRef.current, rid)!).reference?.close ?? false } }, false);
  });

  // Arriving from Plan: Remy writes the Prompt node straight away, so the pipeline is fully written before anyone presses Run.
  const wrote = useRef(false);
  useEffect(() => {
    if (!props.planned || wrote.current) return;
    wrote.current = true;
    const P = flowRef.current.nodes.find((x) => x.type === "prompt" && !cfgOf(x).prompt);
    if (P) go(async () => { await write(P.id); });
  });

  // Started from the node-types page's Run flow.
  useEffect(() => {
    if (!props.autoRun || ran.current) return;
    ran.current = true;
    router.replace(pathname);
    runFlow();
  });

  // ---- editing the graph
  const select = (id: string | null) => { setSel(id); setSelEdge(null); setMenu(false); setQuick(null); };
  const addNode = (t: NodeKey, at?: { x: number; y: number }, link: string | null = sel) => {
    const g = flowRef.current, from = find(g, link);
    let pos = at;
    if (!pos && from) pos = { x: from.x + NODE_W[from.type] + 56, y: from.y };
    if (!pos) { const r = wrap.current?.getBoundingClientRect(); pos = r ? rf.screenToFlowPosition({ x: r.left + r.width / 2 - 90, y: r.top + r.height / 3 }) : { x: 40, y: 40 }; }
    const n: ShootNode = { id: newId(t), type: t, x: Math.round(pos.x), y: Math.round(pos.y), cfg: { ...DEFAULTS[t], ...(t === "product" ? { product: products[0]?.url ?? null } : {}), ...(t === "data" ? { signal: signals[0]?.key ?? null } : {}) } };
    const wire = from && ALLOWED[from.type].includes(t) ? edgeOf(from, n) : from && ALLOWED[t].includes(from.type) ? edgeOf(n, from) : null;
    update((f) => ({ ...f, nodes: [...f.nodes, n], edges: wire ? [...f.edges, wire] : f.edges }));
    select(n.id);
    return n;
  };
  const duplicate = (id: string) => {
    const n = find(flowRef.current, id);
    if (!n) return;
    const copy: ShootNode = { ...n, id: newId(n.type), x: n.x + 36, y: n.y + 36, cfg: { ...n.cfg, out: [], at: null } };
    update((f) => ({ ...f, nodes: [...f.nodes, copy], edges: [...f.edges, ...f.edges.filter((e) => e.to === id).map((e) => ({ ...e, id: `e-${e.from}-${copy.id}`, to: copy.id }))] }));
    select(copy.id);
  };
  const removeNode = (id: string) => { update((f) => ({ ...f, nodes: f.nodes.filter((n) => n.id !== id), edges: f.edges.filter((e) => e.from !== id && e.to !== id) })); select(null); };
  const removeEdge = (id: string) => { update((f) => ({ ...f, edges: f.edges.filter((e) => e.id !== id) })); setSelEdge(null); };
  const connect = (a: string, b: string) => { const g = flowRef.current; if (!valid(g, a, b)) return; update((f) => ({ ...f, edges: [...f.edges, edgeOf(find(g, a)!, find(g, b)!)] })); };
  const setTemplate = (key: string) => {
    if (key === "__fullad") { update(() => fullAdFlow(flowSignal(flowRef.current), headProduct?.url ?? products[0]?.url ?? null, props.characters[0]?.id ?? null)); select("story"); setTimeout(() => rf.fitView({ padding: 0.12, maxZoom: 1, duration: 200 }), 50); return; }
    if (key === "__ugc") { update(() => ugcFlow(flowSignal(flowRef.current), headProduct?.url ?? products[0]?.url ?? null, props.characters[0]?.id ?? null)); select("character"); setTimeout(() => rf.fitView({ padding: 0.12, maxZoom: 1, duration: 200 }), 50); return; }
    if (key === "__reset") { update(() => defaultFlow(flowSignal(flowRef.current), headProduct?.url ?? products[0]?.url ?? null)); select(null); setTimeout(() => rf.fitView({ padding: 0.12, maxZoom: 1, duration: 200 }), 50); return; }
    if (key) update((f) => applyPreset(f, { template: key }));
    else { const d = flowRef.current.nodes.find((n) => n.type === "data"); if (d) patchNode(d.id, { signal: null, rules: [] }); }
  };

  const onNodesChange = (changes: NodeChange<CanvasNode>[]) => {
    const moves = new Map<string, { x: number; y: number }>(), removed: string[] = [], measured: Record<string, { width: number; height: number }> = {};
    for (const c of changes) {
      if (c.type === "dimensions" && c.dimensions) measured[c.id] = c.dimensions;
      else if (c.type === "position" && c.position) moves.set(c.id, c.position);
      else if (c.type === "select" && c.selected) select(c.id);
      else if (c.type === "remove") removed.push(c.id);
    }
    if (Object.keys(measured).length) setDims((d) => ({ ...d, ...measured }));
    if (moves.size) {
      if (!dragging.current) { dragging.current = true; const snap = flowRef.current; setPast((p) => [...p.slice(-39), snap]); }
      update((f) => ({ ...f, nodes: f.nodes.map((n) => { const m = moves.get(n.id); return m ? { ...n, x: Math.round(m.x), y: Math.round(m.y) } : n; }) }), false);
    }
    if (removed.length) { update((f) => ({ ...f, nodes: f.nodes.filter((n) => !removed.includes(n.id)), edges: f.edges.filter((e) => !removed.includes(e.from) && !removed.includes(e.to)) })); if (sel && removed.includes(sel)) select(null); }
  };
  const onEdgesChange = (changes: EdgeChange<Wire>[]) => {
    const removed: string[] = [];
    for (const c of changes) {
      if (c.type === "select" && c.selected) { setSelEdge(c.id); setSel(null); setQuick(null); }
      else if (c.type === "remove") removed.push(c.id);
    }
    if (removed.length) { update((f) => ({ ...f, edges: f.edges.filter((e) => !removed.includes(e.id)) })); setSelEdge(null); }
  };
  const onConnect = (c: Connection) => connect(c.source, c.target);
  const onReconnect = (old: Edge, c: Connection) => {
    reconnected.current = true;
    const g = flowRef.current;
    if (!valid(g, c.source, c.target, old.id)) return;
    update((f) => ({ ...f, edges: [...f.edges.filter((e) => e.id !== old.id), edgeOf(find(g, c.source)!, find(g, c.target)!)] }));
  };
  // Drop a wire on empty canvas: pick what to add there, already connected. Drop it on the wrong node: say why.
  const onConnectEnd: OnConnectEnd = (e, st) => {
    const from = st.fromNode ? find(flowRef.current, st.fromNode.id) : null;
    if (!from || st.isValid) return;
    const dir = st.fromHandle?.type === "target" ? "in" : "out";
    if (st.toNode) {
      const to = find(flowRef.current, st.toNode.id);
      if (to) setMsg(dir === "out" ? `${NODES[from.type].name} can’t feed ${NODES[to.type].name}.` : `${NODES[to.type].name} can’t feed ${NODES[from.type].name}.`);
      return;
    }
    const pt = "changedTouches" in e ? e.changedTouches[0] : e;
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    // Keep the menu inside the canvas: flip up near the bottom, left near the right edge.
    const types = dir === "out" ? ALLOWED[from.type].length : (Object.keys(ALLOWED) as NodeKey[]).filter((t) => ALLOWED[t].includes(from.type)).length;
    const h = 70 + Math.max(1, types) * 32, x0 = pt.clientX - r.left, y0 = pt.clientY - r.top;
    setQuick({ x: Math.max(8, Math.min(x0, r.width - 222)), y: y0 + h > r.height - 8 ? Math.max(8, y0 - h) : y0, at: rf.screenToFlowPosition({ x: pt.clientX, y: pt.clientY }), from: from.id, dir });
  };

  // V / H tools, ⌘Z undo, ⌘D duplicate, Esc — like a design tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && sel) { e.preventDefault(); duplicate(sel); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "v") setTool("select"); else if (e.key === "h") setTool("hand"); else if (e.key === "Escape") { select(null); setQuick(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const rfNodes: CanvasNode[] = useMemo(() => flow.nodes.map((n) => ({ id: n.id, type: "shoot" as const, position: { x: n.x, y: n.y }, data: {}, selected: sel === n.id, ...(expanded.includes(n.id) ? { zIndex: 10 } : {}), ...(dims[n.id] ? { measured: dims[n.id] } : {}) })), [flow.nodes, sel, dims, expanded]);
  const rfEdges: Wire[] = useMemo(() => flow.edges.map((e) => {
    const a = find(flow, e.from), b = find(flow, e.to);
    return { id: e.id, source: e.from, target: e.to, sourceHandle: e.fh, targetHandle: e.th, type: "wire" as const, selected: selEdge === e.id,
      data: { color: a ? wireColor(a.type) : "#C9C5BF", dashed: a?.type === "product" && b?.type === "photo", hot: sel != null && (sel === e.from || sel === e.to),
        flow: status[e.to] === "running" || Boolean(b?.cfg.jobs?.length && (a?.type === "photo" || a?.type === "prompt" || a?.type === "sound")) } };
  }), [flow, sel, selEdge, status]);

  // The viewer shows what the clicked node made (or everything, for a Check node).
  const viewerNode = viewer ? find(flow, viewer.node) : null;
  const viewerItems: Shot[] = viewerNode?.type === "character" ? props.characters.filter((c) => c.id === viewer?.id).map((c) => ({ id: c.id, kind: "image" as const, product: null, prompt: c.description, check: null, edit: null, seconds: null, at: c.at, engine: c.uploaded ? "Real creator · photo" : "Character sheet", cost: null, sound: false }))
    : !viewerNode ? [] : (viewerNode.type === "photo" || viewerNode.type === "video" || viewerNode.type === "cut" ? cfgOf(viewerNode).out : viewerNode.type === "story" ? (cfgOf(viewerNode).storyboard?.scenes ?? []).flatMap((x) => (x.frame ? [x.frame] : [])) : viewerNode.type === "check" ? checkedFor(viewerNode.id).map((x) => x.id) : shots.map((x) => x.id))
    .map((x) => byId.get(x)).filter((x): x is Shot => Boolean(x));
  const viewerChecks = viewerNode ? outs(flow, viewerNode.id).filter((x) => x.type === "check") : [];
  const viewerVideos = viewerNode ? outs(flow, viewerNode.id).filter((x) => x.type === "video") : [];
  const viewerSend = viewerNode ? outs(flow, viewerNode.id).find((x) => x.type === "send") ?? viewerChecks.flatMap((k) => outs(flow, k.id)).find((x) => x.type === "send") ?? null : null;
  const sortedBatches = [...batches].sort((a, b) => Number(b.signal === flowSignal(flow)) - Number(a.signal === flowSignal(flow)));
  const nextStepOf = (id: string) => { const x = find(flow, id), s = sent[id]; return x && s && s.batch === cfgOf(x).send && s.ad ? `${base}/creative/editor?ad=${s.ad}` : null; };
  const api: StudioApi = {
    flow, status, busy, now, currency: props.currency, brand: props.brand, byId, palette: props.palette, look: props.look, tone: props.tone, lessons: props.lessons, batches: sortedBatches,
    perImage, perVideoSecond, perSoundSecond: props.engines.perSoundSecond, engines: props.engines, clip: (m) => clipModel(props.engines, perVideoSecond, m), voiceName: (id) => (id ? props.voices.find((v) => v.id === id)?.name ?? "Brand voice" : null),
    productFor: (id) => productOf(flow, id), signalFor: (id) => signalOf(flow, id), sceneFor: (id) => { const P = promptOf(flow, id); return P ? cfgOf(P).scene : "No prompt wired"; },
    stale: (id) => { const P = find(flow, id); return P ? staleOf(flow, P) : false; }, changed: changedOf, checkedFor, frameFor: (id) => frameOf(flow, id), sendItems, pickedFor,
    nextStep: nextStepOf,
    characterOf: (id) => charById(id), errorFor: (id) => errors[id] ?? null,
    statusAt, jobState, planning: (id) => planning.includes(id),
    storyOf: (id) => { const S = storyNodeOf(flow, id); return S ? cfgOf(S).storyboard ?? null : null; }, sceneClip: (vid, sc) => cfgOf(find(flow, vid)!).sceneOut?.[sc] ?? null, cutStatus, styleFor: (id) => { const d = directionOf(flow, id); return { name: STYLE[d.key].name, auto: d.auto }; },
    view: (node, id) => setViewer({ node, id }), expanded: (id) => expanded.includes(id), toggleExpand: (id) => setExpanded((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id])),
    patch: (id, cfg) => patchNode(id, cfg), select, writePrompt: (id) => go(async () => { await write(id); }), design, rerunOne, send, focus: (id) => setFocus(id),
  };

  // ---------------------------------------------------------------- left: node library (click to add, or drag onto the canvas)
  const q = query.trim().toLowerCase();
  const library = (
    <aside className="col" style={{ width: 212, flexShrink: 0, borderRight: "1px solid var(--line)", background: "#fff", padding: "12px 10px", gap: 2, overflowY: "auto" }} aria-label="Nodes">
      <div className="row between" style={{ padding: "0 6px 6px", flexShrink: 0 }}><span className="sm w5">Nodes</span><Link className="lnk xs i2 row g4" href={`${base}/creative/shoots/nodes`}>What each does<Icon name="arrow-r" size={11} color="#55534F" /></Link></div>
      <label className="input sm" style={{ height: 30, margin: "0 2px 4px", flexShrink: 0 }}>
        <Icon name="search" size={13} color="#8B8883" />
        <input ref={search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Add a node" aria-label="Add a node"
          onKeyDown={(e) => { if (e.key === "Enter") { const k = LIBRARY.flatMap(([, , ks]) => ks).find((x) => `${NODES[x].name} ${NODES[x].does}`.toLowerCase().includes(q)); if (k) { addNode(k); setQuery(""); } } }}
          style={{ border: 0, outline: 0, background: "transparent", font: "inherit", fontSize: 12, width: "100%" }} />
      </label>
      {LIBRARY.map(([g, c, keys]) => {
        const rows = keys.filter((k) => !q || `${NODES[k].name} ${NODES[k].does}`.toLowerCase().includes(q));
        const edits = g === "Make" && (!q || "edit remove bg extend relight".includes(q));
        if (!rows.length && !edits) return null;
        return (
          <div key={g} className="col" style={{ gap: 2 }}>
            <span className="row g6" style={{ fontSize: 10.5, fontWeight: 500, color: "var(--ink-3)", padding: "6px 6px 2px" }}><span className="dot" style={{ width: 6, height: 6, background: CAT[c] }} />{g}</span>
            {rows.map((k) => (
              <button key={k} type="button" draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG, k); e.dataTransfer.effectAllowed = "move"; }} onClick={() => addNode(k)}
                className="row g8 hv" title={`Add ${NODES[k].name} — click, or drag onto the canvas`} style={{ height: 38, padding: "0 6px", borderRadius: 8, flexShrink: 0, textAlign: "left", cursor: "grab" }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: `${CAT[c]}1A`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={NODES[k].icon} size={13} color={CAT[c]} /></span>
                <span className="col fill" style={{ minWidth: 0 }}><span className="xs w5 i1">{NODES[k].name}</span><span className="i3 ell" style={{ fontSize: 10.5 }}>{NODES[k].lib}</span></span>
                <Icon name="plus" size={12} color="#B5B2AC" />
              </button>
            ))}
            {edits && <>
              <span className="row g6" style={{ fontSize: 10.5, fontWeight: 500, color: "var(--ink-3)", padding: "6px 6px 2px" }}><span className="dot" style={{ width: 6, height: 6, background: CAT.edit }} />Edit</span>
              <div className="row g4" style={{ flexWrap: "wrap", padding: "2px 6px 4px" }}>
                {([["remove-bg", "Remove bg"], ["extend", "Extend"], ["relight", "Relight"], [null, "Upscale"], [null, "Recut"]] as const).map(([k, l]) => (
                  <button key={l} type="button" disabled={!k} title={k ? `${l} a photo — pick one in a Photo node’s panel` : "Not available yet"}
                    onClick={() => { const ph = flow.nodes.find((n) => n.type === "photo" && cfgOf(n).out.length) ?? flow.nodes.find((n) => n.type === "photo"); if (ph) { select(ph.id); const o = cfgOf(ph).out; if (o[0]) setFocus(o[0]); } }}
                    className="row" style={{ height: 22, padding: "0 7px", borderRadius: 6, border: "1px solid var(--line-2)", fontSize: 10.5, color: k ? "var(--ink-2)" : "var(--ink-4)", whiteSpace: "nowrap", background: "#fff" }}>{l}</button>
                ))}
              </div>
            </>}
          </div>
        );
      })}
      <div className="col g4" style={{ marginTop: "auto", padding: "10px 6px 0", borderTop: "1px solid var(--line)" }}>
        <span className="xs w5 i3">On the canvas</span>
        {[["Drag a port", "draw a wire"], ["Drag a wire’s end", "move or drop it off"], ["Click a wire", "× removes it"], ["⌫ ⌘D ⌘Z", "delete, duplicate, undo"]].map(([a, b]) => (
          <span key={a} className="xs i3" style={{ lineHeight: "15px" }}><span className="i2">{a}</span> — {b}</span>))}
      </div>
    </aside>
  );

  const quickFrom = quick ? find(flow, quick.from) : null;
  const quickTypes: NodeKey[] = !quickFrom || !quick ? [] : quick.dir === "out" ? ALLOWED[quickFrom.type] : (Object.keys(ALLOWED) as NodeKey[]).filter((t) => ALLOWED[t].includes(quickFrom.type));
  const quickAdd = (t: NodeKey) => {
    if (!quick) return;
    const node = addNode(t, { x: quick.at.x - (quick.dir === "out" ? 0 : NODE_W[t]), y: quick.at.y - 15 }, null);
    if (quick.dir === "out") connect(quick.from, node.id); else connect(node.id, quick.from);
    setQuick(null);
  };

  // ---------------------------------------------------------------- canvas
  const canvas = (
    <section className="col fill" style={{ minWidth: 0, background: "#fff" }} aria-label="Canvas">
      <div className="row g10" style={{ height: 44, flexShrink: 0, padding: "0 14px", borderBottom: "1px solid var(--line)", background: "#fff" }}>
        <div className="row g2" style={{ padding: 3, borderRadius: 9, background: "var(--tray)" }}>
          {([["pointer", "select", "Select and move (V)"], ["hand", "hand", "Pan only (H)"], ["plus", "plus", "Add a node"]] as const).map(([i, k, l]) => {
            const on = k === tool;
            return <button key={k} type="button" title={l} aria-label={l} aria-pressed={on} onClick={() => (k === "plus" ? search.current?.focus() : setTool(k))}
              style={{ width: 28, height: 26, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", ...(on ? { background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" } : {}) }}><Icon name={i} size={14} color={on ? "#121212" : "#8B8883"} /></button>;
          })}
        </div>
        <button type="button" className="hv" title="Undo (⌘Z)" aria-label="Undo" disabled={!past.length} onClick={undo} style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", opacity: past.length ? 1 : 0.4 }}><Icon name="undo" size={14} color="#55534F" /></button>
        <Combo chip label="Template" prefix="Template" icon={<Icon name="layers" size={13} />} value={flowSignal(flow) ?? ""} onChange={setTemplate}
          options={[...signals.filter((x) => TEMPLATES[x.key]).map((x) => ({ value: x.key, label: TEMPLATES[x.key], sub: x.data })), { value: "", label: "Product shoot", sub: "no data signal" }, { value: "__fullad", label: "Full ad layout", sub: "storyboard → scenes → final cut with captions and end card, 15–30 s" }, { value: "__ugc", label: "UGC video layout", sub: "a person holds the product and talks to camera" }, { value: "__reset", label: "Reset the canvas", sub: "back to this template’s layout", tone: "muted" as const }]} />
        <span className="row g6 xs i3" style={{ whiteSpace: "nowrap" }} title={saved.by ? `Last saved by ${saved.by}` : undefined}>
          {saved.saving ? <><Icon name="spinner" size={12} className="spin" />Saving…</> : <><Icon name="check-circle" size={12} weight="fill" color="#1F8A5B" />Saved · {flow.last ? `ran ${agoFrom(flow.last.at, now)}` : "not run yet"}</>}
        </span>
        <div className="fill" />
        {kept != null && <Link className="lnk xs i2 row g4" style={{ whiteSpace: "nowrap" }} href={`${base}/assets`}><Icon name="check-circle" size={12} weight="fill" color="#1F8A5B" />{kept} file{kept === 1 ? "" : "s"} kept in Brand assets<Icon name="arrow-r" size={11} color="#55534F" /></Link>}
        {msg && <button type="button" className="xs c-amber ell" style={{ maxWidth: 300, minWidth: 0, textAlign: "right" }} title={`${msg} — click to dismiss`} onClick={() => setMsg(null)}>{msg}</button>}
        <span className="row g6 xs i2">{([["in", "Inputs"], ["make", "Make"], ["fin", "Finish"]] as const).map(([c, t]) => <span key={c} className="row g4"><span className="dot" style={{ width: 6, height: 6, background: CAT[c] }} />{t}</span>)}</span>
        <span className="row g6 xs i3 tnum">
          <button type="button" aria-label="Zoom out" onClick={() => rf.zoomOut({ duration: 150 })} style={{ display: "flex" }}><Icon name="minus" size={12} color="#8B8883" /></button>
          <button type="button" title="Fit everything" onClick={() => rf.fitView({ padding: 0.12, maxZoom: 1, duration: 200 })} style={{ minWidth: 34 }}>{Math.round(zoom * 100)}%</button>
          <button type="button" aria-label="Zoom in" onClick={() => rf.zoomIn({ duration: 150 })} style={{ display: "flex" }}><Icon name="plus" size={12} color="#8B8883" /></button>
        </span>
      </div>
      <div ref={wrap} style={{ position: "relative", flex: 1, minHeight: 0 }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
        onDrop={(e) => { const t = e.dataTransfer.getData(DRAG) as NodeKey; if (!t || !NODES[t]) return; e.preventDefault(); const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }); addNode(t, { x: p.x - 90, y: p.y - 15 }, null); }}>
        <StudioCtx.Provider value={api}>
          <ReactFlow<CanvasNode, Wire> nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} isValidConnection={(c) => valid(flow, c.source, c.target)} onConnectEnd={onConnectEnd}
            edgesReconnectable onReconnect={onReconnect} onReconnectStart={() => { reconnected.current = false; }}
            onReconnectEnd={(_, edge) => { if (!reconnected.current) removeEdge(edge.id); reconnected.current = true; }}
            onNodeDragStop={() => { dragging.current = false; }} onPaneClick={() => { select(null); }}
            nodesDraggable={tool === "select"} nodesConnectable={tool === "select"} elementsSelectable={tool === "select"} edgesFocusable={tool === "select"}
            panOnDrag panOnScroll zoomOnPinch zoomOnDoubleClick={false} deleteKeyCode={tool === "select" ? ["Backspace", "Delete"] : null}
            fitView fitViewOptions={{ padding: 0.12, maxZoom: 1 }} minZoom={0.3} maxZoom={1.6}
            connectionRadius={28} connectionLineStyle={{ stroke: "#1AA7C8", strokeWidth: 2 }} defaultEdgeOptions={{ type: "wire" }}
            style={{ background: "#F3F2EF", cursor: tool === "hand" ? "grab" : undefined }}>
            <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#DEDBD6" />
            <Panel position="bottom-left">
              <div className="row g8" style={{ padding: "8px 12px", background: "#fff", borderRadius: 10, boxShadow: "0 0 0 1px var(--line)" }}>
                <AgentFace kind="builder" size={18} mood={busy ? "focus" : "happy"} />
                {busy ? <span className="xs i2"><span className="w5 i1">Running:</span> {Object.entries(status).filter(([, v]) => v === "running").map(([k]) => NODES[find(flow, k)?.type ?? "photo"].name).join(", ") || "working"}…</span>
                  : flow.last ? <span className="xs i2"><span className="w5 i1">Last run:</span> {flow.last.photos} photo{flow.last.photos === 1 ? "" : "s"}{flow.last.clips ? ` + ${flow.last.clips} clip${flow.last.clips === 1 ? "" : "s"}` : ""} · {flow.last.flagged ? `${flow.last.flagged} flagged by Otto` : "all passed Otto"} · {usd(flow.last.cost)}</span>
                  : <span className="xs i2"><span className="w5 i1">Not run yet:</span> Run flow follows the wires · about {usd(cost)}</span>}
                {anyChanged && !busy && <button type="button" className="btn sm" onClick={runFlow}><Icon name="refresh" size={11} />The number changed — run again</button>}
                {!busy && toEditor && !toEditor.flagged && <button type="button" className="btn sm dark" onClick={() => send(toEditor.id)}><Icon name="arrow-r" size={11} color="#fff" />Design {toEditor.n} as ads in the Editor</button>}
                {!busy && toEditor?.flagged && <button type="button" className="btn sm" title="Otto flagged every photo. Open them in the Editor anyway and judge for yourself, or re-run for new ones." onClick={() => send(toEditor.id, true)}><Icon name="arrow-r" size={11} />Use them anyway — design in the Editor</button>}
                {!busy && toDesign && <button type="button" className="btn sm dark" title="Opens this photo in the Editor as a new ad, with a layout ready to edit" onClick={() => design(toDesign)}><Icon name="arrow-r" size={11} color="#fff" />Design it in the Editor</button>}
              </div>
            </Panel>
            {flow.nodes.length === 0 && (
              <Panel position="top-center"><div className="col g6" style={{ marginTop: 80, padding: 16, width: 320, textAlign: "center", background: "#fff", borderRadius: 12, boxShadow: "0 0 0 1px var(--line)" }}>
                <span className="sm w5">An empty canvas</span><span className="xs i3">Drag nodes in from the left and wire them up — or start from the template.</span>
                <button type="button" className="btn dark sm" style={{ alignSelf: "center" }} onClick={() => setTemplate("__reset")}>Start from the template</button>
              </div></Panel>
            )}
          </ReactFlow>
        </StudioCtx.Provider>
        {quick && quickFrom && (
            <div className="col" style={{ position: "absolute", left: quick.x, top: quick.y, zIndex: 20, width: 210, padding: 4, background: "#fff", borderRadius: 10, boxShadow: "0 0 0 1px var(--line), 0 8px 24px rgba(18,18,18,.14)" }}>
              <span className="xs i3" style={{ padding: "4px 8px" }}>{quick.dir === "out" ? `Add after ${NODES[quickFrom.type].name}` : `Add before ${NODES[quickFrom.type].name}`}</span>
              {quickTypes.map((t) => (
                <button key={t} type="button" className="row g8 sm hv" style={{ height: 32, padding: "0 8px", borderRadius: 6, textAlign: "left" }}
                  onClick={() => quickAdd(t)}>
                  <Tile k={t} />{NODES[t].name}
                </button>
              ))}
              {!quickTypes.length && <span className="xs i3" style={{ padding: "4px 8px" }}>Nothing can connect here.</span>}
              <button type="button" className="xs i3" style={{ padding: "6px 8px", textAlign: "left" }} onClick={() => setQuick(null)}>Cancel</button>
            </div>
        )}
      </div>
    </section>
  );

  // ---------------------------------------------------------------- right: inspector
  const n = find(flow, sel);
  const edge = selEdge ? flow.edges.find((e) => e.id === selEdge) ?? null : null;
  const c = n ? cfgOf(n) : null;
  const focusShot = focus ? byId.get(focus) ?? null : null;
  const ea = edge ? find(flow, edge.from) : null, eb = edge ? find(flow, edge.to) : null;
  const nP = n?.type === "product" ? productOf(flow, n.id) : null;
  const nSig = n?.type === "data" ? signalOf(flow, n.id) : null, nCh = n?.type === "data" ? changedOf(n.id) : false;
  const nPrompt = n?.type === "photo" ? promptOf(flow, n.id) : null;
  const nMine = n?.type === "photo" && c ? c.out.filter((x) => byId.has(x)) : [];
  const nEarlier = n?.type === "photo" ? shots.filter((s) => s.kind === "image" && !nMine.includes(s.id)) : [];
  const nVideos = n?.type === "photo" ? outs(flow, n.id).filter((x) => x.type === "video") : [];
  const nPh = n?.type === "video" ? inc(flow, n.id).find((x) => x.type === "photo") ?? null : null;
  const nSound = n?.type === "video" ? inc(flow, n.id).find((x) => x.type === "sound") ?? null : null;
  const nFrames = nPh ? cfgOf(nPh).out.filter((x) => byId.has(x)) : [];
  const nFrame = n?.type === "video" ? frameOf(flow, n.id) : null;
  const nClips = n?.type === "video" && c ? c.out.filter((x) => byId.has(x)) : [];
  const nStoryNode = n && (n.type === "video" || n.type === "cut") ? storyNodeOf(flow, n.id) : null, nStory = nStoryNode ? cfgOf(nStoryNode).storyboard ?? null : null;
  const nCut = n?.type === "cut" ? cutStatus(n.id) : { ready: 0, total: 0 };
  const nVoiceNode = n?.type === "video" ? inc(flow, n.id).find((x) => x.type === "sound") ?? null : null;
  const vDir = n?.type === "video" ? directionOf(flow, n.id) : null, vStyle = vDir ? STYLE[vDir.key] : null;
  const vPlan = n?.type === "video" && c ? c.plan ?? null : null, vFits = vDir ? planFits(vPlan, vDir) : false, vPlanning = n ? planning.includes(n.id) : false;
  const vStale = Boolean(vDir && vPlan && vDir.voice && vPlan.shots.some((x) => x.line) && !sameWords(planLines(vPlan), vDir.voice));
  const nChecked = n?.type === "check" ? checkedFor(n.id) : [];
  const nOk = nChecked.filter((s) => passes(checkOf(s.id))).length;
  const sItems = n?.type === "send" ? sendItems(n.id) : { photos: [], clips: [] };
  const sPicked = n?.type === "send" ? pickedFor(n.id) : [];
  const sTarget = n?.type === "send" && c ? batches.find((b) => b.id === c.send) ?? null : null;
  const sNext = n?.type === "send" ? nextStepOf(n.id) : null;
  const sPool = n?.type === "send" ? uniq([...sItems.photos, ...inc(flow, n.id).flatMap((x) => (x.type === "check" ? inc(flow, x.id) : [x])).filter((x) => x.type === "photo").flatMap((x) => cfgOf(x).out)]).filter((x) => byId.has(x)) : [];
  const toggleSend = (x: string) => { if (n) patchNode(n.id, { picked: sPicked.includes(x) ? sPicked.filter((y) => y !== x) : [...sPicked, x] }); };

  const connections = n && (
    <div className="col" style={{ flexShrink: 0 }}>
      <span className="xs w5 i3" style={{ paddingBottom: 4 }}>Wires</span>
      {[...flow.edges.filter((e) => e.to === n.id).map((e) => ({ e, other: find(flow, e.from), dir: "from" })), ...flow.edges.filter((e) => e.from === n.id).map((e) => ({ e, other: find(flow, e.to), dir: "to" }))].map(({ e, other, dir }) => other && (
        <div key={e.id} className="row g8" style={{ minHeight: 28, borderTop: "1px solid var(--line)" }}>
          <span style={{ width: 10, height: 2, background: wireColor(dir === "from" ? other.type : n.type), flexShrink: 0 }} />
          <button type="button" className="xs i1 fill" style={{ textAlign: "left" }} onClick={() => select(other.id)}><span className="i3">{dir === "from" ? "from" : "to"}</span> {NODES[other.type].name}</button>
          <button type="button" aria-label="Remove wire" title="Remove wire" onClick={() => removeEdge(e.id)} style={{ display: "flex" }}><Icon name="x" size={11} color="#B5B2AC" /></button>
        </div>
      ))}
      <div className="row g4" style={{ flexWrap: "wrap", paddingTop: 6 }}>
        {ALLOWED[n.type].map((t) => <button key={t} type="button" className="row g4 xs i2" onClick={() => addNode(t, undefined, n.id)} style={{ height: 22, padding: "0 7px", borderRadius: 6, border: "1px solid var(--line-2)", background: "#fff" }}><Icon name="plus" size={10} />{NODES[t].name}</button>)}
      </div>
    </div>
  );

  const inspector = (
    <aside className="col" style={{ width: 292, flexShrink: 0, borderLeft: "1px solid var(--line)", background: "#fff", padding: "14px 16px", gap: 12, overflowY: "auto" }} aria-label="Inspector">
      {!n && !edge && <>
        <div className="row g10" style={{ flexShrink: 0 }}><span style={{ width: 32, height: 32, borderRadius: 8, background: "var(--tray)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="layers" size={15} /></span>
          <div className="col fill"><span className="sm w5 i1">{name}</span><span className="xs i3">{flow.nodes.length} nodes · {flow.edges.length} wires</span></div></div>
        <span className="xs i2" style={{ lineHeight: "17px", padding: "8px 10px", borderRadius: 8, background: "var(--tray)" }}>Run flow follows the wires: Remy writes each Prompt from what’s wired into it, every Photo node makes its photos, Otto checks the ones wired to a Check, Video nodes start from a wired photo, and Send to collects what passed.</span>
        <Field label="One run">{([["Photo nodes", flow.nodes.filter((x) => x.type === "photo").length], ["Video nodes", flow.nodes.filter((x) => x.type === "video").length], ["Costs about", usd(cost)]] as const).map(([a, b]) => (
          <div key={a} className="row between" style={{ height: 26, borderTop: "1px solid var(--line)" }}><span className="xs i2">{a}</span><span className="xs w5 i1">{b}</span></div>))}</Field>
        <span className="xs i3">Select a node to set it up, or a wire to remove it.</span>
      </>}

      {edge && ea && eb && <>
          <div className="row g10" style={{ flexShrink: 0 }}><span style={{ width: 32, height: 32, borderRadius: 8, background: "var(--tray)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ width: 14, height: 2.5, background: wireColor(ea.type) }} /></span>
            <div className="col fill"><span className="sm w5 i1">Wire</span><span className="xs i3">{NODES[ea.type].name} → {NODES[eb.type].name}</span></div></div>
          <span className="xs i2" style={{ lineHeight: "17px", padding: "8px 10px", borderRadius: 8, background: "var(--tray)" }}>Carries {NODES[ea.type].outs} from {NODES[ea.type].name} into {NODES[eb.type].name}.</span>
          <div className="row g6"><button type="button" className="btn sm" onClick={() => select(ea.id)}>{NODES[ea.type].name}</button><Icon name="arrow-r" size={12} color="#B5B2AC" /><button type="button" className="btn sm" onClick={() => select(eb.id)}>{NODES[eb.type].name}</button></div>
          <button type="button" className="btn" onClick={() => removeEdge(edge.id)} style={{ justifyContent: "center" }}><Icon name="x" size={12} />Remove wire</button>
          <span className="xs i3">Or press Delete. To move it, drag either end to another port.</span>
        </>}

      {n && c && <>
        <div className="row g10" style={{ flexShrink: 0, position: "relative" }}>
          <Tile k={n.type} size={32} icon={n.type === "product" ? <ShopifyLogo size={15} /> : undefined} />
          <div className="col fill" style={{ minWidth: 0 }}><span className="sm w5 i1">{NODES[n.type].name}</span><span className="xs i3 ell">{NODES[n.type].sub}</span></div>
          <button type="button" aria-label="More" onClick={() => setMenu(!menu)} className="hv" style={{ width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="more" size={16} color="#8B8883" /></button>
          {menu && (
            <div className="col" style={{ position: "absolute", right: 0, top: 30, zIndex: 5, width: 200, padding: 4, background: "#fff", borderRadius: 10, boxShadow: "0 0 0 1px var(--line), 0 8px 24px rgba(18,18,18,.12)" }}>
              <MenuItem icon="info" href={`${base}/creative/shoots/nodes`}>What this node does</MenuItem>
              {n.type === "data" && signalOf(flow, n.id) && <MenuItem icon="lightning" href={`${base}/signals/${signalOf(flow, n.id)!.key}`}>Open the signal</MenuItem>}
              <MenuItem icon="copy" onClick={() => duplicate(n.id)}>Duplicate · ⌘D</MenuItem>
              <MenuItem icon="x" onClick={() => removeNode(n.id)}>Delete node · ⌫</MenuItem>
            </div>
          )}
        </div>
        <span className="xs i2" style={{ lineHeight: "17px", flexShrink: 0, padding: "8px 10px", borderRadius: 8, background: "var(--tray)" }}>{NODES[n.type].does}</span>

        {n.type === "character" && <CharacterPicker slug={slug} characters={props.characters} value={c.characterId} onChange={(id) => patchNode(n.id, { characterId: id })} price={perImage}
          signal={(() => { const d = flow.nodes.find((x) => x.type === "data"); const sg = d ? signals.find((y) => y.key === cfgOf(d).signal) : null; return sg ? `${sg.data}: ${sg.value ?? ""}` : null; })()} product={headProduct?.title ?? null} onView={(id) => setViewer({ node: n.id, id })} />}

        {n.type === "product" && <>
          <Field label="Product" sub="Search the whole catalog — products with a Shopify photo">
            <ProductCombo slug={slug} value={nP} products={products} currency={props.currency} onPick={(p) => patchNode(n.id, { product: p.url, item: p })} />
          </Field>
          {nP && <div className="col" style={{ flexShrink: 0 }}>
            <span className="xs w5 i3" style={{ paddingBottom: 4 }}>What Cleo brings in</span>
            {([["Price", nP.price != null ? new Intl.NumberFormat("en", { style: "currency", currency: props.currency }).format(nP.price) : "—"], ["In stock", nP.stock != null ? String(nP.stock) : "—"], ["Photo", "Shopify’s main photo"]] as const).map(([a, b]) => (
              <div key={a} className="row between" style={{ height: 26, borderTop: "1px solid var(--line)" }}><span className="xs i2">{a}</span><span className="xs w5 i1">{b}</span></div>))}
          </div>}
          <div className="row top g8" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", flexShrink: 0 }}><Icon name="lock" size={13} color="#1F8A5B" /><span className="xs i2" style={{ lineHeight: "16px" }}><b className="w5 i1">Label + shape locked.</b> Every photo and clip starts from this real photo, so the product looks like what arrives.</span></div>
        </>}

        {n.type === "data" && <>
          <Field label="Signal" sub={nSig ? `Shopify ${nSig.group.toLowerCase()} · from the latest sync` : "No signal — a general product shoot"}>
            <Combo label="Signal" value={c.signal ?? ""} onChange={(v) => patchNode(n.id, { signal: v || null, rules: [] })} icon={<Icon name="lightning" size={13} color={CAT.in} />}
              options={[...signals.map((x) => ({ value: x.key, label: x.data, sub: x.group === "Market research" ? `Market research · ${x.value ?? ""}` : x.value ?? undefined })), { value: "", label: "No signal", sub: "a general product shoot", tone: "muted" as const }]} />
          </Field>
          {nSig && <div className="col" style={{ flexShrink: 0 }}>
            <span className="xs w5 i3" style={{ paddingBottom: 4 }}>What the data says</span>
            {nSig.evidence.map(([a, b]) => <div key={a} className="row between g8" style={{ minHeight: 26, borderTop: "1px solid var(--line)" }}><span className="xs i2">{a}</span><span className="xs w5 i1" style={{ textAlign: "right" }}>{b}</span></div>)}
          </div>}
          {nSig && FIELDS[nSig.key] && <Field label="Where it comes from"><div className="row g4" style={{ flexWrap: "wrap" }}>{FIELDS[nSig.key].map((f) => <Tag key={f} t={f} color={TOK.data} />)}</div></Field>}
          <div className="col" style={{ flexShrink: 0 }}>
            <div className="row between" style={{ paddingBottom: 4 }}><span className="xs w5 i3">How it shapes the shoot</span><span className="row g4 xs i2"><AgentFace kind="builder" size={14} mood="happy" />Remy</span></div>
            {c.rules.map((r, i) => (
              <div key={i} className="row top g8" style={{ padding: "7px 0", borderTop: "1px solid var(--line)" }}>
                <button type="button" role="checkbox" aria-checked={r.on} aria-label={r.text} onClick={() => patchNode(n.id, { rules: c.rules.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) })} style={{ display: "flex" }}>
                  <Icon name={r.on ? "check-circle" : "circle"} size={13} weight={r.on ? "fill" : "regular"} color={r.on ? TOK.data : "#B5B2AC"} /></button>
                <span className={`xs fill ${r.on ? "i1" : "i3"}`} style={{ lineHeight: "16px" }}>{r.text}</span>
                <button type="button" aria-label="Remove rule" onClick={() => patchNode(n.id, { rules: c.rules.filter((_, j) => j !== i) })} style={{ display: "flex" }}><Icon name="x" size={11} color="#B5B2AC" /></button>
              </div>
            ))}
            {!c.rules.length && <span className="xs i3" style={{ padding: "7px 0", borderTop: "1px solid var(--line)", lineHeight: "16px" }}>Remy writes these from the signal on the next run — or add your own.</span>}
            <form className="row g4" style={{ paddingTop: 6 }} onSubmit={(e) => { e.preventDefault(); if (newRule.trim()) { patchNode(n.id, { rules: [...c.rules, { text: newRule.trim().slice(0, 80), on: true }] }); setNewRule(""); } }}>
              <Icon name="plus" size={11} color="#55534F" /><input value={newRule} onChange={(e) => setNewRule(e.target.value)} placeholder="Add a rule" aria-label="Add a rule" style={{ border: 0, outline: 0, flex: 1, font: "inherit", fontSize: 11.5 }} />
            </form>
          </div>
          <div className="col g4" style={{ flexShrink: 0, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
            <div className="row g8"><span className="xs i1 fill">Re-run when the number changes</span><Switch label="Re-run when the number changes" on={c.rerun} onChange={(v) => patchNode(n.id, { rerun: v })} /></div>
            <span className="xs i3" style={{ lineHeight: "15px" }}>{nCh ? "It changed since the last run — run again to match." : "Kaviar flags this shoot when the number moves; nothing is spent until someone runs it."}</span>
          </div>
        </>}

        {n.type === "brand" && <>
          <Field label="Colours" sub={props.look ?? undefined}>
            <div className="row g6">{props.palette.slice(0, 6).map((x) => <span key={x} title={x} style={{ width: 24, height: 24, borderRadius: 99, background: x, boxShadow: "0 0 0 1px var(--line)" }} />)}{!props.palette.length && <span className="xs i3">The brand analysis hasn’t found a palette yet.</span>}</div>
          </Field>
          <Field label="Tone"><span className="xs i1">{props.tone ?? "Not set in the brand profile"}</span></Field>
          <Field label="Follow the kit"><Pills label="Follow the kit" value={c.strict ? "strict" : "loose"} options={[["strict", "Strict"], ["loose", "Loose"]]} onChange={(v) => patchNode(n.id, { strict: v === "strict" })} /></Field>
          <div className="col" style={{ flexShrink: 0 }}>
            <span className="xs w5 i3" style={{ paddingBottom: 4 }}>Rules for every shoot</span>
            {c.brandRules.map((r, i) => <div key={i} className="row g8" style={{ minHeight: 28, borderTop: "1px solid var(--line)" }}><Icon name="blocked" size={12} color="#B7791F" /><span className="xs i1 fill">{r}</span><button type="button" aria-label="Remove rule" onClick={() => patchNode(n.id, { brandRules: c.brandRules.filter((_, j) => j !== i) })} style={{ display: "flex" }}><Icon name="x" size={11} color="#B5B2AC" /></button></div>)}
            <form className="row g4" style={{ paddingTop: 6 }} onSubmit={(e) => { e.preventDefault(); const v = (new FormData(e.currentTarget).get("r") as string).trim(); if (v) { patchNode(n.id, { brandRules: [...c.brandRules, v.slice(0, 60)] }); e.currentTarget.reset(); } }}>
              <Icon name="plus" size={11} color="#55534F" /><input name="r" placeholder="Add a rule, e.g. no models’ faces" aria-label="Add a brand rule" style={{ border: 0, outline: 0, flex: 1, font: "inherit", fontSize: 11.5 }} />
            </form>
          </div>
        </>}

        {n.type === "wins" && <>
          <div className="row g8" style={{ flexShrink: 0 }}><span className="xs i1 fill">Strong lessons only</span><Switch label="Strong lessons only" on={c.strongOnly} onChange={(v) => patchNode(n.id, { strongOnly: v })} /></div>
          {props.lessons.length ? props.lessons.map((l) => (
            <div key={l.lesson} className="col g2" style={{ padding: "8px 0", borderTop: "1px solid var(--line)", flexShrink: 0, opacity: c.strongOnly && l.strength !== "Strong" ? 0.45 : 1 }}>
              <span className="row between"><span className="eyebrow">{l.dimension}</span><span className={`xs w5 ${l.strength === "Strong" ? "c-green" : "i3"}`}>{l.strength}</span></span>
              <span className="xs i1" style={{ lineHeight: "16px" }}>{l.lesson}</span><span className="xs i3" style={{ lineHeight: "15px" }}>{l.evidence}</span>
            </div>
          )) : <span className="xs i3" style={{ lineHeight: "16px" }}>No lessons yet. Iris writes them from the live Meta ads and the team’s reviews of Remy’s drafts.</span>}
          <Link className="lnk xs i2 row g4" href={`${base}/creative/insights`}>Open Insights<Icon name="arrow-r" size={11} /></Link>
        </>}

        {n.type === "reference" && <>
          <Field label="Brand photo" sub={refs.length ? "From Brand assets" : "Upload one, or pick from your store below"}>
            <div className="row g6" style={{ flexWrap: "wrap" }}>
              {refs.slice(0, 15).map((r) => <Thumb key={r.id} id={r.id} w={56} h={56} ring={c.reference?.id === r.id} onClick={() => pickReference(n.id, r.id)} title={r.name} />)}
              <button type="button" className="nodrag" disabled={running} onClick={() => refFile.current?.click()} title="Upload a photo — JPG, PNG or WebP under 4 MB. It joins Brand assets."
                style={{ width: 56, height: 56, borderRadius: 6, border: "1px dashed var(--line-2)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, color: "var(--ink-2)", fontSize: 10.5 }}><Icon name="upload" size={14} />Upload</button>
              <input ref={refFile} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { const fd = new FormData(); fd.set("file", f); addReference(n.id, () => uploadReference(slug, fd)); } }} />
            </div>
          </Field>
          {store.length > 0 && <Field label="From your store" sub="Your Shopify product photos">
            <div className="row g6" style={{ flexWrap: "wrap", maxHeight: 190, overflowY: "auto", padding: 2 }}>
              {store.map((x) => (
                <button key={x.url} type="button" className="nodrag thumb-hover" disabled={running} title={x.name} onClick={() => addReference(n.id, () => storeReference(slug, x.url))}
                  style={{ width: 56, height: 56, borderRadius: 6, overflow: "hidden", flexShrink: 0, padding: 0, background: "var(--tray)", boxShadow: "0 0 0 1px var(--line)" }}>
                  <img src={`${x.url}${x.url.includes("?") ? "&" : "?"}width=160`} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </button>))}
            </div>
          </Field>}
          {c.reference && <Field label="What Remy borrows"><span className="xs i1" style={{ lineHeight: "16px", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)" }}>{c.reference.note}</span></Field>}
          <Field label="How closely to follow"><Pills label="How closely to follow" value={c.reference?.close ? "close" : "loose"} options={[["loose", "Loosely"], ["close", "Closely"]]} onChange={(v) => c.reference && patchNode(n.id, { reference: { ...c.reference, close: v === "close" } })} /></Field>
        </>}

        {n.type === "prompt" && <>
          <Field label="Prompt" sub={c.segments && c.prompt === joinSegs(c.segments) ? "Written by Remy · edit it and it’s yours" : c.prompt ? "Edited by hand" : undefined}>
            <textarea value={c.prompt} rows={18} onChange={(e) => patchNode(n.id, { prompt: e.target.value, promptFor: keyOf(flow, n) }, false)} placeholder="Describe the scene, or let Remy write it from the inputs wired in."
              style={{ border: "1px solid var(--line-2)", borderRadius: 8, padding: 8, resize: "vertical", font: "inherit", fontSize: 12, lineHeight: "17px" }} />
          </Field>
          <Field label="Scene" sub={isUgc(c.scene) && !inc(flow, n.id).some((x) => x.type === "character") ? "UGC scene — wire a Character in to keep the same person in every shot" : undefined}>
            <ScenePick value={c.scene} examples={props.examples} onChange={(v) => patchNode(n.id, { scene: v })} />
          </Field>
          <Field label="Length"><Pills label="Length" value={c.length} options={[["short", "Short"], ["medium", "Medium"], ["detailed", "Detailed"]]} onChange={(v) => patchNode(n.id, { length: v })} /></Field>
          {c.segments && c.prompt === joinSegs(c.segments) && <div className="col" style={{ flexShrink: 0 }}>
            <span className="xs w5 i3" style={{ paddingBottom: 4 }}>Where each phrase came from</span>
            {(["product", "data", "brand", "wins"] as const).map((k) => { const s = c.segments!.filter((x) => x.source === k); return s.length ? (
              <div key={k} className="row top g8" style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}><span style={{ width: 10, height: 2, background: TOK[k], marginTop: 7, flexShrink: 0 }} /><span className="xs i3" style={{ width: 52, flexShrink: 0 }}>{k === "data" ? "Data" : k === "wins" ? "Wins" : k[0].toUpperCase() + k.slice(1)}</span><span className="xs i1" style={{ lineHeight: "16px" }}>{s.map((x) => x.text.trim()).join(" · ")}</span></div>) : null; })}
          </div>}
          <button type="button" className="btn dark" disabled={busy} onClick={() => runNode(n.id)} style={{ justifyContent: "center", flexShrink: 0 }}>
            {status[n.id] === "running" ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : <Icon name="refresh" size={12} color="#fff" />}{c.prompt ? "Rewrite with Remy" : "Write with Remy"}</button>
        </>}

        {n.type === "photo" && <>
            {props.engines.photoModels.length > 1
              ? <Field label="Model" sub={(props.engines.photoModels.find((x) => x.key === (c.model ?? props.engines.photoModel)) ?? props.engines.photoModels[0]).note}>
                  <Combo label="Model" value={c.model ?? props.engines.photoModel} onChange={(v) => patchNode(n.id, { model: v })}
                    options={props.engines.photoModels.map((x) => ({ value: x.key, label: x.name, sub: `${usd(x.price)} a photo · keeps the real product from the Shopify photo` }))} />
                </Field>
              : <Field label="Model" sub="Keeps the real product from the Shopify photo"><div className="row g8" style={{ height: 34, padding: "0 10px", border: "1px solid var(--line-2)", borderRadius: 8 }}><Icon name="pencil" size={13} color={CAT.make} /><span className="sm i1">{props.engines.photo}</span><span className="xs i3">via {props.engines.via}</span></div></Field>}
            <Field label="Scene" sub={nPrompt ? "Set on the Prompt wired in" : "Wire a Prompt in to set the scene"}>{nPrompt ? <ScenePick value={cfgOf(nPrompt).scene} examples={props.examples} onChange={(v) => patchNode(nPrompt.id, { scene: v })} /> : <span className="xs i3">—</span>}</Field>
            <div className="row g6" style={{ flexShrink: 0 }}><Pills label="Size" value={c.aspect} options={[["4:5", "4:5"], ["9:16", "9:16"], ["1:1", "1:1"]]} onChange={(v) => patchNode(n.id, { aspect: v })} /><span className="fill" /><Pills label="Count" value={c.n} options={[[1, "× 1"], [2, "× 2"], [4, "× 4"]]} onChange={(v) => patchNode(n.id, { n: v })} /></div>
            {(nMine.length > 0 || nEarlier.length > 0) && <Field label={focusShot ? "Selected photo" : "Pick a photo to edit or design"}>
              {focusShot && focusShot.kind === "image" && <div className="col g6">
                <img src={asset(focusShot.id)} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 8, background: "var(--tray)" }} />
                {checkOf(focusShot.id) && <span className={`xs ${passes(checkOf(focusShot.id)) ? "c-green" : "c-amber"}`}>Otto: {checkOf(focusShot.id)!.note}</span>}
                <div className="row g4" style={{ flexWrap: "wrap" }}>
                  <button type="button" className="btn dark sm" disabled={busy} onClick={() => design(focusShot.id)}><Icon name="pen" size={12} color="#fff" />Design in Editor</button>
                  {nVideos.map((v, i) => <button key={v.id} type="button" className="btn sm" onClick={() => patchNode(v.id, { from: focusShot.id })}>Start {nVideos.length > 1 ? `clip ${i + 1}` : "the clip"} here</button>)}
                </div>
                <span className="xs w5 i3">Edit it · {usd(perImage)} each, the original stays</span>
                <div className="row g4" style={{ flexWrap: "wrap" }}>
                  {([["remove-bg", "Remove bg"], ["extend", "Extend to 9:16"], ["relight", "Relight"]] as const).map(([k, l]) => <button key={k} type="button" className="btn sm" disabled={busy} onClick={() => edit(n.id, focusShot.id, k)}><Icon name="brush" size={12} />{l}</button>)}
                </div>
                <span className="row g10 xs"><a className="lnk i2" href={asset(focusShot.id)} download>Download</a><button type="button" className="lnk i3" onClick={() => go(async () => { await deleteShot(slug, focusShot.id); setFocus(null); patchNode(n.id, { out: cfgOf(find(flowRef.current, n.id)!).out.filter((x) => x !== focusShot.id) }, false); router.refresh(); })}>Delete</button></span>
              </div>}
              <div className="row g4" style={{ flexWrap: "wrap" }}>{[...nMine, ...nEarlier.map((s) => s.id)].slice(0, 24).map((x) => <Thumb key={x} id={x} w={56} h={56} ring={focus === x} flag={flagOf(checkOf(x))} onClick={() => setFocus(x)} />)}</div>
              {nEarlier.length > 0 && <span className="xs i3">{nEarlier.length} nEarlier · all are in the Editor’s Media panel too</span>}
            </Field>}
            <div className="col g6" style={{ flexShrink: 0, marginTop: "auto" }}>
              <button type="button" className="btn dark" disabled={busy} onClick={() => runNode(n.id)} style={{ justifyContent: "center" }}><Icon name="play" size={12} weight="fill" color="#fff" />Run this node · {usd(c.n * perImage)}</button>
              <span className="xs i3" style={{ textAlign: "center" }}>about 20 seconds · product stays locked</span>
            </div>
          </>}

        {n.type === "story" && c && (
          <StoryPanel cfg={c} story={c.storyboard ?? null} busy={busy} working={working[n.id] ?? null} perImage={perImage} byId={byId}
            hasProduct={Boolean(productOf(flow, n.id))} hasPerson={Boolean(up(flow, n.id, "character"))}
            onPatch={(x, save = true) => patchNode(n.id, x, save)} onWrite={() => go(() => storyWrite(n.id))} onFrames={(ids) => go(() => storyFrames(n.id, ids))} onView={(x) => setViewer({ node: n.id, id: x })} />
        )}

        {n.type === "video" && nStoryNode && c && <>
            {props.engines.models.length > 1
              ? <Field label="Model" sub={clipModel(props.engines, perVideoSecond, c.model).note}>
                  <Combo label="Model" value={clipModel(props.engines, perVideoSecond, c.model).key} onChange={(v) => patchNode(n.id, { model: v })}
                    options={props.engines.models.map((x) => ({ value: x.key, label: x.name, sub: `${usd(x.rate.second * (x.rate.res[c.res ?? "720p"] ?? 1))} a second at this quality` }))} />
                </Field>
              : <Field label="Model"><div className="row g8" style={{ height: 34, padding: "0 10px", border: "1px solid var(--line-2)", borderRadius: 8 }}><Icon name="pencil" size={13} color={CAT.make} /><span className="sm i1">{props.engines.video}</span><span className="xs i3">via {props.engines.via}</span></div></Field>}
            <SceneRenderPanel story={nStory} sceneOut={c.sceneOut ?? {}} jobs={c.jobs ?? []} jobState={jobState} busy={busy} res={c.res ?? "720p"} via={props.engines.via} perVideoSecond={clipModel(props.engines, perVideoSecond, c.model).rate.second} resMul={clipModel(props.engines, perVideoSecond, c.model).rate.res}
              voice={nVoiceNode && cfgOf(nVoiceNode).voiceId ? props.voices.find((v) => v.id === cfgOf(nVoiceNode).voiceId)?.name ?? "Brand voice" : null} byId={byId}
              onRes={(r) => patchNode(n.id, { res: r })} onRender={(ids) => go(async () => { const r = await scenesRun(n.id, ids); if (r.jobs) setMsg(`${r.jobs} scene${r.jobs > 1 ? "s are" : " is"} rendering — usually 3–6 minutes.`); })} onView={(x) => setViewer({ node: n.id, id: x })} />
          </>}

        {n.type === "cut" && c && (
          <CutPanel cfg={c} story={nStory} ready={nCut.ready} total={nCut.total} busy={busy} working={status[n.id] === "running"} onPatch={(x) => patchNode(n.id, x)} onCut={() => go(() => cutRun(n.id))} />
        )}

        {n.type === "video" && !nStoryNode && <>
            {props.engines.models.length > 1
              ? <Field label="Model" sub={clipModel(props.engines, perVideoSecond, c.model).note}>
                  <Combo label="Model" value={clipModel(props.engines, perVideoSecond, c.model).key} onChange={(v) => patchNode(n.id, { model: v })}
                    options={props.engines.models.map((x) => ({ value: x.key, label: x.name, sub: `${usd(x.rate.second * (x.rate.res[c.res ?? "720p"] ?? 1))} a second at this quality` }))} />
                </Field>
              : <Field label="Model"><div className="row g8" style={{ height: 34, padding: "0 10px", border: "1px solid var(--line-2)", borderRadius: 8 }}><Icon name="pencil" size={13} color={CAT.make} /><span className="sm i1">{props.engines.video}</span><span className="xs i3">via {props.engines.via}</span></div></Field>}
            <Field label="Start frame" sub={nFrames.length > 1 ? "Click another photo to start from it" : undefined}>
              {nFrame ? <div className="col g6"><div className="row g8"><Thumb id={nFrame} w={40} h={50} /><div className="col"><span className="xs w5 i1">From the Photo node</span><span className="xs i3">{c.from ? "picked by hand" : "Otto’s best pass"}</span></div></div>
                {nFrames.length > 1 && <div className="row g4" style={{ flexWrap: "wrap" }}>{nFrames.map((x) => <Thumb key={x} id={x} w={34} h={34} ring={x === nFrame} onClick={() => patchNode(n.id, { from: x })} />)}</div>}</div>
                : <span className="xs i3">{nPh ? "Run the Photo node first — the clip starts from one of its photos." : "Wire a Photo node into this one (its bottom port to this node’s top)."}</span>}
            </Field>
            {vDir && vStyle && <>
              <Field label="Shooting style" sub={vDir.auto ? `Picked for ${vDir.scene ? `“${vDir.scene}”` : "this scene"}${vDir.withPerson ? " with a person on camera" : ""} — choose one to direct it yourself.` : undefined}>
                <Combo label="Shooting style" value={vDir.auto ? "auto" : vDir.key} onChange={(v) => patchNode(n.id, { style: v, plan: null })}
                  options={[{ value: "auto", label: `Auto · ${STYLE[vDir.autoKey].name}`, sub: "Remy picks from the scene and who’s in it" }, ...STYLES.map((x) => ({ value: x.key, label: x.name, sub: `${x.group} · ${x.look}` }))]} />
              </Field>
              <div className="col g6" style={{ padding: "10px 12px", borderRadius: 10, background: "var(--tray)", flexShrink: 0 }}>
                <span className="row g6 xs w5 i1"><Icon name="video" size={12} color={CAT.make} />How a pro films it</span>
                {([["Camera", vStyle.camera], ["Light", vStyle.light], ["Edit", vStyle.edit]] as const).map(([a, b]) => (
                  <div key={a} className="row top g8"><span className="xs i3" style={{ width: 44, flexShrink: 0 }}>{a}</span><span className="xs i2" style={{ lineHeight: "16px" }}>{b}</span></div>))}
              </div>
            </>}
            <div className="row g6" style={{ flexShrink: 0, flexWrap: "wrap" }}>
              <Pills label="Length" value={c.seconds} options={props.engines.via === "Higgsfield" ? [[5, "5s"], [10, "10s"], [15, "15s"], [20, "20s"], [30, "30s"]] : [[5, "5s"], [10, "10s"]]}
                onChange={(v) => patchNode(n.id, { seconds: v, plan: c.plan && c.plan.shots.length * 1.5 <= v ? { ...c.plan, seconds: v, shots: fitTimes(c.plan.shots, v) } : null })} />
              {props.engines.via === "Higgsfield" && <Pills label="Quality" value={c.res ?? "720p"} options={[["480p", "Draft"], ["720p", "Standard"], ["1080p", "High"]]} onChange={(v) => patchNode(n.id, { res: v })} />}
              {props.engines.via !== "Higgsfield" && <Pills label="Size" value={c.aspect === "1:1" ? "1:1" : "9:16"} options={[["9:16", "9:16"], ["1:1", "1:1"]]} onChange={(v) => patchNode(n.id, { aspect: v })} />}
              <span className="fill" /><Pills label="Count" value={c.n} options={[[1, "× 1"], [2, "× 2"], [3, "× 3"]]} onChange={(v) => patchNode(n.id, { n: v })} />
            </div>
            {vDir && <Field label="Shots in the clip">
              <Pills label="Shots" value={c.shotCount ?? 0} options={[[0, `Auto · ${autoShots(vDir.key, c.seconds)}`], [1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"]]}
                onChange={(v) => patchNode(n.id, { shotCount: v || null, ...(v && c.plan && c.plan.shots.length !== v ? { plan: null } : {}) })} />
            </Field>}
            {vDir && <Field label="Shot list">
              {vPlan ? <div className="col g8">
                  {!vFits && <span className="xs c-amber" style={{ lineHeight: "16px" }}>Planned for {STYLE[vPlan.style]?.name ?? "another style"}{vPlan.seconds !== c.seconds ? ` · ${vPlan.seconds}s` : ""} — Remy re-plans it on the next run.</span>}
                  {vStale && <span className="xs c-amber" style={{ lineHeight: "16px" }}>The voice line changed — re-plan to place the new words in the shots.</span>}
                  <ShotList plan={vPlan} talk={Boolean(vDir.snd && (vDir.voice || vDir.withPerson))} onChange={(p, save) => editPlan(n.id, p, save)} />
                  <button type="button" className="btn quiet sm" style={{ alignSelf: "flex-start" }} disabled={busy || vPlanning} onClick={() => go(async () => { const r = await planFor(n.id); if (r.error) setMsg(r.error); })}>
                    {vPlanning ? <Icon name="spinner" size={12} className="spin" /> : <Icon name="refresh" size={12} />}Re-plan the shots</button>
                </div>
                : <div className="col g8" style={{ padding: 12, borderRadius: 10, border: "1px dashed var(--line-2)" }}>
                  <span className="xs i2" style={{ lineHeight: "16px" }}>Remy plans the clip like a director: framing, angle, camera move and action{vDir.snd ? ", and who says what," : ""} for every cut. It happens when you run — or plan now to edit the shots first.</span>
                  <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} disabled={busy || vPlanning} onClick={() => go(async () => { const r = await planFor(n.id); if (r.error) setMsg(r.error); })}>
                    {vPlanning ? <Icon name="spinner" size={12} className="spin" /> : <AgentFace kind="builder" size={14} />}{vPlanning ? "Planning…" : "Plan the shots"}</button>
                </div>}
            </Field>}
            {props.engines.via === "Higgsfield" && <span className="xs i3">The clip’s shape follows its start photo — make the photo 9:16 for Reels and Stories.</span>}
            <Field label="Sound">{nSound
              ? <button type="button" className="xs i1" style={{ textAlign: "left", lineHeight: "16px" }} onClick={() => select(nSound.id)}>{props.engines.sound ? soundDirection(cfgOf(nSound)) : "Needs Higgsfield — silent for now"} <span className="i3">· edit</span></button>
              : <span className="xs i2">Silent — wire a Voice + music node into this one for sound.</span>}</Field>
            {nClips.length > 0 && <Field label="Clips">{nClips.map((x) => <video key={x} src={asset(x)} controls muted playsInline style={{ width: "100%", maxHeight: 260, borderRadius: 8, background: "#000", outline: focus === x ? "2px solid #1AA7C8" : undefined }} />)}</Field>}
            <div className="col g6" style={{ flexShrink: 0, marginTop: "auto" }}>
              <button type="button" className="btn dark" disabled={busy || !nFrame} onClick={() => runNode(n.id)} style={{ justifyContent: "center" }}><Icon name="play" size={12} weight="fill" color="#fff" />Run this node · {usd(c.n * clipCost(clipModel(props.engines, perVideoSecond, c.model).rate, c.seconds, c.res))}</button>
              <span className="xs i3" style={{ textAlign: "center" }}>{c.res === "480p" ? "Draft is the quickest — " : ""}usually {renderTime(c.seconds)} · renders in the background</span>
            </div>
          </>}

        {n.type === "sound" && <>
          {!props.engines.sound && <div className="row g8" style={{ padding: "10px 12px", borderRadius: 10, background: "var(--amber-bg)", flexShrink: 0 }}><Icon name="plug" size={14} color="#B7791F" /><span className="xs" style={{ color: "#7A5414", lineHeight: "16px" }}>Sound needs the Higgsfield connection. Until then clips come out silent — add music when uploading to Meta.</span></div>}
          <Field label="Music"><Pills label="Music" value={c.music} options={MUSIC.map((m) => [m, m])} onChange={(v) => patchNode(n.id, { music: v })} /></Field>
          <Field label="Voice line" sub={`${(c.voice ?? "").length}/140 · leave empty for music only`}>
            <textarea value={c.voice} maxLength={140} rows={2} onChange={(e) => patchNode(n.id, { voice: e.target.value }, false)} placeholder="e.g. Running low? Your next bottle ships today."
              style={{ border: "1px solid var(--line-2)", borderRadius: 8, padding: 8, resize: "none", font: "inherit", fontSize: 12, lineHeight: "17px" }} />
          </Field>
          <VoicePicker slug={slug} voices={props.voices} value={c.voiceId} enabled={props.engines.sound} onChange={(id) => patchNode(n.id, { voiceId: id })} />
          {!c.voiceId && <Field label="Voice style"><input value={c.voiceStyle} onChange={(e) => patchNode(n.id, { voiceStyle: e.target.value.slice(0, 60) }, false)} placeholder="e.g. warm, female, English" className="input sm" style={{ height: 30, fontSize: 12 }} /></Field>}
          {props.engines.sound && <span className="xs i3" style={{ lineHeight: "15px" }}>{props.engines.video} makes the sound together with the clip{c.voiceId ? ". With a brand voice it works from the photo as a reference, so check the label in the result" : ""}. Wire this node into a Video node to use it.</span>}
        </>}

        {n.type === "check" && <>
          {nChecked.length ? nChecked.map((s, i) => { const k = checkOf(s.id); return (
            <div key={s.id} className="row top g8" style={{ padding: "8px 0", borderTop: "1px solid var(--line)", flexShrink: 0 }}>
              <Thumb id={s.id} w={40} h={48} onClick={() => setFocus(s.id)} />
              <div className="col g2 fill" style={{ minWidth: 0 }}>
                <span className="xs w5 i1">Photo {i + 1} {k ? (passes(k) ? <span className="c-green">· passed</span> : <span className="c-amber">· {flagOf(k)}</span>) : <span className="i3">· not checked</span>}</span>
                <span className="xs i3" style={{ lineHeight: "15px" }}>{k?.note ?? "Otto hasn’t looked at this one yet."}</span>
                <span className="row g8 xs">{k && !passes(k) && <button type="button" className="lnk i2" disabled={busy} onClick={() => rerunOne(n.id, s.id)}>Re-run · {usd(perImage)}</button>}<button type="button" className="lnk i3" disabled={busy} onClick={() => recheck(s.id, n.id)}>Check {k ? "again" : "now"}</button></span>
              </div>
            </div>); })
            : <span className="xs i3" style={{ lineHeight: "16px" }}>Wire a Photo node in and run it. Otto checks each photo next to the real product: label, shape, colours, and no added text or watermark.</span>}
          {nChecked.length > 0 && <span className="xs i2">{nOk} passed · {nChecked.length - nOk} flagged — flagged photos aren’t sent unless you pick them.</span>}
        </>}

        {n.type === "send" && <>
            <Field label="Destination" sub={c.send ? "They become the batch’s ad photos, in order" : "Kept for the Editor’s Media panel"}>
              <Combo label="Destination" value={c.send ?? ""} onChange={(v) => patchNode(n.id, { send: v || null })} icon={<Icon name="squares" size={13} color={CAT.fin} />}
                options={[...sortedBatches.map((b) => ({ value: b.id, label: b.title, sub: `${b.n} ads${b.signal ? ` · from ${b.signal.startsWith("seg:") ? "market research" : b.signal.replace(/-/g, " ")}` : ""}` })), { value: "", label: "Brand assets", sub: "kept for the Editor’s Media panel" }]} />
            </Field>
            <Field label={`Photos to send · ${sPicked.length}`} sub="Otto pre-picks the ones that pass. Click to change.">
              {sPool.length ? <div className="row g4" style={{ flexWrap: "wrap" }}>{sPool.map((x) => <Thumb key={x} id={x} w={56} h={56} ring={sPicked.includes(x)} flag={flagOf(checkOf(x))} onClick={() => toggleSend(x)} />)}</div>
                : <span className="xs i3">{inc(flow, n.id).length ? "Nothing made yet — Run flow first." : "Wire a Check (or a Photo node) into this one."}</span>}
            </Field>
            {sItems.clips.length > 0 && <span className="xs i3">{sItems.clips.length} clip{sItems.clips.length === 1 ? "" : "s"} wired in — clips are kept in brand assets.</span>}
            <div className="col g6" style={{ flexShrink: 0, marginTop: "auto" }}>
              <button type="button" className="btn dark" disabled={busy || !sPicked.length} onClick={() => send(n.id)} style={{ justifyContent: "center" }}>{c.send ? `Send ${sPicked.length} to batch` : `Keep ${sPicked.length} in brand assets`}</button>
              {sNext && <Link className="btn" href={sNext} style={{ justifyContent: "center" }}>Next: design in Editor<Icon name="arrow-r" size={12} /></Link>}
              {sTarget && <Link className="lnk xs i2" href={`${base}/creative/${sTarget.id}`} style={{ textAlign: "center" }}>Open “{sTarget.title}”</Link>}
            </div>
          </>}

        {connections}
      </>}
    </aside>
  );

  return (
    <>
      <ShootBar base={base} name={name} spend={props.month.cost} counts={reviewCount(props.toReview)}>
        <button type="button" className="btn dark sm" disabled={busy || !flow.nodes.some((x) => x.type === "photo" || x.type === "video")} onClick={runFlow} title="Follows the wires: prompts → photos → Otto’s checks → clips">
          {busy ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : <Icon name="play" size={12} weight="fill" color="#fff" />}{busy ? "Running…" : `Run flow · ≈ ${usd(cost)}`}</button>
      </ShootBar>
      <div className="row fill stretch" style={{ minHeight: 0 }}>{library}{canvas}{inspector}</div>
      {viewer && viewerItems.length > 0 && (
        <ResultViewer key={`${viewer.node}-${viewer.id}`} items={viewerItems} start={Math.max(0, viewerItems.findIndex((x) => x.id === viewer.id))} now={now} busy={busy}
          title={`${NODES[find(flow, viewer.node)?.type ?? "photo"].name} · ${name}`} checkOf={checkOf} onClose={() => setViewer(null)}
          actions={{
            design: (id) => { setViewer(null); design(id); },
            ...(viewerNode?.type === "photo" ? {
              edit: (id, k) => edit(viewerNode.id, id, k), recheck: (id) => recheck(id, viewerNode.id),
              ...(viewerChecks[0] ? { rerun: (id: string) => rerunOne(viewerChecks[0].id, id) } : {}),
              ...(viewerVideos.length ? { startClip: (id: string) => { viewerVideos.forEach((v) => patchNode(v.id, { from: id })); setMsg(`The clip${viewerVideos.length > 1 ? "s" : ""} will start from this photo.`); } } : {}),
            } : {}),
            ...(viewerSend ? { pick: { on: (id: string) => pickedFor(viewerSend.id).includes(id), toggle: (id: string) => { const cur = pickedFor(viewerSend.id); patchNode(viewerSend.id, { picked: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] }); } } } : {}),
            remove: (id) => go(async () => { await deleteShot(slug, id); if (viewerNode) patchNode(viewerNode.id, { out: cfgOf(find(flowRef.current, viewerNode.id)!).out.filter((x) => x !== id) }, false); router.refresh(); }),
          }} />
      )}
    </>
  );
}
