"use client";
/* eslint-disable @next/next/no-img-element -- stored copies of competitors' ads */
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addRival, addScreenshot, decide, readScreenshot, removeRival, removeScreenshot, rerun } from "./actions";
import type { ResearchRow } from "./view";
import { Combo } from "../creative/shoots/combo";
import { Icon, type IconName } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { adLibraryUrl, marketName, type AdsRead, type Decision, type LibAd, type LibBlock, type RivalAds } from "@/lib/research/types";

const DAY = 86_400_000;
const days = (iso: string | null | undefined) => (iso && !Number.isNaN(Date.parse(iso)) ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / DAY)) : null);
const num = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const isLibId = (id: string) => /^\d{8,20}$/.test(id);
let regions: Intl.DisplayNames | null = null;
const country = (code: string) => { try { return (regions ??= new Intl.DisplayNames(["en"], { type: "region" })).of(code) ?? code; } catch { return code; } };

const PLAT: Record<string, [IconName, string]> = {
  FACEBOOK: ["facebook", "Facebook"], INSTAGRAM: ["instagram", "Instagram"], MESSENGER: ["messenger", "Messenger"], THREADS: ["threads", "Threads"],
  WHATSAPP: ["whatsapp", "WhatsApp"], AUDIENCE_NETWORK: ["squares", "Audience Network"],
};
function Platforms({ ps }: { ps: string[] }) {
  if (!ps.length) return null;
  return <span className="row g4">{ps.map((p) => { const [ic, label] = PLAT[p.toUpperCase()] ?? ["globe", p]; return <span key={p} title={label} aria-label={label} style={{ display: "inline-flex" }}><Icon name={ic} size={13} color="#55534F" /></span>; })}</span>;
}

