"use client";
/* eslint-disable @next/next/no-img-element -- product photos and generated images */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteShot, runShoot, suggestPrompt } from "./actions";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { ShootArt } from "@/components/empty";

type Product = { title: string; url: string; price: number | null };
type Shot = { id: string; product: string | null; prompt: string | null; createdAt: string };
const ANGLES = ["Everyday ritual at home", "Gift moment", "Close-up texture, hands", "Outdoor, natural light", "Bathroom shelf flatlay", "Win-back: 'we miss you' mood"];

export function ShootStudio({ slug, products, shots, perImage, month, signals }: { slug: string; products: Product[]; shots: Shot[]; perImage: number; month: number; signals: string[] }) {
  const router = useRouter();
  const [p, setP] = useState<Product | null>(products[0] ?? null);
  const [angle, setAngle] = useState(signals[0] ?? ANGLES[0]);
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<"4:5" | "9:16" | "1:1">("4:5");
  const [n, setN] = useState(2);
  const [msg, setMsg] = useState<string | null>(null);
  const [writing, startWrite] = useTransition();
  const [making, startMake] = useTransition();
  const [, startDel] = useTransition();

  const write = () => p && startWrite(async () => { setMsg(null); const r = await suggestPrompt(slug, p.title, angle); if (r.prompt) setPrompt(r.prompt); else setMsg(r.error ?? null); });
  const make = () => p && startMake(async () => { setMsg(null); const r = await runShoot(slug, { product: p.title, imageUrl: p.url, prompt, aspect, n }); setMsg(r.error ?? `${r.ids?.length} new image${r.ids?.length === 1 ? "" : "s"} — they’re in the Editor’s Media panel.`); router.refresh(); });

  return (
    <div className="row fill stretch" style={{ minHeight: 0 }}>
      <section className="scroll col" style={{ padding: "20px 24px", gap: 16 }}>
        <div className="col g4"><h1 className="h1">Shoots</h1><p className="sm i3">New photos of the brand’s real products, in new scenes. The model keeps the product from the Shopify photo; Remy writes the scene.</p></div>
        <div className="row top g16">
          <div className="col g12 fill" style={{ minWidth: 0 }}>
            <div className="card" style={{ padding: 14, gap: 10 }}>
              <span className="row g8 sm w5"><span className="xs i4">01</span><Icon name="box" size={14} />Product</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8 }}>
                {products.map((x) => (
                  <button key={x.url} type="button" onClick={() => setP(x)} title={x.title} className="col g4" style={{ padding: 0, border: 0, background: "none", cursor: "pointer", textAlign: "left" }}>
                    <img src={x.url} alt={x.title} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, border: p?.url === x.url ? "2px solid var(--ink)" : "1px solid var(--line)" }} />
                    <span className="xs i2 ell">{x.title}</span>
                  </button>
                ))}
              </div>
              {products.length === 0 && <span className="xs i3">No product photos synced from Shopify yet.</span>}
            </div>
            <div className="card" style={{ padding: 14, gap: 10 }}>
              <span className="row g8 sm w5"><span className="xs i4">02</span><Icon name="sparkle" size={14} />Scene</span>
              <div className="row g6" style={{ flexWrap: "wrap" }}>{[...signals, ...ANGLES].slice(0, 8).map((a) => <button key={a} type="button" className={`chip${angle === a ? "" : " dash"}`} onClick={() => setAngle(a)} style={{ height: 28 }}>{a}</button>)}</div>
              <div className="input" style={{ height: "auto", padding: 8 }}>
                <textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the scene — or let Remy write it from the product and the angle." style={{ border: 0, outline: 0, resize: "none", width: "100%", font: "inherit", fontSize: 13, lineHeight: "19px" }} />
              </div>
              <div className="row g8">
                <button type="button" className="btn sm" disabled={!p || writing} onClick={write}>{writing ? <Icon name="spinner" size={12} className="spin" /> : <AgentFace kind="builder" size={14} />}{writing ? "Remy is writing…" : prompt ? "Rewrite with Remy" : "Write it with Remy"}</button>
                <span className="fill" />
                <div className="seg">{(["4:5", "9:16", "1:1"] as const).map((a) => <button key={a} type="button" className={`o${aspect === a ? " on" : ""}`} onClick={() => setAspect(a)}>{a}</button>)}</div>
                <label className="chip" style={{ height: 30 }}><select value={n} onChange={(e) => setN(Number(e.target.value))} style={{ border: 0, outline: 0, background: "transparent", font: "inherit" }}>{[1, 2, 3, 4].map((k) => <option key={k} value={k}>{k} image{k > 1 ? "s" : ""}</option>)}</select></label>
              </div>
            </div>
            <div className="row g10">
              <button type="button" className="btn dark" disabled={!p || prompt.trim().length < 10 || making} onClick={make}>
                {making ? <Icon name="spinner" size={14} className="spin" color="#fff" /> : <Icon name="image" size={14} color="#fff" />}{making ? `Making ${n} image${n > 1 ? "s" : ""}…` : `Generate ${n} image${n > 1 ? "s" : ""}`}</button>
              <span className="xs i3">≈ ${(perImage * n).toFixed(2)} · billed to the Vercel team’s AI Gateway{making ? " · usually 10–30 seconds" : ""}</span>
            </div>
            {msg && <div className={`notice ${/couldn|fail|no |isn|credits/i.test(msg) ? "amber" : "green"}`}><span>{msg}</span></div>}
          </div>
          <div className="col g8" style={{ width: 300, flexShrink: 0 }}>
            <span className="sm w5">Reference</span>
            {p ? <img src={p.url} alt={p.title} style={{ width: "100%", borderRadius: 10, border: "1px solid var(--line)" }} /> : <div className="skel" style={{ height: 200 }} />}
            <span className="xs i3">{p?.title}{p?.price ? ` · ${p.price}` : ""}</span>
            <div className="row top g8" style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10 }}>
              <AgentFace kind="qa" size={16} /><span className="xs i2" style={{ lineHeight: "17px" }}><b className="w5 i1">Otto:</b> check the label and bottle shape on every image before it goes in an ad — models can still drift.</span>
            </div>
          </div>
        </div>
        <div className="row between"><span className="sm w5">Made in Shoots</span><span className="xs i3">{month} this month · ≈ ${(month * perImage).toFixed(2)}</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
          {shots.map((s) => (
            <div key={s.id} className="col g6">
              <a href={`/api/assets/${s.id}`} target="_blank" rel="noreferrer"><img src={`/api/assets/${s.id}`} alt={s.product ?? ""} style={{ width: "100%", aspectRatio: "4 / 5", objectFit: "cover", borderRadius: 10, border: "1px solid var(--line)" }} /></a>
              <span className="xs i2 ell" title={s.prompt ?? ""}>{s.product}</span>
              <div className="row g6">
                <a className="btn sm fill" href={`/api/assets/${s.id}`} download><Icon name="download" size={12} />Save</a>
                <button type="button" className="btn quiet sm" onClick={() => startDel(async () => { await deleteShot(slug, s.id); router.refresh(); })} aria-label="Delete image"><Icon name="x" size={12} /></button>
              </div>
            </div>
          ))}
        </div>
        {shots.length === 0 && (
          <div className="row g24" style={{ padding: 20, border: "1px dashed var(--line-2)", borderRadius: 14, background: "var(--tray)", flexWrap: "wrap", alignItems: "center" }}>
            <ShootArt />
            <div className="col g4" style={{ maxWidth: 280 }}><span className="sm w5">Your first shoot lands here</span><span className="xs i3" style={{ lineHeight: "17px" }}>Pick a product, let Remy write the scene, and generate. New photos also appear in the Editor’s Media panel, ready to drop into an ad.</span></div>
          </div>
        )}
        <Link className="lnk xs i2 row g4" href={`/brands/${slug}/creative/editor`}>Open the Editor<Icon name="arrow-r" size={11} /></Link>
      </section>
    </div>
  );
}
