"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { redo, saveAd, setAdStatus, variations } from "../actions";
import { AdArt, FormatLabel, PhonePreview, type AdView } from "@/components/ad-creative";
import { AgentFace } from "@/components/agent";
import { Icon } from "@/components/icon";
import { CopyButton } from "@/components/copy";
import { ottoChecks } from "@/lib/creative/otto";

type Filter = "all" | "review" | "approved" | "rejected";
const CTAS = ["Shop now", "Learn more", "Get offer", "Order now", "See more"];

export const adsText = (list: AdView[]) => list.map((a, i) =>
  `Ad ${i + 1} · ${a.format}\nHook: ${a.hook}\nPrimary text: ${a.primaryText}\nHeadline: ${a.headline}\nCTA: ${a.cta}\nOffer: ${a.offer}${a.product ? `\nProduct: ${a.product}` : ""}${a.imageUrl ? `\nImage: ${a.imageUrl}` : ""}`).join("\n\n");

function Editor({ slug, ad, onDone }: { slug: string; ad: AdView; onDone: () => void }) {
  const [f, setF] = useState({ hook: ad.hook, primaryText: ad.primaryText, headline: ad.headline, offer: ad.offer, cta: ad.cta });
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const field = (k: keyof typeof f, label: string, rows = 1, max?: number) => (
    <label className="col g4">
      <span className="row between xs"><span className="w5 i2">{label}</span>{max && <span className={f[k].length > max ? "c-amber" : "i4"}>{f[k].length}/{max}</span>}</span>
      <div className="input" style={{ height: "auto", padding: 6 }}>
        <textarea rows={rows} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} style={{ border: 0, outline: 0, resize: "none", width: "100%", font: "inherit", fontSize: 12.5 }} />
      </div>
    </label>
  );
  return (
    <div className="col g8" style={{ padding: 12, border: "1px solid var(--ink)", borderRadius: 10, background: "#fff" }}>
      {field("hook", "Hook")}
      {field("primaryText", "Primary text", 4, 125)}
      {field("headline", "Headline", 1, 40)}
      {field("offer", "Offer")}
      <label className="col g4"><span className="xs w5 i2">Button</span>
        <div className="input"><select value={f.cta} onChange={(e) => setF({ ...f, cta: e.target.value })} style={{ border: 0, outline: 0, flex: 1, background: "transparent", font: "inherit" }}>{CTAS.map((c) => <option key={c}>{c}</option>)}</select></div></label>
      {err && <span className="xs c-amber">{err}</span>}
      <div className="row g6" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn quiet sm" onClick={onDone}>Cancel</button>
        <button type="button" className="btn dark sm" disabled={busy} onClick={() => start(async () => { const r = await saveAd(slug, ad.id, f); if (r?.error) setErr(r.error); else onDone(); })}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

export function BatchReview({ slug, brand, ads, codes }: { slug: string; brand: string; ads: AdView[]; codes: string[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [sel, setSel] = useState(ads[0]?.id ?? null);
  const [ratio, setRatio] = useState<"9 / 16" | "4 / 5" | "1 / 1">("4 / 5");
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const counts = { all: ads.length, review: ads.filter((a) => a.status === "review").length, approved: ads.filter((a) => a.status === "approved").length, rejected: ads.filter((a) => a.status === "rejected").length };
  const shown = ads.filter((a) => filter === "all" || a.status === filter);
  const ad = ads.find((a) => a.id === sel) ?? ads[0];
  const checks = useMemo(() => (ad ? ottoChecks(ad, codes) : []), [ad, codes]);
  const approved = ads.filter((a) => a.status === "approved");
  const run = (fn: () => Promise<unknown>, done?: string) => start(async () => { setMsg(null); const r = (await fn()) as { error?: string } | undefined; if (r?.error) setMsg(r.error); else if (done) setMsg(done); router.refresh(); });

  if (!ad) return <div className="sm i3" style={{ padding: 24 }}>No ads in this batch yet.</div>;
  const idx = ads.indexOf(ad) + 1;

  return (
    <div className="row fill stretch" style={{ minHeight: 0 }}>
      <section className="scroll col" style={{ padding: "18px 24px", gap: 14 }}>
        <div className="row g8">
          <div className="seg">
            {([["all", "All"], ["review", "To review"], ["approved", "Approved"], ["rejected", "Rejected"]] as const).map(([k, l]) => (
              <button key={k} type="button" className={`o${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{l}<span className="i3">{counts[k]}</span></button>
            ))}
          </div>
          <span className="fill" />
          <span className="xs i3">{counts.approved + counts.rejected} of {counts.all} reviewed</span>
          <div style={{ width: 120, height: 4, borderRadius: 99, background: "var(--tray-2)" }}><div style={{ width: `${((counts.approved + counts.rejected) / Math.max(1, counts.all)) * 100}%`, height: 4, borderRadius: 99, background: "var(--ink)" }} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))", gap: 14 }}>
          {shown.map((a) => (
            <div key={a.id} className="col g6">
              <button type="button" onClick={() => { setSel(a.id); setEditing(false); setRejecting(false); }}
                style={{ position: "relative", borderRadius: 10, overflow: "hidden", padding: 0, border: 0, cursor: "pointer", boxShadow: a.id === ad.id ? "0 0 0 2px var(--ink)" : "0 0 0 1px var(--line)", opacity: a.status === "rejected" ? 0.55 : 1 }}>
                <AdArt ad={a} brand={brand} />
                {a.status !== "review" && <span className={`pill ${a.status === "approved" ? "green" : "red"}`} style={{ position: "absolute", top: 8, left: 8, height: 20, fontSize: 10.5 }}>{a.status === "approved" ? "✓ Approved" : "Rejected"}</span>}
              </button>
              <FormatLabel ad={a} />
              {a.status === "rejected" && a.note && <span className="xs c-amber ell">“{a.note}”</span>}
            </div>
          ))}
        </div>
        {shown.length === 0 && <span className="sm i3">Nothing here.</span>}
      </section>

      <aside className="col" style={{ width: 360, flexShrink: 0, borderLeft: "1px solid var(--line)", background: "var(--tray)", overflowY: "auto" }}>
        <div className="col g12" style={{ padding: "16px 18px" }}>
          <div className="row between top">
            <div className="col" style={{ minWidth: 0 }}><span className="sm w5 i1">{idx} · {ad.hook}</span><FormatLabel ad={ad} /></div>
            <span className={`pill ${ad.status === "approved" ? "green" : ad.status === "rejected" ? "red" : ""}`} style={{ height: 22, fontSize: 11 }}>{ad.status === "review" ? "To review" : ad.status === "approved" ? "Approved" : "Rejected"}</span>
          </div>
          <div className="seg" style={{ alignSelf: "flex-start" }}>
            {(["9 / 16", "4 / 5", "1 / 1"] as const).map((r) => <button key={r} type="button" className={`o${ratio === r ? " on" : ""}`} onClick={() => setRatio(r)}>{r.replace(/ /g, "")}</button>)}
          </div>
          <div className="row" style={{ justifyContent: "center", padding: "4px 0" }}><PhonePreview ad={ad} brand={brand} ratio={ratio} /></div>

          <div className="col g6">
            <span className="xs w5 i2">Why Remy made it</span>
            <span className="xs i2" style={{ lineHeight: "17px" }}>{ad.why}</span>
            {ad.product && <span className="row g6 xs i3"><Icon name="box" size={12} />{ad.product}</span>}
          </div>

          <div className="col g6" style={{ padding: "10px 12px", background: "#fff", border: "1px solid var(--line)", borderRadius: 10 }}>
            <span className="row g8"><AgentFace kind="qa" size={16} /><span className="sm w5 fill">Otto: {checks.filter((c) => c.ok).length} of {checks.length} checks pass</span></span>
            {checks.map((c) => <span key={c.label} className={`row g6 xs ${c.ok ? "i2" : "c-amber"}`}><Icon name={c.ok ? "check-circle" : "warning-circle"} size={13} weight={c.ok ? "fill" : "regular"} color={c.ok ? "#1F8A5B" : "#B7791F"} />{c.label}</span>)}
          </div>

          {editing ? <Editor slug={slug} ad={ad} onDone={() => { setEditing(false); router.refresh(); }} /> : (
            <div className="col g6" style={{ padding: "10px 12px", background: "#fff", border: "1px solid var(--line)", borderRadius: 10 }}>
              {([["Primary text", ad.primaryText], ["Headline", ad.headline], ["Offer", ad.offer]] as const).map(([k, v]) => (
                <div key={k} className="col g2"><span className="xs i3">{k}</span><span className="xs i1" style={{ lineHeight: "17px" }}>{v}</span></div>
              ))}
            </div>
          )}

          {rejecting && (
            <div className="col g6">
              <span className="xs w5 i2">Why reject it? Remy learns from every answer.</span>
              <div className="input" style={{ height: "auto", padding: 6 }}><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Number feels pushy" style={{ border: 0, outline: 0, resize: "none", width: "100%", font: "inherit", fontSize: 12.5 }} autoFocus /></div>
              <div className="row g6" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="btn quiet sm" onClick={() => setRejecting(false)}>Cancel</button>
                <button type="button" className="btn sm" disabled={busy} onClick={() => { run(() => setAdStatus(slug, ad.id, "rejected", note)); setRejecting(false); setNote(""); }}>Reject</button>
              </div>
            </div>
          )}

          {msg && <span className="xs c-amber">{msg}</span>}
          <div className="row g8">
            <button type="button" className="btn dark fill" disabled={busy} onClick={() => run(() => setAdStatus(slug, ad.id, ad.status === "approved" ? "review" : "approved"))}>
              <Icon name="check" size={13} color="#fff" />{ad.status === "approved" ? "Approved — undo" : "Approve"}</button>
            <button type="button" className="btn fill" disabled={busy} onClick={() => setRejecting(true)}><Icon name="x" size={13} />Reject</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <button type="button" className="btn sm" disabled={busy} onClick={() => setEditing(true)}><Icon name="pencil" size={12} />Edit text</button>
            <a className="btn sm" href={`/brands/${slug}/creative/editor?ad=${ad.id}`}><Icon name="image" size={12} />Design</a>
            <button type="button" className="btn sm" disabled={busy} onClick={() => run(() => redo(slug, ad.id), "Remy rewrote it.")}><Icon name="refresh" size={12} />Redo</button>
            <button type="button" className="btn sm" disabled={busy} onClick={() => run(() => variations(slug, ad.id), "Remy added 3 variations.")}><Icon name="layers" size={12} />Variations</button>
          </div>
          {busy && <span className="row g6 xs i3"><Icon name="spinner" size={12} className="spin" />Working…</span>}
          <span className="xs i3" style={{ textAlign: "center" }}>Reject asks why — Remy learns from every answer</span>
        </div>
        <div className="fill" />
        <div className="row g8" style={{ padding: "12px 18px", borderTop: "1px solid var(--line)", background: "#fff", position: "sticky", bottom: 0 }}>
          <span className="xs i3 fill">{approved.length} approved</span>
          {approved.length > 0 && <CopyButton text={adsText(approved)} label="Copy approved" />}
        </div>
      </aside>
    </div>
  );
}
