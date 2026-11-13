import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand } from "@/lib/queries/brands";
import { COST_PER_IMAGE, COST_PER_VIDEO_SECOND, shootsThisMonth } from "@/lib/creative/shoots";
import { Icon } from "@/components/icon";
import { AgentFace, AGENT_NAME } from "@/components/agent";
import { ShootBar } from "../bar";
import { reviewCount } from "../../tabs";
import { CAT, NODES, defaultFlow, templateName, type NodeKey } from "../flow";

export const metadata = { title: "Shoots · Every node" };

const ORDER: NodeKey[] = ["product", "data", "brand", "wins", "reference", "prompt", "photo", "video", "sound", "check", "send"];
const GROUP = { in: "INPUT", make: "MAKE", edit: "EDIT", fin: "FINISH" } as const;
const EDIT = { cat: "edit" as const, icon: "brush" as const, name: "Edit", does: "Fixes a photo without starting again. The original stays.", ins: "a photo", outs: "the edited version",
  settings: "Remove bg · Extend · Relight", example: "Extend a 4:5 photo to 9:16 for Reels", agent: "builder" as const };

function Card({ cat, icon, name, does, ins, outs, settings, example, agent, cost }: {
  cat: keyof typeof CAT; icon: Parameters<typeof Icon>[0]["name"]; name: string; does: string; ins: string; outs: string; settings: string; example: string; agent: "builder" | "catalog" | "qa" | "analyst" | null; cost: string;
}) {
  const c = CAT[cat];
  const row = (k: string, v: React.ReactNode) => (
    <div className="row top g8" style={{ padding: "3px 0", borderTop: "1px solid var(--line)" }}><span className="xs i3" style={{ width: 58, flexShrink: 0 }}>{k}</span><span className="xs i1 fill" style={{ lineHeight: "16px" }}>{v}</span></div>
  );
  const port = (side: "left" | "right") => <span style={{ position: "absolute", [side]: -5, top: 16, width: 10, height: 10, borderRadius: 99, background: "#fff", boxShadow: `0 0 0 1.5px ${c}` }} />;
  return (
    <div className="col" style={{ position: "relative", width: "calc((100% - 42px) / 4)", background: "#fff", borderRadius: 12, boxShadow: "0 0 0 1px var(--line), 0 4px 14px rgba(18,18,18,0.04)" }}>
      {ins !== "—" && port("left")}{port("right")}
      <div className="row g8" style={{ height: 38, padding: "0 12px", borderBottom: "1px solid var(--line)" }}>
        <span style={{ width: 22, height: 22, borderRadius: 6, background: `${c}1A`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={icon} size={13} color={c} /></span>
        <span className="sm w5 i1 fill">{name}</span>
        <span className="mono" style={{ fontSize: 9.5, color: c, letterSpacing: "0.04em" }}>{GROUP[cat]}</span>
      </div>
      <div className="col" style={{ padding: "10px 12px 8px", gap: 6, flex: 1 }}>
        <span className="xs i1" style={{ lineHeight: "17px", minHeight: 34 }}>{does}</span>
        <div className="col">{row("In", ins)}{row("Out", outs)}{row("Settings", settings)}{row("Example", <span className="i2">{example}</span>)}</div>
        <div className="row between" style={{ paddingTop: 6, borderTop: "1px solid var(--line)", marginTop: "auto" }}>
          {agent ? <span className="row g4 xs i2"><AgentFace kind={agent} size={14} />{AGENT_NAME[agent]}</span> : <span className="xs i3">{name === "Voice + music" ? "ElevenLabs" : "you"}</span>}
          <span className="xs i3">{cost}</span>
        </div>
      </div>
    </div>
  );
}

/** Board 17c · node types: every node on one screen — what it does, what goes in and out, its settings, who runs it, what it costs. */
export default async function NodesPage({ params }: PageProps<"/brands/[slug]/creative/shoots/nodes">) {
  const { slug } = await params;
  const brand = await getBrand(slug);
  const base = `/brands/${slug}`;
  const [month, [saved], [rev]] = await Promise.all([
    shootsThisMonth(brand.id),
    db.select({ flow: schema.shootFlows.flow }).from(schema.shootFlows).where(eq(schema.shootFlows.brandId, brand.id)),
    db.execute(sql`select count(*)::int as n from ads where brand_id = ${brand.id} and status = 'review'`).then((r) => r.rows as { n: number }[]),
  ]);
  const flow = saved?.flow ?? defaultFlow(null, null);
  const cost = flow.n * COST_PER_IMAGE + (flow.off.includes("video") ? 0 : flow.video.seconds * COST_PER_VIDEO_SECOND * flow.video.n);
  const costs: Partial<Record<NodeKey, string>> = { photo: `$${COST_PER_IMAGE.toFixed(2)} each`, video: `$${COST_PER_VIDEO_SECOND.toFixed(3)} / second` };
  const cards = [...ORDER.map((k) => ({ ...NODES[k], cost: costs[k] ?? NODES[k].cost })), { ...EDIT, cost: `$${COST_PER_IMAGE.toFixed(2)} each` }];
  // Board order: inputs, then make, edit, finish.
  const sorted = [...cards.filter((c) => c.cat === "in"), ...cards.filter((c) => c.cat === "make"), ...cards.filter((c) => c.cat === "edit"), ...cards.filter((c) => c.cat === "fin")];

  return (
    <>
      <ShootBar base={base} name={saved ? `${templateName(flow.template)} · every node` : "Every node"} spend={month.cost} counts={reviewCount(rev?.n ?? 0)}>
        <Link className="btn dark sm" href={`${base}/creative/shoots?run=1`}><Icon name="play" size={12} weight="fill" color="#fff" />Run flow · ≈ ${cost.toFixed(2)}</Link>
      </ShootBar>
      <section className="col fill scroll" style={{ minHeight: 0, padding: "16px 22px", gap: 14, background: "var(--tray)" }}>
        <div className="row between" style={{ flexShrink: 0, alignItems: "flex-end" }}>
          <div className="col g4"><h1 className="h2">Every node, and what it does</h1>
            <span className="xs i3">Add any node from the canvas’s Nodes list · wires carry data from left to right · a person approves before anything reaches an ad</span></div>
          <Link className="btn sm" href={`${base}/creative/shoots`}><Icon name="arrow-l" size={13} />Back to the canvas</Link>
        </div>
        <div className="row" style={{ flexShrink: 0, gap: 18, flexWrap: "wrap" }}>
          {([["in", "Inputs · where the data comes from"], ["make", "Make · AI generation"], ["edit", "Edit"], ["fin", "Finish · check and send"]] as const).map(([k, t]) => (
            <span key={k} className="row g6 xs i2"><span className="dot" style={{ width: 7, height: 7, background: CAT[k] }} />{t}</span>))}
          <span className="fill" />
          <span className="row g6 xs i3" style={{ whiteSpace: "nowrap" }}>
            {["Product + Data + Brand + What wins", "Prompt", "Photo", "Video", "Check", "Send"].map((t, i) => <span key={t} className="row g6">{i > 0 && <Icon name="arrow-r" size={11} color="#B5B2AC" />}<span className="i1 w5">{t}</span></span>)}
          </span>
        </div>
        <div className="row top" style={{ flexWrap: "wrap", gap: "12px 14px", flexShrink: 0, alignItems: "stretch" }}>
          {sorted.map((c) => <Card key={c.name} {...c} />)}
        </div>
      </section>
    </>
  );
}
