"use client";
import { useMemo, useState } from "react";
import { AdArt, PhonePreview, type AdView } from "@/components/ad-creative";
import { AgentFace } from "@/components/agent";
import { Icon } from "@/components/icon";
import { ottoChecks } from "@/lib/creative/otto";
import { META_URL_PARAMS } from "@/lib/sync/attribution";

type Props = {
  brand: string; currency: string; title: string; audience: string; audienceSize: number | null; exclude: string | null;
  ads: AdView[]; codes: string[]; site: string | null; metaAccount: string | null;
};

const money = (v: number, c: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(v);

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="row between g12 sm" style={{ minHeight: 38, borderTop: "1px solid var(--line)" }}><span className="i3">{k}</span><span className="i1 row g6" style={{ textAlign: "right" }}>{children}</span></div>;
}

/** Board 19b: a small, safe test from approved ads — budget, audience, stop rules, Otto's pre-launch checks, launch sheet. */
export function TestSetup(p: Props) {
  const [name, setName] = useState(`${p.title} · ${new Date().toLocaleDateString("en-US", { month: "short" })}`);
  const [daily, setDaily] = useState(20);
  const [days, setDays] = useState(7);
  const [scale, setScale] = useState(1.5);
  const [stop, setStop] = useState(1);
  const [sel, setSel] = useState(p.ads[0]?.id);
  const ad = p.ads.find((a) => a.id === sel) ?? p.ads[0];
  const link = p.site ? `${p.site.replace(/\/$/, "")}/?${META_URL_PARAMS}` : null;
  const adChecks = p.ads.map((a) => ottoChecks(a, p.codes).every((c) => c.ok));
  const checks: [string, boolean][] = [
    ["Budget is small and capped", daily * days <= 500],
    ["UTM tags on every link", Boolean(link)],
    ["Meta ad account connected", Boolean(p.metaAccount)],
    ["Audience big enough (1,000+)", (p.audienceSize ?? 0) >= 1000],
    ["Every ad passes Otto’s checks", adChecks.every(Boolean)],
    ["At least 2 ads to compare", p.ads.length >= 2],
  ];
  const sheet = useMemo(() => {
    const rows = [
      ["Campaign", name], ["Objective", "Sales · purchases"], ["Status", "Paused (turn on after review)"], ["Daily budget", money(daily, p.currency)], ["Days", String(days)], ["Max spend", money(daily * days, p.currency)],
      ["Audience", p.audience], ["Exclude", p.exclude ?? "—"], ["Placements", "Reels · Feed · Stories (Advantage+ placements)"], ["Website URL", link ?? "brand site"], ["URL parameters", META_URL_PARAMS],
      ["Scale if", `≥ ${scale}× verified return at day ${days}`], ["Stop early if", `< ${stop}× by day ${Math.ceil(days / 2)}`], ["Judged by", "Shopify orders (Kaviar verified ROAS)"],
    ];
    const adRows = p.ads.map((a, i) => [`Ad ${i + 1}`, `${a.format} | Hook: ${a.hook} | Primary text: ${a.primaryText} | Headline: ${a.headline} | CTA: ${a.cta} | Offer: ${a.offer}${a.imageUrl ? ` | Image: ${a.imageUrl}` : ""}`]);
    return [...rows, ...adRows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  }, [name, daily, days, scale, stop, p, link]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([sheet], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${name.replace(/[^\w-]+/g, "-").toLowerCase()}-launch-sheet.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const num = (v: number, set: (n: number) => void, step = 1, min = 1) => (
    <input type="number" value={v} min={min} step={step} onChange={(e) => set(Math.max(min, Number(e.target.value) || min))} style={{ width: 70, border: "1px solid var(--line-2)", borderRadius: 6, padding: "3px 6px", font: "inherit", fontSize: 12.5 }} />
  );

  return (
    <div className="row fill stretch" style={{ minHeight: 0 }}>
      <section className="scroll col" style={{ padding: "20px 24px", gap: 14 }}>
        <div className="row g8 xs">
          {["Signal", "Creatives", "Run test", "Measure 7 days", "Optimize"].map((s, i) => (
            <span key={s} className="row g6"><span style={{ width: 14, height: 14, borderRadius: 99, display: "inline-flex", alignItems: "center", justifyContent: "center", background: i < 2 ? "var(--green)" : "#fff", border: i < 2 ? 0 : `1.5px solid ${i === 2 ? "var(--ink)" : "var(--line-2)"}` }}>{i < 2 && <Icon name="check" size={9} color="#fff" weight="bold" />}</span><span className={i <= 2 ? "i1 w5" : "i3"}>{s}</span>{i < 4 && <span style={{ width: 28, height: 1.5, background: i < 2 ? "var(--green)" : "var(--line-2)" }} />}</span>
          ))}
        </div>
        <div className="row top g16">
          <div className="col g12 fill" style={{ minWidth: 0 }}>
            <div className="card" style={{ padding: "4px 16px 4px" }}>
              <span className="row g8 sm w5" style={{ height: 40 }}><span className="xs i4">01</span><Icon name="megaphone" size={14} />Campaign</span>
              <Row k="Name"><input value={name} onChange={(e) => setName(e.target.value)} style={{ border: "1px solid var(--line-2)", borderRadius: 6, padding: "3px 6px", font: "inherit", fontSize: 12.5, width: 220 }} /></Row>
              <Row k="Objective">Sales · purchases</Row>
              <Row k="Budget">{num(daily, setDaily, 5, 5)}<span className="xs i3">/ day ·</span>{num(days, setDays, 1, 3)}<span className="xs i3">days</span></Row>
              <Row k="Max spend"><b className="w5">{money(daily * days, p.currency)}</b></Row>
            </div>
            <div className="card" style={{ padding: "4px 16px 4px" }}>
              <span className="row g8 sm w5" style={{ height: 40 }}><span className="xs i4">02</span><Icon name="users" size={14} />Who sees it</span>
              <Row k="Audience"><span className="ell" style={{ maxWidth: 300 }}>{p.audience}</span>{p.audienceSize != null && <span className="pill green" style={{ height: 20, fontSize: 10.5 }}>{p.audienceSize.toLocaleString("en-US")} Shopify customers</span>}</Row>
              {p.exclude && <Row k="Exclude">{p.exclude}</Row>}
              <Row k="Placements">Reels · Feed · Stories</Row>
            </div>
            <div className="card" style={{ padding: "4px 16px 4px" }}>
              <span className="row g8 sm w5" style={{ height: 40 }}><span className="xs i4">03</span><Icon name="target" size={14} />When to call it</span>
              <Row k="Idea wins">≥ {num(scale, setScale, 0.1, 1)}× real return at day {days} → scale</Row>
              <Row k="Stop early">&lt; {num(stop, setStop, 0.1, 0.1)}× by day {Math.ceil(days / 2)} → pause</Row>
              <Row k="Measured by"><span className="pill" style={{ height: 20, fontSize: 10.5 }}>Shopify orders</span></Row>
            </div>
          </div>
          <div className="card col" style={{ width: 340, flexShrink: 0, overflow: "hidden" }}>
            <span className="row between sm w5" style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}><span className="row g8"><Icon name="image" size={14} />Ads · {p.ads.length} approved</span></span>
            {p.ads.map((a, i) => (
              <button key={a.id} type="button" onClick={() => setSel(a.id)} className="row g10" style={{ padding: "10px 14px", borderTop: i ? "1px solid var(--line)" : 0, textAlign: "left", background: a.id === ad?.id ? "var(--tray)" : "#fff", cursor: "pointer" }}>
                <span style={{ width: 44, flexShrink: 0, borderRadius: 7, overflow: "hidden" }}><AdArt ad={a} brand="" ratio="1 / 1" bare /></span>
                <span className="col fill" style={{ minWidth: 0 }}><span className="sm w5 i1 ell">{a.hook}</span><span className="xs i3 ell">{a.primaryText}</span></span>
                <span className={`pill ${adChecks[i] ? "green" : "amber"}`} style={{ height: 20, fontSize: 10.5 }}>{adChecks[i] ? "Ready" : "Check"}</span>
              </button>
            ))}
            <div className="col g6" style={{ padding: "12px 14px", borderTop: "1px solid var(--line)", background: "var(--tray)" }}>
              <span className="row g6 xs i2"><Icon name="info" size={12} />Meta picks the best ad and shows it more. Kaviar judges the whole idea on Shopify orders.</span>
              {link && <span className="xs i3" style={{ wordBreak: "break-all" }}><b className="w5 i2">Link · auto-tagged:</b> {link}</span>}
            </div>
          </div>
        </div>
      </section>
      <aside className="col g12" style={{ width: 320, flexShrink: 0, borderLeft: "1px solid var(--line)", background: "var(--tray)", padding: "16px", overflowY: "auto" }}>
        <span className="sm w5">Preview</span>
        {ad && <div className="row" style={{ justifyContent: "center" }}><PhonePreview ad={ad} brand={p.brand} ratio="9 / 16" /></div>}
        <div className="col g6" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
          <span className="row g8"><AgentFace kind="qa" size={18} /><span className="sm w5 fill">Otto’s pre-launch checks</span><span className="xs i3">{checks.filter(([, ok]) => ok).length} / {checks.length}</span></span>
          {checks.map(([k, ok]) => <span key={k} className={`row g6 xs ${ok ? "i2" : "c-amber"}`}><Icon name={ok ? "check-circle" : "warning-circle"} size={13} weight={ok ? "fill" : "regular"} color={ok ? "#1F8A5B" : "#B7791F"} />{k}</span>)}
        </div>
        <div className="fill" />
        <span className="xs i3" style={{ lineHeight: "16px" }}>Kaviar can’t create campaigns on Meta yet — it only has read access to the ad account. Export the launch sheet and set it up in Ads Manager as a <b>paused</b> campaign.</span>
        <button type="button" className="btn dark" onClick={download}><Icon name="download" size={14} color="#fff" />Export launch sheet</button>
        <button type="button" className="btn" disabled title="Needs ads_management permission on the Meta app"><Icon name="megaphone" size={14} />Create on Meta · paused</button>
      </aside>
    </div>
  );
}
