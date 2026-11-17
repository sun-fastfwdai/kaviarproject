"use client";
/* eslint-disable @next/next/no-img-element -- brand files served from /api/assets */
import { useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/icon";

export type AssetRow = {
  id: string; kind: string; name: string; mime: string; size: number; at: string; by: string | null;
  ai: boolean; engine: string | null; prompt: string | null; product: string | null; seconds: number | null; cost: number | null; edit: string | null; width: number | null; height: number | null;
};

type Cat = "all" | "photos" | "cards" | "video" | "people" | "logos" | "uploads" | "voice";
const CATS: [Cat, string, IconName, (a: AssetRow) => boolean][] = [
  ["all", "All assets", "squares", () => true],
  ["photos", "AI photos", "sparkle", (a) => a.kind === "imagery" && a.ai && a.edit !== "card"],
  ["cards", "Ad cards", "layers", (a) => a.kind === "imagery" && a.edit === "card"],
  ["video", "Videos", "video", (a) => a.kind === "video"],
  ["people", "Characters", "user", (a) => a.kind === "character"],
  ["logos", "Logos", "palette", (a) => a.kind === "logo"],
  ["uploads", "Uploads", "upload", (a) => !a.ai && ["imagery", "deck", "guidelines"].includes(a.kind)],
  ["voice", "Voices", "music", (a) => a.kind === "voice"],
];
const mb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const src = (a: AssetRow, w?: number) => `/api/assets/${a.id}${w ? `?w=${w}` : ""}`;
const isImg = (a: AssetRow) => a.mime.startsWith("image/");
const isVid = (a: AssetRow) => a.mime.startsWith("video/");

function Thumb({ a }: { a: AssetRow }) {
  if (isImg(a)) return <img src={a.mime === "image/svg+xml" ? src(a) : src(a, 480)} alt={a.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: a.kind === "logo" ? "contain" : "cover", padding: a.kind === "logo" ? 18 : 0 }} />;
  if (isVid(a)) return (
    <>
      <img src={src(a, 480)} alt={a.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}><span style={{ width: 34, height: 34, borderRadius: 99, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="play" size={15} color="#fff" /></span></span>
    </>
  );
  return <span className="col g4" style={{ alignItems: "center", justifyContent: "center", height: "100%", color: "#8B8883" }}><Icon name={a.kind === "voice" ? "music" : "file"} size={22} /><span className="xs">{a.mime.split("/")[1]?.toUpperCase()}</span></span>;
}

/** Board 07a · Brand assets: every file in one place — filter, preview, download. */
export function AssetsView({ brand, assets, initial, moving = 0 }: { brand: string; assets: AssetRow[]; initial: string | null; moving?: number }) {
  const [cat, setCat] = useState<Cat>("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(initial ?? assets[0]?.id ?? null);
  const counts = useMemo(() => Object.fromEntries(CATS.map(([k, , , f]) => [k, assets.filter(f).length])) as Record<Cat, number>, [assets]);
  const test = CATS.find(([k]) => k === cat)![3];
  const shown = assets.filter(test).filter((a) => !q.trim() || `${a.name} ${a.product ?? ""} ${a.prompt ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const a = assets.find((x) => x.id === sel) ?? shown[0] ?? null;

  return (
    <div className="row fill stretch" style={{ minHeight: 0 }}>
      <aside className="col" style={{ width: 210, flexShrink: 0, borderRight: "1px solid var(--line)", padding: "18px 10px", gap: 2, overflowY: "auto" }}>
        <span className="xs w5 i3" style={{ padding: "0 8px 6px" }}>Categories</span>
        {CATS.filter(([k]) => k === "all" || counts[k] > 0).map(([k, label, icon]) => (
          <button key={k} type="button" onClick={() => setCat(k)} className="row g8 ni" style={{ height: 32, padding: "0 8px", borderRadius: 7, textAlign: "left", background: cat === k ? "#fff" : undefined, boxShadow: cat === k ? "0 0 0 1px var(--line)" : undefined, color: cat === k ? "var(--ink)" : undefined }}>
            <Icon name={icon} size={14} /><span className="sm fill">{label}</span><span className="xs i3 tnum">{counts[k]}</span>
          </button>
        ))}
      </aside>

      <section className="scroll col" style={{ padding: "20px 24px", gap: 14 }}>
        <div className="col g4">
          <h1 className="h1">Brand assets</h1>
          <p className="sm i3">{assets.length} files for {brand} — uploads, photos and clips from Shoots, ad cards and store photos.</p>
        </div>
        <div className="row g8">
          <div className="input" style={{ width: 280, height: 32 }}><Icon name="search" size={13} color="#8B8883" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assets" aria-label="Search assets" style={{ border: 0, outline: 0, background: "transparent", flex: 1, font: "inherit", fontSize: 13 }} /></div>
          <span className="fill" />
          {moving > 0 && <span className="row g6 xs i3"><Icon name="spinner" size={12} className="spin" />Moving {moving} older file{moving === 1 ? "" : "s"} to storage</span>}
          <span className="xs i3">{shown.length} shown · newest first</span>
        </div>
        {shown.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
            {shown.map((x) => (
              <button key={x.id} type="button" onClick={() => setSel(x.id)} className="col g6" style={{ textAlign: "left", padding: 0, minWidth: 0 }}>
                <span style={{ position: "relative", display: "block", aspectRatio: "4 / 5", borderRadius: 10, overflow: "hidden", background: "var(--tray-2)", boxShadow: a?.id === x.id ? "0 0 0 2px var(--ink)" : "0 0 0 1px var(--line)" }}>
                  <Thumb a={x} />
                  {x.ai && <span className="pill" style={{ position: "absolute", left: 6, bottom: 6, height: 18, fontSize: 9.5, padding: "0 6px" }}>{x.edit === "card" ? "Ad card" : "AI"}</span>}
                  {x.seconds ? <span className="xs" style={{ position: "absolute", right: 6, bottom: 6, padding: "1px 6px", borderRadius: 99, background: "rgba(0,0,0,.55)", color: "#fff" }}>{x.seconds}s</span> : null}
                </span>
                <span className="col" style={{ minWidth: 0 }}>
                  <span className="xs w5 i1 ell" title={x.name}>{x.name}</span>
                  <span className="xs i3 ell">{when(x.at)} · {mb(x.size)}</span>
                </span>
              </button>
            ))}
          </div>
        ) : <span className="sm i3">{q ? "Nothing matches that search." : "Nothing here yet — photos and clips you make in Shoots land here."}</span>}
      </section>

      {a && (
        <aside className="col" style={{ width: 340, flexShrink: 0, borderLeft: "1px solid var(--line)", background: "var(--tray)", overflowY: "auto" }}>
          <div className="col g12" style={{ padding: 16 }}>
            <div style={{ borderRadius: 12, overflow: "hidden", background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
              {isVid(a) ? <video key={a.id} src={src(a)} controls playsInline style={{ width: "100%", display: "block", maxHeight: 460, background: "#000" }} />
                : isImg(a) ? <img src={src(a)} alt={a.name} style={{ width: "100%", display: "block" }} />
                : a.kind === "voice" ? <audio key={a.id} src={src(a)} controls style={{ width: "100%", padding: 12 }} />
                : <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="file" size={30} color="#8B8883" /></div>}
            </div>
            <div className="col g2">
              <span className="sm w5 i1" style={{ wordBreak: "break-word" }}>{a.name}</span>
              <span className="xs i3">{a.mime.split("/")[1]?.toUpperCase()} · {mb(a.size)}{a.width && a.height ? ` · ${a.width} × ${a.height}` : ""}{a.seconds ? ` · ${a.seconds}s` : ""}</span>
            </div>
            <div className="col" style={{ borderTop: "1px solid var(--line)" }}>
              {([["Made with", a.engine], ["Product", a.product], ["Added by", a.by ? `${a.by} · ${when(a.at)}` : when(a.at)], ["Cost", a.cost != null ? `$${a.cost.toFixed(2)}` : null]] as const).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="row top g10" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}><span className="xs i3" style={{ width: 72, flexShrink: 0 }}>{k}</span><span className="xs i1 fill" style={{ lineHeight: "16px" }}>{v}</span></div>
              ))}
              {a.prompt && <div className="col g4" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}><span className="xs i3">Prompt</span><span className="xs i2" style={{ lineHeight: "16px", maxHeight: 112, overflow: "auto" }}>{a.prompt}</span></div>}
            </div>
            <div className="row g8">
              <a className="btn dark fill" href={`${src(a)}?download=1`} download={a.name} style={{ justifyContent: "center" }}><Icon name="download" size={13} color="#fff" />Download</a>
              <a className="btn" href={src(a)} target="_blank" rel="noreferrer" title="Open in a new tab"><Icon name="external" size={13} /></a>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
