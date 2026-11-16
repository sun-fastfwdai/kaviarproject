import "server-only";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { ask } from "../ai/client";
import { checkShot, shoot } from "../creative/shoots";
import { marketContext } from "../research/context";
import type { StorePhotos } from "../db/schema";
import type { StoreProduct } from "./build";

/**
 * The store's own photography: Remy art-directs one shoot for the store — a hero, a brand-story image and a lifestyle shot per best-seller —
 * and each photo is made from the real Shopify product photo, so the product stays exact. Otto checks every photo against that product
 * (label, shape, colours, no stray text); one that fails is shot again once, and if it fails again the store keeps the plain product photo.
 */
const Art = z.object({
  look: z.string().describe("The shoot's shared look in one line: surfaces, palette, light, lens — so every photo looks like one shoot"),
  hero: z.object({ product: z.string().describe("Exact product title from the list"), scene: z.string().describe("The hero photo: 40–70 words") }),
  story: z.object({ product: z.string(), scene: z.string().describe("The brand-story photo: the world around the product — ingredients, ritual, texture. 40–70 words") }),
  products: z.array(z.object({ product: z.string(), scene: z.string().describe("A lifestyle photo for this product: 30–60 words") })).describe("One per product given, in the same order"),
});

const SYSTEM = `You are Remy, Kaviar's creative director, art-directing the photos for a brand's new Shopify store. Every photo is generated from the brand's real product photo, so the product itself stays exact — you direct everything around it.
Write each scene as a photographer's brief: setting and surface, props, light (direction and quality), lens and framing, and where the product sits and which way its label faces.
- One shoot: a shared look (palette from the brand colours, the same surfaces and light) so the store feels designed, not stocked.
- Hero: the hero product, editorial and calm, generous negative space on one side for the headline; portrait 4:5.
- Story: the brand's world — ingredients, textures, the ritual of using it. Hands are fine; no faces.
- Products: each product in a believable moment of use or display, varied but from the same shoot.
- Never show a person's face, text, logos other than the product's own label, or props that suggest medical or clinical claims.
- Use only what the brand profile and positioning say about the brand; don't invent ingredients or claims.`;

export async function makeStorePhotos(brandId: string, b: { name: string; category: string | null; onboarding: { profile?: Record<string, { value: string }>; analysis?: { palette?: { hex: string; role: string }[] } } | null }, products: StoreProduct[]): Promise<{ photos: StorePhotos; made: number; kept: number; error?: string }> {
  const items = products.filter((p) => p.image).slice(0, 4);
  if (!items.length) return { photos: {}, made: 0, kept: 0, error: "No product photos to shoot from" };
  const market = await marketContext(brandId).catch(() => null);
  const art = await ask("remy", {
    system: SYSTEM,
    content: JSON.stringify({
      brand: b.name, category: b.category,
      profile: Object.fromEntries(Object.entries(b.onboarding?.profile ?? {}).map(([k, v]) => [k, v.value])),
      colours: (b.onboarding?.analysis?.palette ?? []).map((p) => `${p.role}: ${p.hex}`),
      positioning: market?.positioning ? { statement: market.positioning.statement, pillars: market.positioning.pillars, voice: market.positioning.voice } : null,
      products: items.map((p) => p.title),
    }),
    schema: Art, maxTokens: 4000,
  });
  if (!art) return { photos: {}, made: 0, kept: 0, error: "Remy couldn’t plan the shoot — try again" };

  const find = (title: string) => items.find((p) => p.title === title) ?? items.find((p) => p.title.toLowerCase().includes(title.toLowerCase().slice(0, 20))) ?? items[0];
  const jobs: { slot: string; product: StoreProduct; scene: string }[] = [
    { slot: "hero", product: find(art.hero.product), scene: art.hero.scene },
    { slot: "story", product: find(art.story.product), scene: art.story.scene },
    ...items.map((p, i) => ({ slot: `product:${p.title}`, product: p, scene: art.products[i]?.scene ?? art.products.find((x) => x.product === p.title)?.scene ?? art.hero.scene })),
  ];
  let made = 0, firstError: string | undefined;
  const drop: string[] = [];
  // Shoot, check, and shoot once more if Otto finds the product changed.
  const one = async (j: (typeof jobs)[number]): Promise<[string, string] | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await shoot(brandId, null, { product: j.product.title, imageUrl: j.product.image!, prompt: `${j.scene}\nThe whole shoot: ${art.look}`, aspect: "4:5", n: 1 });
      const id = r.ids[0];
      if (!id) { firstError ??= r.error; return null; }
      made++;
      const check = await checkShot(brandId, id, j.product.image!, j.product.title);
      if (!check || (check.labelMatches && check.shapeExact && check.coloursOnBrand && check.noTextOrWatermark)) return [j.slot, id];
      drop.push(id);
    }
    return null;
  };
  const done = (await Promise.all(jobs.map((j) => one(j).catch(() => null)))).filter((x): x is [string, string] => Boolean(x));
  // Photos Otto turned down don't stay in the brand's assets.
  if (drop.length) await db.delete(schema.brandAssets).where(and(eq(schema.brandAssets.brandId, brandId), inArray(schema.brandAssets.id, drop)));
  const photos: StorePhotos = { look: art.look, products: {} };
  for (const [slot, id] of done) {
    if (slot === "hero") photos.hero = id;
    else if (slot === "story") photos.story = id;
    else photos.products![slot.slice(8)] = id;
  }
  return { photos, made, kept: done.length, error: done.length ? undefined : firstError ?? "No photo passed Otto’s check" };
}