const TONES = ["#1F8A5B", "#2563EB", "#B7791F", "#5B6FD6", "#C2410C", "#0E7490", "#9D4EDD", "#55534F"];
const tone = (s: string) => TONES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];
function Avatar({ name }: { name: string }) {
  const c = tone(name);
  return <span style={{ width: 28, height: 28, borderRadius: 99, flexShrink: 0, background: `${c}14`, color: c, border: `1px solid ${c}33`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>{name.charAt(0).toUpperCase()}</span>;
}

function Media({ a }: { a: LibAd }) {
  const m = a.media;
  if (m?.asset) return (
    <div style={{ position: "relative", background: "#F2F1EE", display: "flex", justifyContent: "center" }}>
      <img src={`/api/assets/${m.asset}`} alt={`${a.page} ad`} loading="lazy" style={{ width: "100%", maxHeight: 340, objectFit: "contain", display: "block" }} />
      {m.kind === "video" && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}><span style={{ width: 46, height: 46, borderRadius: 99, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="play" size={20} color="#fff" /></span></span>}
      {m.kind === "carousel" && <span className="xs" style={{ position: "absolute", top: 8, right: 8, padding: "2px 7px", borderRadius: 99, background: "rgba(0,0,0,0.55)", color: "#fff" }}>{m.n && m.n > 1 ? `1 / ${m.n}` : "Carousel"}</span>}
    </div>
  );
  return (
    <div className="row g6 xs i3" style={{ height: 64, justifyContent: "center", background: "var(--tray)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
      <Icon name={m?.kind === "video" ? "video" : m?.kind === "text" ? "file" : "image"} size={14} />
      {m?.kind === "text" ? "Text-only ad" : "Picture not copied — see it on Meta"}
    </div>
  );
}

/** One competitor ad: the picture first, how long it has run, who ran it and what it says. Meta's finer numbers sit in the tooltips. */
function AdCard({ a, who }: { a: LibAd; who: string }) {
  const d = days(a.start), body = a.bodies[0] ?? "", title = a.titles[0] ?? "", long = d != null && d >= 30, off = a.status === "inactive";
  const seen = [a.audience ? `Mostly ${a.audience.top} (${pct(a.audience.topShare)}) · ${pct(a.audience.women)} women` : "", a.countries?.length ? `Top: ${a.countries.slice(0, 3).map((c) => country(c.code)).join(", ")}` : "",
    a.target ? `Targeted: ${[a.target.gender && a.target.gender !== "All" ? a.target.gender : "everyone", a.target.ages, a.target.places.slice(0, 3).join(", ")].filter(Boolean).join(" · ")}` : ""].filter(Boolean).join(" — ");
  return (
    <div className="card" style={{ padding: 0, gap: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative" }}>
        <Media a={a} />
        <span className="row g4" style={{ position: "absolute", top: 8, left: 8 }}>
          {d != null && <span className="tnum" title={long ? `Started ${date(a.start)} — advertisers rarely keep paying for an ad that doesn’t work` : `Started ${date(a.start)}`} suppressHydrationWarning
            style={{ height: 22, padding: "0 8px", borderRadius: 99, fontSize: 11, fontWeight: 600, lineHeight: "22px", background: long ? "#121212" : "rgba(255,255,255,.92)", color: long ? "#fff" : "#121212", boxShadow: "0 1px 3px rgba(0,0,0,.18)" }}>{d} day{d === 1 ? "" : "s"}</span>}
          {off && <span style={{ height: 22, padding: "0 8px", borderRadius: 99, fontSize: 11, lineHeight: "22px", background: "rgba(255,255,255,.92)", color: "#55534F" }}>Stopped</span>}
        </span>
      </div>
      <div className="col g6" style={{ padding: "10px 12px" }}>
        <div className="row g8"><Avatar name={a.page} /><span className="xs w5 i1 ell fill" title={a.partner ? `${a.page} with ${a.partner}` : a.page}>{a.page}</span><Platforms ps={a.platforms} /></div>
        {title && <span className="sm w5 i1 ell" title={title}>{title}</span>}
        {body && <p className="xs i2" style={{ lineHeight: "17px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", margin: 0 }} title={body}>{body}</p>}
      </div>
      <div className="row g10 xs" style={{ padding: "8px 12px", borderTop: "1px solid var(--line)", marginTop: "auto" }}>
        {a.reach != null && <span className="row g4 i1 tnum" title={seen || "People reached in the EU — Meta’s estimate"}><Icon name="users" size={12} color="#3B4FC4" /><b className="w6">{num(a.reach)}</b></span>}
        {(a.copies ?? 1) > 1 && <span className="i3 tnum" title="Ads using this picture and text">×{a.copies}</span>}
        <span className="i3 ell fill" title={a.from === "shot" ? "Copied off a screenshot of the Ad Library website" : "From Meta’s Ad Library — ads that reached the EU or UK"}>{who !== a.page && who !== a.partner ? who : a.from === "shot" ? "US" : "EU/UK"}</span>
        {isLibId(a.id) && <a className="lnk row g4" href={adLibraryUrl({ id: a.id })} target="_blank" rel="noreferrer">Meta<Icon name="external" size={11} /></a>}
      </div>
    </div>
  );
}

/** What Meta needs before the API opens — said once, with the steps. */
function Access({ slug, kind, message, onRetry, busy }: { slug: string; kind: LibBlock; message: string; onRetry: () => void; busy: boolean }) {
  if (kind !== "identity") return (
    <div className="row g10" style={{ padding: "12px 14px", background: "var(--amber-bg)", borderRadius: 12, border: "1px solid #F1E1C4" }}>
      <Icon name="warning-circle" size={16} color="#B7791F" /><span className="xs c-amber fill" style={{ lineHeight: "18px" }}>{message}</span>
      {kind === "auth" ? <a className="btn sm" href={`/brands/${slug}/integrations`}>Reconnect Meta</a> : <button type="button" className="btn sm" disabled={busy} onClick={onRetry}>Try again</button>}
    </div>
  );
  const said = /Meta said: “(.*)”$/.exec(message)?.[1];
  return (
    <div className="card" style={{ border: "1px solid #F1E1C4" }}>
      <div className="card-h"><Icon name="id" size={18} color="#B7791F" /><span className="sm w5 fill">One step on Meta’s side before Kaviar can pull competitors’ ads</span></div>
      <div className="card-b" style={{ gap: 10 }}>
        <span className="xs i2" style={{ lineHeight: "18px" }}>Meta opens its Ad Library API only to a Facebook login that has confirmed its identity with Meta. Kaviar reads the Library with the Meta login connected on Integrations, so that person does this once:</span>
        <ol className="col g6 xs i1" style={{ margin: 0, paddingLeft: 18, lineHeight: "18px" }}>
          <li>Open <a className="lnk" href="https://www.facebook.com/ID" target="_blank" rel="noreferrer">facebook.com/ID</a> and confirm their identity (a photo ID and their country). Meta reviews it.</li>
          <li>Once confirmed, open <a className="lnk" href="https://www.facebook.com/ads/library/api" target="_blank" rel="noreferrer">the Ad Library API page</a> and accept the terms if Meta asks.</li>
          <li>Come back and press <b className="w5">Check again</b>.</li>
        </ol>
        <span className="xs i3" style={{ lineHeight: "17px" }}>Until then, screenshots work: screenshot the Ad Library website and Kaviar copies every ad card off it — Library ID, start date, platforms, text and picture.</span>
        <div className="row g8">
          <a className="btn sm dark" href="https://www.facebook.com/ID" target="_blank" rel="noreferrer"><Icon name="id" size={12} color="#fff" />Open facebook.com/ID</a>
          <button type="button" className="btn sm" disabled={busy} onClick={onRetry}>{busy ? <Icon name="spinner" size={12} className="spin" /> : <Icon name="refresh" size={12} />}Check again</button>
          <span className="fill" />
          {said && <span className="xs i3 ell" style={{ maxWidth: 360 }} title={said}>Meta said: “{said}”</span>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="col g2" style={{ padding: "10px 14px", flex: "1 1 120px", minWidth: 0 }}><span className="xs i3">{label}</span><span className="tnum" style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.3 }}>{value}</span>{sub && <span className="xs i3 ell" title={sub}>{sub}</span>}</div>;
}

/** Each competitor's numbers, counted from their ads — click one to see its ads. */
function Rivals({ rivals, us, market, pick, setPick, onRemove }: { rivals: RivalAds[]; us: Map<string, LibAd[]>; market: string; pick: string; setPick: (v: string) => void; onRemove: (n: string) => void }) {
  const names = [...new Set([...rivals.map((r) => r.name), ...us.keys()])];
  if (!names.length) return null;
  const cols = "minmax(150px, 1.6fr) 70px 70px 80px 76px 84px minmax(110px, 1fr) 64px";
  return (
    <div className="card" style={{ padding: 0, gap: 0, overflowX: "auto" }}>
      <div className="xs i3" style={{ display: "grid", gridTemplateColumns: cols, gap: 10, padding: "8px 14px", borderBottom: "1px solid var(--line)", minWidth: 760 }}>
        <span>Competitor</span><span title="Live ads that reached the EU or UK">Live ads</span><span title="Ads that started in the last 30 days">New, 30 d</span><span>Longest</span><span title="Creatives running 30+ days">30+ days</span><span>EU reach</span><span>Mostly reaches</span><span title="Ads copied off your US screenshots">US shots</span>
      </div>
      {names.map((n) => {
        const r = rivals.find((x) => x.name === n), s = r?.stats, u = us.get(n) ?? [];
        const top = r?.ads.find((a) => a.audience)?.audience;
        const on = pick === n;
        return (
          <div key={n} role="button" tabIndex={0} onClick={() => setPick(on ? "all" : n)} onKeyDown={(e) => { if (e.key === "Enter") setPick(on ? "all" : n); }}
            style={{ display: "grid", gridTemplateColumns: cols, gap: 10, padding: "9px 14px", borderBottom: "1px solid var(--line)", alignItems: "center", cursor: "pointer", background: on ? "var(--tray)" : undefined, minWidth: 760 }}>
            <span className="col" style={{ minWidth: 0 }}>
              <span className="row g6"><span className="sm w5 i1 ell">{n}</span>{on && <Icon name="check" size={12} />}</span>
              <span className="xs i3 ell">
                {r?.error ? <span className="c-amber" title={r.error}>{r.blocked === "identity" ? "Waiting on Meta (identity)" : r.error}</span>
                  : r?.pages?.length ? r.pages.map((p) => p.name).join(", ") : r ? "No Page of theirs ran ads in the EU or UK" : "From your screenshots"}
              </span>
            </span>
            <span className="sm tnum">{s ? s.ads : "—"}</span>
            <span className="sm tnum">{s ? s.new30 : "—"}</span>
            <span className="sm tnum">{s && s.creatives ? `${s.longest} d` : "—"}</span>
            <span className="sm tnum">{s ? s.proven : "—"}</span>
            <span className="sm tnum">{s?.reach != null ? num(s.reach) : "—"}</span>
            <span className="xs i2 ell" title={[top ? `${top.top} (${pct(top.topShare)})` : "", s?.women != null ? `${pct(s.women)} women` : "", s?.countries.map((c) => country(c.code)).join(", ")].filter(Boolean).join(" · ")}>{top ? `${top.top}${s?.women != null ? ` · ${pct(s.women)} women` : ""}` : "—"}</span>
            <span className="row g6">
              <span className="sm tnum">{u.length || "—"}</span><span className="fill" />
              <a className="lnk i3" href={adLibraryUrl({ q: n, country: market })} target="_blank" rel="noreferrer" title={`Their ${marketName(market)} ads on the Ad Library`} onClick={(e) => e.stopPropagation()}><Icon name="external" size={12} /></a>
              {r?.added && <button type="button" className="lnk i3" title="Remove" aria-label={`Remove ${n}`} onClick={(e) => { e.stopPropagation(); onRemove(n); }}><Icon name="x" size={12} /></button>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Iris's read — every angle is the count of ads she tagged with it, and pressing one shows those ads. Each gap is a decision. */
function ReadCard({ read, slug, id, angle, setAngle }: { read: AdsRead; slug: string; id: string; angle: string | null; setAngle: (a: string | null) => void }) {
  const router = useRouter();
  const [local, setLocal] = useState<Record<string, Decision | null>>({});
  const set = (gid: string, s: Decision | null) => { setLocal((x) => ({ ...x, [gid]: s })); void decide(slug, id, "gap", gid, s).then(() => router.refresh()); };
  const chips = [...read.hooks.map((x) => ["Hook", x] as const), ...read.offers.map((x) => ["Offer", x] as const)];
  return (
    <div className="col g12">
      <div className="col g8">
        <span className="row g6 xs i3" title={`${read.summary} ${read.positioning}`} style={{ letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}><AgentFace kind="analyst" size={16} />What their ads say<Icon name="info" size={12} /></span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 8 }}>
          {read.angles.map((a) => {
            const on = angle === a.name, can = Boolean(a.ids?.length);
            return (
              <button key={a.name} type="button" disabled={!can} onClick={() => setAngle(on ? null : a.name)} title={`“${a.example}” — ${a.who.join(", ")}`} className="col g6"
                style={{ padding: "10px 12px", borderRadius: 12, textAlign: "left", background: on ? "#121212" : "#fff", color: on ? "#fff" : "var(--ink)", boxShadow: on ? "none" : "0 0 0 1px var(--line)", cursor: can ? "pointer" : "default" }}>
                <span className="row between g8"><span className="sm w5 ell">{a.name}</span><span className="sm tnum w5">{a.share}%</span></span>
                <span style={{ height: 4, borderRadius: 99, background: on ? "rgba(255,255,255,.2)" : "var(--tray-2)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${Math.max(3, a.share)}%`, borderRadius: 99, background: on ? "#fff" : "#B7791F" }} /></span>
                <span className="xs tnum" style={{ color: on ? "rgba(255,255,255,.65)" : "var(--ink-3)" }}>{a.n != null && read.counted ? `${a.n} ads` : ""}{(a.proven ?? 0) > 0 ? ` · ${a.proven} running 30+ days` : ""}</span>
              </button>
            );
          })}
        </div>
        {chips.length > 0 && <div className="row g6" style={{ flexWrap: "wrap" }}>
          {chips.slice(0, 10).map(([k, x]) => <span key={k + x} className="row g6 xs" title={x} style={{ height: 26, padding: "0 10px", borderRadius: 99, background: "var(--tray)", maxWidth: 320 }}><b className="w5 i3">{k}</b><span className="ell">{x}</span></span>)}
        </div>}
      </div>
      {read.gaps.length > 0 && <div className="col g8">
        <span className="xs i3" style={{ letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>What nobody is saying</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
          {read.gaps.map((g) => {
            const st = g.id in local ? local[g.id] ?? undefined : g.status;
            return (
              <div key={g.id} className="col g10" title={g.why} style={{ padding: "12px 14px", borderRadius: 14, background: "#fff", boxShadow: "0 0 0 1px var(--line)", opacity: st === "rejected" ? 0.55 : 1 }}>
                <span className="row top g8"><Icon name="lightning" size={14} color="#B7791F" style={{ marginTop: 3 }} /><span className="sm w5 i1 fill">{g.text}</span></span>
                <div className="row g6" style={{ marginTop: "auto" }}>
                  {st ? <><span className={`pill ${st === "accepted" ? "green" : ""}`} style={{ height: 24, fontSize: 11.5 }}>{st === "accepted" ? "In your test plan" : "Skipped"}</span><button type="button" className="btn quiet sm" onClick={() => set(g.id, null)}>Undo</button></>
                    : <><button type="button" className="btn dark sm" onClick={() => set(g.id, "accepted")}><Icon name="check" size={12} color="#fff" />Test this</button><button type="button" className="btn quiet sm" onClick={() => set(g.id, "rejected")}>Skip</button></>}
                </div>
              </div>
            );
          })}
        </div>
      </div>}
    </div>
  );
}

/** Screenshots over the upload limit are shrunk in the browser first (full-page Ad Library screenshots are often 5–10 MB). */
async function fit(file: File): Promise<File> {
  if (file.size <= 4 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, 2400 / bmp.width);
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    for (const q of [0.88, 0.8, 0.7, 0.6]) {
      const b = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", q));
      if (b && b.size <= 4 * 1024 * 1024) return new File([b], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
    }
  } catch { /* send as is; the server says if it's too big */ }
  return file;
}

type Item = { a: LibAd; who: string };
type Sort = "long" | "new" | "reach" | "copies";

export function AdsTab({ slug, id, row, market, hasMeta, running }: { slug: string; id: string; row: ResearchRow; market: string; hasMeta: boolean; running: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [who, setWho] = useState("");
  const [note, setNote] = useState("");
  const [drag, setDrag] = useState(false);
  const [pick, setPick] = useState("all");
  const [from, setFrom] = useState<"all" | "api" | "shot">("all");
  const [sort, setSort] = useState<Sort>("long");
  const [proven, setProven] = useState(false);
  const [angle, setAngle] = useState<string | null>(null);
  const [limit, setLimit] = useState(24);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = async (k: string, fn: () => Promise<{ error?: string } | void>) => {
    setBusy(k); setErr(null);
    try { const r = await fn(); if (r && r.error) setErr(r.error); router.refresh(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const upload = async (files: File[]) => {
    const imgs = files.filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type)).slice(0, 6);
    if (!imgs.length) { setErr("Screenshots must be PNG, JPG or WebP."); return; }
    await run("shot", async () => {
      for (const [i, f] of imgs.entries()) {
        setBusy(`shot:${i + 1}/${imgs.length}`);
        const fd = new FormData(); fd.set("file", await fit(f)); fd.set("competitor", who); fd.set("note", note);
        const r = await addScreenshot(slug, id, fd);
        if (r.error) return r;
        router.refresh();
      }
      setNote("");
    });
  };

  const names = [...new Set([...row.rivals.map((r) => r.name), ...(row.report?.competitors ?? []).map((c) => c.name)])];
  const step = row.steps.find((s) => s.key === "adlib");
  const block = row.rivals.find((r) => r.blocked);
  // Screenshot ads are filed under the competitor they belong to ("Medicube" on a card is the "medicube" pulled from the API).
  const us = useMemo(() => {
    const key = (x: string) => x.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
    const canon = (k: string) => row.rivals.find((r) => { const a = key(r.name), b = key(k); return Boolean(a && b) && (a === b || a.includes(b) || (b.includes(a) && a.length >= 4)); })?.name ?? k;
    // An ad already pulled from the API (same Library ID), or read off an earlier screenshot, shows once.
    const seen = new Set(row.rivals.flatMap((r) => r.ads.flatMap((a) => a.ids ?? [a.id])));
    const m = new Map<string, LibAd[]>();
    for (const s of row.manual) for (const a of s.ads ?? []) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      const k = canon(s.competitor || a.partner || a.page); m.set(k, [...(m.get(k) ?? []), a]);
    }
    return m;
  }, [row.manual, row.rivals]);
  const items: Item[] = useMemo(() => [
    ...row.rivals.flatMap((r) => r.ads.map((a) => ({ a: { ...a, from: a.from ?? ("api" as const) }, who: r.name }))),
    ...[...us].flatMap(([k, ads]) => ads.map((a) => ({ a, who: k }))),
  ], [row.rivals, us]);
  const angleIds = angle ? new Set(row.adsRead?.angles.find((x) => x.name === angle)?.ids ?? []) : null;
  const shown = items
    .filter((x) => pick === "all" || x.who === pick)
    .filter((x) => from === "all" || x.a.from === from)
    .filter((x) => !proven || (days(x.a.start) ?? 0) >= 30)
    .filter((x) => !angleIds || angleIds.has(x.a.id))
    .sort((x, y) => sort === "new" ? (days(x.a.start) ?? 1e9) - (days(y.a.start) ?? 1e9)
      : sort === "reach" ? (y.a.reach ?? -1) - (x.a.reach ?? -1)
      : sort === "copies" ? (y.a.copies ?? 1) - (x.a.copies ?? 1)
      : (days(y.a.start) ?? -1) - (days(x.a.start) ?? -1));

  // Totals, counted from Meta's data.
  const st = row.rivals.map((r) => r.stats).filter((s): s is NonNullable<RivalAds["stats"]> => Boolean(s));
  const lib = st.reduce((a, s) => a + s.ads, 0), usN = [...us.values()].reduce((a, x) => a + x.length, 0);
  const longest = items.reduce<Item | null>((b, x) => ((days(x.a.start) ?? -1) > (days(b?.a.start) ?? -1) ? x : b), null);
  const reach = st.some((s) => s.reach != null) ? st.reduce((a, s) => a + (s.reach ?? 0), 0) : null;
  const longRun = items.filter((x) => (days(x.a.start) ?? 0) >= 30).length;
  const pulledAt = row.rivals.map((r) => r.at).sort().at(-1);
  const shotBusy = busy?.startsWith("shot") ?? false;
  const of = shotBusy && busy!.includes("/") && !busy!.endsWith("/1") ? ` ${busy!.slice(5)}` : "";

  return (
    <div className="col g12">
      {block && <Access slug={slug} kind={block.blocked!} message={block.error ?? ""} busy={running || busy != null} onRetry={() => run("pull", () => rerun(slug, id, ["ads"]))} />}
      <div className="row g8" style={{ flexWrap: "wrap" }}>
        <form className="row g6" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void run("add", async () => { const r = await addRival(slug, id, name); if (!r.error) setName(""); return r; }); }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a competitor’s Facebook Page" aria-label="Competitor name" className="input sm" style={{ width: 250, height: 32 }} />
          <button type="submit" className="btn sm" disabled={busy != null || !name.trim()}>{busy === "add" ? <Icon name="spinner" size={12} className="spin" /> : <Icon name="plus" size={12} />}Add</button>
        </form>
        {!hasMeta && <span className="pill amber" style={{ height: 26 }}>Connect Meta Ads to pull ads</span>}
        <span className="fill" />
        {err && <span className="xs c-amber" style={{ maxWidth: 420 }}>{err}</span>}
        <a className="btn sm quiet" href={adLibraryUrl({ q: names[0] ?? "", country: market })} target="_blank" rel="noreferrer" title={`Meta shares a brand’s ads through its API when they also reached the EU or UK. Ads shown only in ${marketName(market)} are on the Ad Library website — screenshot them below and Kaviar copies each ad off the screenshot.`}>Ad Library<Icon name="external" size={11} /></a>
        <button type="button" className="btn sm" disabled={busy != null || running} onClick={() => run("pull", () => rerun(slug, id, ["ads"]))}>{running ? <Icon name="spinner" size={12} className="spin" /> : <Icon name="refresh" size={12} />}Pull again</button>
      </div>
      {!block && hasMeta && step?.state === "error" && step.note && <div className="row g8 xs c-amber" style={{ padding: "8px 12px", background: "var(--amber-bg)", borderRadius: 10 }}><Icon name="warning-circle" size={14} color="#B7791F" />{step.note}</div>}

      {items.length > 0 && (
        <div className="card" style={{ padding: 0, gap: 0 }} title={`Counted from Meta’s Ad Library${pulledAt ? ` · pulled ${new Date(pulledAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""} — no estimates`}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <Stat label="Live ads in the Library" value={lib ? num(lib) : "—"} sub={lib ? `${st.reduce((a, s) => a + s.creatives, 0)} creatives · EU/UK` : "none from the API yet"} />
            <Stat label="From your US screenshots" value={usN ? String(usN) : "—"} sub={usN ? `${row.manual.filter((m) => m.ads?.length).length} screenshots` : "add one below"} />
            <Stat label="Running 30+ days" value={String(longRun)} sub="a sign an ad is working" />
            <Stat label="Longest running" value={longest && days(longest.a.start) != null ? `${days(longest.a.start)} days` : "—"} sub={longest ? longest.who : undefined} />
            <Stat label="Reached in the EU" value={reach != null ? num(reach) : "—"} sub={reach != null ? "people, Meta’s estimate" : "Meta shares reach for EU/UK ads"} />
          </div>
        </div>
      )}

      {row.adsRead && <ReadCard read={row.adsRead} slug={slug} id={id} angle={angle} setAngle={setAngle} />}

      {items.length > 0 && (
        <div className="col g10">
          <div className="row g8" style={{ flexWrap: "wrap" }}>
            <span className="h3">Their ads</span><span className="xs i3 tnum">{shown.length} of {items.length}</span>
            <span className="fill" />
            {angle && <button type="button" className="chip" onClick={() => setAngle(null)} style={{ height: 28 }}>Angle: {angle}<Icon name="x" size={11} /></button>}
            <Combo chip small label="Competitor" prefix="Competitor" value={pick} onChange={setPick} options={[{ value: "all", label: "All competitors" }, ...[...new Set(items.map((x) => x.who))].map((n) => ({ value: n, label: n }))]} />
            <div className="seg">{([["all", "All"], ["api", "EU/UK"], ["shot", "US shots"]] as const).map(([k, l]) => <button key={k} type="button" className={`o ${from === k ? "on" : ""}`} onClick={() => setFrom(k)}>{l}</button>)}</div>
            <button type="button" className={`chip ${proven ? "" : "dash"}`} style={{ height: 28 }} onClick={() => setProven(!proven)}>{proven && <Icon name="check" size={11} />}Running 30+ days</button>
            <Combo chip small label="Sort" prefix="Sort" value={sort} onChange={(v) => setSort(v as Sort)} options={[{ value: "long", label: "Longest running" }, { value: "new", label: "Newest" }, { value: "reach", label: "Most reach (EU)" }, { value: "copies", label: "Most ads using it" }]} />
          </div>
          {shown.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
              {shown.slice(0, limit).map((x) => <AdCard key={`${x.who}:${x.a.id}`} a={x.a} who={x.who} />)}
            </div>
          ) : <span className="sm i3">No ads match these filters.</span>}
          {shown.length > limit && <button type="button" className="btn sm" style={{ alignSelf: "center" }} onClick={() => setLimit(limit + 24)}>Show more ({shown.length - limit})</button>}
        </div>
      )}

      <Rivals rivals={row.rivals} us={us} market={market} pick={pick} setPick={setPick} onRemove={(n) => run("rm", () => removeRival(slug, id, n))} />
      {!row.rivals.length && !usN && <span className="sm i3">No competitors pulled yet. {row.report ? "Pull the ads, add a competitor by name, or add a screenshot below." : "They come from the market research — or add one by name."}</span>}


      <div className="col g8" style={{ marginTop: 6 }}>
        <div className="row between"><span className="h3" title="Screenshot a results page or one ad on the Ad Library website — Kaviar copies every ad off it">Add US ads from a screenshot</span></div>
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (!shotBusy) void upload([...e.dataTransfer.files]); }}
          onPaste={(e) => { const fs = [...e.clipboardData.files]; if (fs.length && !shotBusy) { e.preventDefault(); void upload(fs); } }}
          className="row g8" style={{ flexWrap: "wrap", padding: 12, border: `1px dashed ${drag ? "var(--ink-3)" : "var(--line-2)"}`, borderRadius: 10, background: drag ? "var(--tray)" : undefined }}>
          <button type="button" className="btn sm dark" disabled={shotBusy} onClick={() => fileRef.current?.click()}>
            {shotBusy ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : <Icon name="upload" size={12} color="#fff" />}{shotBusy ? `Reading${of}…` : "Add screenshots"}</button>
          <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) void upload(fs); }} />
          <input value={who} onChange={(e) => setWho(e.target.value)} list="research-rivals" placeholder="Whose ads (optional)" aria-label="Whose ads" className="input sm" style={{ width: 170, height: 32 }} />
          <datalist id="research-rivals">{names.map((n) => <option key={n} value={n} />)}</datalist>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" className="input sm fill" style={{ minWidth: 160, height: 32 }} />
          {shotBusy && <span className="xs i3" style={{ width: "100%" }}>Iris is copying each ad — about 20 seconds a screenshot.</span>}
        </div>
        {row.manual.length > 0 && (
          <div className="col">
            {row.manual.map((m) => (
              <div key={m.id} className="row g10" style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                <a href={`/api/assets/${m.id}`} target="_blank" rel="noreferrer" className="thumb" style={{ width: 54, height: 40 }}><img src={`/api/assets/${m.id}`} alt="Screenshot" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} /></a>
                <span className="col fill" style={{ minWidth: 0 }}>
                  <span className="xs w5 i1 ell">{m.competitor || "Screenshot"}{m.note ? <span className="w4 i3"> · {m.note}</span> : null}</span>
                  <span className={`xs ell ${m.read === "error" ? "c-amber" : "i3"}`}>{m.read ? m.readNote : "Not copied yet — Iris looks at the picture as a whole"}</span>
                </span>
                {(!m.ads?.length || m.read === "error") && <button type="button" className="btn sm" disabled={busy != null} onClick={() => run(`read:${m.id}`, () => readScreenshot(slug, id, m.id))}>{busy === `read:${m.id}` ? <Icon name="spinner" size={12} className="spin" /> : <Icon name="refresh" size={12} />}{m.read ? "Read again" : "Copy the ads"}</button>}
                <button type="button" className="lnk xs i3" onClick={() => run("rm", () => removeScreenshot(slug, id, m.id))}>Remove</button>
              </div>
            ))}

          </div>
        )}
      </div>
    </div>
  );
}
