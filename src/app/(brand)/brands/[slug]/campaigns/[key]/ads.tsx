"use client";
/* eslint-disable @next/next/no-img-element -- product photos, brand pictures and drawn cards, served by the app itself */
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import type { Work } from "@/components/working";
import type { PlanAd, PlanExtras } from "@/lib/growth/plans";
import type { Stage } from "@/lib/growth/plans-rules";
import { makeAds } from "../../plan/actions";
import { setAdStatus } from "../../creative/actions";
import { addReference, designAds, removeReference, saveBrief } from "../actions";

/**
 * A campaign's ads, made and judged in one place — used on the campaign's own page and in the Creative studio. The brand gives Remy
 * what to work from (its own pictures, its own words), presses once, and says yes or no to each ad that comes back. Progress goes to
 * the dock at the bottom of the screen through `onWork`, so the brand never leaves the page it is on.
 */
/** `count`: how many ads Remy writes for this campaign — set from how often competitors keep an ad. Left out where it isn't known. */
type Args = { slug: string; planKey: string; title: string; brief: PlanExtras["brief"]; ads: PlanAd[]; count?: number; onWork: (w: Work | null) => void; onError?: (m: string | null) => void; onChanged?: () => void };
export function useAds({ slug, planKey, title, brief, ads, count, onWork, onError, onChanged }: Args) {
  const n = count ? `${count} ads` : "the ads";
  const router = useRouter();
  const [busy, start] = useTransition();
  const [doing, setDoing] = useState<string | null>(null);
  const [note, setNote] = useState(brief.note);
  const [shootNew, setShootNew] = useState(brief.shoot);
  const fail = (m: string | null) => onError?.(m);
  const run = (what: string, f: () => Promise<{ error?: string } | void>, done?: string) => { setDoing(what); fail(null); start(async () => { const r = await f(); if (r && r.error) { fail(r.error); onWork({ done: r.error, bad: true }); } else { router.refresh(); onChanged?.(); if (done) onWork({ done }); } setDoing(null); }); };
  const toReview = ads.filter((x) => x.status === "review");
  return {
    busy, doing, note, setNote, shootNew, setShootNew, toReview, count,
    keepNote: () => { if (note !== brief.note) void saveBrief(slug, planKey, note, shootNew); },
    addRefs: (files: File[]) => { if (!files.length) return; run("ref", async () => { for (const f of files.slice(0, 8)) { const fd = new FormData(); fd.set("file", f); const r = await addReference(slug, planKey, fd); if (r.error) return r; } }); },
    removeRef: (id: string) => run(id, () => removeReference(slug, planKey, id)),
    review: (id: string, status: "approved" | "rejected" | "review") => run(id, () => setAdStatus(slug, id, status)),
    // Its words set on its picture, a different layout on each ad — or back to the plain pictures.
    design: (on: boolean) => {
      fail(null); setDoing("design");
      if (on) onWork({ who: "builder", what: `Remy is designing the pictures for “${title}”`, usually: "Usually under a minute", since: Date.now() });
      start(async () => {
        const r = await designAds(slug, planKey, on);
        if (r.error) { onWork({ done: r.error, bad: true }); fail(r.error); }
        else { router.refresh(); onChanged?.(); onWork({ done: on ? `${r.made} picture${r.made === 1 ? "" : "s"} designed — each in its own layout` : "Back to the plain pictures" }); }
        setDoing(null);
      });
    },
    approveAll: () => run("all", async () => { for (const x of toReview) await setAdStatus(slug, x.id, "approved"); }, `${toReview.length} ads approved`),
    // Remy writes the ads while the brand stays here: the dock says so, and the ads appear when he is done.
    write: () => {
      const shooting = shootNew && brief.refs.length > 0;
      fail(null); setDoing("make"); onWork({ who: "builder", what: shooting ? `Remy is writing ${n} and shooting their pictures` : `Remy is writing ${n} for “${title}”`, usually: shooting ? "Usually two to three minutes" : "Usually under a minute", since: Date.now() });
      start(async () => {
        await saveBrief(slug, planKey, note, shootNew);
        const r = await makeAds(slug, planKey, true);
        if (r?.error) { onWork({ done: r.error, bad: true }); fail(r.error); }
        else { router.refresh(); onWork(r?.note ? { done: r.note, bad: true } : { done: `${count ? `${count} ads are` : "The ads are"} ready — say yes or no to each` }); setTimeout(() => document.getElementById("ads")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400); }
        setDoing(null);
      });
    },
  };
}
export type AdsMaker = ReturnType<typeof useAds>;

