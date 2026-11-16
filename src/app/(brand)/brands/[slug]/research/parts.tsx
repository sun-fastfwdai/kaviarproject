"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buildTestAds, decide, rerun, toggleCell } from "./actions";
import type { ResearchRow } from "./view";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { Decide, Figures, Found, Line, Section, Tone } from "./bits";
import { type Decision, type MarketReport, type Src } from "@/lib/research/types";

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u.slice(0, 30); } };
const VERDICT: Record<string, "green" | "blue" | "amber" | "red"> = { Strong: "green", Growing: "blue", Niche: "amber", Weak: "red" };
const PRIORITY: Record<string, string> = { Primary: "c-green", Secondary: "c-blue", Test: "i3" };

/** Accept/reject with an instant local update, saved in the background. */
function useDecisions(slug: string, id: string) {
  const router = useRouter();
  const [local, setLocal] = useState<Record<string, Decision | null>>({});
  const set = (kind: "segment" | "opportunity" | "gap", itemId: string, s: Decision | null) => {
    setLocal((x) => ({ ...x, [itemId]: s }));
    void decide(slug, id, kind, itemId, s).then(() => router.refresh());
  };
  const of = (itemId: string, saved?: Decision) => (itemId in local ? local[itemId] ?? undefined : saved);
  return { set, of };
}

