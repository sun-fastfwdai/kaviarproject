import "server-only";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { ask } from "../ai/client";
import type { BuildTask, StoreContent } from "../db/schema";
import { commit, note } from "./revise";
import { STORE_APPS } from "@/app/(brand)/brands/[slug]/integrations/apps";

export type StoreProduct = { title: string; handle: string | null; image: string | null; price: number | null; units: number };

/** Board 05's build plan. The Homepage stage is Remy's copy; the last three wait on people. */
export const TASKS: Omit<BuildTask, "status" | "detail">[] = [
  { key: "brand", label: "Brand understanding", agent: "iris" },
  { key: "architecture", label: "Store architecture", agent: "iris" },
  { key: "mapping", label: "Content mapping", agent: "remy" },
  { key: "theme", label: "Theme configuration", agent: "remy" },
  { key: "catalog", label: "Product catalog", agent: "cleo" },
  { key: "content", label: "Homepage", agent: "remy" },
  { key: "pages", label: "Product pages", agent: "cleo" },
  { key: "apps", label: "Shopify apps", agent: "cleo" },
  { key: "qa", label: "Quality assurance", agent: "otto" },
  { key: "review", label: "Final review", agent: "you" },
];

export async function storeProducts(brandId: string): Promise<StoreProduct[]> {
  return (await db.execute(sql`
    select p.title, p.handle, p.image_url as image,
      (select min(v.price) from shop_variants v where v.brand_id = p.brand_id and v.product_id = p.id)::float8 as price,
      coalesce((select sum(l.quantity) from shop_order_lines l join shop_orders o on o.brand_id = l.brand_id and o.id = l.order_id
        where l.brand_id = p.brand_id and l.product_id = p.id and o.created_at > now() - interval '90 days' and not o.test and o.cancelled_at is null), 0)::int as units
    from shop_products p where p.brand_id = ${brandId} and coalesce(p.status, 'ACTIVE') = 'ACTIVE'
    order by units desc, p.total_inventory desc nulls last limit 24`)).rows as StoreProduct[];
}

const ContentOut = z.object({
  announcement: z.string().describe("Top bar, under 60 characters, e.g. a real shipping promise or launch line — never invent a discount"),
  heroOptions: z.array(z.string()).describe("3 hero headlines, each under 6 words, in the brand's voice"),
  subline: z.string().describe("Under 18 words"),
  cta: z.string().describe("Button, 2–3 words"),
  promises: z.array(z.object({ title: z.string(), body: z.string() })).describe("3 short brand promises from the profile"),
  bestsellersTitle: z.string(),
  story: z.object({ title: z.string(), body: z.string().describe("60–90 words, founder/brand story from the profile only") }),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).describe("5 FAQs a shopper asks; mark anything the brand must confirm in [brackets]"),
  newsletter: z.object({ title: z.string(), body: z.string() }),
  nav: z.array(z.string()).describe("4–6 menu items"),
  aboutPage: z.string().describe("Our story page, 150–220 words, from the profile only"),
});

