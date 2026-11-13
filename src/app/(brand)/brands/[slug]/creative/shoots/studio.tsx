"use client";
/* eslint-disable @next/next/no-img-element -- product photos and generated media */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteShot, designFromShot, runCheck, runShoot, runVideo, sendShots, suggestPrompt } from "./actions";
import { Icon, type IconName } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { ShootArt } from "@/components/empty";

type Product = { title: string; url: string; price: number | null };
type Check = { labelMatches: boolean; shapeExact: boolean; coloursOnBrand: boolean; noTextOrWatermark: boolean; note: string };
export type Shot = { id: string; kind: "image" | "video"; product: string | null; prompt: string | null; check: Check | null };
export type SignalOpt = { key: string; data: string; value: string | null; evidence: [string, string][] };
type NodeKey = "product" | "signal" | "brand" | "wins" | "prompt" | "photo" | "video" | "sound" | "check" | "send";

const passes = (c: Check | null) => Boolean(c && c.labelMatches && c.shapeExact && c.coloursOnBrand && c.noTextOrWatermark);
const NODE_INFO: Record<NodeKey, [string, string, IconName]> = {
  product: ["Product", "The real Shopify photo the models must keep — label and shape locked.", "box"],
  signal: ["Data signal", "Brings a Shopify number into the shoot, so the scene fits the people who will see the ad.", "lightning"],
  brand: ["Brand kit", "Colours, tone and the rules: no claims, no before/after.", "palette"],
  wins: ["What wins", "Lessons from Insights — what has made money for this brand.", "chart-bar"],
  prompt: ["Prompt · Remy", "Remy writes the scene from every input on the left. Edit it by hand any time.", "pencil"],
  photo: ["Photo · FLUX Kontext", "Puts the real product into the scene. About $0.04 per photo.", "image"],
  video: ["Video · Kling", "Animates the best checked photo into a 5–10 s clip. About $0.04 per second.", "video"],
  sound: ["Voice + music", "Needs an ElevenLabs key — not connected yet.", "megaphone"],
  check: ["Check · Otto", "Otto looks at every photo next to the real product: label, shape, colours, no added text.", "shield"],
  send: ["Send to", "Photos become the ads’ photos in a batch, or stay in brand assets for the Editor.", "arrow-r"],
};

