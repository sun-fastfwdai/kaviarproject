"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { Modal } from "@/components/modal";
import { show, stand, VERDICT_NAME, type Measure, type Rival, type Verdict } from "@/lib/seo/bench-rules";
import type { RivalAdLine } from "@/lib/seo/bench";
import { addCompetitor, readRivals, removeCompetitor } from "./actions";
import { KeptAds } from "./kept";
import { AiAnswers } from "./answers";
import type { AnswerRun } from "@/lib/seo/answers-rules";
import type { Category } from "@/lib/research/category";

/**
 * Market · Competitors. The brand against the sites Kaviar read: three scores beside theirs, every site side by side on the same checks,
 * and what each runs on Meta. It is the reference the Store fixes and the ads are judged against — nothing is changed from here.
 * Every number is measured; there is no traffic, conversion or spend because no competitor publishes those.
 */
type Site = { name: string; url: string; read: boolean; note: string | null };
type RowT = Measure & { you: number | null; each: (number | null)[] };
type Props = {
  slug: string; brand: string; own: string | null; rivals: Rival[]; checked: string | null; you: Site | null; sites: Site[]; rows: RowT[];
  basis: string | null; storeHref: string; // basis: who was read how, for the tooltip
  ads: (RivalAdLine & { library: string })[]; ownAds: { ads: number; new30: number }; adsHref: string; uses: Category | null; answers: AnswerRun[]; angles: { name: string; share: number; example: string }[];
};
const DIM = "rgba(255,255,255,.55)";
const TONE: Record<Verdict, { fg: string; bg: string; bar: string }> = { ahead: { fg: "#1F7A52", bg: "#E4F4EB", bar: "#34C77B" }, level: { fg: "#fff", bg: "rgba(255,255,255,.16)", bar: "#C9C5BD" }, behind: { fg: "#B4532A", bg: "#FBEDE6", bar: "#FF8A5C" } };
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const HEAD = ["seo", "ai", "speed"], TABLE = ["seo", "ai", "speed", "answer", "code", "apps", "reviews", "aiOpen", "facts"], SPEED = ["speed", "answer", "code", "apps"];

function Cell({ m, v, best }: { m: RowT; v: number | null; best: boolean }) {
  if (m.unit === "yes") return v == null ? <span className="i3">–</span> : v ? <Icon name="check-circle" size={15} weight="fill" color="#1F8A5B" /> : <Icon name="x" size={13} weight="bold" color="#C9705A" />;
  return <span className="tnum" style={{ fontWeight: best ? 600 : 400, color: v == null ? "var(--ink-3)" : best ? "#1F7A52" : "var(--ink)" }}>{show(m, v)}</span>;
}
/** Two numbers, one above the other, each with a bar — "you" against "them". */
function Pair({ label, pill, you, they, theyName, max, hint }: { label: string; pill?: Verdict | null; you: string; they: string; theyName: string; max: [number | null, number | null]; hint: string }) {
  const t = pill ? TONE[pill] : null, w = (v: number | null) => `${v == null ? 0 : Math.max(3, Math.min(100, v))}%`;
  return (
    <div className="col g10" title={hint} style={{ padding: "14px 16px", borderRadius: 16, background: "rgba(255,255,255,.06)", minWidth: 0 }}>
      <span className="row between g8"><span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>{pill && <span style={{ height: 20, padding: "0 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, lineHeight: "20px", background: t!.bg, color: t!.fg }}>{VERDICT_NAME[pill]}</span>}</span>
      {([["You", you, max[0], t?.bar ?? "#fff"], [theyName, they, max[1], "rgba(255,255,255,.45)"]] as const).map(([k, v, n, c]) => (
        <div key={k} className="col g4">
          <span className="row between g8"><span className="ell" style={{ fontSize: 12, color: DIM }}>{k}</span><span className="tnum" style={{ fontSize: k === "You" ? 22 : 15, lineHeight: "24px", fontWeight: 600, color: k === "You" ? "#fff" : "rgba(255,255,255,.8)" }}>{v}</span></span>
          <span style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,.12)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: w(n), borderRadius: 99, background: c }} /></span>
        </div>))}
    </div>
  );
}

