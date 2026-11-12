import Link from "next/link";
import { AgentFace } from "@/components/agent";
import { Icon } from "@/components/icon";
import { STEP_PATHS, STEPS } from "@/lib/onboarding/types";

const Check = ({ size = 9 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

export type RailItem = { sub?: string };

/** The onboarding frame from boards 02a–02e: header with draft state, step rail, content, footer. */
export function OnboardingShell({ id, step, reached, name, thumb, subs, children, footer, iris }: {
  id: string | null; step: number; reached: number; name?: string | null; thumb?: string | null; subs?: (string | undefined)[];
  children: React.ReactNode; footer: React.ReactNode; iris?: React.ReactNode;
}) {
  return (
    <div className="sheet" style={{ margin: 0 }}>
      <header className="bar">
        <div className="wordmark" style={{ padding: 0 }}><div className="m"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4v16M18 4 8 12l10 8" /></svg></div>Kaviar</div>
        <div className="vr" style={{ margin: "14px 4px" }} />
        <nav className="crumb">
          <Link className="lnk" href="/brands">Brands</Link><span className="i4">›</span><span>New brand</span>
          {name && <><span className="i4">›</span>
            <span className="row g6">{thumb ? <img src={thumb} alt="" width={18} height={18} style={{ borderRadius: 5, objectFit: "cover" }} /> : <span style={{ width: 18, height: 18, borderRadius: 5, background: "var(--tray-2)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600 }}>{name.charAt(0)}</span>}<b>{name}</b></span></>}
        </nav>
        <div className="fill" />
        {id && <span className="row g6 xs i3"><Icon name="check-circle" size={14} color="#1F8A5B" />Draft saved · you can leave and come back</span>}
        <Link href="/brands" className="btn quiet sm">✕ Exit</Link>
      </header>

      <div className="row fill stretch" style={{ minHeight: 0 }}>
        <aside className="col" style={{ width: 280, flexShrink: 0, borderRight: "1px solid var(--line)", background: "var(--tray)", padding: "22px 18px", gap: 18 }}>
          <div className="col g10">
            <span className="eyebrow">New brand</span>
            <div className="row between"><span className="h3">Onboarding</span><span className="xs i3">Step {step} of 5</span></div>
            <div className="steps">{STEPS.map((_, i) => <span key={i} className={`s ${i + 1 < step ? "done" : i + 1 === step ? "now" : ""}`} />)}</div>
          </div>
          <div className="col g2">
            {STEPS.map(([title, hint], i) => {
              const n = i + 1;
              const state = n === step ? "now" : n < step || n <= reached ? "done" : "next";
              const sub = state === "done" ? subs?.[i] ?? hint : hint;
              const body = (
                <div className="row top g12">
                  <div className="col" style={{ alignItems: "center", paddingTop: 11, alignSelf: "stretch" }}>
                    <span style={{ width: 16, height: 16, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                      background: state === "done" ? "var(--green)" : "#fff", border: state === "done" ? 0 : `1.5px solid ${state === "now" ? "var(--ink)" : "var(--line-2)"}` }}>
                      {state === "done" ? <Check /> : state === "now" ? <span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--ink)" }} /> : null}
                    </span>
                    {n < 5 && <span style={{ width: 1.5, flex: 1, minHeight: 14, marginTop: 4, background: state === "done" ? "var(--green)" : "var(--line-2)", borderRadius: 2 }} />}
                  </div>
                  <div className="col fill" style={{ padding: "8px 10px", borderRadius: 8, background: state === "now" ? "var(--sheet)" : "transparent", boxShadow: state === "now" ? "0 0 0 1px var(--line)" : undefined, minWidth: 0 }}>
                    <span className="row between"><span className={`sm w5 ${state === "next" ? "i3" : "i1"}`}>{title}</span><span className="xs i3">{n}/5</span></span>
                    <span className="xs i3 ell">{sub}</span>
                  </div>
                </div>
              );
              return id && state === "done" ? <Link key={n} href={`/brands/new/${id}/${STEP_PATHS[i]}`} style={{ color: "inherit" }}>{body}</Link> : <div key={n}>{body}</div>;
            })}
          </div>
          <div className="fill" />
          <div className="col g6" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
            <div className="row g8"><AgentFace kind="analyst" size={18} /><span className="sm w5">Iris</span><span className="xs i3">· studies the brand</span></div>
            <span className="xs i2" style={{ lineHeight: "17px" }}>{iris ?? "Everything here is saved as you go. Skip what you don’t have — I’ll flag it in review."}</span>
          </div>
        </aside>
        <section className="scroll" style={{ background: "var(--sheet)" }}>{children}</section>
      </div>

      <footer className="row g12" style={{ height: 64, flexShrink: 0, padding: "0 20px", borderTop: "1px solid var(--line)" }}>{footer}</footer>
    </div>
  );
}

/** "Back" in the footer — always a link, the draft is already saved. */
export function BackLink({ href }: { href: string }) {
  return <Link className="btn" href={href}><Icon name="arrow-l" size={13} />Back</Link>;
}

/** Provenance tag: From website / From brand deck / Suggested / Entered. */
export function FromTag({ from }: { from: string }) {
  const map: Record<string, [string, string]> = {
    website: ["From website", "blue"], deck: ["From brand deck", "amber"], shopify: ["From Shopify", "green"], suggested: ["Suggested", ""], entered: ["Entered", ""],
  };
  const [t, tone] = map[from] ?? [from, ""];
  return <span className={`pill ${tone}`} style={{ height: 20, fontSize: 11, padding: "0 7px" }}>{t}</span>;
}

/** Iris's line in the footer. */
export function IrisSays({ children }: { children: React.ReactNode }) {
  return <><AgentFace kind="analyst" size={20} /><span className="sm i2 fill ell"><b className="w5 i1">Iris:</b> {children}</span></>;
}