/** Run the build: each stage writes its progress so the Build screen fills in live. `resume` keeps stages already done. */
export async function runBuild(brandId: string, opts: { resume?: boolean } = {}): Promise<void> {
  const [b] = await db.select().from(schema.brands).where(eq(schema.brands.id, brandId));
  const [build] = await db.select().from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brandId));
  if (!b || !build) return;
  const prev = opts.resume ? build.tasks : [];
  const tasks: BuildTask[] = TASKS.map((t) => prev.find((p) => p.key === t.key && p.status === "done") ?? { ...t, status: "waiting", detail: "" });
  const save = (patch: Partial<typeof schema.storeBuilds.$inferInsert> = {}) => db.update(schema.storeBuilds).set({ tasks, updatedAt: new Date(), ...patch }).where(eq(schema.storeBuilds.brandId, brandId));
  const startedAt = new Date();
  // Pause = someone set finishedAt after this run started; stop before the next stage.
  const paused = async () => { const [x] = await db.select({ f: schema.storeBuilds.finishedAt }).from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brandId)); return Boolean(x?.f); };
  let stopped = false;
  const step = async (key: string, run: () => Promise<string | { needs: string }>) => {
    const t = tasks.find((x) => x.key === key)!;
    if (stopped || t.status === "done") return;
    if (await paused()) { stopped = true; return; }
    const t0 = Date.now();
    t.status = "running"; t.at = new Date().toISOString(); await save();
    try {
      const r = await run();
      if (typeof r === "string") { t.detail = r; t.status = "done"; } else { t.detail = r.needs; t.status = "needs"; }
    } catch (e) { t.detail = (e as Error).message.slice(0, 120); t.status = "error"; }
    t.ms = Date.now() - t0;
    await save();
  };
  await save(opts.resume ? { finishedAt: null } : { startedAt, finishedAt: null });

  const profile = b.onboarding?.profile ?? {};
  const products = await storeProducts(brandId);
  const noImg = products.filter((p) => !p.image);
  await step("brand", async () => Object.keys(profile).length ? `${Object.keys(profile).length} facts from the brand profile` : "No profile — using the store’s own data");
  await step("architecture", async () => `${build.pages.length} pages · ${build.pages.join(", ")}`);
  await step("mapping", async () => {
    const facts = Object.keys(profile).length;
    return `${facts} facts + ${Math.min(8, products.length)} best-sellers → 7 homepage sections`;
  });
  await step("theme", async () => {
    const pal = b.onboarding?.analysis?.palette ?? [];
    const font = b.onboarding?.analysis?.font?.name;
    const theme = build.theme === "kaviar-starter" ? "Kaviar Starter" : "the store’s theme";
    return pal.length ? `${theme} · ${pal.length} brand colours${font ? ` · ${font}` : ""}` : `${theme} · default colours`;
  });
  await step("catalog", async () => {
    await note(brandId, { who: "Cleo", agent: "cleo", what: `Checked ${products.length} products for the store, sorted by 90-day sales${noImg.length ? ` — ${noImg.length} need a photo` : ""}`, scope: "bestsellers" });
    return `${products.length} products · sorted by 90-day sales`;
  });
  let content: StoreContent | null = build.content;
  await step("content", async () => {
    const out = await ask("remy", {
      system: "You are Remy, Kaviar's store builder. Write the copy for a brand's new Shopify store from its profile and real best-sellers. Use only facts given; no medical or guaranteed claims; never invent discounts, awards or reviews. Write in the brand's tone.",
      content: JSON.stringify({ brand: b.name, category: b.category, website: b.website, currency: b.currency, profile: Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, v.value])), bestsellers: products.slice(0, 8).map((p) => ({ title: p.title, price: p.price, soldLast90Days: p.units })), pages: build.pages }),
      schema: ContentOut,
      maxTokens: 6000,
    });
    if (!out) throw new Error("Remy couldn’t write the copy — try again");
    content = { ...out, heroOptions: out.heroOptions.slice(0, 3), hero: out.heroOptions[0] ?? b.name };
    await commit(brandId, content, { who: "Remy", agent: "remy", what: `Wrote the homepage, story page and ${out.faq.length} FAQs from the brand profile and best-sellers`, scope: null });
    return `7 sections · ${out.heroOptions.length} hero options · ${out.faq.length} FAQs`;
  });
  await step("pages", async () => noImg.length
    ? { needs: `${noImg.length} photo${noImg.length > 1 ? "s" : ""} needed` }
    : `${products.length} product pages`);
  await step("apps", async () => {
    const picked = STORE_APPS.filter((a) => build.apps[a.key]);
    const waiting = picked.filter((a) => a.who === "Merchant" && b.integrations?.[a.key]?.status !== "connected");
    return waiting.length ? { needs: "Merchant auth" } : picked.length ? `${picked.length} connected` : "None picked";
  });
  await step("qa", async () => {
    const issues = qaChecks(content, products, b.onboarding?.analysis?.toAdd?.some((t) => t.key === "policy" && !t.done) ?? false).filter((c) => !c.ok).length;
    await note(brandId, { who: "Otto", agent: "otto", what: issues ? `Found ${issues} thing${issues > 1 ? "s" : ""} to fix before publish` : "All quality checks pass", scope: null });
    return issues ? `${issues} to fix before publish` : "All checks pass";
  });
  await step("review", async () => ({ needs: "Your turn" }));
  if (!stopped) await save({ finishedAt: new Date() });
}

