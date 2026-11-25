/* eslint-disable @next/next/no-img-element -- ad pictures from brand assets */
import Link from "next/link";
import { Icon } from "@/components/icon";
import { ctaType, countryNames } from "@/lib/meta/place-rules";
import type { PlanAd } from "@/lib/growth/plans";
import type { PlanCard } from "@/lib/growth/plans-rules";

/**
 * A campaign's set-up, exactly as Kaviar puts it on Meta — the same names, budget, countries, link, tags and words that `placeStep`
 * sends. For checking what is on Meta against what was planned, or for building it by hand in Ads Manager when Meta won't let Kaviar.
 * Read-only: the campaign itself is changed on its own page.
 */
const CTA_NAME: Record<string, string> = { SHOP_NOW: "Shop now", LEARN_MORE: "Learn more", ORDER_NOW: "Order now", BUY_NOW: "Buy now", GET_OFFER: "Get offer", SIGN_UP: "Sign up", SUBSCRIBE: "Subscribe" };
const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

function Row({ k, children, mono }: { k: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="row top between g16 sm" style={{ padding: "9px 0", borderTop: "1px solid var(--line)" }}>
      <span className="i3" style={{ flexShrink: 0, width: 150 }}>{k}</span>
      <span className="i1" style={{ textAlign: "right", minWidth: 0, overflowWrap: "anywhere", userSelect: "all", ...(mono ? { fontSize: 12, lineHeight: "18px" } : {}) }}>{children}</span>
    </div>
  );
}
function Card({ n, icon, title, right, children }: { n: string; icon: Parameters<typeof Icon>[0]["name"]; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: "4px 16px 6px" }}>
      <span className="row between g8 sm w5" style={{ height: 40 }}><span className="row g8"><span className="xs i4">{n}</span><Icon name={icon} size={14} />{title}</span>{right}</span>
      {children}
    </div>
  );
}

export function PlanSheet({ base, brand, p, ads, link, tags, page, pixel, country }: {
  base: string; brand: string; p: PlanCard; ads: PlanAd[]; link: string | null; tags: string; page: string | null; pixel: string | null; country: string;
}) {
  const daily = Math.max(1, Math.round((p.budget / p.days) * 100) / 100), m = p.meta ?? null, placed = m?.placed ?? {};
  const state = !m ? "Not on Meta yet" : m.onAt ? "Switched on" : "On Meta · paused";
  const onMeta = (id: string) => <span className="row g4 xs w5" style={{ color: "var(--green)" }}><Icon name="check" size={11} color="#1F7A52" />On Meta · {id}</span>;
  return (
    <div className="scroll col" style={{ padding: "20px 24px 40px", gap: 14 }}>
      <div className="row between g12" style={{ flexWrap: "wrap" }}>
        <span className="sm i3">Everything Kaviar sends to Meta for this campaign, as it is sent. Click a value to select it.</span>
        <Link className="btn sm" href={`${base}/campaigns/${encodeURIComponent(p.key)}`}>Back to the campaign<Icon name="arrow-r" size={11} /></Link>
      </div>
      <div className="row top g16" style={{ flexWrap: "wrap" }}>
        <div className="col g12" style={{ flex: "1 1 420px", minWidth: 0 }}>
          <Card n="01" icon="megaphone" title="Campaign" right={<span className="xs w5" style={{ color: m ? "var(--green)" : "var(--ink-3)" }}>{state}</span>}>
            <Row k="Name">{`${brand} · ${p.title}`.slice(0, 180)}</Row>
            <Row k="Objective">Sales</Row>
            <Row k="Budget">{usd(daily)} a day, set on the campaign · {usd(p.budget)} over {p.days} days</Row>
            <Row k="Bid">Highest volume</Row>
            <Row k="Made as">Paused — it runs only when you switch it on, for {p.days} days</Row>
            {m?.campaignId && <Row k="Meta campaign">{m.campaignId}</Row>}
          </Card>
          <Card n="02" icon="users" title="Ad set" right={m?.adset ? onMeta(m.adset) : undefined}>
            <Row k="Name">{`${p.title} · ${countryNames(country) || country}`}</Row>
            <Row k="Shown to people in">{countryNames(country) || country}</Row>
            <Row k="Audience">Advantage+ audience — Meta finds the likely buyers; no interests or ages are set</Row>
            <Row k="Placements">Advantage+ placements — Meta chooses</Row>
            <Row k="Optimised for">Purchases on the website</Row>
            <Row k="Counted by">{pixel ?? "The ad account’s pixel"}</Row>
            <Row k="Budget">None of its own — it uses the campaign’s</Row>
            <Row k="Ends">{m?.until ? new Date(m.until).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : `${p.days} days after it is switched on`}</Row>
          </Card>
          <Card n="03" icon="link" title="Every ad">
            <Row k="Shown as">{page ?? "The brand’s Facebook Page"}</Row>
            <Row k="Format">Single image · link ad</Row>
            <Row k="Website URL" mono>{link ?? "Kaviar doesn’t know this product’s page yet — run a sync in Settings"}</Row>
            <Row k="URL parameters" mono>{tags}</Row>
          </Card>
        </div>
        <div className="col g12" style={{ flex: "1 1 420px", minWidth: 0 }}>
          {ads.map((a, i) => (
            <Card key={a.id} n={`Ad ${i + 1}`} icon="image" title={a.hook.slice(0, 90)} right={placed[a.id] ? onMeta(placed[a.id]) : <span className="xs i3">Not on Meta yet</span>}>
              <div className="row top g14" style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
                {a.image && <a href={a.image} target="_blank" rel="noreferrer" title="Open the picture" style={{ flexShrink: 0 }}><img src={a.image} alt="" loading="lazy" style={{ width: 96, borderRadius: 8, display: "block", background: "var(--tray)", boxShadow: "0 0 0 1px var(--line)" }} /></a>}
                <div className="col fill" style={{ minWidth: 0 }}>
                  <Row k="Ad name">{a.hook.slice(0, 90)}</Row>
                  <Row k="Primary text">{a.text}</Row>
                  <Row k="Headline">{a.headline || a.hook}</Row>
                  <Row k="Button">{CTA_NAME[ctaType(a.cta)] ?? "Shop now"}</Row>
                </div>
              </div>
            </Card>))}
          {!ads.length && <div className="notice amber"><span>No approved ads yet. Approve them on the campaign first.</span></div>}
        </div>
      </div>
    </div>
  );
}
