"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { continueToAnalysis, removeAsset, setInspiration, uploadAssets } from "./actions";
import { BackLink, OnboardingShell } from "./shell";
import { AgentFace } from "@/components/agent";
import { Icon, type IconName } from "@/components/icon";
import type { AssetKind } from "@/lib/db/schema";

export type AssetView = { id: string; kind: AssetKind; name: string; mime: string; size: number; meta: { width?: number; height?: number; pages?: number } };
const mb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const ROWS: { kind: AssetKind; title: string; need: "Required" | "Recommended" | "Optional"; body: string; icon: IconName; accept: string }[] = [
  { kind: "deck", title: "Brand deck", need: "Required", body: "PDF. Iris reads tone, story, claims and visual rules from it.", icon: "pdf", accept: "application/pdf" },
  { kind: "logo", title: "Logos", need: "Required", body: "SVG preferred. Light and dark versions.", icon: "pencil", accept: "image/svg+xml,image/png,image/webp" },
  { kind: "imagery", title: "Product imagery", need: "Recommended", body: "High-res photos, at least 1600 px. Cleo matches them to products.", icon: "image", accept: "image/*" },
  { kind: "video", title: "Videos", need: "Optional", body: "Hero loops or product demos. MP4 or MOV, up to 4 MB here.", icon: "video", accept: "video/mp4,video/quicktime,video/webm" },
  { kind: "guidelines", title: "Brand guidelines", need: "Optional", body: "Colors, type, photography and do-nots.", icon: "file", accept: "application/pdf" },
];

function Tile({ a, onRemove }: { a: AssetView; onRemove: () => void }) {
  const img = a.mime.startsWith("image/");
  const meta = a.mime === "application/pdf" ? `${a.meta.pages ? `${a.meta.pages} pages · ` : ""}${mb(a.size)} · read by Iris` : a.meta.width ? `${a.meta.width} × ${a.meta.height} · ${a.mime.split("/")[1].toUpperCase().replace("SVG+XML", "SVG")}` : `${mb(a.size)} · ${a.mime.split("/")[1].toUpperCase().replace("SVG+XML", "SVG")}`;
  return (
    <div className="row g10 asset-tile" style={{ padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 9, background: "var(--tray)", minWidth: 0, flex: "1 1 220px" }}>
      <span style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid var(--line)", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
        {img ? <img src={`/api/assets/${a.id}`} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <Icon name={a.mime === "application/pdf" ? "pdf" : "video"} size={15} color="#C8423B" />}
      </span>
      <div className="col fill" style={{ minWidth: 0 }}><span className="xs w5 i1 ell">{a.name}</span><span className="xs i3 ell">{meta}</span></div>
      <Icon name="check-circle" size={15} weight="fill" color="#1F8A5B" />
      <button type="button" className="btn quiet sm ic" onClick={onRemove} aria-label={`Remove ${a.name}`} style={{ width: 22, height: 22 }}><Icon name="x" size={12} /></button>
    </div>
  );
}

