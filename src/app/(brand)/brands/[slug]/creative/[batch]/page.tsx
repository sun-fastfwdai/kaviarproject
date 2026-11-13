import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrand } from "@/lib/queries/brands";
import { batchWithAds, brandCodes } from "@/lib/creative/remy";
import { ago } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { LoopStrip } from "@/components/loop-strip";
import { CreativeTabs } from "../tabs";
import { BatchReview } from "./review";

export const metadata = { title: "Creative studio · Batch" };
export const maxDuration = 120;

export default async function BatchPage({ params }: PageProps<"/brands/[slug]/creative/[batch]">) {
  const { slug, batch: id } = await params;
  const brand = await getBrand(slug);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await batchWithAds(id, brand.id);
  if (!data) notFound();
  const { batch, ads } = data;
  const base = `/brands/${slug}`;
  const approved = ads.filter((a) => a.status === "approved").length;
  const codes = await brandCodes(brand.id);

  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: base }, { label: "Creative studio", href: `${base}/creative` }, { label: batch.title }]}>
        <LoopStrip base={base} step={2} />
      </Bar>
      <CreativeTabs base={base} on="batches" />
      <div className="col g10" style={{ padding: "16px 24px 0" }}>
        <div className="row between" style={{ alignItems: "flex-end" }}>
          <div className="col g4">
            <span className="xs i3"><Link className="lnk" href={`${base}/creative`}>All batches</Link>{batch.signal && <> · from the <Link className="lnk" href={`${base}/signals/${batch.signal}`}>{batch.signal.replace(/-/g, " ")}</Link> signal</>}</span>
            <h1 className="h1">{batch.title}</h1>
            <span className="xs i3">{ads.length} ads · written by Remy {ago(batch.createdAt)}</span>
          </div>
          <div className="row g8">
            <Link className={`btn dark${approved ? "" : " off"}`} aria-disabled={!approved} href={`${base}/run/${batch.id}`}><Icon name="target" size={14} color="#fff" />Set up a test · {approved} approved</Link>
          </div>
        </div>
        <div className="row top g10" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
          <AgentFace kind="builder" size={22} />
          <div className="col g6 fill">
            <span className="sm i1" style={{ lineHeight: "19px" }}>{batch.brief}</span>
            <span className="row g6" style={{ flexWrap: "wrap" }}>
              <span className="pill" style={{ height: 22, fontSize: 11 }}><Icon name="users" size={11} />{batch.audience}</span>
              {batch.evidence.slice(0, 3).map(([k, v]) => <span key={k} className="pill" style={{ height: 22, fontSize: 11 }}>{k}: {v}</span>)}
            </span>
          </div>
        </div>
      </div>
      <BatchReview slug={slug} brand={brand.name} ads={ads} codes={codes} />
    </>
  );
}
