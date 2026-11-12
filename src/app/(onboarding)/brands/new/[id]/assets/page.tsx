import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { loadDraft } from "../../load";
import { AssetsStep } from "../../assets-step";

export const metadata = { title: "New brand · Assets" };

export default async function AssetsPage({ params }: PageProps<"/brands/new/[id]/assets">) {
  const { id } = await params;
  const d = await loadDraft(id);
  const a = schema.brandAssets;
  const assets = await db.select({ id: a.id, kind: a.kind, name: a.name, mime: a.mime, size: a.size, meta: a.meta }).from(a).where(eq(a.brandId, id)).orderBy(desc(a.createdAt));
  return <AssetsStep id={id} reached={Math.max(3, d.reached)} name={d.name} thumb={d.thumb} subs={d.subs} assets={assets} pulled={d.ob.pulled ?? []} inspiration={d.ob.inspiration ?? []} />;
}
