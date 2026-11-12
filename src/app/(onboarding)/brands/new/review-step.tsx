"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { finishOnboarding, irisDraftPolicy, saveField } from "./actions";
import { BackLink, FromTag, OnboardingShell } from "./shell";
import { AgentFace } from "@/components/agent";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import { CopyButton } from "@/components/copy";
import { PROFILE_GROUPS, type Analysis, type Profile, type ToAdd } from "@/lib/onboarding/types";

function Row({ id, k, label, f, palette, onSaved }: { id: string; k: string; label: string; f: Profile[string] | undefined; palette?: string[]; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(f?.value ?? "");
  const [busy, start] = useTransition();
  const save = () => start(async () => { await saveField(id, k, v); setEditing(false); onSaved(); });
  if (editing) {
    return (
      <div className="row top g12" style={{ padding: "12px 14px", borderTop: "1px solid var(--line)", boxShadow: "inset 3px 0 0 var(--ink)", background: "#fff" }}>
        <span className="sm w5 i1" style={{ width: 120, flexShrink: 0, paddingTop: 8 }}>{label}</span>
        <div className="col g8 fill">
          <div className="input" style={{ height: "auto", padding: 8, borderColor: "var(--ink)" }}>
            <textarea value={v} onChange={(e) => setV(e.target.value)} rows={3} autoFocus style={{ border: 0, outline: 0, resize: "none", width: "100%", font: "inherit", fontSize: 13 }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(); if (e.key === "Escape") setEditing(false); }} />
          </div>
          <div className="row g8">
            {f?.note && <span className="row g6 xs i3 fill"><AgentFace kind="analyst" size={14} />{f.note}</span>}
            <span className="fill" />
            <button type="button" className="btn quiet sm" onClick={() => { setV(f?.value ?? ""); setEditing(false); }}>Cancel</button>
            <button type="button" className="btn dark sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="row top g12 rv-row" style={{ padding: "11px 14px", borderTop: "1px solid var(--line)", cursor: "text" }} onClick={() => setEditing(true)} title={f?.note ?? undefined}>
      <span className="sm i3" style={{ width: 120, flexShrink: 0 }}>{label}</span>
      <span className={`sm fill ${f?.value ? "i1" : "i4"}`} style={{ lineHeight: "19px" }}>
        {palette?.length ? <span className="row g4" style={{ display: "inline-flex", marginRight: 8, verticalAlign: "middle" }}>{palette.map((h) => <i key={h} style={{ width: 14, height: 14, borderRadius: 4, background: h, border: "1px solid rgba(0,0,0,.08)" }} />)}</span> : null}
        {f?.value || "Not found yet — click to add"}
      </span>
      {f && <FromTag from={f.from} />}
      <span className="rv-edit"><Icon name="pencil" size={13} color="#8B8883" /></span>
    </div>
  );
}

function ToAddItem({ id, t, onDone }: { id: string; t: ToAdd; onDone: () => void }) {
  const [busy, start] = useTransition();
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ask = `Hi — to finish the new store, could you send us ${t.key === "logo" ? "the logo as an SVG (light and dark versions)" : t.key === "photos" ? "product photos at least 1600 px wide" : t.key === "story" ? "a few paragraphs about how the brand started" : "the brand deck as a PDF"}? Thank you!`;
  return (
    <div className="row top g10" style={{ padding: "12px 14px", borderTop: "1px solid var(--line)" }}>
      {t.done ? <Icon name="check-circle" size={16} weight="fill" color="#1F8A5B" style={{ marginTop: 1 }} /> : <span className="radio" style={{ marginTop: 2 }} />}
      <div className="col g6 fill" style={{ minWidth: 0 }}>
        <span className="sm w5">{t.title}</span>
        <span className="xs i3" style={{ lineHeight: "17px" }}>{t.done && t.draft ? "Iris drafted it — open to review and copy." : t.detail}</span>
        {err && <span className="xs c-amber">{err}</span>}
        <div className="row g6">
          {t.action === "draft-policy" ? (t.done ? <button type="button" className="btn sm" onClick={() => setShow(true)}><Icon name="file" size={13} />Open draft</button>
            : <button type="button" className="btn sm" disabled={busy} onClick={() => start(async () => { const r = await irisDraftPolicy(id); if (r?.error) setErr(r.error); onDone(); })}>
                {busy ? <Icon name="spinner" size={13} className="spin" /> : <Icon name="pencil" size={13} />}{busy ? "Iris is drafting…" : "Draft with Iris"}</button>)
            : <>
              <Link className="btn sm" href={`/brands/new/${id}/assets`}><Icon name="upload" size={13} />{t.action === "upload-logo" ? "Upload SVG" : "Upload"}</Link>
              <button type="button" className="btn quiet sm" onClick={() => setShow(true)}>Ask the brand</button>
            </>}
        </div>
      </div>
      {show && (
        <Modal icon={<Icon name={t.draft ? "file" : "megaphone"} size={18} />} title={t.draft ? "Return & refund policy — Iris’s draft" : `Ask the brand for: ${t.title}`} sub={t.draft ? "Check anything in [brackets] with the brand before it goes live." : "Copy this into your email or chat with the brand."} onClose={() => setShow(false)} width={620}
          footer={<><CopyButton text={t.draft ?? ask} /><button type="button" className="btn dark" onClick={() => setShow(false)}>Done</button></>}>
          <pre className="sm i1" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", maxHeight: 380, overflowY: "auto", margin: 0, padding: 12, background: "var(--tray)", borderRadius: 8 }}>{t.draft ?? ask}</pre>
        </Modal>
      )}
    </div>
  );
}

export function ReviewStep({ id, reached, name, thumb, subs, profile, analysis }: {
  id: string; reached: number; name: string; thumb: string | null; subs: (string | undefined)[]; profile: Profile; analysis: Analysis | null;
}) {
  const router = useRouter();
  const [going, start] = useTransition();
  const refresh = () => router.refresh();
  const keys = PROFILE_GROUPS.flatMap((g) => g.keys.map(([k]) => k));
  const filled = keys.filter((k) => profile[k]?.value).length;
  const pending = (analysis?.toAdd ?? []).filter((t) => !t.done);
  const ready = Math.max(0, Math.min(100, Math.round((filled / keys.length) * 100) - pending.length * 3));
  const count = (f: string) => keys.filter((k) => profile[k]?.from === f).length;
  const palette = analysis?.palette.map((p) => p.hex) ?? [];

  return (
    <OnboardingShell id={id} step={5} reached={reached} name={name} thumb={thumb} subs={subs}
      footer={<>
        <BackLink href={`/brands/new/${id}/analysis`} />
        <span className="fill" />
        <span className="xs i3">{pending.length ? `${pending.length} item${pending.length > 1 ? "s" : ""} can be added during setup` : "Everything Iris needs is here"}</span>
        <button type="button" className="btn dark" disabled={going} onClick={() => start(() => finishOnboarding(id))}>{going ? "Saving…" : "Continue to store setup"}<Icon name="arrow-r" size={13} color="#fff" /></button>
      </>}>
      <div className="col g20" style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 40px" }}>
        <div className="row between" style={{ alignItems: "flex-end" }}>
          <div className="row g12">
            {thumb ? <img src={thumb} alt="" width={48} height={48} style={{ borderRadius: 10, objectFit: "cover" }} /> : <span style={{ width: 48, height: 48, borderRadius: 10, background: "var(--tray-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 600 }}>{name.charAt(0)}</span>}
            <div className="col g4"><span className="eyebrow">Step 5 · Review</span><h1 className="h1">{name} brand profile</h1></div>
          </div>
          <span className="row g6 xs i3"><Icon name="eye" size={13} />Hover any row to edit · provenance shown on the right</span>
        </div>

        {!filled && <div className="notice amber"><Icon name="warning" size={14} /><span>Iris hasn’t written the profile yet. Go back to Analysis and let it finish, or fill the rows yourself.</span></div>}

        <div className="row top g16">
          <div className="card fill" style={{ minWidth: 0, overflow: "hidden" }}>
            {PROFILE_GROUPS.map((g, gi) => (
              <div key={g.title} className="col">
                <div className="row between xs" style={{ padding: "9px 14px", background: "var(--tray)", borderTop: gi ? "1px solid var(--line)" : 0 }}><span className="w5 i2">{g.title}</span><span className="i3">{g.keys.length} fields</span></div>
                {g.keys.map(([k, label]) => <Row key={k} id={id} k={k} label={label} f={profile[k]} palette={k === "palette" ? palette : undefined} onSaved={refresh} />)}
              </div>
            ))}
          </div>

          <div className="col g12" style={{ width: 320, flexShrink: 0 }}>
            <div className="card" style={{ padding: 14, gap: 10 }}>
              <span className="row between"><span className="sm w5">Profile readiness</span><span className="h2 tnum">{ready}%</span></span>
              <div style={{ height: 5, borderRadius: 99, background: "var(--tray-2)" }}><div style={{ width: `${ready}%`, height: 5, borderRadius: 99, background: "var(--ink)" }} /></div>
              <span className="row g10 xs i3" style={{ flexWrap: "wrap" }}>
                <span className="row g4"><span className="dot blue" />{count("website")} from website</span>
                <span className="row g4"><span className="dot amber" />{count("deck")} from deck</span>
                {count("shopify") > 0 && <span className="row g4"><span className="dot green" />{count("shopify")} from Shopify</span>}
                <span className="row g4"><span className="dot" />{count("suggested")} suggested</span>
              </span>
            </div>
            {(analysis?.toAdd.length ?? 0) > 0 && (
              <div className="card">
                <div className="row between" style={{ padding: "12px 14px" }}><span className="sm w5">To add before build</span><span className="xs i3">{pending.length} item{pending.length === 1 ? "" : "s"}</span></div>
                {analysis!.toAdd.map((t) => <ToAddItem key={t.key} id={id} t={t} onDone={refresh} />)}
              </div>
            )}
            {(analysis?.otto.length ?? 0) > 0 && (
              <div className="card">
                <div className="row g8" style={{ padding: "12px 14px" }}><AgentFace kind="qa" size={18} /><span className="sm w5">Otto recommends</span></div>
                {analysis!.otto.map((o) => (
                  <div key={o.title} className="row between g8 sm" style={{ padding: "10px 14px", borderTop: "1px solid var(--line)" }}>
                    <span className="i1">{o.title}</span><Link className="lnk xs w5 i2" href={`/brands/new/${id}/assets`}>{o.action}</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </OnboardingShell>
  );
}
