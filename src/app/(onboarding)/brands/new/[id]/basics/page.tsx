import { loadDraft } from "../../load";
import { BasicsStep } from "../../basics-step";

export const metadata = { title: "New brand · Basics" };

export default async function BasicsPage({ params }: PageProps<"/brands/new/[id]/basics">) {
  const { id } = await params;
  const d = await loadDraft(id);
  return (
    <BasicsStep key={d.ob.scan?.scannedAt ?? "none"} id={id} reached={Math.max(2, d.reached)} ob={d.ob} subs={d.subs}
      brand={{ name: d.name, category: d.b.category, website: d.b.website, currency: d.b.currency, timezone: d.b.timezone }}
      shopConnected={d.shopConnected?.externalId ?? null} />
  );
}
