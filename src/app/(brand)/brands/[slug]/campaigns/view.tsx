"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import type { Action, Tile } from "@/lib/growth/today";
import { LIB_STATUS, type LibRow, type LibStatus } from "@/lib/growth/library";
import { makeAds } from "../plan/actions";
import { ActionCard, StatTile } from "../today/action-card";

/**
 * Campaigns. Top: what is live and what is waiting, as numbers. Then the two things that need the brand, each with its ads and its
 * button. Then the library — every campaign, planned, in the making or on Meta, with its budget, what it brought back and the next step.
 */
type Props = { slug: string; currency: string; lib: { rows: LibRow[]; live: number; toReview: number; drafts: number }; actions: Action[]; more: number; tiles: Tile[]; hasMeta: boolean };
const TONE: Record<LibStatus, [string, string]> = { live: ["#E4F4EB", "#1F7A52"], ready: ["#E4F4EB", "#1F7A52"], test: ["#FBEFE3", "#B4632A"], review: ["#E3F3F8", "#14788F"], planned: ["var(--tray-2)", "var(--ink-2)"], paused: ["var(--tray-2)", "var(--ink-3)"] };
const COLS = "minmax(240px, 2.4fr) 132px repeat(3, minmax(84px, 1fr)) 132px";

function Count({ label, value, hint, href }: { label: string; value: string; hint: string; href: string }) {
  return (
    <Link href={href} title={hint} className="col hv" style={{ padding: "14px 16px", gap: 2, borderRadius: 18, background: "#fff", boxShadow: "0 0 0 1px var(--line), 0 1px 2px rgba(18,18,18,.04)", minWidth: 0, justifyContent: "center" }}>
      <span className="ell" style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>{label}</span>
      <span className="tnum" style={{ fontSize: 30, lineHeight: "38px", fontWeight: 700, letterSpacing: "-0.035em" }}>{value}</span>
    </Link>
  );
}