/** One buyer group: who they are and what to say in a line; open it for the rest. */
function Segment({ s, all, st, onSet }: { s: MarketReport["segments"][number]; all: Src[]; st?: Decision; onSet: (v: Decision | null) => void }) {
  const [open, setOpen] = useState(false);
  const reach = [s.reach.gender === "All" ? "All genders" : s.reach.gender, s.reach.ages].filter(Boolean).join(" ");
  return (
    <div className="col" style={{ borderBottom: "1px solid var(--line)", opacity: st === "rejected" ? 0.45 : 1 }}>
      <div className="row top g16" style={{ padding: "11px 0" }}>
        <button type="button" className="col" onClick={() => setOpen(!open)} aria-expanded={open} style={{ width: 200, flexShrink: 0, textAlign: "left" }}>
          <span className="row top g6"><Icon name={open ? "chev-d" : "chev-r"} size={12} style={{ marginTop: 4 }} /><span className="sm w5 i1" style={{ lineHeight: "20px" }}>{s.name}</span></span>
          <span className={`xs ${PRIORITY[s.priority] ?? "i3"}`} style={{ paddingLeft: 18 }}>{s.priority}{reach ? <span className="i3"> · {reach}</span> : null}</span>
        </button>
        <span className="col g2 fill" style={{ minWidth: 0 }}>
          <span className="sm i1" style={{ lineHeight: "20px" }}>{s.who}</span>
          <span className="xs i2" style={{ lineHeight: "17px" }}><span className="i3">Say </span>“{s.angle}”</span>
        </span>
        <span style={{ flexShrink: 0, paddingTop: 2 }}><Found ids={s.sources} all={all} /></span>
        <Decide status={st} onSet={onSet} />
      </div>
      {open && (
        <div className="col" style={{ padding: "0 0 12px 216px", gap: 6 }}>
          {([["Needs", s.need], ["Why us", s.why], ["Doubts", s.objections], ["Interests", s.reach.interests.join(" · ")], ["Where", s.reach.placements.join(" · ")]] as const).filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="row top g12"><span className="xs i3" style={{ width: 64, flexShrink: 0, lineHeight: "17px" }}>{k}</span><span className="xs i2" style={{ lineHeight: "17px" }}>{v}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Market
export function MarketTab({ slug, id, report, currency, onAds }: { slug: string; id: string; report: MarketReport; currency: string; onAds: () => void }) {
  const d = useDecisions(slug, id);
  const S = report.sources;
  const TREND: Record<string, [string, "green" | "ink" | "amber"]> = { rising: ["Rising", "green"], steady: ["Steady", "ink"], fading: ["Fading", "amber"] };
  const accepted = report.segments.filter((s) => d.of(s.id, s.status) === "accepted").length;
  return (
    <div className="col" style={{ gap: 28 }}>
      <div className="row top g10">
        <AgentFace kind="analyst" size={18} />
        <p className="i1" style={{ margin: 0, fontSize: 16, lineHeight: "25px", letterSpacing: "-0.01em", maxWidth: 860 }}><Figures text={report.summary} /></p>
      </div>

      <Section title="Demand" right={<Tone c={VERDICT[report.demand.verdict] ?? "blue"}>{report.demand.verdict}</Tone>}>
        <Line label="In short"><Figures text={report.demand.line} /></Line>
        {report.demand.signals.map((s, i) => <Line key={i} label={i ? "" : "Signals"} from={<Found ids={s.sources} all={S} />}><Figures text={s.text} /></Line>)}
      </Section>

      <Section title="Who buys it" right={`${report.segments.length} groups${accepted ? ` · ${accepted} accepted` : ""} · the test plan uses the ones you don’t reject`}>
        {report.segments.map((s) => <Segment key={s.id} s={s} all={S} st={d.of(s.id, s.status)} onSet={(v) => d.set("segment", s.id, v)} />)}
      </Section>

      <Section title="Competitors" right={<button type="button" className="lnk i2 row g4" onClick={onAds}>See their ads<Icon name="arrow-r" size={11} /></button>}>
        <div className="row g16 xs i3" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
          <span style={{ width: 170, flexShrink: 0 }}>Brand</span><span style={{ width: 80, flexShrink: 0 }}>Price</span><span className="fill">How they sell</span><span className="fill">Strong at</span><span className="fill">Weak at</span>
        </div>
        {report.competitors.map((c) => (
          <div key={c.name} className="row top g16" style={{ padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
            <span className="col g2" style={{ width: 170, flexShrink: 0, minWidth: 0 }}>
              <span className="sm w5 i1">{c.name}</span><span className="xs i3" style={{ lineHeight: "16px" }}>{c.product}</span>
              <span style={{ paddingTop: 4 }}><Found ids={c.sources} all={S} /></span>
            </span>
            <span className="sm i1 tnum" style={{ width: 80, flexShrink: 0 }}>{c.price}</span>
            <span className="xs i2 fill" style={{ lineHeight: "17px" }}>{c.positioning}</span>
            <span className="xs i2 fill" style={{ lineHeight: "17px" }}>{c.strength}</span>
            <span className="xs i2 fill" style={{ lineHeight: "17px" }}>{c.weakness}</span>
          </div>
        ))}
      </Section>

      <Section title="Trends" right={`${report.trends.length}`}>
        {report.trends.map((t, i) => <Line key={i} label={<Tone c={TREND[t.direction]?.[1] ?? "ink"}>{TREND[t.direction]?.[0] ?? t.direction}</Tone>} labelW={84} from={<Found ids={t.sources} all={S} />}><Figures text={t.text} /></Line>)}
      </Section>

      <Section title="Opportunities" right="accept the ones worth testing">
        {report.opportunities.map((o) => {
          const st = d.of(o.id, o.status);
          return <Line key={o.id} dim={st === "rejected"} sub={o.why} from={<Found ids={o.sources} all={S} />} end={<Decide status={st} onSet={(v) => d.set("opportunity", o.id, v)} />}><span className="w5">{o.text}</span></Line>;
        })}
      </Section>
      {report.price.note && <span className="xs i3">Prices are in {currency} where Iris found them.</span>}
    </div>
  );
}

// ---------------------------------------------------------------- Test plan
export function PlanTab({ slug, id, row, running, onMarket }: { slug: string; id: string; row: ResearchRow; running: boolean; onMarket: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"plan" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const plan = row.plan;
  const on = (c: { id: string; on: boolean }) => (c.id in off ? !off[c.id] : c.on);
  const replan = async () => { setBusy("plan"); setErr(null); try { const r = await rerun(slug, id, ["plan"]); if (r.error) setErr(r.error); router.refresh(); } finally { setBusy(null); } };
  // Building ends in a redirect to the new batch: run it as a navigation so the router follows it.
  const [building, startBuild] = useTransition();
  const build = () => { setErr(null); startBuild(async () => { const r = await buildTestAds(slug, id); if (r?.error) setErr(r.error); }); };

  if (!plan) return (
    <div className="col g8" style={{ padding: 16, border: "1px dashed var(--line-2)", borderRadius: 12 }}>
      <span className="sm i2">{row.report ? "No test plan yet." : "The plan builds on the market research — run it first."}</span>
      {row.report && <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} disabled={busy != null || running} onClick={replan}><AgentFace kind="analyst" size={14} />Plan the message test</button>}
      {err && <span className="xs c-amber">{err}</span>}
    </div>
  );
  const chosen = plan.cells.filter(on);
  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="row top g10">
        <AgentFace kind="analyst" size={18} />
        <span className="col g4" style={{ maxWidth: 860 }}>
          <p className="i1" style={{ margin: 0, fontSize: 16, lineHeight: "25px", letterSpacing: "-0.01em" }}><Figures text={plan.summary} /></p>
          <span className="xs i3">Static product ads first: cheap to make, so the budget tests the message. When one wins, make UGC clips for it in Shoots.</span>
        </span>
      </div>
      <Section title="Message test" right={`${chosen.length} of ${plan.cells.length} cells on · one ad set each`}>
        <div className="row g16 xs i3" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
          <span style={{ width: 16, flexShrink: 0 }} /><span style={{ width: 190, flexShrink: 0 }}>Buyer × message</span><span className="fill">Hypothesis</span><span className="fill">Ad idea</span><span style={{ width: 170, flexShrink: 0 }}>It works if</span>
        </div>
        {plan.cells.map((c) => (
          <label key={c.id} className="row top g16" style={{ padding: "11px 0", borderBottom: "1px solid var(--line)", cursor: "pointer", opacity: on(c) ? 1 : 0.45 }}>
            <span style={{ width: 16, flexShrink: 0, paddingTop: 3 }}><input type="checkbox" checked={on(c)} onChange={() => { setOff((x) => ({ ...x, [c.id]: on(c) })); void toggleCell(slug, id, c.id).then(() => router.refresh()); }} style={{ accentColor: "#121212", margin: 0 }} /></span>
            <span className="col g2" style={{ width: 190, flexShrink: 0, minWidth: 0 }}><span className="sm w5 i1" style={{ lineHeight: "20px" }}>{c.segment}</span><span className="xs i2" style={{ lineHeight: "17px" }}>{c.angle}</span><span className="xs i3" style={{ lineHeight: "16px", paddingTop: 2 }}>{c.audience}</span></span>
            <span className="xs i2 fill" style={{ lineHeight: "17px" }}>{c.hypothesis}</span>
            <span className="col g2 fill" style={{ minWidth: 0 }}><span className="xs w5 i1" style={{ lineHeight: "17px" }}>“{c.hook}”</span><span className="xs i3" style={{ lineHeight: "16px" }}>{c.visual}</span></span>
            <span className="xs i2" style={{ width: 170, flexShrink: 0, lineHeight: "17px" }}><Figures text={c.metric} /></span>
          </label>
        ))}
      </Section>
      <div className="row g8" style={{ flexWrap: "wrap" }}>
        <button type="button" className="btn dark" disabled={busy != null || building || running || !chosen.length} onClick={build}>
          {building ? <Icon name="spinner" size={13} className="spin" color="#fff" /> : <Icon name="sparkle" size={13} color="#fff" />}{building ? "Remy is writing the ads…" : `Build ${chosen.length} static ad${chosen.length === 1 ? "" : "s"}`}</button>
        <button type="button" className="btn" disabled={busy != null || building || running} onClick={replan}>{busy === "plan" || running ? <Icon name="spinner" size={13} className="spin" /> : <Icon name="refresh" size={13} />}Plan again</button>
        <button type="button" className="btn quiet" onClick={onMarket}>Change the buyers</button>
        {err && <span className="xs c-amber">{err}</span>}
        <span className="fill" />
        <span className="xs i3">Remy writes one ad per cell into a new batch in Creative studio.</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- right rail
/** Every competitor's price on one line, with where this brand sits — the price argument at a glance. */
function PriceMap({ report, own, money }: { report: MarketReport; own: { label: string; min: number; max: number } | null; money: (v: number | null) => string }) {
  // The first price in the text: "$32–$38" → 32, "Hand cream 30 ml $32" → 32 (a number with a currency sign wins over sizes).
  const first = (t: string) => Number((/[$€£¥₩]\s?(\d[\d,]*(?:\.\d+)?)/.exec(t) ?? /(\d[\d,]*(?:\.\d+)?)/.exec(t))?.[1]?.replace(/,/g, "") ?? NaN);
  const pts = report.competitors.map((c) => ({ name: c.name, price: c.price, v: first(c.price) })).filter((p) => Number.isFinite(p.v) && p.v > 0).sort((a, b) => a.v - b.v);
  const vals = [...pts.map((p) => p.v), ...(own ? [own.min, own.max] : []), ...[report.price.low, report.price.high].filter((x): x is number => x != null)];
  if (vals.length < 2) return null;
  const lo = Math.min(...vals), hi = Math.max(...vals), span = Math.max(1, hi - lo);
  const x = (v: number) => `${3 + ((v - lo) / span) * 94}%`;
  const w = (a: number, b: number) => `calc(${x(b)} - ${x(a)})`;
  const band = report.price.low != null && report.price.high != null ? { lo: report.price.low, hi: report.price.high } : null;
  return (
    <div className="col g10">
      <div style={{ position: "relative", height: 70 }}>
        {own && <>
          <span className="xs w5 i1" style={{ position: "absolute", left: x(own.min), top: 0, whiteSpace: "nowrap" }}>{own.label}</span>
          <span title={`${own.label} · ${money(own.min)}${own.max !== own.min ? `–${money(own.max)}` : ""}`} style={{ position: "absolute", left: x(own.min), width: own.max > own.min ? w(own.min, own.max) : 4, top: 19, height: 6, borderRadius: 3, background: "#121212" }} />
        </>}
        <span style={{ position: "absolute", left: "3%", right: "3%", top: 40, height: 2, background: "var(--line-2)", borderRadius: 2 }} />
        {band && <span title={`Iris’s range ${money(band.lo)}–${money(band.hi)}`} style={{ position: "absolute", left: x(band.lo), width: w(band.lo, band.hi), top: 37, height: 8, borderRadius: 4, background: "#D3EBDD" }} />}
        {pts.map((p) => <span key={p.name} title={`${p.name} · ${p.price}`} style={{ position: "absolute", left: x(p.v), top: 36, width: 10, height: 10, marginLeft: -5, borderRadius: 99, background: "#fff", border: "2px solid #8B8883" }} />)}
        <span className="xs i3 tnum" style={{ position: "absolute", left: 0, top: 52 }}>{money(lo)}</span>
        <span className="xs i3 tnum" style={{ position: "absolute", right: 0, top: 52 }}>{money(hi)}</span>
      </div>
      <div className="row g12 xs i3" style={{ flexWrap: "wrap" }}>
        {own && <span className="row g4"><span style={{ width: 10, height: 4, borderRadius: 2, background: "#121212" }} />{own.label}</span>}
        <span className="row g4"><span style={{ width: 8, height: 8, borderRadius: 99, border: "2px solid #8B8883" }} />Competitors</span>
        {band && <span className="row g4"><span style={{ width: 12, height: 6, borderRadius: 3, background: "#D3EBDD" }} />Iris’s range</span>}
      </div>
      <div className="col" style={{ borderTop: "1px solid var(--line)" }}>
        {pts.map((p) => <span key={p.name} className="row top g10 xs" style={{ padding: "5px 0", borderBottom: "1px solid var(--line)" }}><span className="i2" style={{ flex: "0 0 40%", minWidth: 0 }}>{p.name}</span><span className="i1 fill" style={{ textAlign: "right", lineHeight: "16px" }}>{p.price}</span></span>)}
      </div>
    </div>
  );
}

export function Rail({ tab, row, currency, own }: { tab: "market" | "ads" | "plan"; row: ResearchRow; currency: string; own: { label: string; min: number; max: number } | null }) {
  const r = row.report;
  const money = (v: number | null) => (v == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(v));
  const head = (t: string, right?: React.ReactNode) => <span className="row between" style={{ paddingBottom: 8 }}><span className="sm w5">{t}</span>{right != null && <span className="xs i3">{right}</span>}</span>;
  const byHost = r ? [...r.sources.reduce((m, s) => m.set(host(s.url), [...(m.get(host(s.url)) ?? []), s]), new Map<string, Src[]>())].sort((a, b) => b[1].length - a[1].length) : [];
  return (
    <aside className="col" style={{ width: 300, flexShrink: 0, borderLeft: "1px solid var(--line)", background: "var(--tray)", padding: "20px 18px", gap: 24, overflowY: "auto" }}>
      {r && (
        <div className="col">
          {head("Demand", <Tone c={VERDICT[r.demand.verdict] ?? "blue"}>{r.demand.verdict}</Tone>)}
          <span className="xs i2" style={{ lineHeight: "17px" }}><Figures text={r.demand.line} /></span>
        </div>
      )}
      {r && (r.price.low != null || r.price.high != null || r.competitors.length > 1) && (
        <div className="col">
          {head("Price", r.price.low != null && r.price.high != null ? `${money(r.price.low)}–${money(r.price.high)}` : undefined)}
          <div className="col g10" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
            <PriceMap report={r} own={own} money={money} />
            {r.price.note && <span className="xs i3" style={{ lineHeight: "16px", borderTop: "1px solid var(--line)", paddingTop: 8 }}>{r.price.note}</span>}
          </div>
        </div>
      )}
      {tab === "plan" && row.plan && (
        <div className="col">
          {head("Test budget")}
          <span className="h3 tnum">{money(row.plan.budget.perDay)} a day · {row.plan.budget.days} days</span>
          <span className="xs i2" style={{ paddingTop: 2 }}>About <b className="w6 i1 tnum">{money(row.plan.budget.perDay * row.plan.budget.days)}</b> in total</span>
          {row.plan.budget.note && <span className="xs i3" style={{ lineHeight: "16px", paddingTop: 6, display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" }} title={row.plan.budget.note}>{row.plan.budget.note}</span>}
        </div>
      )}
      {tab !== "plan" && byHost.length > 0 && (
        <div className="col">
          {head("Sources", `${r!.sources.length} pages · ${byHost.length} sites`)}
          <div className="col" style={{ borderTop: "1px solid var(--line)" }}>
            {byHost.slice(0, 12).map(([h, xs]) => (
              <a key={h} href={xs[0].url} target="_blank" rel="noreferrer" title={xs.map((s) => s.title).join("\n")} className="row g8" style={{ padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
                <Icon name="globe" size={13} color="#8B8883" />
                <span className="col fill" style={{ minWidth: 0 }}><span className="xs i1 ell">{h}</span><span className="xs i3 ell">{xs[0].title}</span></span>
                {xs.length > 1 && <span className="xs i3 tnum">{xs.length}</span>}
              </a>
            ))}
          </div>
          {byHost.length > 12 && <span className="xs i3" style={{ paddingTop: 6 }}>+{byHost.length - 12} more sites</span>}
        </div>
      )}
    </aside>
  );
}