const when = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" }) : "");
export function CompetitorsView({ slug, brand, own, rivals, checked, you, sites, rows, ads, ownAds, adsHref, uses, answers, angles, basis, storeHref }: Props) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [doing, setDoing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", url: "" });
  const [vs, setVs] = useState(-1); // -1: all competitors (their average); otherwise one of them
  const go = (what: string, f: () => Promise<{ error?: string } | void>) => { setDoing(what); setMsg(null); start(async () => { const r = await f(); if (r && r.error) setMsg(r.error); router.refresh(); setDoing(null); }); };
  const submit = () => { if (!form.url.trim()) return; go("add", async () => { const r = await addCompetitor(slug, form.name, form.url); if (!r.error) { setForm({ name: "", url: "" }); setAdding(false); } return r; }); };

  const one = vs >= 0 && vs < sites.length ? vs : -1, readN = sites.filter((s) => s.read).length;
  const st = (r: RowT) => stand(r, r.you, one >= 0 ? [r.each[one] ?? null] : r.each);
  const by = (k: string) => rows.find((r) => r.key === k);
  const head = HEAD.map(by).filter((r): r is RowT => Boolean(r)), table = TABLE.map(by).filter((r): r is RowT => Boolean(r));
  const behind = rows.map((r) => ({ r, s: st(r) })).filter((x) => x.s.verdict === "behind"), names = (v: Verdict) => head.filter((r) => st(r).verdict === v).map((r) => r.name);
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0]);
  const theyName = one >= 0 ? sites[one].name : "Their average";
  const line = !checked ? `See where ${brand} stands` : !readN ? "No competitor could be read" : names("behind").length ? `Behind on page checks: ${list(names("behind"))}` : names("ahead").length ? `Ahead on page checks: ${list(names("ahead"))}` : one >= 0 ? `Level with ${sites[one].name}` : "Level with your competitors";
  const pill = (dark: boolean) => ({ height: 38, padding: "0 16px", borderRadius: 8, fontSize: 14, fontWeight: 500, flexShrink: 0, background: dark ? "#fff" : "rgba(255,255,255,.12)", color: dark ? "#121212" : "#fff" }) as const;
  const all: (Site & { me?: boolean })[] = checked ? [...(you ? [{ ...you, me: true }] : []), ...sites] : rivals.map((r) => ({ name: r.name, url: r.url, read: false, note: "Not read yet" }));
  const cols = `minmax(170px, 1.6fr) repeat(${TABLE.length}, minmax(70px, 1fr)) 30px`;
  // Ads on Meta: the brand's own account beside what the Ad Library shows for each competitor.
  const adOf = one >= 0 ? ads.find((a) => norm(a.name).includes(norm(sites[one].name)) || norm(sites[one].name).includes(norm(a.name))) ?? null : null;
  const adAvg = ads.length ? Math.round(ads.reduce((n, a) => n + a.ads, 0) / ads.length) : null, theirAds = one >= 0 ? adOf?.ads ?? null : adAvg, top = Math.max(ownAds.ads, theirAds ?? 0, 1);

  return (
    <div className="scroll" style={{ padding: "22px 24px 48px" }}>
      <div className="col g16">
        <div style={{ position: "relative", overflow: "clip", borderRadius: 20, background: "#121212", color: "#fff", padding: "24px 26px 22px" }}>
          <div className="row top between g20" style={{ position: "relative", flexWrap: "wrap" }}>
            <div className="row top g14" style={{ minWidth: 0 }}>
              <AgentFace kind="analyst" size={40} mood={names("behind").length ? "up" : "happy"} />
              <div className="col g4">
                <span style={{ fontSize: 12, fontWeight: 500, color: DIM }}>{checked ? `You against ${one >= 0 ? sites[one].name : `${readN} competitor${readN === 1 ? "" : "s"}`}` : "Competitors"}</span>
                <span style={{ fontSize: 30, lineHeight: "36px", fontWeight: 600, letterSpacing: "-0.015em" }}>{line}</span>
                <span style={{ fontSize: 13, color: DIM }}>{checked ? `Kaviar’s own checks of each site’s pages, not rankings · ${checked}` : own ? "Kaviar opens each site the way Google does. About two minutes." : "This brand has no website Kaviar can open yet."}</span>
              </div>
            </div>
            <div className="row g8" style={{ flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {checked && sites.length > 1 && <label className="row g6" style={{ ...pill(false), paddingRight: 10 }}>
                <span style={{ color: DIM, fontSize: 13 }}>Compare with</span>
                <select value={one} onChange={(e) => setVs(Number(e.target.value))} aria-label="Compare with" style={{ background: "transparent", color: "#fff", border: 0, font: "inherit", fontWeight: 500, outline: "none", maxWidth: 170 }}>
                  <option value={-1} style={{ color: "#121212" }}>All competitors</option>
                  {sites.map((s, i) => <option key={s.url} value={i} disabled={!s.read} style={{ color: "#121212" }}>{s.name}</option>)}
                </select>
              </label>}
              {(own || rivals.length > 0) && <button type="button" disabled={busy} onClick={() => go("read", () => readRivals(slug))} className="row g6" style={pill(!checked)}>{doing === "read" ? <Icon name="spinner" size={13} className="spin" /> : <Icon name="refresh" size={13} />}{doing === "read" ? "Reading the sites… about 2 minutes" : checked ? "Read again" : "Read my competitors"}</button>}
            </div>
          </div>
          {checked && readN > 0 && <div style={{ position: "relative", marginTop: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {head.map((r) => { const s = st(r); return <Pair key={r.key} label={r.name} pill={s.verdict} you={show(r, r.you)} they={show(r, s.avg)} theyName={theyName} max={[r.you, s.avg]} hint={r.hint} />; })}
            {(ads.length > 0 || ownAds.ads > 0) && <Pair label="Ads running on Meta" you={String(ownAds.ads)} they={theirAds == null ? "–" : String(theirAds)} theyName={theyName} max={[(ownAds.ads / top) * 100, theirAds == null ? null : (theirAds / top) * 100]} hint="How many ads are live. More ads is not better ads — what a competitor spends or sells is never public." />}
          </div>}
        </div>

        {msg && !adding && <div className="row g8 sm" style={{ padding: "10px 14px", borderRadius: 12, background: "#FBEDE6", color: "#B4532A" }}><Icon name="warning-circle" size={14} weight="fill" color="#B4532A" />{msg}</div>}

        {/* ---- every site, side by side */}
        <div className="card" style={{ padding: "14px 8px 12px" }}>
          <div className="row between g12" style={{ padding: "0 12px" }}>
            <span className="h3 row g6" title={basis ?? undefined}>Site by site{basis && <Icon name="info" size={13} color="#8B8883" />}</span>
            <button type="button" className="btn sm" onClick={() => { setMsg(null); setAdding(true); }}><Icon name="plus" size={12} />Add competitor</button>
          </div>
          {!all.length ? <span className="sm i3" style={{ padding: "12px 12px 8px" }}>Add a competitor’s website, or press “Read my competitors” to start from the ones Iris found</span>
            : <div style={{ overflowX: "auto", marginTop: 8 }}>
              <div style={{ minWidth: 860 }}>
                <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>
                  <span className="xs i3">Site</span>
                  {TABLE.map((k) => { const m = table.find((x) => x.key === k); return <span key={k} className="xs i3" title={m?.hint} style={{ textAlign: "center" }}>{m?.name ?? ""}</span>; })}<span />
                </div>
                {all.map((s, i) => {
                  const ri = s.me ? -1 : sites.findIndex((x) => x.url === s.url);
                  return (
                    <div key={s.url + i} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: "12px 12px", borderBottom: s.me ? 0 : "1px solid var(--line)", background: s.me ? "var(--tray)" : ri === one && one >= 0 ? "var(--blue-bg)" : undefined, borderRadius: s.me ? 12 : 0, marginTop: s.me ? 6 : 0 }}>
                      <span className="col" style={{ minWidth: 0 }}>
                        <span className="sm w5 ell">{s.me ? `You · ${brand}` : s.name}</span>
                        {s.me && !s.read ? <Link className="xs lnk" style={{ color: "#B4532A" }} href={storeHref}>{s.note} →</Link>
                          : <a className="xs i3 lnk ell" href={s.url} target="_blank" rel="noreferrer">{host(s.url)}{!s.read && s.note ? ` · ${s.note}` : ""}</a>}
                      </span>
                      {TABLE.map((k) => { const m = table.find((x) => x.key === k); if (!m) return <span key={k} className="sm i3" style={{ textAlign: "center" }}>–</span>;
                        const v = s.me ? m.you : ri >= 0 ? m.each[ri] ?? null : null, vals = [m.you, ...m.each].filter((x): x is number => x != null);
                        const best = v != null && m.unit !== "yes" && vals.length > 1 && v === (m.better === "high" ? Math.max(...vals) : Math.min(...vals));
                        return <span key={k} className="sm" style={{ display: "flex", justifyContent: "center" }}><Cell m={m} v={v} best={best} /></span>; })}
                      {s.me ? <span /> : <button type="button" className="btn quiet sm ic" title={`Remove ${s.name}`} aria-label={`Remove ${s.name}`} disabled={busy} onClick={() => go(s.url, () => removeCompetitor(slug, s.url))}>{doing === s.url ? <Icon name="spinner" size={12} className="spin" /> : <Icon name="x" size={12} />}</button>}
                    </div>);
                })}
                {readN > 0 && <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: "10px 12px 4px" }}>
                  <span className="xs i3">Their average</span>
                  {TABLE.map((k) => { const m = table.find((x) => x.key === k), s = m ? stand(m, m.you, m.each) : null; return <span key={k} className="xs i3 tnum" style={{ textAlign: "center" }}>{!m || !s ? "–" : m.unit === "yes" ? (s.avg == null ? "–" : `${Math.round(s.avg * s.n)} of ${s.n}`) : show(m, s.avg)}</span>; })}<span />
                </div>}
              </div>
            </div>}
          {checked && readN > 0 && <div className="row g6" style={{ flexWrap: "wrap", padding: "10px 12px 0", marginTop: 6, borderTop: "1px solid var(--line)" }}>
            {!behind.length ? <span className="row g6 xs i2"><Icon name="check-circle" size={14} weight="fill" color="#1F8A5B" />Level or ahead on all {rows.filter((r) => st(r).verdict).length} measures</span>
              : <><span className="xs i3" style={{ alignSelf: "center" }}>Behind on</span>{behind.map(({ r, s }) => (
                <Link key={r.key} href={`/brands/${slug}/seo#${SPEED.includes(r.key) ? "speed" : "fixes"}`} title={`${r.hint} — fixed in Store`} className="row g6 xs" style={{ height: 26, padding: "0 10px", borderRadius: 6, background: "#FBEDE6", color: "#B4532A" }}>
                  <b className="w5">{r.name}</b><span className="tnum">{r.unit === "yes" ? `${Math.round((s.avg ?? 0) * s.n)} of ${s.n} have it` : `${show(r, r.you)} · they ${show(r, s.avg)}`}</span><Icon name="arrow-r" size={10} color="#B4532A" />
                </Link>))}</>}
          </div>}
        </div>

        {/* ---- whether an assistant recommends them: a result, where the checks above are a set-up */}
        <AiAnswers slug={slug} runs={answers} />

        {/* ---- what each runs on Meta */}
        <div className="card" style={{ padding: "14px 16px 8px" }}>
          <div className="row between g12" style={{ paddingBottom: 8 }}>
            <span className="h3" title="Meta publishes which ads run and for how long. It never publishes what a competitor spends or sells.">Their ads on Meta</span>
            <Link className="btn sm" href={adsHref}>{ads.length ? "See the ads" : "Read their ads"}<Icon name="arrow-r" size={11} /></Link>
          </div>
          {ads.length > 0 && <div className="col">
            <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1.6fr) repeat(7, minmax(72px, 1fr)) 30px", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <span className="xs i3">Brand</span>{([["Running"], ["New · 30 days"], ["Longest run"], ["Video"], ["Stopped in a week", "Of the ads they started in the last six months, the share they stopped within 7 days"], ["Kept 30+ days", "The share of those ads they ran for 30 days or more"], ["Typical run", "How long one of those ads ran — the middle one"]] as [string, string?][]).map(([h, t]) => <span key={h} className="xs i3" title={t} style={{ textAlign: "right" }}>{h}</span>)}<span />
            </div>
            {[{ name: `You · ${brand}`, ads: ownAds.ads, new30: ownAds.new30, longest: null as number | null, video: null as number | null, past: null as RivalAdLine["past"], library: null as string | null, me: true }, ...ads.map((a) => ({ ...a, me: false }))].map((a) => (
              <div key={a.name} style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1.6fr) repeat(7, minmax(72px, 1fr)) 30px", gap: 8, alignItems: "center", padding: "8px 8px", margin: "0 -8px", borderBottom: "1px solid var(--line)", background: a.me ? "var(--tray)" : undefined, borderRadius: a.me ? 10 : 0 }}>
                <span className="sm w5 ell">{a.name}</span>
                <span className="sm tnum" style={{ textAlign: "right" }}>{a.ads}</span>
                <span className="sm tnum" style={{ textAlign: "right" }}>{a.new30}</span>
                <span className="sm tnum i2" style={{ textAlign: "right" }}>{a.longest == null ? "–" : `${a.longest} days`}</span>
                <span className="sm tnum i2" style={{ textAlign: "right" }}>{a.video == null ? "–" : `${a.video}%`}</span>
                <span className="sm tnum i2" style={{ textAlign: "right" }} title={a.past?.ads ? `${a.past.ads}${a.past.more ? "+" : ""} ads started ${when(a.past.since)} – ${when(a.past.until)}: ${a.past.quick} stopped within a week · ${a.past.long} ran 30+ days · ${a.past.ads - a.past.stopped} still running` : undefined}>{a.past?.ads ? `${Math.round((a.past.quick / a.past.ads) * 100)}%` : "–"}</span>
                <span className="sm tnum i2" style={{ textAlign: "right" }} title={a.past?.months?.length ? a.past.months.map((m) => `${new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}: ${m.long} of ${m.ads} kept`).join(" · ") : undefined}>{a.past?.ads ? `${Math.round((a.past.long / a.past.ads) * 100)}%` : "–"}</span>
                <span className="sm tnum i2" style={{ textAlign: "right" }}>{a.past?.ads ? `${a.past.median}${a.past.medianOpen ? "+" : ""} ${a.past.median === 1 && !a.past.medianOpen ? "day" : "days"}` : "–"}</span>
                {a.library ? <a className="btn quiet sm ic" href={a.library} target="_blank" rel="noreferrer" title="Open in Meta’s Ad Library" aria-label={`Open ${a.name} in Meta’s Ad Library`}><Icon name="external" size={12} /></a> : <span />}
              </div>))}
          </div>}
          {/* what these six months decide in the brand's own campaigns */}
          {uses && <div className="col g8" style={{ padding: "16px 0 0" }}>
            <span className="xs i3" title={`Counted from ${uses.ads.toLocaleString("en-US")} ads by ${uses.brands} competitor${uses.brands === 1 ? "" : "s"}, started in the last six months`}>What Kaviar does with this</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 8 }}>
              <Link href={`/brands/${slug}/campaigns`} className="row g16 hv" style={{ padding: 16, borderRadius: 12, background: "var(--tray)" }}>
                <span className="col" style={{ flexShrink: 0 }}><span className="tnum" style={{ fontSize: 24, lineHeight: "28px", fontWeight: 600 }}>{uses.oneIn ? `1 in ${uses.oneIn}` : "None"}</span><span className="xs i3">ads kept past 30 days</span></span>
                <span className="col fill" style={{ minWidth: 0 }}><span className="sm w5">Remy writes {uses.make} ads for each campaign</span><span className="xs i3">{uses.kept.toLocaleString("en-US")} of {uses.ads.toLocaleString("en-US")} ads kept · enough to expect one worth keeping</span></span>
                <Icon name="arrow-r" size={12} color="#8B8883" />
              </Link>
              {uses.round != null && uses.decide != null && <Link href={`/brands/${slug}/campaigns`} className="row g16 hv" style={{ padding: 16, borderRadius: 12, background: "var(--tray)" }}>
                <span className="col" style={{ flexShrink: 0 }}><span className="tnum" style={{ fontSize: 24, lineHeight: "28px", fontWeight: 600 }}>{uses.decide} day{uses.decide === 1 ? "" : "s"}</span><span className="xs i3">before they drop an ad</span></span>
                <span className="col fill" style={{ minWidth: 0 }}><span className="sm w5">A round of testing is {uses.round} days in each forecast</span><span className="xs i3">{Math.round(uses.quickRate * 100)}% of their ads stop within a week</span></span>
                <Icon name="arrow-r" size={12} color="#8B8883" />
              </Link>}
            </div>
          </div>}
          <KeptAds slug={slug} items={ads.flatMap((a) => (a.past?.kept ?? []).slice(0, 2).map((k) => ({ ...k, competitor: a.name }))).sort((x, y) => Number(y.english ?? false) - Number(x.english ?? false) || y.days - x.days).slice(0, 6)} />
          {angles.length > 0 && <div className="col g8" style={{ padding: "14px 0 8px" }}>
            <span className="xs i3">What their ads say</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8 }}>
              {angles.map((a) => (
                <div key={a.name} className="col g6" title={a.example} style={{ padding: "10px 12px", borderRadius: 12, background: "var(--tray)" }}>
                  <span className="row between g8"><span className="sm w5 ell">{a.name}</span><span className="sm tnum w5">{a.share}%</span></span>
                  <span style={{ height: 4, borderRadius: 99, background: "var(--line)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${Math.max(3, a.share)}%`, borderRadius: 99, background: "#5B6FD6" }} /></span>
                </div>))}
            </div>
          </div>}
        </div>
      </div>
      {adding && <Modal icon={<Icon name="globe" size={16} />} title="Add a competitor" sub="Kaviar opens their site and reads it by the same rules as your store" onClose={() => setAdding(false)} width={460}
        footer={<><button type="button" className="btn quiet" onClick={() => setAdding(false)}>Cancel</button><button type="button" className="btn dark" disabled={busy || !form.url.trim()} onClick={submit}>{doing === "add" ? <><Icon name="spinner" size={13} className="spin" color="#fff" />Reading their site…</> : "Add and read"}</button></>}>
        <div className="col g12">
          <label className="col g4"><span className="xs i2 w5">Website</span><input className="input" placeholder="theirstore.com" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} autoFocus /></label>
          <label className="col g4"><span className="xs i2 w5">Name <span className="i3" style={{ fontWeight: 400 }}>· optional</span></span><input className="input" placeholder="Taken from the address if left empty" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} /></label>
          {msg && <span className="xs" style={{ color: "#B4532A" }}>{msg}</span>}
        </div>
      </Modal>}
    </div>
  );
}
