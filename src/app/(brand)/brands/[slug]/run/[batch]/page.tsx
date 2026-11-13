import { notFound } from "next/navigation";
import { getBrand, getConnections } from "@/lib/queries/brands";
import { batchWithAds, brandCodes } from "@/lib/creative/remy";
import { Bar } from "@/components/shell/parts";
import { LoopStrip } from "@/components/loop-strip";
import { AgentFace } from "@/components/agent";
import { TestSetup } from "../setup";

export const metadata = { title: "Run ads · New test" };

export default async function NewTestPage({ params }: PageProps<"/brands/[slug]/run/[batch]">) {
  const { slug, batch: id } = await params;
  const brand = await getBrand(slug);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await batchWithAds(id, brand.id);
  if (!data) notFound();
  const conns = await getConnections(brand.id);
  const base = `/brands/${slug}`;
  const approved = data.ads.filter((a) => a.status === "approved");
  // The audience size is the first number in the signal's evidence (e.g. "Lapsed · 60–180 days: 2,986").
  const size = data.batch.evidence.map(([, v]) => Number(String(v).replace(/[^\d]/g, ""))).find((n) => n > 0) ?? null;
  const exclude = data.batch.evidence.find(([k]) => /last 30 days|exclude/i.test(k));

  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: base }, { label: "Run ads", href: `${base}/run` }, { label: "New test" }]}>
        <LoopStrip base={base} step={3} />
      </Bar>
      <div className="row between" style={{ padding: "18px 24px 4px", alignItems: "flex-end" }}>
        <div className="col g4"><h1 className="h1">New test · {data.batch.title}</h1><p className="sm i3">Approved creatives, a Shopify audience, a small budget, a clear rule.</p></div>
        <span className="row g6 xs i3"><AgentFace kind="analyst" size={16} />Iris set this up from {data.batch.signal ? `the ${data.batch.signal.replace(/-/g, " ")} signal` : "your idea"}</span>
      </div>
      {approved.length === 0 ? (
        <div className="notice amber" style={{ margin: 24 }}><span>No approved ads in this batch yet. Approve at least two in Creative studio first.</span></div>
      ) : (
        <TestSetup brand={brand.name} currency={brand.currency} title={data.batch.title} audience={data.batch.audience} audienceSize={size}
          exclude={exclude ? `${exclude[0]} (${exclude[1]})` : null} ads={approved} codes={await brandCodes(brand.id)} site={brand.website}
          metaAccount={conns.meta?.status === "connected" ? conns.meta.externalId : null} />
      )}
    </>
  );
}