const label = { fontSize: 12, fontWeight: 500 } as const;
export function AdsBlock({ m, base, stage, locked, ads, brief, productPhoto, batchId, heading = "Its ads", extra, placed, plain = false }: {
  plain?: boolean; // only the ads and their yes/no — the studio's thread has its own place to say what Remy works from
  m: AdsMaker; base: string; stage: Stage; locked: boolean; ads: PlanAd[]; brief: PlanExtras["brief"]; productPhoto: string | null; batchId: string | null; heading?: string; extra?: React.ReactNode;
  placed?: Record<string, string>; // the plan's ads already on Meta, by ad
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  // A designed ad comes in Meta's three shapes; a plain photo is shown as it is.
  const [size, setSize] = useState<"4x5" | "1x1" | "9x16">("4x5");
  const designed = ads.filter((x) => x.designed).length, shape = { "4x5": "4 / 5", "1x1": "1 / 1", "9x16": "9 / 16" }[size];
  const okAds = ads.filter((x) => x.status === "approved"), toReview = m.toReview, spin = (k: string, c?: string) => m.doing === k && <Icon name="spinner" size={13} className="spin" color={c} />;
  return (
    <div id="ads" className="col g12" style={{ padding: plain ? "14px 16px" : "16px 18px", borderRadius: 18, background: "#fff", boxShadow: plain ? "0 0 0 1px var(--line), 0 12px 32px rgba(18,18,18,.06)" : "0 0 0 1px var(--line)", scrollMarginTop: 16 }}>
      <div className="row between g12" style={{ flexWrap: "wrap" }}>
        <span className="row g8"><AgentFace kind="builder" size={18} /><span className="i3" style={label}>{heading}</span>{ads.length > 0 && <span className="xs i3 tnum">{toReview.length ? `${toReview.length} to review` : ""}{toReview.length && okAds.length ? " · " : ""}{okAds.length ? `${okAds.length} approved` : ""}</span>}</span>
        <span className="row g6">
          {toReview.length > 1 && <button type="button" className="btn dark sm" disabled={m.busy} onClick={m.approveAll}>{spin("all", "#fff") || <Icon name="check" size={12} color="#fff" />}Approve all {toReview.length}</button>}
          {designed > 0 && <div className="seg" role="radiogroup" aria-label="Which shape to look at">
            {([["4x5", "Feed"], ["1x1", "Square"], ["9x16", "Story"]] as const).map(([k, t]) => <button key={k} type="button" role="radio" aria-checked={size === k} className={`o${size === k ? " on" : ""}`} title={k === "4x5" ? "4:5 — Facebook and Instagram feed" : k === "1x1" ? "1:1 — square placements" : "9:16 — Stories and Reels"} onClick={() => setSize(k)}>{t}</button>)}
          </div>}
          {/* a campaign made on Meta can still have its pictures designed until its ads are placed there */}
          {!Object.keys(placed ?? {}).length && ads.length > 0 && (designed < ads.length
            ? <button type="button" className="btn sm" disabled={m.busy} onClick={() => m.design(true)} title="Remy sets each ad’s words on its picture, a different layout on each">{m.doing === "design" ? <Icon name="spinner" size={12} className="spin" /> : <AgentFace kind="builder" size={14} />}Design the pictures</button>
            : <button type="button" className="btn quiet sm" disabled={m.busy} onClick={() => m.design(false)} title="Put each ad’s plain picture back">{m.doing === "design" ? <Icon name="spinner" size={12} className="spin" /> : null}Use plain pictures</button>)}
          {batchId && <Link className="btn quiet sm" href={`${base}/creative/${batchId}`} title="Change the words or the picture">Edit the ads<Icon name="arrow-r" size={11} /></Link>}
          {extra}
        </span>
      </div>
      {/* what Remy works from: the product photo, the brand's own pictures and its own words */}
      {!locked && !plain && <div className="col g10" style={{ padding: "12px 14px", borderRadius: 14, background: "var(--tray)" }}>
        <div className="row g8" style={{ flexWrap: "wrap", alignItems: "center" }}>
          <span className="xs i2 w5" style={{ width: "100%" }}>Work from</span>
          {productPhoto && <span title="The product’s own photo — the product in every picture stays exactly this" style={{ position: "relative", flexShrink: 0 }}>
            <img src={productPhoto} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", background: "#fff", boxShadow: "0 0 0 1px var(--line)" }} />
            <span style={{ position: "absolute", left: 3, bottom: 3, padding: "0 4px", borderRadius: 6, fontSize: 10, lineHeight: "14px", background: "rgba(18,18,18,.78)", color: "#fff" }}>Product</span></span>}
          {brief.refs.map((r) => (
            <span key={r.id} title={r.name} style={{ position: "relative", flexShrink: 0 }}>
              <img src={`/api/assets/${r.id}?w=480`} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", background: "#fff", boxShadow: "0 0 0 1px var(--line)" }} />
              <button type="button" aria-label={`Remove ${r.name}`} disabled={m.busy} onClick={() => m.removeRef(r.id)} style={{ position: "absolute", right: -5, top: -5, width: 18, height: 18, borderRadius: 99, background: "#121212", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="x" size={9} color="#fff" /></button>
            </span>))}
          <button type="button" className="btn sm" disabled={m.busy || brief.refs.length >= 8} onClick={() => fileRef.current?.click()} title="Your own photos, or pictures whose look you like — up to 8, 4 MB each" style={{ height: 56, borderStyle: "dashed" }}>{m.doing === "ref" ? <Icon name="spinner" size={13} className="spin" /> : <Icon name="plus" size={13} />}Add reference pictures</button>
          <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; m.addRefs(fs); }} />
        </div>
        <textarea value={m.note} onChange={(e) => m.setNote(e.target.value.slice(0, 600))} onBlur={m.keepNote} rows={2} aria-label="Your notes for this campaign" placeholder="Anything Remy should use — the offer, a line you like, what to leave out"
          style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line-2)", background: "#fff", font: "inherit", fontSize: 14, lineHeight: "19px", resize: "vertical" }} />
        <div className="row g10" style={{ flexWrap: "wrap" }}>
          {brief.refs.length > 0 && <div className="seg" role="radiogroup" aria-label="Where the pictures come from">
            {([[false, "Use my pictures"], [true, "Shoot new ones in their style"]] as const).map(([v, text]) => <button key={text} type="button" role="radio" aria-checked={m.shootNew === v} className={`o${m.shootNew === v ? " on" : ""}`} title={v ? "New pictures are made from your product photo, lit and composed like your references. Each one is charged by the image service." : "Your reference pictures go on the ads as they are"} onClick={() => m.setShootNew(v)}>{text}</button>)}
          </div>}
          <span className="fill" />
          {stage !== "suggested" && <button type="button" className={`btn sm${ads.length ? "" : " dark"}`} disabled={m.busy} onClick={m.write}>{m.doing === "make" ? <Icon name="spinner" size={12} className="spin" color={ads.length ? undefined : "#fff"} /> : null}{ads.length ? `Make ${m.count ?? ""} new ads`.replace("  ", " ") : `Make ${m.count ?? ""} ads`.replace("  ", " ")}</button>}
        </div>
      </div>}
      {ads.length === 0 ? <span className="sm i3" style={{ padding: "8px 0 4px" }}>{stage === "suggested" ? "Ads are written once you approve the plan." : m.doing === "make" ? "Remy is writing them now…" : "None yet."}</span>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {ads.map((ad) => (
            <div key={ad.id} className="col" style={{ borderRadius: 14, overflow: "hidden", boxShadow: "0 0 0 1px var(--line)", background: "#fff" }}>
              {ad.image && (ad.designed
                ? <a href={`/api/ads/${ad.id}/card?size=${size}`} target="_blank" rel="noreferrer" title="Open this size on its own" style={{ display: "block", background: "var(--tray-2)" }}>
                  <img key={size} src={size === "4x5" ? ad.image : `/api/ads/${ad.id}/card?size=${size}`} alt="" loading="lazy" style={{ display: "block", width: "100%", aspectRatio: shape, objectFit: "cover" }} /></a>
                : <img src={ad.image} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", background: "var(--tray-2)" }} />)}
              <div className="col g4" style={{ padding: "10px 12px" }}>
                <span className="sm w5" style={{ lineHeight: "19px" }}>{ad.hook || ad.headline}</span>
                <span className="xs i2" title={ad.text} style={{ lineHeight: "17px", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{ad.text}</span>
              </div>
              <div className="row g6" style={{ padding: "8px 12px", borderTop: "1px solid var(--line)", marginTop: "auto" }}>
                {placed?.[ad.id] ? <span className="pill green" style={{ height: 24, fontSize: 12 }}><Icon name="facebook" size={11} />On Meta</span>
                  : ad.status === "approved" ? <><span className="pill green" style={{ height: 24, fontSize: 12 }}><Icon name="check" size={11} />Approved</span><span className="fill" /><button type="button" className="btn quiet sm" disabled={m.busy} onClick={() => m.review(ad.id, "review")}>Undo</button></>
                  : <><button type="button" className="btn dark sm" disabled={m.busy} onClick={() => m.review(ad.id, "approved")}>{spin(ad.id, "#fff") || <Icon name="check" size={12} color="#fff" />}Approve</button><button type="button" className="btn quiet sm" disabled={m.busy} onClick={() => m.review(ad.id, "rejected")}>Reject</button><span className="fill" /><span className="xs i3 ell">{ad.cta}</span></>}
              </div>
            </div>))}
        </div>}
    </div>
  );
}
