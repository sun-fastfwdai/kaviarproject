"use client";
import { Fragment } from "react";
import { Icon, type IconName } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { MetaLogo, ShopifyLogo } from "@/components/logos";
import type { DataSource, Src } from "@/lib/research/types";

/* The Brand intelligence board's language (03): a section head with a quiet count, then hairline rows —
   a muted label, the value, where it came from in small grey type, and actions on the right. No pills for sources. */

export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="col">
      <div className="row between g12" style={{ paddingBottom: 8 }}><span className="h3">{title}</span>{right != null && <span className="xs i3 row g6">{right}</span>}</div>
      <div className="col" style={{ borderTop: "1px solid var(--line)" }}>{children}</div>
    </section>
  );
}

export function Line({ label, children, from, end, dim, sub, labelW = 132 }: {
  label?: React.ReactNode; children: React.ReactNode; from?: React.ReactNode; end?: React.ReactNode; dim?: boolean; sub?: React.ReactNode; labelW?: number;
}) {
  return (
    <div className="row top g16" style={{ padding: "11px 0", borderBottom: "1px solid var(--line)", opacity: dim ? 0.45 : 1 }}>
      {label !== undefined && <span className="sm i3" style={{ width: labelW, flexShrink: 0, lineHeight: "20px" }}>{label}</span>}
      <span className="col g2 fill" style={{ minWidth: 0 }}>
        <span className="sm i1" style={{ lineHeight: "20px" }}>{children}</span>
        {sub && <span className="xs i3" style={{ lineHeight: "17px" }}>{sub}</span>}
      </span>
      {from && <span style={{ flexShrink: 0, paddingTop: 2 }}>{from}</span>}
      {end && <span style={{ flexShrink: 0 }}>{end}</span>}
    </div>
  );
}

const FROM: Record<DataSource, [string, IconName | "shopify" | "meta"]> = {
  shopify: ["From Shopify", "shopify"], meta: ["From Meta ads", "meta"], research: ["From the research", "globe"], ads: ["From competitors’ ads", "eye"], brand: ["From the brand profile", "palette"],
};
/** Where a fact came from, as small grey type — "From Shopify". */
export function From({ s }: { s: DataSource }) {
  const [label, ic] = FROM[s] ?? FROM.research;
  return (
    <span className="row g6 xs i3" style={{ whiteSpace: "nowrap" }}>
      {ic === "shopify" ? <ShopifyLogo size={12} /> : ic === "meta" ? <MetaLogo size={12} /> : <Icon name={ic} size={12} color="#8B8883" />}{label}
    </span>
  );
}

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u.slice(0, 30); } };
/** Web sources behind a finding: "Found on koreaherald.com +2", each a link. */
export function Found({ ids, all }: { ids: number[]; all: Src[] }) {
  const list = ids.map((i) => all[i - 1]).filter(Boolean);
  if (!list.length) return <span className="row g6 xs i3" style={{ whiteSpace: "nowrap" }}><AgentFace kind="analyst" size={13} />Iris’s read</span>;
  return (
    <span className="row g6 xs i3" style={{ whiteSpace: "nowrap" }} title={list.map((s) => `${s.title} — ${host(s.url)}`).join("\n")}>
      <Icon name="globe" size={12} color="#8B8883" />
      <span>Found on <a className="i2" href={list[0].url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline", textDecorationColor: "var(--line-2)", textUnderlineOffset: 2 }}>{host(list[0].url).slice(0, 26)}</a></span>
      {list.length > 1 && <span>+{list.length - 1}</span>}
    </span>
  );
}

/** Numbers carry the argument: money, percentages, counts and "N of M" stand out from the sentence around them. */
const FIG = /(\$\s?\d[\d,]*(?:\.\d+)?[KMB]?(?:\s?[–-]\s?\$?\d[\d,]*(?:\.\d+)?[KMB]?)?\+?|\d[\d,]*(?:\.\d+)?\s?%|\b\d+ of \d+\b|\b\d[\d,]*\.\d+\b|\b\d{1,3}(?:,\d{3})+\b|\b\d{2,}\b)/g;
const YEAR = /^(19|20)\d{2}$/;
export function Figures({ text }: { text: string }) {
  const parts = text.split(FIG);
  return <>{parts.map((p, i) => (i % 2 && !YEAR.test(p) ? <b key={i} className="w6 i1 tnum">{p}</b> : <Fragment key={i}>{p}</Fragment>))}</>;
}

/** Accept / reject on a suggestion, as on board 03: two quiet icons, then "Accepted" in green with Undo. */
export function Decide({ status, onSet }: { status?: "accepted" | "rejected"; onSet: (s: "accepted" | "rejected" | null) => void }) {
  if (status) return <span className="row g8 xs" style={{ whiteSpace: "nowrap" }}><span className={status === "accepted" ? "c-green row g4" : "i3"}>{status === "accepted" && <Icon name="check" size={12} color="#1F8A5B" />}{status === "accepted" ? "Accepted" : "Rejected"}</span><button type="button" className="lnk i3" onClick={() => onSet(null)}>Undo</button></span>;
  return (
    <span className="row g2">
      <button type="button" aria-label="Accept" title="Accept" onClick={() => onSet("accepted")} className="btn quiet sm" style={{ width: 26, padding: 0, justifyContent: "center" }}><Icon name="check" size={13} color="#1F8A5B" /></button>
      <button type="button" aria-label="Reject" title="Reject" onClick={() => onSet("rejected")} className="btn quiet sm" style={{ width: 26, padding: 0, justifyContent: "center" }}><Icon name="x" size={13} color="#8B8883" /></button>
    </span>
  );
}

/** A short status in colour, with a dot — never a pill. */
export function Tone({ c, children }: { c: "green" | "blue" | "amber" | "red" | "ink"; children: React.ReactNode }) {
  return <span className={`row g6 xs w5 ${c === "ink" ? "i1" : `c-${c}`}`} style={{ whiteSpace: "nowrap" }}><span className={`dot ${c}`} />{children}</span>;
}