export function CampaignsView({ slug, currency, lib, actions, more, tiles, hasMeta }: Props) {
  const base = `/brands/${slug}`;
  const [filter, setFilter] = useState<"all" | "meta" | "drafts">("all");
  const [busy, start] = useTransition();
  const [making, setMaking] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(v));
  const make = (key: string) => { setMaking(key); setErr(null); start(async () => { const r = await makeAds(slug, key); if (r?.error) { setErr(r.error); setMaking(null); } }); };
  const onMeta = lib.rows.filter((r) => r.where === "Meta").length;
  const rows = lib.rows.filter((r) => (filter === "all" ? true : filter === "meta" ? r.where === "Meta" : r.where === "Kaviar"));

  return (
    <div className="scroll" style={{ padding: "22px 24px 48px" }}>
      <div className="col g16">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))", gap: 12 }}>
          <Count label="Live campaigns" value={String(lib.live)} hint="Running on Meta now" href={`${base}/performance`} />
          <Count label="Ads to review" value={String(lib.toReview)} hint="Written by Remy, waiting for your yes or no" href={`${base}/creative?tab=ads`} />
          {tiles.length > 0 ? tiles.map((k) => <StatTile key={k.label} k={k} />) : <Count label="In the making" value={String(lib.drafts)} hint="Planned, or with ads written, not yet on Meta" href={`${base}/plan`} />}
        </div>

        {actions.length > 0 && <div className="col g10">
          <div className="row between"><span className="row g8"><Icon name="sparkle" size={15} weight="fill" /><span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>Waiting for you</span></span>{more > 0 && <Link className="lnk xs i3 row g4" href={`${base}/today`}>{more} more on Today<Icon name="arrow-r" size={11} /></Link>}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 12 }}>{actions.map((a, i) => <ActionCard key={a.key} slug={slug} a={a} n={i + 1} primary={i === 0} />)}</div>
        </div>}

        <div className="card" style={{ padding: "14px 16px 6px" }}>
          <div className="row between g12" style={{ paddingBottom: 8, flexWrap: "wrap" }}>
            <span className="h3">Campaign library</span>
            <div className="seg" role="radiogroup" aria-label="Which campaigns">
              {([["all", `All ${lib.rows.length}`], ["meta", `On Meta ${onMeta}`], ["drafts", `In the making ${lib.drafts}`]] as const).map(([k, label]) => <button key={k} type="button" role="radio" aria-checked={filter === k} className={`o${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{label}</button>)}
            </div>
          </div>
          {err && <span className="xs" style={{ color: "#B4532A", paddingBottom: 6 }}>{err}</span>}
          {rows.length === 0 ? (
            <div className="row g12" style={{ padding: "14px 0 16px" }}>
              <span className="sm i3 fill">{filter === "meta" ? (hasMeta ? "Nothing is on Meta yet." : "The Meta ad account isn’t connected.") : "No campaigns yet."}</span>
              <Link className="btn dark sm" href={filter === "meta" && !hasMeta ? `${base}/integrations` : `${base}/plan`}>{filter === "meta" && !hasMeta ? "Connect Meta" : "Open the Spend plan"}<Icon name="arrow-r" size={11} color="#fff" /></Link>
            </div>
          ) : <div style={{ overflowX: "auto" }}><div style={{ minWidth: 820 }}>
            <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <span className="xs i3">Campaign</span><span className="xs i3">Status</span>
              <span className="xs i3" style={{ textAlign: "right" }}>Budget</span><span className="xs i3" style={{ textAlign: "right" }}>Spent · 30 days</span><span className="xs i3" style={{ textAlign: "right" }} title="Shopify sales from this campaign ÷ what it spent">Back per $1</span><span />
            </div>
            {rows.map((r) => (
              <div key={r.key} style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
                <span className="row g10" style={{ minWidth: 0 }}>
                  {r.thumb
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={r.thumb} alt="" loading="lazy" style={{ width: 32, height: 40, borderRadius: 7, objectFit: "cover", flexShrink: 0, background: "var(--tray-2)", boxShadow: "0 0 0 1px var(--line)" }} />
                    : <span style={{ width: 32, height: 40, borderRadius: 7, background: "var(--tray)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="megaphone" size={14} color="#8B8883" /></span>}
                  <span className="col" style={{ minWidth: 0 }}><span className="sm w5 ell" title={r.name}>{r.name}</span><span className="xs i3 ell">{r.sub}</span></span>
                </span>
                <span><span style={{ display: "inline-block", height: 22, padding: "0 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, lineHeight: "22px", background: TONE[r.status][0], color: TONE[r.status][1] }}>{LIB_STATUS[r.status]}</span></span>
                <span className="sm tnum" style={{ textAlign: "right" }} title={r.where === "Kaviar" && r.perDay != null ? "From the Spend plan" : undefined}>{r.perDay ? `${usd(r.perDay)}/day` : "–"}</span>
                <span className="sm tnum i2" style={{ textAlign: "right" }}>{r.spend ? usd(r.spend) : "–"}</span>
                <span className="sm tnum w5" style={{ textAlign: "right", color: r.back == null ? "var(--ink-3)" : r.back >= 1 ? "#1F7A52" : "#B4532A" }}>{r.back == null ? "–" : `${r.back.toFixed(2)}×`}</span>
                <span style={{ display: "flex", justifyContent: "flex-end" }}>
                  {r.next.make ? <button type="button" className="btn sm" disabled={busy} onClick={() => make(r.next.make!)}>{making === r.next.make ? <><Icon name="spinner" size={12} className="spin" />Writing…</> : r.next.label}</button>
                    : <Link className="btn sm" href={r.next.href ?? base}>{r.next.label}<Icon name="arrow-r" size={11} /></Link>}
                </span>
              </div>))}
          </div></div>}
        </div>
      </div>
    </div>
  );
}
