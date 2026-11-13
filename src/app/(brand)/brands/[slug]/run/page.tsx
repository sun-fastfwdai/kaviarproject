import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand } from "@/lib/queries/brands";
import { ago } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { LoopStrip } from "@/components/loop-strip";
import { EmptyState, RunTestArt } from "@/components/empty";

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
  const toReview = (await db.execute(sql`select b.id, b.title, count(*)::int as n from ad_batches b join ads a on a.batch_id = b.id where b.brand_id = ${brand.id} and a.status = 'review' group by 1, 2 order by max(b.created_at) desc limit 1`)).rows as { id: string; title: string; n: number }[];

  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: base }, { label: "Growth" }, { label: "Run ads" }]}><LoopStrip base={base} step={3} /></Bar>
      <div className="scroll col" style={{ padding: "22px 24px", gap: 16 }}>
        <div className="col g4"><h1 className="h1">Run ads</h1><p className="sm i3">Each test is a small, paused Meta campaign built from approved ads, judged on real Shopify orders.</p></div>
        {ready.length === 0 ? (
          <EmptyState eyebrow="Step 3 of 5 · Run ads" title="Nothing approved to test yet"
            body="A test here is a small, paused Meta campaign made from ads you approved — a few dollars a day for a week, aimed at a Shopify audience, and judged on real Shopify orders instead of Meta’s count."
            steps={[
              { agent: "builder", title: "Remy writes ads from a signal", body: "In Creative studio — e.g. a win-back batch for lapsed buyers." },
              { icon: "check-circle", title: "You approve the ones you like", body: "Approve at least two so Meta can compare them." },
              { agent: "qa", title: "Set up the test here", body: "Budget, days and stop rules; Otto checks it; export the launch sheet for Ads Manager." },
            ]}
            art={<RunTestArt />}
            actions={toReview[0]
              ? <><Link className="btn dark" href={`${base}/creative/${toReview[0].id}`}><Icon name="check" size={14} color="#fff" />Review {toReview[0].n} ads in “{toReview[0].title}”</Link><Link className="btn" href={`${base}/creative`}>Creative studio</Link></>
              : <><Link className="btn dark" href={`${base}/creative`}><Icon name="sparkle" size={14} color="#fff" />Plan a batch with Remy</Link><Link className="btn" href={`${base}/signals`}><Icon name="lightning" size={14} />Pick a signal</Link></>}
            note="Kaviar only reads the ad account today, so tests go out as a launch sheet you set up in Ads Manager — paused until you switch them on." />
        ) : (
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
        </div>
        )}
      </div>
    </>
  );
}
