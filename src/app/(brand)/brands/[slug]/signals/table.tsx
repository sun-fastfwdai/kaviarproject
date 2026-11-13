"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { writeBrief, type Brief } from "./actions";
import { Icon, type IconName } from "@/components/icon";
import { Modal } from "@/components/modal";
import { CopyButton } from "@/components/copy";
import { AgentFace } from "@/components/agent";

export type Status = "in-use" | "ready" | "needs-data" | "needs-app";
export type SignalRow = {
  group: string; icon: IconName; data: string; value: string | null; use: string;
  where: [string, string, IconName]; status: Status; evidence: [string, string][];
  missing?: string; why?: string;
};

const STATUS: Record<Status, [string, string]> = {
  "in-use": ["In use", "green"], ready: ["Ready", "blue"], "needs-data": ["Needs data", ""], "needs-app": ["Needs app access", "amber"],
};

function StatusPill({ s }: { s: Status }) {
  const [t, tone] = STATUS[s];
  return <span className={`pill ${tone}`} style={{ height: 22, fontSize: 11.5 }}>{tone && <span className={`dot ${tone}`} />}{t}</span>;
}

const briefText = (b: Brief) =>
  `Audience: ${b.audience}\nAngle: ${b.angle}\nHook: ${b.hook}\n\nPrimary text:\n${b.primaryText}\n\nHeadline: ${b.headline}\nOffer: ${b.offer}\nFormat: ${b.format}\nAvoid: ${b.avoid}`;

function SignalModal({ slug, row, onClose }: { slug: string; row: SignalRow; onClose: () => void }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const usable = row.status === "in-use" || row.status === "ready";
  const write = () => start(async () => {
    setErr(null);
    const r = await writeBrief(slug, { data: row.data, value: row.value, use: row.use, evidence: row.evidence });
    if (r.brief) setBrief(r.brief); else setErr(r.error ?? "Something went wrong.");
  });
  return (
    <Modal icon={<Icon name={row.icon} size={18} />} title={row.data} sub={`${row.group} · ${row.use}`} onClose={onClose} width={640}
      footer={<>
        <Link className="btn" href={row.where[1]}><Icon name={row.where[2]} size={13} />Open {row.where[0]}</Link>
        <span className="fill" />
        {brief ? <CopyButton text={briefText(brief)} label="Copy brief" />
          : usable && <button type="button" className="btn dark" disabled={busy} onClick={write}>
              {busy ? <Icon name="spinner" size={13} className="spin" color="#fff" /> : <Icon name="sparkle" size={13} color="#fff" />}{busy ? "Remy is writing…" : "Write the ad"}</button>}
      </>}>
      <div className="col g14">
        <div className="row g8"><StatusPill s={row.status} /><span className="sm i2">{row.value ?? "Not enough data yet"}</span></div>
        {row.evidence.length > 0 && (
          <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
            <div className="xs w5 i2" style={{ padding: "8px 12px", background: "var(--tray)", borderBottom: "1px solid var(--line)" }}>From the store’s data</div>
            {row.evidence.map(([k, v], i) => (
              <div key={k + i} className="row between g12 sm" style={{ padding: "8px 12px", borderTop: i ? "1px solid var(--line)" : 0 }}><span className="i1 ell">{k}</span><span className="i2 tnum" style={{ flexShrink: 0 }}>{v}</span></div>
            ))}
          </div>
        )}
        {row.why && <div className="row top g8" style={{ padding: "10px 12px", background: "var(--blue-bg)", borderRadius: 10 }}><AgentFace kind="analyst" size={18} /><span className="sm i1" style={{ lineHeight: "19px" }}><b className="w5">Iris:</b> {row.why}</span></div>}
        {row.missing && <div className="notice amber"><Icon name="info" size={14} /><span>{row.missing}</span></div>}
        {err && <div className="notice red">{err}</div>}
        {brief ? (
          <div className="col" style={{ border: "1px solid var(--ink)", borderRadius: 10, overflow: "hidden" }}>
            <div className="row g8" style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)" }}><AgentFace kind="builder" size={18} mood="happy" /><span className="sm w5">Ad brief from Remy</span><span className="xs i3 fill">ready to paste into Ads Manager</span></div>
            {([["Audience", brief.audience], ["Angle", brief.angle], ["Hook", brief.hook], ["Primary text", brief.primaryText], ["Headline", brief.headline], ["Offer", brief.offer], ["Format", brief.format], ["Avoid", brief.avoid]] as const).map(([k, v]) => (
              <div key={k} className="row top g12" style={{ padding: "8px 12px", borderTop: "1px solid var(--line)" }}>
                <span className="xs i3" style={{ width: 90, flexShrink: 0, paddingTop: 2 }}>{k}</span>
                <span className="sm i1" style={{ lineHeight: "19px", whiteSpace: "pre-wrap" }}>{v}</span>
              </div>
            ))}
          </div>
        ) : usable && !busy && (
          <span className="xs i3">“Write the ad” asks Remy for a Meta ad brief built on this signal — audience, angle, hook, copy and format — using the real numbers above.</span>
        )}
      </div>
    </Modal>
  );
}

export function SignalsTable({ slug, rows }: { slug: string; rows: SignalRow[] }) {
  const [open, setOpen] = useState<SignalRow | null>(null);
  return (
    <>
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="tr hd dense" style={{ padding: "0 14px" }}>
          <div className="td" style={{ width: 100 }}>Group</div><div className="td fill">Shopify data · what it tells us</div>
          <div className="td" style={{ width: 200 }}>How ads use it</div><div className="td" style={{ width: 140 }}>Where in Kaviar</div><div className="td" style={{ width: 132 }}>Status</div>
        </div>
        {rows.map((s, i) => {
          const first = rows[i - 1]?.group !== s.group;
          const lastInGroup = rows[i + 1]?.group !== s.group;
          return (
            <div key={s.group + s.data} className="tr sig-row" role="button" tabIndex={0} onClick={() => setOpen(s)} onKeyDown={(e) => { if (e.key === "Enter") setOpen(s); }}
              style={{ padding: "8px 14px", minHeight: 52, cursor: "pointer", borderBottom: lastInGroup ? "1px solid var(--line-2)" : undefined }}>
              <div className="td" style={{ width: 100 }}>{first && <span className="row g6 sm w5 i1"><Icon name={s.icon} size={14} />{s.group}</span>}</div>
              <div className="td fill"><div className="col" style={{ minWidth: 0 }}><span className="sm w5 i1">{s.data}</span><span className="xs i3" style={{ lineHeight: "16px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.value ?? "Not enough data yet"}</span></div></div>
              <div className="td sm" style={{ width: 200, lineHeight: "17px" }}>{s.use}</div>
              <div className="td" style={{ width: 140 }} onClick={(e) => e.stopPropagation()}>
                <Link className="chip" style={{ height: 26, fontSize: 12, fontWeight: 400, ...(s.status === "needs-app" ? { borderColor: "#F1E1C4", color: "var(--amber)" } : {}) }} href={s.where[1]}>
                  <Icon name={s.where[2]} size={12} />{s.where[0]}</Link>
              </div>
              <div className="td row between" style={{ width: 132 }}><StatusPill s={s.status} /><Icon name="chev-r" size={13} color="#B5B2AC" /></div>
            </div>
          );
        })}
      </div>
      {open && <SignalModal slug={slug} row={open} onClose={() => setOpen(null)} />}
    </>
  );
}
