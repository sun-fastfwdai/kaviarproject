import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand, getConnections } from "@/lib/queries/brands";
import { dawnIndexJson, qaChecks, storeProducts } from "@/lib/store/build";
import { Bar } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { NeedsSource } from "@/components/ui";
import { StoreSetup } from "./setup";
import { BuildView } from "./build-view";
import { BuildCanvas } from "./build-canvas";
import { STORE_APPS } from "../integrations/apps";
import type { Look } from "./preview";
import type { ThemeState } from "./themes-ui";
import { requireMember } from "@/lib/auth";
import { starterInfo, storageReady, storeThemes } from "@/lib/store/themes";
import { themeStorePreview } from "@/lib/store/theme-previews";

export const metadata = { title: "Store builder" };
export const maxDuration = 180;

export default async function StorePage({ params, searchParams }: PageProps<"/brands/[slug]/store">) {
  const { slug } = await params;
  const sp = await searchParams;
  const brand = await getBrand(slug);
  const conns = await getConnections(brand.id);
  const base = `/brands/${slug}`;
  const crumbs = [{ label: brand.name, href: base }, { label: "Store builder" }];
  if (!conns.shopify) return (<><Bar crumbs={crumbs} /><div className="scroll" style={{ padding: 24 }}><NeedsSource slug={slug} provider="shopify" what="the products the store is built from" /></div></>);

  const [build] = await db.select().from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brand.id));
  const me = await requireMember();
  const shopConn = conns.shopify?.status === "connected" ? conns.shopify : null;
  const canRead = Boolean(shopConn?.scopes.some((s) => s === "read_themes" || s === "write_themes"));
  let themesList: ThemeState["themes"] = [], themesError: string | null = null;
  if (shopConn && canRead) {
    try {
      const raw = await storeThemes(shopConn.id);
      const previews = await Promise.all(raw.map((t) => themeStorePreview(t.name)));
      themesList = raw.map((t, i) => ({ id: t.id, name: t.name, role: t.role, processing: t.processing, fromThemeStore: Boolean(t.themeStoreId) || Boolean(previews[i]), preview: previews[i] }));
    } catch (e) { themesError = `Couldn’t read the store’s themes: ${(e as Error).message.slice(0, 120)}`; }
  }
  const themes: ThemeState = { starter: await starterInfo().catch(() => null), storageReady: storageReady(), canRead, canWrite: Boolean(shopConn?.scopes.includes("write_themes")),
    themes: themesList, themesError, shop: shopConn?.externalId ?? null, owner: me.role === "owner" };
  const step = sp.step === "review" && build?.content ? "review" : sp.step === "build" && build ? "build" : build?.content && sp.step !== "setup" ? "build" : "setup";
  // The step lives in the URL so the shell knows to show the icon rail (boards 05/06) instead of the sidebar.
  if (sp.step !== step) redirect(`${base}/store?step=${step}`);
  const products = await storeProducts(brand.id);
  const ob = brand.onboarding ?? {};
  const pal = ob.analysis?.palette ?? [];
  const role = (r: string, d: string) => pal.find((p) => p.role.startsWith(r))?.hex ?? d;
  const look: Look = { bg: role("Background", "#FBF9F6"), text: role("Text", "#1A1714"), accent: role("Accent", "#B8956A"), soft: role("Secondary", "#F1ECE4"), serif: true };
  const running = Boolean(build?.startedAt && !build.finishedAt);
  const policyMissing = ob.analysis?.toAdd?.some((t) => t.key === "policy" && !t.done) ?? false;
  const qa = qaChecks(build?.content ?? null, products, policyMissing);
  const c = build?.content;
  const copyText = c ? [`ANNOUNCEMENT\n${c.announcement}`, `HERO\n${c.hero}\n${c.subline}\n[${c.cta}]`, `PROMISES\n${c.promises.map((p) => `- ${p.title}: ${p.body}`).join("\n")}`, `BESTSELLERS\n${c.bestsellersTitle}`, `STORY\n${c.story.title}\n${c.story.body}`, `OUR STORY PAGE\n${c.aboutPage}`, `FAQ\n${c.faq.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n")}`, `NEWSLETTER\n${c.newsletter.title}\n${c.newsletter.body}`, `MENU\n${c.nav.join(" · ")}`].join("\n\n") : null;

  const tabs = (["setup", "build", "review"] as const).map((k) => {
    const can = k === "setup" || (k === "build" && build) || (k === "review" && build?.content);
    const doneTab = (k === "setup" && build) || (k === "build" && build?.finishedAt);
    return can ? <Link key={k} href={`?step=${k}`} className={`o${step === k ? " on" : ""}`}>{doneTab ? <Icon name="check-circle" size={12} weight="fill" color="#1F8A5B" /> : null}{k[0].toUpperCase() + k.slice(1)}</Link>
      : <span key={k} className="o" style={{ opacity: 0.45 }}>{k[0].toUpperCase() + k.slice(1)}</span>;
  });

  if (step === "build" && build) {
    const appsWaiting = STORE_APPS.filter((a) => build.apps[a.key] && a.who === "Merchant" && brand.integrations?.[a.key]?.status !== "connected").map((a) => a.name);
    return (
      <BuildCanvas slug={slug} brand={brand.name} category={brand.category ?? null} currency={brand.currency} tasks={build.tasks} content={c ?? null} products={products} look={look}
        hero={products.find((p) => p.image)?.image ?? null} running={running} startedAt={build.startedAt?.toISOString() ?? null} finishedAt={build.finishedAt?.toISOString() ?? null}
        approved={build.approved} log={build.log} comments={build.comments} history={build.history} qa={qa} appsWaiting={appsWaiting} setupDone />
    );
  }

  return (
    <>
      <Bar crumbs={[...crumbs, { label: step[0].toUpperCase() + step.slice(1) }]}>
        <div className="seg">{tabs}<span className="o" style={{ opacity: 0.45 }}>Publish</span></div>
        {running && <span className="row g6 xs i3"><AgentFace kind="builder" size={14} />Remy is building</span>}
      </Bar>
      {step === "setup"
        ? <StoreSetup slug={slug} initial={{ theme: build?.theme ?? "kaviar-starter", pages: build?.pages ?? ["home", "products", "collections", "story", "contact", "policies"], apps: build?.apps ?? {} }} products={products.length} profile={Boolean(ob.profile && Object.keys(ob.profile).length)} hasBuild={Boolean(build?.content)} themes={themes} />
        : <BuildView slug={slug} step={step} brand={brand.name} currency={brand.currency} tasks={build?.tasks ?? []} content={c ?? null} products={products} look={look}
            hero={products.find((p) => p.image)?.image ?? null} running={running} approved={build?.approved ?? []} qa={qa} dawn={c ? dawnIndexJson(c) : null} copyText={copyText} theme={build?.theme ?? "kaviar-starter"} themes={themes} />}
    </>
  );
}
