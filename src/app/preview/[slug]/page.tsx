import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import { storeProducts } from "@/lib/store/build";
import { StorePreview, type Look } from "@/app/(brand)/brands/[slug]/store/preview";
import { PAGES, type StorePage } from "@/app/(brand)/brands/[slug]/store/store-pages";

export const metadata = { title: "Store preview" };

/** "Open preview ↗" from the Build screen: the draft store full-size, outside the console, page by page. */
export default async function PreviewPage({ params, searchParams }: PageProps<"/preview/[slug]">) {
  await requireMember();
  const { slug } = await params;
  const sp = await searchParams;
  const brand = await getBrand(slug);
  const [build] = await db.select().from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brand.id));
  if (!build?.content) notFound();
  const page = (PAGES.find(([k]) => k === sp.page)?.[0] ?? "home") as StorePage;
  const products = await storeProducts(brand.id);
  const pal = brand.onboarding?.analysis?.palette ?? [];
  const role = (r: string, d: string) => pal.find((p) => p.role.startsWith(r))?.hex ?? d;
  const look: Look = { bg: role("Background", "#FBF9F6"), text: role("Text", "#1A1714"), accent: role("Accent", "#B8956A"), soft: role("Secondary", "#F4EFE8"), serif: true };
  const rev = build.log.at(-1)?.rev ?? 0;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--tray)" }}>
      <header className="row g12" style={{ position: "sticky", top: 0, zIndex: 10, height: 48, padding: "0 16px", background: "#fff", borderBottom: "1px solid var(--line)" }}>
        <span className="sm w5">{brand.name}</span>
        <span className="row g6 xs i3"><span className="dot blue" style={{ width: 6, height: 6 }} />Draft r{rev} · not published</span>
        <div className="fill" />
        <nav className="seg" aria-label="Pages">
          {PAGES.map(([k, l]) => <Link key={k} href={`?page=${k}`} className={`o${page === k ? " on" : ""}`}>{l}</Link>)}
        </nav>
        <div className="fill" />
        <Link className="btn sm" href={`/brands/${slug}/store?step=build`}>Back to the build</Link>
      </header>
      <main style={{ display: "flex", justifyContent: "center", padding: "24px 16px 48px" }}>
        <StorePreview brand={brand.name} category={brand.category ?? null} c={build.content} products={products} look={look}
          hero={products.find((p) => p.image)?.image ?? null} width={1120} currency={brand.currency} page={page} />
      </main>
    </div>
  );
}
