"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { startResearch } from "./actions";
import { Combo } from "../creative/shoots/combo";
import { MarketTab, PlanTab, Rail } from "./parts";
import { AdsTab } from "./ads";
import { PositionTab } from "./position";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { EmptyState } from "@/components/empty";
import { MARKETS, marketName, type AdsRead, type ManualAd, type MarketReport, type Positioning, type RivalAds, type Step, type TestPlan } from "@/lib/research/types";

export type ResearchRow = {
  id: string; status: "running" | "done" | "error"; stale: boolean; steps: Step[]; report: MarketReport | null; rivals: RivalAds[]; manual: ManualAd[];
  adsRead: AdsRead | null; plan: TestPlan | null; positioning: Positioning | null; error: string | null; updatedAt: string; startedAt: string | null; finishedAt: string | null;
};
type Tab = "position" | "market" | "ads" | "plan";

export const clock = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`; };
export const ago = (iso: string, now: number) => { const m = Math.round((now - Date.parse(iso)) / 60_000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

/** Market research for one product in one market: what Iris found, competitors' ads, and the message test it suggests. */
export function ResearchView({ slug, brand, currency, products, researched, subject, market, tab, row, hasMeta }: {
  slug: string; brand: string; currency: string; products: { title: string; price: number | null; image: string | null }[]; researched: { subject: string; market: string; status: string }[];
  subject: string; market: string; tab: Tab; row: ResearchRow | null; hasMeta: boolean;
}) {
  const router = useRouter(), path = usePathname();
  const [now, setNow] = useState(() => Date.now());
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const running = row?.status === "running" && !row.stale;

  // While Iris works: refresh every few seconds so each finished step shows up, and tick the timers.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), running ? 1000 : 30_000);
    const r = running ? setInterval(() => router.refresh(), 3000) : null;
    return () => { clearInterval(t); if (r) clearInterval(r); };
  }, [running, router]);

  const go = (p: Partial<{ product: string; market: string; tab: Tab }>) => {
    const q = new URLSearchParams({ product: p.product ?? subject, market: p.market ?? market, tab: p.tab ?? tab });
    router.replace(`${path}?${q}`, { scroll: false });
  };
  const start = async () => {
    setStarting(true); setErr(null);
    try { const r = await startResearch(slug, subject, market); if (r.error) setErr(r.error); router.refresh(); }
    catch (e) { setErr((e as Error).message); }
    finally { setStarting(false); }
  };

  const done = new Set(researched.map((r) => `${r.subject}|${r.market}`));
  const productOptions = [{ value: "", label: "Whole brand", sub: done.has(`|${market}`) ? "Researched" : "All products together" },
    ...products.map((p) => ({ value: p.title, label: p.title, sub: [p.price != null ? `${currency === "USD" ? "$" : ""}${p.price}${currency !== "USD" ? ` ${currency}` : ""}` : null, done.has(`${p.title}|${market}`) ? "Researched" : null].filter(Boolean).join(" · ") || undefined }))];
  const report = row?.report ?? null;
  const counts = { ads: (row?.rivals.reduce((a, r) => a + r.ads.length, 0) ?? 0) + (row?.manual.reduce((a, m) => a + (m.ads?.length || 1), 0) ?? 0), plan: row?.plan?.cells.length ?? 0 };
  const took = row?.startedAt && row.finishedAt ? Date.parse(row.finishedAt) - Date.parse(row.startedAt) : null;

  return (
    <div className="row fill stretch" style={{ minHeight: 0 }}>
      <section className="scroll col" style={{ padding: "20px 24px 32px", gap: 16 }}>
        <div className="row between top g16">
          <div className="col g4" style={{ minWidth: 0 }}>
            <h1 className="h1">Market research</h1>
            <p className="sm i3">What Iris found about demand, buyers and competitors for {subject ? <b className="w5 i2">{subject}</b> : brand} in {marketName(market)} — every finding links to where it came from.</p>
          </div>
          {row && !running && row.finishedAt && <span className="chip" style={{ flexShrink: 0 }}><AgentFace kind="analyst" size={16} />Researched by Iris · {ago(row.finishedAt, now)}{took ? ` · took ${clock(took)}` : ""}</span>}
        </div>

        <div className="row g8" style={{ flexWrap: "wrap" }}>
          <Combo chip label="Product" prefix="Product" value={subject} options={productOptions} onChange={(v) => go({ product: v })} menuWidth={340} />
          <Combo chip label="Market" prefix="Market" value={market} options={MARKETS.map(([k, l]) => ({ value: k, label: l }))} onChange={(v) => go({ market: v })} />
          <span className="fill" />
          {err && <span className="xs c-amber" style={{ maxWidth: 360 }}>{err}</span>}
          <button type="button" className={`btn ${row?.report ? "" : "dark"}`} disabled={starting || running} onClick={start}>
            {starting || running ? <Icon name="spinner" size={13} className="spin" color={row?.report ? undefined : "#fff"} /> : <Icon name={row?.report ? "refresh" : "search"} size={13} color={row?.report ? undefined : "#fff"} />}
            {running ? "Researching…" : row?.report ? "Research again" : "Research this market"}
          </button>
        </div>

        {row && (running || row.status === "error" || row.stale) && <Progress row={row} now={now} subject={subject || brand} />}

        {!row && (
          <EmptyState eyebrow="Before the first ad" title="Research the market before spending on ads"
            body={`New to ${marketName(market)}? Iris searches the web for demand, buyers and competitors for one product, reads competitors’ live Meta ads, and plans a cheap test of static ads — so the first budget tests messages instead of guesses. Takes about 3–5 minutes.`}
            steps={[
              { agent: "analyst", title: "Market", body: "Demand, buyer groups, competitors, trends and gaps — each with its sources." },
              { icon: "megaphone", title: "Competitor ads", body: "Their live ads from the Meta Ad Library, plus screenshots you add, and what they all say." },
              { icon: "target", title: "Message test", body: "Static ads for each buyer × message, written by Remy into Creative studio." },
            ]}
            art={<ResearchArt />}
            actions={<button type="button" className="btn dark" disabled={starting} onClick={start}>{starting ? <Icon name="spinner" size={13} className="spin" color="#fff" /> : <Icon name="search" size={13} color="#fff" />}Research {subject ? "this product" : "the brand"} in {marketName(market)}</button>} />
        )}

        {row && (report || row.rivals.length || row.plan) && (
          <>
            <div className="tabs">
              {([["position", "Positioning", 0], ["market", "Market", report ? report.segments.length + report.competitors.length : 0], ["ads", "Competitor ads", counts.ads], ["plan", "Test plan", counts.plan]] as const).map(([k, l, n]) => (
                <button key={k} type="button" className={`tab${tab === k ? " on" : ""}`} onClick={() => go({ tab: k })}>{l}{n ? <span className="n">{n}</span> : null}</button>
              ))}
            </div>
            {tab === "position" && <PositionTab key={row.positioning?.at ?? "none"} slug={slug} id={row.id} pos={row.positioning} running={running} />}
            {tab === "market" && (report ? <MarketTab slug={slug} id={row.id} report={report} currency={currency} onAds={() => go({ tab: "ads" })} /> : <span className="sm i3">The market findings appear here as soon as Iris finishes writing them up.</span>)}
            {tab === "ads" && <AdsTab slug={slug} id={row.id} row={row} market={market} hasMeta={hasMeta} running={running} />}
            {tab === "plan" && <PlanTab slug={slug} id={row.id} row={row} running={running} onMarket={() => go({ tab: "market" })} />}
          </>
        )}
      </section>
      {row && (report || row.plan) && <Rail tab={tab === "position" ? "market" : tab} row={row} currency={currency} />}
    </div>
  );
}

/** Board 02d's job list: what Iris is doing right now, step by step. */
function Progress({ row, now, subject }: { row: ResearchRow; now: number; subject: string }) {
  const running = row.status === "running" && !row.stale;
  const left = row.steps.filter((s) => s.state === "waiting" || s.state === "running").length;
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="card-h" style={{ background: running ? "var(--blue-bg)" : row.status === "error" || row.stale ? "var(--amber-bg)" : undefined }}>
        <AgentFace kind="analyst" size={22} mood={running ? "focus" : "worried"} />
        <span className="col fill" style={{ minWidth: 0 }}>
          <span className="sm w5">{running ? `Iris is researching ${subject}` : row.stale ? "This research stopped before it finished" : "Iris couldn’t finish"}</span>
          <span className="xs i2 ell">{running ? `${left} step${left === 1 ? "" : "s"} left · usually 3–5 minutes · you can leave this page` : row.stale ? "Run it again — what was saved is kept." : row.error}</span>
        </span>
        {running && row.startedAt && <span className="xs tnum" style={{ color: "#1A8FAB" }}>{clock(now - Date.parse(row.startedAt))}</span>}
      </div>
      <div className="col" style={{ padding: "4px 16px 8px" }}>
        {row.steps.map((s) => (
          <div key={s.key} className="row g10" style={{ minHeight: 40, borderBottom: "1px solid var(--line)" }}>
            {s.state === "done" ? <Icon name="check-circle" size={16} weight="fill" color="#1F8A5B" /> : s.state === "running" && running ? <Icon name="spinner" size={16} className="spin" color="#1A8FAB" />
              : s.state === "error" ? <Icon name="warning-circle" size={16} color="#B7791F" /> : <Icon name="circle" size={16} color="#C9C5BF" />}
            <span className={`sm fill ${s.state === "waiting" ? "i3" : "i1"}`}>{s.label}</span>
            {s.note && <span className={`xs ell ${s.state === "error" ? "c-amber" : "i3"}`} style={{ maxWidth: 420 }} title={s.note}>{s.note}</span>}
            {s.ms != null && s.state !== "running" && <span className="xs i3 tnum" style={{ width: 52, textAlign: "right" }}>{clock(s.ms)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ResearchArt() {
  return (
    <div className="col g8" style={{ width: 260, padding: 18, justifyContent: "center", background: "var(--tray)" }}>
      {[["Positioning", "For Gen Z", "#1F8A5B", 80], ["Demand", "Growing", "#2563EB", 72], ["Acne-prone Gen Z", "Primary", "#1F8A5B", 88], ["Busy professionals", "Secondary", "#1F8A5B", 61], ["Competitors’ angle: ingredients", "64%", "#B7791F", 64]].map(([a, b, c, w]) => (
        <div key={a as string} className="col g4" style={{ padding: "8px 10px", background: "#fff", borderRadius: 8, border: "1px solid var(--line)" }}>
          <span className="row between xs"><span className="i1 w5">{a}</span><span style={{ color: c as string }}>{b}</span></span>
          <span style={{ height: 4, borderRadius: 2, background: "var(--tray-2)" }}><span style={{ display: "block", height: 4, width: `${w}%`, borderRadius: 2, background: c as string }} /></span>
        </div>
      ))}
    </div>
  );
}