function Node({ k, on, select, status, children, tone }: { k: NodeKey; on: boolean; select: (k: NodeKey) => void; status?: React.ReactNode; children: React.ReactNode; tone?: string }) {
  const [title, , icon] = NODE_INFO[k];
  return (
    <div onClick={() => select(k)} className="col g8" style={{ padding: 10, background: "#fff", borderRadius: 12, cursor: "pointer", border: on ? "1.5px solid #1AA7C8" : "1px solid var(--line)", boxShadow: on ? "0 0 0 3px rgba(26,167,200,.15)" : "0 2px 8px rgba(18,18,18,.04)" }}>
      <span className="row g6 xs"><span style={{ width: 18, height: 18, borderRadius: 5, background: tone ?? "var(--tray)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={11} /></span><b className="w5 i1 fill">{title}</b>{status}</span>
      {children}
    </div>
  );
}

export function ShootStudio({ slug, products, shots, signals, palette, tone, lessons, batches, month, perImage, perVideoSecond }: {
  slug: string; products: Product[]; shots: Shot[]; signals: SignalOpt[]; palette: string[]; tone: string | null; lessons: string[];
  batches: { id: string; title: string; n: number }[]; month: number; perImage: number; perVideoSecond: number;
}) {
  const router = useRouter();
  const [p, setP] = useState<Product | null>(products[0] ?? null);
  const [sig, setSig] = useState<SignalOpt | null>(signals[0] ?? null);
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<"4:5" | "9:16" | "1:1">("4:5");
  const [n, setN] = useState(4);
  const [withVideo, setWithVideo] = useState(false);
  const [seconds, setSeconds] = useState(5);
  const [sel, setSel] = useState<NodeKey>("signal");
  const [run, setRun] = useState<Partial<Record<NodeKey, string>>>({});
  const [fresh, setFresh] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [target, setTarget] = useState<string | null>(batches[0]?.id ?? null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const photos = shots.filter((s) => s.kind === "image");
  const videos = shots.filter((s) => s.kind === "video");
  const current = fresh.length ? photos.filter((s) => fresh.includes(s.id)) : photos.slice(0, 4);
  const cost = n * perImage + (withVideo ? seconds * perVideoSecond : 0);
  const mark = (k: NodeKey, v: string) => setRun((r) => ({ ...r, [k]: v }));

  const writePrompt = async () => {
    if (!p) return null;
    mark("prompt", "writing");
    const r = await suggestPrompt(slug, p.title, sig ? `Ad for ${sig.data}` : "Everyday ritual at home", sig ? { data: sig.data, value: sig.value, evidence: sig.evidence } : null, lessons);
    mark("prompt", r.prompt ? "done" : "error");
    if (r.prompt) setPrompt(r.prompt); else setMsg(r.error ?? null);
    return r.prompt ?? null;
  };

  /** Run flow: prompt → photos → Otto's checks → video from the best photo. */
  const runFlow = () => start(async () => {
    if (!p) return;
    setMsg(null); setRun({}); setFresh([]);
    const text = prompt.trim().length >= 10 ? prompt : await writePrompt();
    if (!text) return;
    mark("photo", "running");
    const r = await runShoot(slug, { product: p.title, imageUrl: p.url, prompt: text, aspect, n });
    if (!r.ids?.length) { mark("photo", "error"); setMsg(r.error ?? "No photos came back."); return; }
    mark("photo", "done"); setFresh(r.ids); router.refresh();
    mark("check", "running");
    const checks = await Promise.all(r.ids.map((id) => runCheck(slug, id, p.url, p.title)));
    mark("check", "done"); router.refresh();
    if (withVideo) {
      const best = r.ids.find((_, i) => passes(checks[i].check ?? null)) ?? r.ids[0];
      mark("video", "running");
      const v = await runVideo(slug, { fromAssetId: best, prompt: text, seconds, aspect: aspect === "1:1" ? "1:1" : "9:16" });
      mark("video", v.id ? "done" : "error");
      if (v.error) setMsg(v.error);
      router.refresh();
    }
    setPicked(r.ids.filter((_, i) => passes(checks[i].check ?? null)));
  });

  const pill = (k: NodeKey) => {
    const s = run[k];
    if (!s) return null;
    if (s === "done") return <span className="xs c-green">done</span>;
    if (s === "error") return <span className="xs c-amber">failed</span>;
    return <Icon name="spinner" size={11} className="spin" />;
  };
  const Thumb = ({ s, size = 54 }: { s: Shot; size?: number }) => {
    const ok = passes(s.check);
    const on = picked.includes(s.id);
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); setPicked(on ? picked.filter((x) => x !== s.id) : [...picked, s.id]); }} title={s.check?.note ?? "Not checked yet"}
        style={{ position: "relative", width: size, height: size * 1.2, padding: 0, border: on ? "2px solid #1AA7C8" : "1px solid var(--line)", borderRadius: 8, overflow: "hidden", cursor: "pointer", background: "var(--tray)" }}>
        <img src={`/api/assets/${s.id}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {s.check && <span style={{ position: "absolute", left: 3, top: 3, width: 14, height: 14, borderRadius: 99, background: ok ? "var(--green)" : "var(--amber)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={ok ? "check" : "warning"} size={8} color="#fff" weight="bold" /></span>}
      </button>
    );
  };
  const col = (children: React.ReactNode) => <div className="col g10" style={{ width: 210, flexShrink: 0 }}>{children}</div>;
  const arrow = <div style={{ width: 22, flexShrink: 0, alignSelf: "stretch", display: "flex", alignItems: "center" }}><svg width="22" height="12"><path d="M0 6h18m-4-4 4 4-4 4" fill="none" stroke="#B5B2AC" strokeWidth="1.5" /></svg></div>;
  const send = () => start(async () => { const r = await sendShots(slug, picked, target); setMsg(r.error ?? (target ? `${r.done} photos are now the ads’ photos in that batch.` : `${r.done} photos kept in brand assets — use them in the Editor.`)); router.refresh(); });

  return (
    <div className="col fill" style={{ minHeight: 0 }}>
      <div className="row g10" style={{ padding: "8px 16px", borderBottom: "1px solid var(--line)" }}>
        <span className="sm w5 i1">{sig ? `${sig.data.split(" ")[0]} shoot` : "Shoot"} · {p?.title ?? "pick a product"}</span>
        <span className="row g6 xs i3"><span className="dot blue" />Inputs<span className="dot green" />Make<span className="dot amber" />Finish</span>
        <span className="fill" />
        {msg && <span className="xs i2 ell" style={{ maxWidth: 360 }} title={msg}>{msg}</span>}
        <span className="xs i3">{month} made this month</span>
        <button type="button" className="btn dark sm" disabled={busy || !p} onClick={runFlow}>
          {busy ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : <Icon name="arrow-r" size={12} color="#fff" />}{busy ? "Running…" : `Run flow · ≈ $${cost.toFixed(2)}`}</button>
      </div>
      <div className="row fill stretch" style={{ minHeight: 0 }}>
        <div className="fill" style={{ overflow: "auto", background: "var(--tray)", backgroundImage: "radial-gradient(#DEDBD5 1px, transparent 1px)", backgroundSize: "16px 16px" }}>
          <div className="row top" style={{ padding: 20, gap: 0, minWidth: "fit-content" }}>
            {col(<>
              <Node k="product" on={sel === "product"} select={setSel} tone="#EAF5EF">
                {p ? <div className="row g8"><img src={p.url} alt="" width={40} height={40} style={{ borderRadius: 7, objectFit: "cover" }} /><div className="col" style={{ minWidth: 0 }}><span className="xs w5 i1 ell">{p.title}</span><span className="xs i3">{p.price ? `$${p.price}` : ""}</span></div></div> : <span className="xs i3">No product photos synced.</span>}
                <select value={p?.url ?? ""} onChange={(e) => setP(products.find((x) => x.url === e.target.value) ?? null)} onClick={(e) => e.stopPropagation()} className="xs" style={{ border: "1px solid var(--line)", borderRadius: 6, padding: 3 }}>{products.map((x) => <option key={x.url} value={x.url}>{x.title}</option>)}</select>
                <span className="row g4 xs i3"><Icon name="lock" size={10} />label + shape locked</span>
              </Node>
              <Node k="signal" on={sel === "signal"} select={setSel} tone="#EDF2FD">
                {sig ? <><span className="sm w5 i1">{sig.data}</span><span className="xs i3" style={{ lineHeight: "15px" }}>{sig.value}</span></> : <span className="xs i3">No signal — a general shoot.</span>}
                <select value={sig?.key ?? ""} onChange={(e) => setSig(signals.find((s) => s.key === e.target.value) ?? null)} onClick={(e) => e.stopPropagation()} className="xs" style={{ border: "1px solid var(--line)", borderRadius: 6, padding: 3 }}>
                  <option value="">No signal</option>{signals.map((s) => <option key={s.key} value={s.key}>{s.data}</option>)}</select>
              </Node>
              <Node k="brand" on={sel === "brand"} select={setSel}>
                <span className="row g4">{(palette.length ? palette : ["#F4F2EE", "#121212"]).slice(0, 5).map((c) => <i key={c} style={{ width: 16, height: 16, borderRadius: 99, background: c, border: "1px solid var(--line)" }} />)}</span>
                <span className="xs i2">{tone ?? "Brand tone from the profile"}</span><span className="xs i3">no claims · no before/after</span>
              </Node>
              <Node k="wins" on={sel === "wins"} select={setSel}>
                {lessons.length ? lessons.slice(0, 3).map((l) => <span key={l} className="xs i2 ell" title={l}>{l}</span>) : <span className="xs i3">Iris’s lessons appear after Insights reads the ads.</span>}
              </Node>
            </>)}
            {arrow}
            {col(
              <Node k="prompt" on={sel === "prompt"} select={setSel} tone="#E6F6FA" status={pill("prompt")}>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onClick={(e) => e.stopPropagation()} rows={9} placeholder="Run the flow and Remy writes this from the inputs — or write the scene yourself."
                  style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8, resize: "vertical", font: "inherit", fontSize: 12, lineHeight: "17px" }} />
                <span className="row g4 xs i3"><span className="dot" style={{ background: "#22A46E" }} />Product<span className="dot blue" />Data<span className="dot amber" />Brand<span className="dot ink" />Wins</span>
                <button type="button" className="btn sm" disabled={busy || !p} onClick={(e) => { e.stopPropagation(); start(async () => { await writePrompt(); }); }}><Icon name="refresh" size={11} />{prompt ? "Rewrite" : "Write"} with Remy</button>
              </Node>,
            )}
            {arrow}
            {col(<>
              <Node k="photo" on={sel === "photo"} select={setSel} tone="#EAF5EF" status={pill("photo")}>
                <div className="row g6" onClick={(e) => e.stopPropagation()}>
                  <div className="seg">{(["4:5", "9:16", "1:1"] as const).map((a) => <button key={a} type="button" className={`o${aspect === a ? " on" : ""}`} onClick={() => setAspect(a)} style={{ padding: "0 6px" }}>{a}</button>)}</div>
                  <select value={n} onChange={(e) => setN(Number(e.target.value))} className="xs" style={{ border: "1px solid var(--line)", borderRadius: 6 }}>{[1, 2, 3, 4].map((k) => <option key={k} value={k}>× {k}</option>)}</select>
                </div>
                <div className="row g4" style={{ flexWrap: "wrap" }}>{current.map((s) => <Thumb key={s.id} s={s} size={42} />)}{!current.length && <span className="xs i3">Photos appear here.</span>}</div>
                <span className="xs i3">≈ ${(n * perImage).toFixed(2)} · {photos.length} made</span>
              </Node>
              <Node k="video" on={sel === "video"} select={setSel} tone="#EAF5EF" status={pill("video")}>
                <label className="row g6 xs" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={withVideo} onChange={(e) => setWithVideo(e.target.checked)} style={{ accentColor: "#121212" }} />Make a clip from the best photo</label>
                {withVideo && <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} onClick={(e) => e.stopPropagation()} className="xs" style={{ border: "1px solid var(--line)", borderRadius: 6, padding: 3 }}><option value={5}>5 seconds · ≈ ${(5 * perVideoSecond).toFixed(2)}</option><option value={10}>10 seconds · ≈ ${(10 * perVideoSecond).toFixed(2)}</option></select>}
                {videos[0] && <video src={`/api/assets/${videos[0].id}`} controls muted playsInline style={{ width: "100%", borderRadius: 8, maxHeight: 220, background: "#000" }} />}
              </Node>
              <Node k="sound" on={sel === "sound"} select={setSel}><span className="xs i3">Voice and music need an ElevenLabs key.</span></Node>
            </>)}
            {arrow}
            {col(<>
              <Node k="check" on={sel === "check"} select={setSel} tone="#FBF3E6" status={pill("check")}>
                {current.filter((s) => s.check).map((s, i) => (
                  <span key={s.id} className={`row g6 xs ${passes(s.check) ? "i2" : "c-amber"}`}><Icon name={passes(s.check) ? "check-circle" : "warning-circle"} size={12} weight={passes(s.check) ? "fill" : "regular"} color={passes(s.check) ? "#1F8A5B" : "#B7791F"} />Photo {i + 1}: {s.check!.note}</span>
                ))}
                {!current.some((s) => s.check) && <span className="xs i3">Label · shape · colours · no added text</span>}
                {current.some((s) => passes(s.check)) && <button type="button" className="btn sm" disabled={busy} onClick={(e) => { e.stopPropagation(); const best = current.find((s) => passes(s.check))!; start(() => designFromShot(slug, best.id)); }}><Icon name="pencil" size={11} />Design an ad with the best photo</button>}
              </Node>
              <Node k="send" on={sel === "send"} select={setSel} tone="#FBF3E6">
                <div className="col g4" onClick={(e) => e.stopPropagation()}>
                  {batches.slice(0, 3).map((b) => <label key={b.id} className="row g6 xs"><input type="radio" checked={target === b.id} onChange={() => setTarget(b.id)} />{b.title}<span className="i3">· {b.n} ads</span></label>)}
                  <label className="row g6 xs"><input type="radio" checked={target === null} onChange={() => setTarget(null)} />Brand assets</label>
                </div>
                <button type="button" className="btn dark sm" disabled={busy || !picked.length} onClick={(e) => { e.stopPropagation(); send(); }}>Send {picked.length} to {target ? "batch" : "assets"}</button>
                <span className="xs i3">Click photos to pick them. Otto pre-picks the ones that pass.</span>
              </Node>
            </>)}
          </div>
          <div className="col g10" style={{ padding: "0 20px 20px" }}>
            <span className="row between"><span className="sm w5">Everything made in Shoots</span><span className="xs i3">Also in the Editor’s Media panel</span></span>
            {shots.length ? (
              <div className="row g8" style={{ flexWrap: "wrap" }}>
                {photos.map((s) => (
                  <div key={s.id} className="col g4" style={{ width: 92 }}>
                    <Thumb s={s} size={92} />
                    <button type="button" className="btn dark sm" disabled={busy} onClick={() => start(() => designFromShot(slug, s.id))}><Icon name="pencil" size={11} color="#fff" />Design</button>
                    <span className="row between xs"><a className="lnk i3" href={`/api/assets/${s.id}`} download>Save</a><button type="button" className="lnk i3" onClick={() => start(async () => { await deleteShot(slug, s.id); router.refresh(); })}>Delete</button></span>
                  </div>
                ))}
                {videos.map((s) => <video key={s.id} src={`/api/assets/${s.id}`} controls muted playsInline style={{ width: 110, borderRadius: 8, background: "#000" }} />)}
              </div>
            ) : (
              <div className="row g24" style={{ padding: 20, border: "1px dashed var(--line-2)", borderRadius: 14, background: "#fff", flexWrap: "wrap", alignItems: "center" }}>
                <ShootArt />
                <div className="col g4" style={{ maxWidth: 300 }}><span className="sm w5">Your first shoot lands here</span><span className="xs i3" style={{ lineHeight: "17px" }}>Pick a product and a signal, then Run flow: Remy writes the scene, the model keeps the real product, Otto checks every photo, and you send the good ones to a batch.</span></div>
              </div>
            )}
          </div>
        </div>
        <aside className="col g10" style={{ width: 280, flexShrink: 0, borderLeft: "1px solid var(--line)", padding: 16, overflowY: "auto" }}>
          <span className="row g8"><Icon name={NODE_INFO[sel][2]} size={15} /><span className="sm w5">{NODE_INFO[sel][0]}</span></span>
          <span className="xs i2" style={{ lineHeight: "17px", padding: "8px 10px", background: "var(--tray)", borderRadius: 8 }}>{NODE_INFO[sel][1]}</span>
          {sel === "signal" && sig && <>
            <span className="xs i3">What the data says</span>
            {sig.evidence.map(([k, v]) => <div key={k} className="row between xs" style={{ minHeight: 24, borderTop: "1px solid var(--line)" }}><span className="i3">{k}</span><span className="i1">{v}</span></div>)}
            <span className="row g6 xs i3" style={{ paddingTop: 6 }}><AgentFace kind="builder" size={13} />How it shapes the shoot</span>
            <span className="xs i2" style={{ lineHeight: "17px" }}>Remy writes the scene for these people — e.g. lapsed buyers see the product already at home, half-used; new buyers see it as a gift.</span>
            <Link className="lnk xs i2" href={`/brands/${slug}/signals/${sig.key}`}>Open the signal →</Link>
          </>}
          {sel === "wins" && lessons.map((l) => <span key={l} className="xs i2" style={{ lineHeight: "17px" }}>• {l}</span>)}
          {sel === "photo" && <span className="xs i3">Model: bfl/flux-kontext-pro via Vercel AI Gateway, billed to the team.</span>}
          {sel === "video" && <span className="xs i3">Model: klingai/kling-v2.6-i2v via Vercel AI Gateway. Takes 1–3 minutes.</span>}
          {sel === "check" && <span className="xs i3">Otto runs on Claude and compares each photo with the Shopify photo. Flagged photos can be deleted or re-run.</span>}
        </aside>
      </div>
    </div>
  );
}