export type QA = { label: string; ok: boolean; detail: string; fix?: string };

/** Otto's pre-publish checks on the generated store. */
export function qaChecks(c: StoreContent | null, products: StoreProduct[], policyMissing: boolean): QA[] {
  const noImg = products.filter((p) => !p.image);
  const noPrice = products.filter((p) => p.price == null);
  const words = (s: string) => s.trim().split(/\s+/).length;
  return [
    { label: "Every product has a photo", ok: noImg.length === 0, detail: noImg.length ? `${noImg.length} without: ${noImg.slice(0, 2).map((p) => p.title).join(", ")}` : `${products.length} products`, fix: "Add photos in Shopify admin" },
    { label: "Prices on every product", ok: noPrice.length === 0, detail: noPrice.length ? `${noPrice.length} missing` : "All priced" },
    { label: "Hero fits on a phone", ok: !c || words(c.hero) <= 6, detail: c ? `${words(c.hero)} words` : "—", fix: "Pick a shorter headline" },
    { label: "Return & refund policy", ok: !policyMissing, detail: policyMissing ? "Shopify checkout needs one" : "Present", fix: "Draft it in the brand’s onboarding review" },
    { label: "Image alt text", ok: true, detail: "Written from product names" },
    { label: "No invented claims", ok: !c || !/\b(cure|guarantee|miracle|#1|award)/i.test(JSON.stringify(c)), detail: "Copy checked for claims Meta and shoppers distrust" },
  ];
}

/** Dawn's homepage as a templates/index.json, using Dawn's own section types. Paste it into the theme code editor. */
export function dawnIndexJson(c: StoreContent, collectionHandle = "all"): string {
  const sections: Record<string, unknown> = {
    banner: { type: "image-banner", blocks: {
      heading: { type: "heading", settings: { heading: c.hero, heading_size: "h0" } },
      text: { type: "text", settings: { text: `<p>${c.subline}</p>`, text_style: "body" } },
      buttons: { type: "buttons", settings: { button_label_1: c.cta, button_link_1: "shopify://collections/all", button_style_secondary_1: false } },
    }, block_order: ["heading", "text", "buttons"], settings: { image_height: "large", desktop_content_position: "bottom-left", show_text_box: false, image_overlay_opacity: 30 } },
    promises: { type: "multicolumn", blocks: Object.fromEntries(c.promises.map((p, i) => [`p${i}`, { type: "column", settings: { title: p.title, text: `<p>${p.body}</p>` } }])), block_order: c.promises.map((_, i) => `p${i}`), settings: { title: "", columns_desktop: 3 } },
    bestsellers: { type: "featured-collection", settings: { title: c.bestsellersTitle, collection: collectionHandle, products_to_show: 4, columns_desktop: 4, show_view_all: true } },
    story: { type: "rich-text", blocks: { h: { type: "heading", settings: { heading: c.story.title } }, t: { type: "text", settings: { text: `<p>${c.story.body}</p>` } } }, block_order: ["h", "t"], settings: {} },
    faq: { type: "collapsible-content", blocks: Object.fromEntries(c.faq.map((f, i) => [`q${i}`, { type: "collapsible_row", settings: { heading: f.q, row_content: `<p>${f.a}</p>` } }])), block_order: c.faq.map((_, i) => `q${i}`), settings: { heading: "Questions" } },
    newsletter: { type: "newsletter", blocks: { h: { type: "heading", settings: { heading: c.newsletter.title } }, p: { type: "paragraph", settings: { text: `<p>${c.newsletter.body}</p>` } }, f: { type: "email_form", settings: {} } }, block_order: ["h", "p", "f"], settings: {} },
  };
  return JSON.stringify({ sections, order: Object.keys(sections) }, null, 2);
}
