import "server-only";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { ask } from "../ai/client";
import { fetchPublic, readPage, toUrl } from "../ai/site";
import { slugify } from "../format";
import { patchOnboarding } from "../onboarding/draft";
import type { CatalogProduct } from "../onboarding/types";

type ShopifyJson = { products?: { handle: string; title: string; body_html: string; vendor: string; product_type: string; tags: string[] | string; images: { src: string }[]; options: { name: string }[]; variants: { title: string; price: string; compare_at_price: string | null; sku: string }[] }[] };

/** Cleo reads the old website's catalog: Shopify storefronts publish it, anything else is read page by page. */
export async function extractCatalog(brandId: string): Promise<{ count: number; source: string; error?: string }> {
  const [b] = await db.select({ name: schema.brands.name, website: schema.brands.website, onboarding: schema.brands.onboarding }).from(schema.brands).where(eq(schema.brands.id, brandId));
  const site = toUrl(b?.onboarding?.basics?.website || b?.website || "");
  if (!site) return { count: 0, source: "", error: "This brand has no website to read." };
  let products: CatalogProduct[] = [];
  let source = "";

  const json = await fetchPublic(`${site.origin}/products.json?limit=250`, 12_000, "application/json");
  if (json?.ok) {
    try {
      const j = (await json.json()) as ShopifyJson;
      products = (j.products ?? []).map((p) => ({
        handle: p.handle, title: p.title, body: p.body_html ?? "", type: p.product_type ?? "", vendor: p.vendor || b!.name,
        tags: Array.isArray(p.tags) ? p.tags.join(", ") : p.tags ?? "", images: p.images.map((i) => i.src).slice(0, 8),
        variants: p.variants.map((v) => ({ option: v.title === "Default Title" ? "" : v.title, price: Number(v.price) || null, compareAt: v.compare_at_price ? Number(v.compare_at_price) : null, sku: v.sku ?? "" })),
      }));
      source = "the store’s product feed";
    } catch { /* not a Shopify store */ }
  }

  if (!products.length) {
    // Any other platform: find product pages from the home page and let Cleo read them.
    const home = await readPage(site.toString());
    if (!home) return { count: 0, source: "", error: `Couldn’t open ${site.hostname}.` };
    const links = [...new Set(home.links.map((l) => l.href).filter((h) => { try { const u = new URL(h); return u.hostname === home.host && /product|goods|detail|item|shop\/|\/p\//i.test(u.pathname + u.search); } catch { return false; } }))].slice(0, 30);
    const pages = (await Promise.all(links.map((l) => readPage(l)))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof readPage>>>[];
    const Out = z.object({ products: z.array(z.object({
      title: z.string(), description: z.string().describe("The product description, 1–4 sentences, as written"), type: z.string().describe("Short product type, e.g. Serum"),
      price: z.number().nullable().describe("Price in the site's currency; null if not shown"), compareAt: z.number().nullable(), sourceUrl: z.string(),
    })) });
    const out = await ask("cleo", {
      system: "You are Cleo, Kaviar's catalog agent. From these product pages, list each distinct product for sale with its title, description, type and price exactly as the site shows them. Skip categories, bundles of links and non-products. Never invent prices.",
      content: pages.map((p) => `URL: ${p.url}\nTITLE: ${p.title}\nIMAGE: ${p.image ?? ""}\n${p.text.slice(0, 2500)}`).join("\n\n---\n\n").slice(0, 120_000),
      schema: Out, maxTokens: 12000,
    });
    const imageOf = new Map(pages.map((p) => [p.url, p.image]));
    products = (out?.products ?? []).map((p) => ({
      handle: slugify(p.title).slice(0, 80) || "product", title: p.title, body: `<p>${p.description}</p>`, type: p.type, vendor: b!.name, tags: "",
      images: [imageOf.get(p.sourceUrl) ?? ""].filter(Boolean), variants: [{ option: "", price: p.price, compareAt: p.compareAt, sku: "" }],
    }));
    source = `${pages.length} product pages`;
  }
  // Unique handles, as Shopify requires.
  const seen = new Map<string, number>();
  for (const p of products) { const n = seen.get(p.handle) ?? 0; seen.set(p.handle, n + 1); if (n) p.handle = `${p.handle}-${n + 1}`; }
  await patchOnboarding(brandId, { catalog: { at: new Date().toISOString(), source, products } });
  return { count: products.length, source, ...(products.length ? {} : { error: "No products found on the site." }) };
}

const cell = (v: string | number | null | undefined) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Shopify's product import CSV (Admin → Products → Import). One row per variant, extra rows for extra images. */
export function shopifyCsv(products: CatalogProduct[]): string {
  const head = ["Handle", "Title", "Body (HTML)", "Vendor", "Type", "Tags", "Published", "Option1 Name", "Option1 Value", "Variant SKU", "Variant Price", "Variant Compare At Price", "Variant Inventory Policy", "Variant Fulfillment Service", "Variant Requires Shipping", "Variant Taxable", "Image Src", "Image Position", "Image Alt Text", "Status"];
  const rows: (string | number | null)[][] = [];
  for (const p of products) {
    const vs = p.variants.length ? p.variants : [{ option: "", price: null, compareAt: null, sku: "" }];
    const multi = vs.some((v) => v.option);
    const n = Math.max(vs.length, p.images.length, 1);
    for (let i = 0; i < n; i++) {
      const v = vs[i];
      const img = p.images[i];
      rows.push([
        p.handle, i ? "" : p.title, i ? "" : p.body, i ? "" : p.vendor, i ? "" : p.type, i ? "" : p.tags, i ? "" : "TRUE",
        i ? "" : multi ? "Option" : "Title", v ? (multi ? v.option : "Default Title") : "", v?.sku ?? "", v?.price ?? "", v?.compareAt ?? "",
        v ? "deny" : "", v ? "manual" : "", v ? "TRUE" : "", v ? "TRUE" : "",
        img ?? "", img ? i + 1 : "", img ? p.title : "", i ? "" : "draft",
      ]);
    }
  }
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}