export function AssetsStep({ id, reached, name, thumb, subs, assets, pulled, inspiration }: {
  id: string; reached: number; name: string; thumb: string | null; subs: (string | undefined)[];
  assets: AssetView[]; pulled: { url: string; w: number | null; h: number | null }[]; inspiration: string[];
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [uploading, setUploading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [drag, setDrag] = useState(false);
  const [going, startGo] = useTransition();
  const pickers = useRef<Record<string, HTMLInputElement | null>>({});
  const by = (k: AssetKind) => assets.filter((a) => a.kind === k);
  const requiredDone = [by("deck").length > 0, by("logo").length > 0].filter(Boolean).length;
  const small = pulled.filter((p) => p.w != null && p.w < 1600).length;

  const upload = (kind: AssetKind | "auto", files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    const fd = new FormData();
    list.forEach((f) => fd.append("files", f));
    setErr(null);
    setUploading(kind);
    start(async () => {
      const r = await uploadAssets(id, kind, fd);
      if (r?.error) setErr(r.error);
      setUploading(null);
      router.refresh();
    });
  };
  const remove = (assetId: string) => start(async () => { await removeAsset(id, assetId); router.refresh(); });
  const saveInspo = (list: string[]) => start(async () => { const r = await setInspiration(id, list); if (r?.error) setErr(r.error); else setUrl(""); router.refresh(); });

  return (
    <OnboardingShell id={id} step={3} reached={reached} name={name} thumb={thumb} subs={subs}
      footer={<>
        <BackLink href={`/brands/new/${id}/basics`} />
        <span className="fill" />
        <span className="xs i3">{uploading ? "Uploading…" : requiredDone < 2 ? "Skip what you don’t have — Iris flags it in review" : "Iris reads everything in the next step"}</span>
        <button type="button" className="btn dark" disabled={busy || going} onClick={() => startGo(() => continueToAnalysis(id))}>{going ? "Starting…" : "Continue"}<Icon name="arrow-r" size={13} color="#fff" /></button>
      </>}>
      <div className="col g20" style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 40px" }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); upload("auto", e.dataTransfer.files); }}>
        <div className="row between" style={{ alignItems: "flex-end" }}>
          <div className="col g8">
            <span className="eyebrow">Step 3 · Brand assets</span>
            <h1 className="h1">Add what the brand sent you</h1>
            <p className="lead">Two items are required. Everything else makes the store better.</p>
          </div>
          <div className="col g6" style={{ width: 200 }}>
            <span className="row between xs"><span className="i3">Required</span><span className="i1">{requiredDone} of 2 done</span></span>
            <div className="steps"><span className={`s ${requiredDone > 0 ? "done" : ""}`} /><span className={`s ${requiredDone > 1 ? "done" : ""}`} /></div>
          </div>
        </div>
        {err && <div className="notice amber" role="alert"><Icon name="warning" size={14} /><span>{err}</span></div>}

        <div className="row top g16">
          <div className="card fill" style={{ minWidth: 0 }}>
            {ROWS.map((r, i) => {
              const list = by(r.kind);
              const status = r.kind === "logo" ? (list.length ? `${Math.min(list.length, 2)} of 2` : "None yet") : r.kind === "imagery" ? (list.length ? `${list.length} files` : "None yet") : list.length ? "Done" : "None yet";
              return (
                <div key={r.kind} className="col g10" style={{ padding: 16, borderTop: i ? "1px solid var(--line)" : 0 }}>
                  <div className="row top g12">
                    <span style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid var(--line)", background: "var(--tray)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={r.icon} size={16} color="#55534F" /></span>
                    <div className="col fill" style={{ minWidth: 0 }}>
                      <span className="row g8"><span className="sm w5">{r.title}</span><span className={`pill ${r.need === "Required" ? (list.length ? "green" : "amber") : ""}`} style={{ height: 20, fontSize: 11 }}>{r.need}</span></span>
                      <span className="xs i3">{r.body}</span>
                    </div>
                    <span className={`row g4 xs ${status === "Done" || (r.kind === "logo" && list.length > 1) ? "c-green" : "i3"}`}>{status === "Done" && <Icon name="check-circle" size={13} weight="fill" color="#1F8A5B" />}{status}</span>
                    <button type="button" className="btn sm" disabled={busy} onClick={() => pickers.current[r.kind]?.click()}>
                      {uploading === r.kind ? <Icon name="spinner" size={13} className="spin" /> : <Icon name="upload" size={13} />}Upload</button>
                    <input ref={(el) => { pickers.current[r.kind] = el; }} type="file" hidden multiple={r.kind !== "deck"} accept={r.accept} onChange={(e) => { upload(r.kind, e.target.files); e.target.value = ""; }} />
                  </div>
                  {list.length > 0 && (r.kind === "imagery" ? (
                    <div className="row g6" style={{ paddingLeft: 46, flexWrap: "wrap" }}>
                      {list.slice(0, 8).map((a) => <img key={a.id} src={`/api/assets/${a.id}`} alt={a.name} title={`${a.name}${a.meta.width ? ` · ${a.meta.width}px` : ""}`} width={44} height={44} style={{ borderRadius: 8, objectFit: "cover", border: a.meta.width && a.meta.width < 1600 ? "1.5px solid var(--amber)" : "1px solid var(--line)" }} />)}
                      {list.length > 8 && <span className="sm i3" style={{ width: 44, height: 44, borderRadius: 8, background: "var(--tray)", display: "flex", alignItems: "center", justifyContent: "center" }}>+{list.length - 8}</span>}
                    </div>
                  ) : (
                    <div className="row g8" style={{ paddingLeft: 46, flexWrap: "wrap" }}>{list.map((a) => <Tile key={a.id} a={a} onRemove={() => remove(a.id)} />)}</div>
                  ))}
                </div>
              );
            })}
          </div>

          <div className="col g12" style={{ width: 300, flexShrink: 0 }}>
            <button type="button" className="col g6" onClick={() => pickers.current.auto?.click()}
              style={{ alignItems: "center", textAlign: "center", padding: "26px 16px", border: `1.5px dashed ${drag ? "var(--ink)" : "var(--line-2)"}`, borderRadius: 12, background: drag ? "var(--tray-2)" : "var(--tray)", cursor: "pointer" }}>
              <span style={{ width: 34, height: 34, borderRadius: 99, background: "#fff", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="cloud" size={17} /></span>
              <span className="sm w5">Drop files anywhere</span>
              <span className="xs i3">Kaviar sorts them into the right group</span>
              <span className="btn sm" style={{ marginTop: 4 }}>Browse files</span>
            </button>
            <input ref={(el) => { pickers.current.auto = el; }} type="file" hidden multiple accept="image/*,video/*,application/pdf" onChange={(e) => { upload("auto", e.target.files); e.target.value = ""; }} />

            {pulled.length > 0 && (
              <div className="col g10" style={{ padding: 12, border: "1px solid var(--line)", borderRadius: 12, background: "#fff" }}>
                <div className="row g8"><AgentFace kind="catalog" size={20} /><div className="col"><span className="sm w5">Cleo pulled {pulled.length} images</span><span className="xs i3">From the website’s product pages</span></div></div>
                <div className="row g4">
                  {pulled.slice(0, 5).map((p) => <img key={p.url} src={p.url} alt="" width={40} height={40} style={{ borderRadius: 7, objectFit: "cover", border: "1px solid var(--line)" }} />)}
                  {pulled.length > 5 && <span className="xs i3" style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>+{pulled.length - 5}</span>}
                </div>
                {small > 0 && <span className="xs i3">{small} are below 1600 px. Otto will flag them in review.</span>}
              </div>
            )}

            <div className="col g8">
              <span className="row between"><span className="sm w5">Inspiration URLs</span><span className="pill" style={{ height: 20, fontSize: 11 }}>Optional</span></span>
              <form className="input" onSubmit={(e) => { e.preventDefault(); if (url.trim()) saveInspo([...inspiration, url.trim()]); }}>
                <Icon name="link" size={13} color="#8B8883" /><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a store you like" style={{ border: 0, outline: 0, flex: 1, fontSize: 12.5 }} />
                <button className="btn quiet sm ic" disabled={!url.trim() || busy} aria-label="Add" style={{ width: 22, height: 22 }}><Icon name="enter" size={12} /></button>
              </form>
              <div className="row g6" style={{ flexWrap: "wrap" }}>
                {inspiration.map((h) => (
                  <span key={h} className="chip" style={{ height: 26 }}><Icon name="link" size={11} />{h}
                    <button type="button" onClick={() => saveInspo(inspiration.filter((x) => x !== h))} aria-label={`Remove ${h}`} style={{ display: "flex" }}><Icon name="x" size={11} /></button></span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </OnboardingShell>
  );
}
