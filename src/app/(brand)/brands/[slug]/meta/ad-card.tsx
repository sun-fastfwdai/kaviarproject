"use client";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import type { AdRow } from "@/lib/queries/growth";
import type { AdSeg } from "@/lib/db/schema";

/**
 * One ad, and — opened — everything Kaviar knows about it: what it said and showed, how many different people saw it and how often,
 * how much of its video they watched, and its results split by who saw it and where it ran.
 */
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const ctaName = (t: string | null) => (t ? cap(t.toLowerCase().replace(/_/g, " ")) : null);
const label = { fontSize: 12, fontWeight: 500 } as const;

function Bars({ rows, usd }: { rows: AdSeg[]; usd: (v: number) => string }) {
  const all = rows.reduce((n, x) => n + x.impressions, 0) || 1;
  return (
    <div className="col g6">
      {rows.slice(0, 6).map((x) => (
        <div key={x.key} className="col" style={{ gap: 4 }} title={`${x.impressions.toLocaleString("en-US")} views · ${usd(x.spend)} spent · ${x.clicks.toLocaleString("en-US")} clicks · ${x.purchases} purchases`}>
          <span className="row between xs"><span className="i1">{cap(x.key)}</span><span className="tnum i3">{Math.round((x.impressions / all) * 100)}%{x.purchases ? ` · ${x.purchases} bought` : ""}</span></span>
          <span style={{ height: 5, borderRadius: 99, background: "var(--tray-2)" }}><span style={{ display: "block", height: "100%", width: `${Math.max(2, (x.impressions / all) * 100)}%`, borderRadius: 99, background: x.purchases ? "#34C77B" : "var(--ink)" }} /></span>
        </div>))}
    </div>);
}

