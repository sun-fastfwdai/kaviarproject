"use client";
import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Combo } from "@/components/combo";
import { Working, type Work } from "@/components/working";
import type { PlanAd, PlanExtras } from "@/lib/growth/plans";
import { REASON_NAME, STAGE_NAME, type Reason, type Stage } from "@/lib/growth/plans-rules";
import { AdsBlock, useAds } from "../campaigns/[key]/ads";
import { approvePlanFor } from "../campaigns/actions";

/**
 * The studio's first screen: make ads in three moves. Pick the campaign they are for, give Remy what to work from — the brand's own
 * pictures and words — and press once. The ads come back here, to be approved one by one; the campaign then takes them to Meta.
 */
export type MakePlan = { key: string; title: string; reason: Reason; stage: Stage; image: string | null; product: string; budget: string; days: number; rawBudget: number; onMeta: boolean; ads: number };
type Open = { ads: PlanAd[]; brief: PlanExtras["brief"]; productPhoto: string | null; batchId: string | null; placed?: Record<string, string> };

export function MakeAds({ slug, plans, on, open }: { slug: string; plans: MakePlan[]; on: MakePlan | null; open: Open | null }) {
  const base = `/brands/${slug}`, router = useRouter();
  const [work, setWork] = useState<Work | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const clear = useCallback(() => setWork(null), []);
  const m = useAds({ slug, planKey: on?.key ?? "", title: on?.title ?? "", brief: open?.brief ?? { note: "", shoot: false, refs: [] }, ads: open?.ads ?? [], onWork: setWork, onError: setErr });
  const approved = (open?.ads ?? []).filter((x) => x.status === "approved").length;

  if (!plans.length || !on || !open) return (
    <div className="scroll" style={{ padding: "22px 24px" }}>
      <div className="col g12" style={{ alignItems: "flex-start", padding: "28px 26px", borderRadius: 18, background: "#fff", boxShadow: "0 0 0 1px var(--line)", maxWidth: 560 }}>
        <span className="h3">No campaign to make ads for yet</span>
        <span className="sm i3">Every ad belongs to a campaign — a reason, a product and a budget.</span>
        <Link className="btn dark" href={`${base}/campaigns?new=1`}><Icon name="plus" size={13} color="#fff" />New campaign</Link>
      </div>
    </div>);

  return (
    <div className="scroll" style={{ padding: "22px 24px 96px" }}>
      <div className="col g16" style={{ maxWidth: 1280, width: "100%" }}>
        <div className="row between g12" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
          <h1 className="h1">Make ads</h1>
          <span className="row g6 xs i3">{(["Pick the campaign", "Add your pictures and notes", "Approve what comes back"] as const).map((t, i) => <span key={t} className="row g6"><span className="tnum" style={{ width: 18, height: 18, borderRadius: 99, background: "var(--tray-2)", color: "var(--ink-2)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 600 }}>{i + 1}</span>{t}{i < 2 && <Icon name="chev-r" size={10} color="#B5B2AC" />}</span>)}</span>
        </div>

        <div className="row g12" style={{ padding: "14px 16px", borderRadius: 18, background: "#fff", boxShadow: "0 0 0 1px var(--line)", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="col g4 fill" style={{ minWidth: 300 }}><span className="xs i2 w5">For which campaign</span>
            <Combo label="Campaign" searchText="Search campaigns" value={on.key} onChange={(v) => router.replace(`${base}/creative?for=${encodeURIComponent(v)}`)}
              items={plans.map((x) => ({ value: x.key, label: x.title, image: x.image, sub: `${REASON_NAME[x.reason]} · ${x.product}`, right: x.onMeta ? "On Meta" : x.ads ? `${x.ads} ad${x.ads === 1 ? "" : "s"}` : STAGE_NAME[x.stage] }))} /></div>
          <span className="col" style={{ paddingBottom: 6 }}><span className="xs i3">Budget</span><span className="sm w5 tnum">{on.budget} · {on.days} days</span></span>
          <span className="row g8" style={{ paddingBottom: 6 }}>
            {on.stage === "suggested" && <button type="button" className="btn dark" disabled={busy} onClick={() => start(async () => { await approvePlanFor(slug, on.key, on.rawBudget, on.days); router.refresh(); setWork({ done: "Plan approved — Remy can write its ads now" }); })}>{busy ? <Icon name="spinner" size={13} className="spin" color="#fff" /> : <Icon name="check" size={13} color="#fff" />}Approve this plan</button>}
            <Link className="btn" href={`${base}/campaigns/${encodeURIComponent(on.key)}`}>{approved > 0 && !on.onMeta ? "Put it on Meta" : "Open campaign"}<Icon name="arrow-r" size={12} /></Link>
            <Link className="btn quiet" href={`${base}/campaigns?new=1`}><Icon name="plus" size={12} />New campaign</Link>
          </span>
        </div>

        {err && <div className="row g8 sm" style={{ padding: "10px 14px", borderRadius: 12, background: "#FBEDE6", color: "#B4532A" }}><Icon name="warning-circle" size={14} weight="fill" color="#B4532A" />{err}</div>}

        <AdsBlock key={on.key} m={m} base={base} stage={on.stage} locked={on.onMeta} ads={open.ads} brief={open.brief} productPhoto={open.productPhoto} batchId={open.batchId} placed={open.placed} heading="The ads"
          extra={<Link className="btn quiet sm" href={`${base}/assets`} title="Every picture and file the brand has">Brand assets<Icon name="arrow-r" size={11} /></Link>} />
      </div>
      <Working work={work} onClear={clear} />
    </div>
  );
}
