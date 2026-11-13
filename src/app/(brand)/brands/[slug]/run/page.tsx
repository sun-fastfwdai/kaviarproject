import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand } from "@/lib/queries/brands";
import { ago } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { LoopStrip } from "@/components/loop-strip";

export const metadata = { title: "Run ads" };

export default async function RunPage({ params }: PageProps<"/brands/[slug]/run">) {
  const { slug } = await params;
  const brand = await getBrand(slug);
  const base = `/brands/${slug}`;
  const batches = await db.select({ id: schema.adBatches.id, title: schema.adBatches.title, createdAt: schema.adBatches.createdAt, audience: schema.adBatches.audience,
    approved: sql<number>`(select count(*) from ads a where a.batch_id = ${schema.adBatches.id} and a.status = 'approved')::int`,
    image: sql<string | null>`(select a.image_url from ads a where a.batch_id = ${schema.adBatches.id} and a.status = 'approved' and a.image_url is not null order by a.position limit 1)` })
    .from(schema.adBatches).where(eq(schema.adBatches.brandId, brand.id)).orderBy(desc(schema.adBatches.createdAt));
  const ready = batches.filter((b) => b.approved > 0);

  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: base }, { label: "Growth" }, { label: "Run ads" }]}><LoopStrip base={base} step={3} /></Bar>
      <div className="scroll col" style={{ padding: "22px 24px", gap: 16 }}>
        <div className="col g4"><h1 className="h1">Run ads</h1><p className="sm i3">Each test is a small, paused Meta campaign built from approved ads, judged on real Shopify orders.</p></div>
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="tr hd dense" style={{ padding: "0 16px" }}><div className="td fill">Ready to test</div><div className="td" style={{ width: 260 }}>Audience</div><div className="td" style={{ width: 110 }}>Approved</div><div className="td" style={{ width: 140 }} /></div>
          {ready.map((b) => (
            <div key={b.id} className="tr compact" style={{ padding: "0 16px" }}>
              <div className="td fill"><span style={{ width: 32, height: 32, borderRadius: 7, flexShrink: 0, background: b.image ? `center/cover url("${b.image}")` : "var(--tray-2)" }} />
                <div className="col" style={{ minWidth: 0 }}><Link href={`${base}/creative/${b.id}`} className="sm w5 i1 ell">{b.title}</Link><span className="xs i3">{ago(b.createdAt)}</span></div></div>
              <div className="td sm ell" style={{ width: 260 }}>{b.audience}</div>
              <div className="td sm" style={{ width: 110 }}>{b.approved} ads</div>
              <div className="td" style={{ width: 140, justifyContent: "flex-end" }}><Link className="btn dark sm" href={`${base}/run/${b.id}`}><Icon name="target" size={13} color="#fff" />Set up test</Link></div>
            </div>
          ))}
          {ready.length === 0 && (
            <div className="col g8" style={{ padding: 20, alignItems: "flex-start" }}>
              <span className="sm i2">No approved ads yet.</span>
              <Link className="btn sm" href={`${base}/creative`}><Icon name="sparkle" size={13} />Open Creative studio</Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