export function AdCard({ a, currency, days }: { a: AdRow; currency: string; days: number }) {
  const [open, setOpen] = useState(false);
  const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(v));
  const back = (v: number) => (a.spend ? `${(v / a.spend).toFixed(2)}×` : "–"), c = a.creative, d = a.detail, pic = c?.image ?? a.thumbnailUrl, v = d?.video;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="card link" style={{ width: "calc((100% - 36px) / 4)", minWidth: 200, overflow: "hidden", textAlign: "left", display: "flex", flexDirection: "column" }}>
        <div style={{ height: 112, background: "var(--tray-2)", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid var(--line)", position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {pic ? <img src={pic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="image" size={22} color="#B5B2AC" />}
          {c && c.kind !== "image" && <span style={{ position: "absolute", left: 8, bottom: 8, height: 20, padding: "0 8px", borderRadius: 6, fontSize: 11, lineHeight: "20px", background: "rgba(18,18,18,.75)", color: "#fff" }}>{cap(c.kind)}</span>}
        </div>
        <div className="col g2" style={{ padding: "10px 12px" }}>
          <span className="sm w5 i1 ell">{c?.title || a.name}</span>
          <span className="xs i3 ell">{a.campaign ?? "—"}</span>
          <div className="row between" style={{ paddingTop: 8 }}>
            <div className="col"><span className="xs i3">Spend</span><span className="sm i1 tnum">{usd(a.spend)}</span></div>
            <div className="col" style={{ alignItems: "center" }}><span className="xs i3" title="Back per $1 by Meta’s own count">Meta</span><span className="sm tnum">{back(a.value)}</span></div>
            <div className="col" style={{ alignItems: "flex-end" }}><span className="xs i3" title="Back per $1 from orders in Shopify that carry this ad’s tag">Shopify</span><span className="sm tnum w5" style={{ color: !a.spend ? "var(--ink-3)" : a.verifiedRevenue / a.spend >= 1 ? "var(--green)" : "var(--red)" }}>{back(a.verifiedRevenue)}</span></div>
          </div>
        </div>
      </button>
      {open && <Modal icon={<Icon name="megaphone" size={16} />} title={c?.title || a.name} sub={`${a.campaign ?? "Meta ad"} · last ${days} days`} onClose={() => setOpen(false)} width={820}>
        <div className="row top g20" style={{ flexWrap: "wrap" }}>
          <div className="col g10" style={{ width: 280, flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {pic ? <img src={pic} alt="" style={{ width: "100%", borderRadius: 14, background: "var(--tray-2)", boxShadow: "0 0 0 1px var(--line)" }} /> : <span style={{ height: 180, borderRadius: 14, background: "var(--tray-2)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="image" size={24} color="#B5B2AC" /></span>}
            {c ? <>
              {c.body && <span className="sm i1" style={{ lineHeight: "20px", whiteSpace: "pre-wrap", maxHeight: 200, overflowY: "auto" }}>{c.body}</span>}
              <span className="row between g8" style={{ padding: "8px 10px", borderRadius: 10, background: "var(--tray)" }}>
                <span className="col" style={{ minWidth: 0 }}><span className="sm w5 ell">{c.title || "No headline"}</span>{c.description && <span className="xs i3 ell">{c.description}</span>}</span>
                {ctaName(c.cta) && <span className="pill" style={{ height: 24, flexShrink: 0 }}>{ctaName(c.cta)}</span>}
              </span>
              {c.link && <a className="lnk xs i3 ell" href={c.link} target="_blank" rel="noreferrer">{c.link.replace(/^https?:\/\//, "").split("?")[0]}</a>}
            </> : <span className="xs i3">Its words arrive with the next sync</span>}
          </div>
          <div className="col g14 fill" style={{ minWidth: 300 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
              {([["Spent", usd(a.spend)], ["Views", a.impressions.toLocaleString("en-US")], ["Clicks", a.clicks.toLocaleString("en-US")], ["Orders in Shopify", String(a.verifiedOrders)],
                ...(d ? [["People reached", d.reach.toLocaleString("en-US")], ["Times each saw it", d.frequency.toFixed(1)]] : [])] as [string, string][]).map(([k, val]) => (
                <div key={k} className="col g2" style={{ padding: "8px 12px", borderRadius: 12, background: "var(--tray)" }}><span className="xs i3">{k}</span><span className="tnum" style={{ fontSize: 18, fontWeight: 600 }}>{val}</span></div>))}
            </div>
            {!d ? <span className="sm i3">Who saw it, where it ran and how often are read from Meta once a day — nothing yet for this ad</span> : <>
              {v && <div className="col g6"><span className="i3" style={label}>Video watched</span>
                <div className="row g6" style={{ alignItems: "flex-end", height: 64 }}>
                  {([["Started", v.plays], ["25%", v.p25], ["50%", v.p50], ["75%", v.p75], ["To the end", v.p100]] as const).map(([k, n]) => (
                    <div key={k} className="col fill" style={{ alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }} title={`${n.toLocaleString("en-US")} people`}>
                      <span className="xs tnum i2">{v.plays ? Math.round((n / v.plays) * 100) : 0}%</span>
                      <span style={{ width: "100%", height: `${v.plays ? Math.max(4, (n / v.plays) * 40) : 4}px`, borderRadius: 6, background: "var(--ink)" }} />
                      <span className="xs i3">{k}</span>
                    </div>))}
                </div>
                {v.avgSeconds > 0 && <span className="xs i3">Watched for {v.avgSeconds} seconds on average</span>}
              </div>}
              {d.ages.length > 0 && <div className="col g8"><span className="i3" style={label}>Who saw it</span><Bars rows={d.ages} usd={usd} /></div>}
              {d.places.length > 0 && <div className="col g8"><span className="i3" style={label}>Where it ran</span><Bars rows={d.places} usd={usd} /></div>}
              <span className="xs i3">Reach, frequency and the splits cover {new Date(`${d.since}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {new Date(`${d.until}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            </>}
          </div>
        </div>
      </Modal>}
    </>
  );
}
