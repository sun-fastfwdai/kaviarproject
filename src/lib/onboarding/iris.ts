import "server-only";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { ask, type Block } from "../ai/client";
import { detectPlatform, readPage, shopifyProducts, shopNameFree, styleEvidence, toUrl, type Page } from "../ai/site";
import { slugify } from "../format";
import { patchOnboarding, readOnboarding } from "./draft";
import type { Analysis, ChatTurn, Field, Job, Onboarding, Profile, Recommendation, SiteScan, ToAdd } from "./types";

const now = () => new Date().toISOString();
const LANG = new Intl.DisplayNames(["en"], { type: "language" });
const langName = (code: string) => { try { return LANG.of(code.split("-")[0]) ?? code; } catch { return code; } };

// ---------------------------------------------------------------- Step 2: Iris reads the website and prefills the basics

const ScanOut = z.object({
  brandName: z.string().describe("The brand's own name as customers know it"),
  category: z.string().describe("Short category, e.g. 'Skincare · dermatologist-led'"),
  tagline: z.string().describe("The brand's tagline or hero line as written on the site; empty if none"),
  heroProduct: z.string().describe("The product the site pushes hardest; empty if unclear"),
  markets: z.array(z.string()).describe("Countries where the Shopify store should sell first, most important first, at most 3"),
  defaultLanguage: z.string().describe("Default storefront language in English, e.g. 'English'"),
  currency: z.string().describe("ISO 4217 code for the first market"),
  note: z.string().describe("One sentence heads-up for the operator about anything that stays on the old platform or needs a decision; empty if nothing"),
});

export async function scanSite(input: string, hint?: { name?: string }): Promise<SiteScan> {
  const u = toUrl(input);
  const base: SiteScan = {
    ok: false, url: input, host: u?.hostname ?? input, platform: null, title: null, image: null, brandName: hint?.name ?? null, category: null, tagline: null,
    heroProduct: null, productCount: null, priceMin: null, priceMax: null, currency: null, languages: [], nav: [], markets: [], defaultLanguage: null,
    shopName: null, shopNameNote: null, note: null, scannedAt: now(),
  };
  if (!u) return { ...base, error: "That doesn’t look like a public website address." };
  const page = await readPage(u.toString());
  if (!page) return { ...base, error: `Iris couldn’t open ${u.hostname}. Check the address, or continue and fill the basics yourself.` };

  const platform = detectPlatform(page.html);
  const products = await shopifyProducts(new URL(page.url).origin);
  const prices = (products ?? []).flatMap((p) => p.prices);
  const langs = [...new Set([...(page.lang ? [page.lang] : []), ...page.hreflangs].map(langName))];
  const nav = [...new Set(page.links.filter((l) => l.inNav && l.text && l.text.length < 24 && new URL(l.href).hostname === page.host).map((l) => l.text))].slice(0, 10);

  const out = await ask("iris", {
    effort: "low",
    maxTokens: 4000,
    system: "You are Iris, Kaviar's brand analyst. Kaviar moves brands onto Shopify. Read the website facts and fill the brand basics precisely. Never invent facts that the page doesn't support; leave a field empty when unsure.",
    content: [
      `Website: ${page.url}`, `Platform detected: ${platform ?? "unknown"}`, `Title: ${page.title ?? ""}`, `Description: ${page.description ?? ""}`,
      `Site name: ${page.siteName ?? ""}`, `Languages: ${langs.join(", ") || "unknown"}`, `Navigation: ${nav.join(" · ")}`,
      products ? `Catalog (${products.length} products): ${products.slice(0, 40).map((p) => `${p.title} [${p.type}] ${p.prices[0] ?? ""}`).join("; ")}` : "",
      `Hint from the operator — brand name: ${hint?.name ?? "unknown"}`,
      `Page text:\n${page.text.slice(0, 7000)}`,
    ].join("\n"),
    schema: ScanOut,
  });

  const name = out?.brandName || hint?.name || page.siteName || page.title?.split(/[|–-]/)[0].trim() || page.host;
  let shopName: string | null = null, shopNameNote: string | null = null;
  const stem = slugify(name).replace(/[^a-z0-9-]/g, "").slice(0, 30);
  if (stem) {
    for (const cand of [stem, `${stem}-global`, `${stem}-store`, `${stem}-official`, `${stem}-shop`]) {
      const free = await shopNameFree(cand);
      if (free) { shopName = cand; shopNameNote = cand === stem ? null : `“${stem}” is taken on Shopify, so Iris picked the closest free name.`; break; }
      if (free === null) { shopName = cand; break; }
    }
  }

  return {
    ...base,
    ok: true,
    url: page.url,
    host: page.host,
    platform,
    title: page.title,
    image: page.image,
    brandName: name,
    category: out?.category || null,
    tagline: out?.tagline || page.description,
    heroProduct: out?.heroProduct || null,
    productCount: products?.length ?? null,
    priceMin: prices.length ? Math.min(...prices) : null,
    priceMax: prices.length ? Math.max(...prices) : null,
    currency: out?.currency?.toUpperCase().slice(0, 3) || null,
    languages: langs,
    nav,
    markets: out?.markets ?? [],
    defaultLanguage: out?.defaultLanguage || langs[0] || null,
    shopName,
    shopNameNote,
    note: out?.note || null,
  };
}

/** Product images Cleo can reuse on Shopify, with their sizes (Shopify storefronts only; others get the page image). */
export async function pullImages(url: string): Promise<{ url: string; w: number | null; h: number | null }[]> {
  const u = toUrl(url);
  if (!u) return [];
  const products = await shopifyProducts(u.origin);
  if (products) return products.flatMap((p) => p.images.slice(0, 3)).slice(0, 60).map((i) => ({ url: i.src, w: i.width, h: i.height }));
  const page = await readPage(u.toString());
  if (!page) return [];
  const imgs = [...page.html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => { try { return new URL(m[1], page.url).toString(); } catch { return null; } })
    .filter((s): s is string => Boolean(s && /\.(jpe?g|png|webp)/i.test(s)));
  return [...new Set(imgs)].slice(0, 30).map((src) => ({ url: src, w: null, h: null }));
}

// ---------------------------------------------------------------- Step 1 (Kaviar AI): three questions, then a recommended path

const ChatOut = z.object({
  reply: z.string().describe("What Kaviar AI says next. Under 45 words. Plain, warm, specific to this brand."),
  options: z.array(z.string()).describe("2–4 short tap-to-answer options for the question just asked; empty when no question is pending"),
  understands: z.object({
    sellsOn: z.string().nullable(), catalog: z.string().nullable(), wants: z.string().nullable(), customerData: z.string().nullable(),
  }),
  answered: z.number().int().describe("How many of the three questions are answered, 0–3"),
  recommendation: z.object({
    path: z.enum(["shopify", "website", "specialist"]),
    title: z.string().describe("e.g. 'Import from website'"),
    confidence: z.enum(["High", "Med", "Low"]),
    points: z.array(z.object({ tone: z.enum(["good", "wait"]), lead: z.string().describe("Bold opening, e.g. 'Cleo moves all 12 products'"), text: z.string() })).describe("Exactly three points"),
    landsOn: z.string().describe("e.g. 'Lands on Shopify · about 6 min to start'"),
  }).nullable().describe("Set only once all three questions are answered"),
});

const CONCIERGE = `You are Kaviar AI, the concierge inside Kaviar's "New brand" onboarding. You talk with a member of the Kaviar team who is setting up a brand. Kaviar runs brands on Shopify: it connects existing Shopify stores (read-only), or imports a brand's site from Cafe24, WooCommerce or anything else and rebuilds it on Shopify with the Kaviar Starter theme. Agents: Iris reads the site and brand deck, Cleo moves the catalog, Remy builds the store, Otto checks everything before launch.

Find the right path with exactly three questions, asked one at a time, in this order:
1. Where does the brand sell today? (On Shopify / Its own website / Marketplaces only / Not selling online yet)
2. Should the brand keep its customer accounts and order history when it moves? (Yes, move them / No, fresh start / Not sure yet) — skip with a sensible note if they're already on Shopify.
3. What matters first? (e.g. launch fast / subscriptions / keep the current look / international markets)
If the user answers something else (a side question like "What will Shopify cost them?"), answer it briefly and accurately, then repeat the pending question.
After the third answer, give the recommendation: shopify = already on Shopify, connect it; website = import the existing site and rebuild on Shopify; specialist = unclear or complex, book a call with a Kaviar brand specialist. Use "wait" tone for anything that can be decided later.
Never invent facts about the brand; use only what's in the conversation and the site notes.`;

export async function chatTurn(id: string, text: string): Promise<void> {
  const ob = await readOnboarding(id);
  const [b] = await db.select({ name: schema.brands.name, website: schema.brands.website }).from(schema.brands).where(eq(schema.brands.id, id));
  const chat = ob.chat ?? { turns: [], understands: { sellsOn: null, catalog: null, wants: null, customerData: null, path: null }, answered: 0, recommendation: null };
  const turns: ChatTurn[] = [...chat.turns];
  const last = [...turns].reverse().find((t) => t.who === "kaviar" && t.options?.length);
  if (text) {
    if (last && last.options?.includes(text)) last.chosen = text;
    else turns.push({ who: "kris", text, at: now() });
  }

  // A pasted link (or the brand's site, once it's known) gets read by Iris first.
  let scan = ob.scan;
  const url = text.match(/\b((?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?)/i)?.[1] ?? (!scan && b?.website && text ? b.website : null);
  if (url && toUrl(url) && (!scan || scan.host !== toUrl(url)!.hostname)) {
    scan = await scanSite(url, { name: b?.name });
    if (scan.ok) {
      const bits = [scan.platform ? `a ${scan.platform} store` : "a storefront", scan.productCount ? `with ${scan.productCount} products` : "", scan.languages.length ? `in ${scan.languages.join(" and ")}` : ""].filter(Boolean).join(" ");
      turns.push({ who: "iris", text: `I looked at ${scan.host}. It’s ${bits}.`, at: now(), site: { host: scan.host, image: scan.image, chips: [scan.platform, scan.productCount ? `${scan.productCount} products` : null, scan.languages.map((l) => l.slice(0, 2).toUpperCase()).join(" · ") || null].filter(Boolean) as string[] } });
      await patchOnboarding(id, { scan, pulled: await pullImages(scan.url) });
    } else {
      turns.push({ who: "iris", text: scan.error ?? "I couldn’t open that site.", at: now() });
    }
  }

  const transcript = turns.map((t) => `${t.who === "kris" ? "Team" : t.who === "iris" ? "Iris" : "Kaviar AI"}: ${t.text}${t.chosen ? `\nTeam: ${t.chosen}` : ""}`).join("\n");
  const out = await ask("kaviar", {
    system: CONCIERGE,
    content: `Brand: ${b?.name ?? "the brand"}\nSite notes: ${scan?.ok ? JSON.stringify({ host: scan.host, platform: scan.platform, products: scan.productCount, languages: scan.languages, priceRange: [scan.priceMin, scan.priceMax] }) : "none yet"}\n\nConversation so far:\n${transcript || "(nothing yet — open with the first question, greeting the team member)"}`,
    schema: ChatOut,
  });

  if (out) {
    turns.push({ who: "kaviar", text: out.reply, at: now(), options: out.recommendation ? [] : out.options, rec: out.recommendation ?? undefined });
    const rec: Recommendation | null = out.recommendation;
    await patchOnboarding(id, {
      chat: { turns, answered: Math.max(chat.answered, Math.min(3, out.answered)), recommendation: rec ?? chat.recommendation, understands: { ...out.understands, path: rec?.title ?? chat.understands.path } },
    });
  } else {
    turns.push({ who: "kaviar", text: "Kaviar AI can’t answer right now. Pick a path on the left instead — you can switch later.", at: now() });
    await patchOnboarding(id, { chat: { ...chat, turns } });
  }
}

// ---------------------------------------------------------------- Step 4: Iris studies the brand

const DeckOut = z.object({
  pages: z.number().int(),
  tagline: z.string(), positioning: z.string(), tone: z.string(), audience: z.string(),
  claims: z.array(z.string()), visualRules: z.string(), founderStory: z.string(),
});
const IdentityOut = z.object({
  palette: z.array(z.object({ hex: z.string().describe("#RRGGBB"), role: z.enum(["Background", "Text, buttons", "Accent", "Secondary"]), confidence: z.enum(["High", "Med", "Low"]) })).describe("Exactly four, one per role"),
  font: z.object({ name: z.string(), note: z.string().describe("e.g. 'Not on Shopify · Inter suggested'"), confidence: z.enum(["High", "Med", "Low"]) }),
});
const OttoOut = z.object({
  toAdd: z.array(z.object({ key: z.enum(["policy", "photos", "story", "logo", "deck"]), detail: z.string().describe("One short sentence, specific numbers where known") })),
  otto: z.array(z.object({ title: z.string().describe("e.g. 'Replace 6 small product photos'"), action: z.enum(["Review", "Add"]) })).describe("At most 3"),
});
const FieldOut = z.object({ value: z.string(), from: z.enum(["website", "deck", "shopify", "suggested", "entered"]), note: z.string().describe("Where exactly it came from, e.g. 'Iris suggested the first sentence from deck p.3'; empty if obvious") });
const ProfileOut = z.object({
  tagline: FieldOut, positioning: FieldOut, tone: FieldOut, audience: FieldOut, markets: FieldOut, catalog: FieldOut, heroProducts: FieldOut, palette: FieldOut, typography: FieldOut,
});

const JOBS: Omit<Job, "status" | "detail">[] = [
  { key: "deck", label: "Read brand deck", agent: "iris", what: "tone, claims, visuals" },
  { key: "crawl", label: "Crawl website", agent: "iris", what: "" },
  { key: "products", label: "Extract products", agent: "cleo", what: "prices, variants, images" },
  { key: "identity", label: "Detect brand identity", agent: "iris", what: "palette, type, voice" },
  { key: "structure", label: "Map site structure", agent: "iris", what: "pages, menus, blog" },
  { key: "missing", label: "Check missing assets", agent: "otto", what: "against the base theme" },
];

export function freshAnalysis(): Analysis {
  return {
    startedAt: now(), jobs: JOBS.map((j) => ({ ...j, status: "waiting", detail: "" })), palette: [], font: null, paletteSource: null, categories: [], productCount: 0,
    pages: [], pagesDone: 0, pagesTotal: 0, toAdd: [], otto: [],
  };
}

export async function runAnalysis(id: string): Promise<void> {
  const ob = await readOnboarding(id);
  const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, id));
  if (!brand) return;
  const a: Analysis = ob.analysis?.startedAt && !ob.analysis.finishedAt ? ob.analysis : freshAnalysis();
  const job = (k: string) => a.jobs.find((j) => j.key === k)!;
  const save = () => patchOnboarding(id, { analysis: a });
  const set = async (k: string, patch: Partial<Job>) => { Object.assign(job(k), patch); a.current = patch.status === "running" ? job(k).label : a.current; await save(); };
  const site = ob.basics?.website || brand.website || ob.scan?.url || null;
  const home = site ? toUrl(site) : null;

  // 1. Brand deck (PDF) — Iris reads it directly.
  await set("deck", { status: "running", detail: "Opening the deck" });
  const [deck] = await db.select().from(schema.brandAssets).where(and(eq(schema.brandAssets.brandId, id), eq(schema.brandAssets.kind, "deck"))).orderBy(desc(schema.brandAssets.createdAt)).limit(1);
  let deckRead: z.infer<typeof DeckOut> | null = null;
  if (deck && deck.mime === "application/pdf") {
    const doc: Block = { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(deck.data).toString("base64") } };
    deckRead = await ask("iris", {
      effort: "medium",
      system: "You are Iris, Kaviar's brand analyst. Read this brand deck and pull out exactly what the brand says about itself. Quote the brand's own words where you can.",
      content: [doc, { type: "text", text: "Extract the brand's tagline, positioning, tone of voice, audience, key claims, visual rules (colours, type, photography do's and don'ts) and founder story. Count the pages." }],
      schema: DeckOut,
    });
    a.deckPages = deckRead?.pages ?? deck.meta.pages;
    await set("deck", deckRead ? { status: "done", detail: `${a.deckPages ?? "?"} pages` } : { status: "error", detail: "Couldn’t read the deck" });
  } else {
    await set("deck", { status: "skipped", detail: deck ? "Deck isn’t a PDF" : "No deck uploaded" });
  }

  // 2. Crawl the site — home, navigation, then other internal pages.
  const pages: Page[] = [];
  if (home) {
    await set("crawl", { status: "running", detail: home.hostname, what: home.hostname });
    const first = await readPage(home.toString());
    if (first) {
      pages.push(first);
      const internal = [...new Set(first.links.filter((l) => { try { const u = new URL(l.href); return u.hostname === first.host && !/\/(cart|account|login|search|checkout|cdn)/i.test(u.pathname) && u.pathname !== "/"; } catch { return false; } })
        .sort((x, y) => Number(y.inNav) - Number(x.inNav)).map((l) => l.href.split("#")[0]))].slice(0, 23);
      a.pagesTotal = internal.length + 1;
      a.pagesDone = 1;
      for (let i = 0; i < internal.length; i += 4) {
        const got = await Promise.all(internal.slice(i, i + 4).map((u) => readPage(u)));
        got.forEach((p) => p && pages.push(p));
        a.pagesDone = Math.min(a.pagesTotal, a.pagesDone + 4);
        job("crawl").done = a.pagesDone; job("crawl").total = a.pagesTotal;
        await save();
      }
      await set("crawl", { status: "done", detail: `${pages.length} / ${a.pagesTotal} pages`, done: pages.length, total: a.pagesTotal });
    } else {
      await set("crawl", { status: "error", detail: `Couldn’t open ${home.hostname}` });
    }
  } else {
    await set("crawl", { status: "skipped", detail: "No website" });
  }

  // 3. Products — from the connected store, the storefront catalog, or the crawled pages.
  await set("products", { status: "running", detail: "Reading the catalog" });
  let cats: { name: string; count: number }[] = [];
  let productNames: string[] = [];
  const synced = (await db.execute(sql`select coalesce(nullif(product_type, ''), 'Other') as t, title from shop_products where brand_id = ${id} and status = 'ACTIVE'`)).rows as { t: string; title: string }[];
  if (synced.length) {
    productNames = synced.map((r) => r.title);
    cats = Object.entries(synced.reduce<Record<string, number>>((m, r) => ((m[r.t] = (m[r.t] ?? 0) + 1), m), {})).map(([name, count]) => ({ name, count }));
  } else if (home) {
    const list = await shopifyProducts(home.origin);
    if (list) {
      productNames = list.map((p) => p.title);
      cats = Object.entries(list.reduce<Record<string, number>>((m, p) => ((m[p.type] = (m[p.type] ?? 0) + 1), m), {})).map(([name, count]) => ({ name, count }));
    } else if (pages.length) {
      const got = await ask("cleo", {
        system: "You are Cleo, Kaviar's catalog agent. List the products this site sells, with a short category for each. Only products that are clearly for sale.",
        content: pages.slice(0, 12).map((p) => `${p.url}\n${p.title}\n${p.text.slice(0, 1500)}`).join("\n\n"),
        schema: z.object({ products: z.array(z.object({ name: z.string(), category: z.string() })) }),
      });
      productNames = got?.products.map((p) => p.name) ?? [];
      cats = Object.entries((got?.products ?? []).reduce<Record<string, number>>((m, p) => ((m[p.category] = (m[p.category] ?? 0) + 1), m), {})).map(([name, count]) => ({ name, count }));
    }
  }
  a.categories = cats.sort((x, y) => y.count - x.count).slice(0, 8);
  a.productCount = productNames.length;
  await set("products", productNames.length ? { status: "done", detail: `${productNames.length} products` } : { status: "skipped", detail: "No catalog found" });

  // 4. Identity — palette and type from the site's CSS, checked against the deck's visual rules.
  await set("identity", { status: "running", detail: "Reading colours and type" });
  if (pages[0]) {
    const ev = await styleEvidence(pages[0]);
    const id4 = await ask("iris", {
      effort: "low",
      system: "You are Iris. Pick the brand's real palette and typeface from CSS evidence (colour counts) and the deck's visual rules. Ignore greys used only for borders, and framework defaults.",
      content: `CSS colours by frequency: ${ev.colors.map(([c, n]) => `${c}×${n}`).join(", ")}\nFonts by frequency: ${ev.fonts.map(([f, n]) => `${f}×${n}`).join(", ")}\nDeck visual rules: ${deckRead?.visualRules ?? "none"}`,
      schema: IdentityOut,
    });
    if (id4) { a.palette = id4.palette.slice(0, 4); a.font = id4.font; a.paletteSource = deckRead ? "site CSS · deck" : "site CSS"; }
    await set("identity", id4 ? { status: "done", detail: "palette, type" } : { status: "error", detail: "Couldn’t read the styles" });
  } else {
    await set("identity", { status: "skipped", detail: "No website" });
  }

  // 5. Site structure — what Remy will need to rebuild.
  await set("structure", { status: "running", detail: "Mapping pages" });
  const nav = pages[0]?.links.filter((l) => l.inNav && l.text && new URL(l.href).hostname === pages[0].host).slice(0, 10) ?? [];
  const blogPosts = pages[0]?.links.filter((l) => /\/(blogs?|journal|news|magazine)\//i.test(l.href)).length ?? 0;
  a.pages = [{ label: "Home", meta: "", depth: 0 }];
  for (const l of nav) {
    const p = new URL(l.href).pathname;
    if (p === "/" || a.pages.some((x) => x.label === l.text)) continue;
    const isShop = /\/(collections|shop|products|store)/i.test(p);
    const isBlog = /\/(blogs?|journal|news|magazine)/i.test(p);
    a.pages.push({ label: l.text, meta: isShop && a.productCount ? `${a.productCount} products` : isBlog && blogPosts ? `${blogPosts} posts` : "", depth: 0 });
    if (isShop && a.categories.length > 1) a.pages.push({ label: a.categories.slice(0, 3).map((c) => c.name).join(" · "), meta: "", depth: 1 });
  }
  await set("structure", { status: "done", detail: `${a.pages.length} sections` });

  // 6. Otto checks what's missing before Remy builds.
  await set("missing", { status: "running", detail: "Checking assets" });
  const hasPolicy = pages.some((p) => /refund|return|polic/i.test(p.url));
  const pulled = ob.pulled ?? [];
  const small = pulled.filter((i) => i.w != null && i.w < 1600).length;
  const about = pages.find((p) => /about|story|brand/i.test(new URL(p.url).pathname));
  const assets = (await db.execute(sql`select kind, mime from brand_assets where brand_id = ${id}`)).rows as { kind: string; mime: string }[];
  const hasSvg = assets.some((x) => x.kind === "logo" && x.mime.includes("svg"));
  const facts = { returnPolicyOnSite: hasPolicy, productPhotos: pulled.length, photosUnder1600px: small, aboutPageWords: about ? about.text.split(" ").length : 0, founderStoryInDeck: Boolean(deckRead?.founderStory), logoSvgUploaded: hasSvg, logoFiles: assets.filter((x) => x.kind === "logo").length, deckUploaded: Boolean(deck), platform: ob.scan?.platform ?? null };
  const otto = await ask("otto", {
    system: "You are Otto, Kaviar's QA agent. Before Remy builds the Shopify store, list only what is actually missing or too weak for launch, given these facts. Shopify checkout requires a refund policy. Product photos should be at least 1600px. The header needs a vector (SVG) logo.",
    content: JSON.stringify(facts),
    schema: OttoOut,
  });
  const TITLE: Record<string, [string, ToAdd["action"]]> = {
    logo: ["High-res logo (SVG)", "upload-logo"], policy: ["Return & refund policy", "draft-policy"], photos: [`Product photos ≥ 1600 px`, "upload-imagery"], story: ["Founder story", "add-story"], deck: ["Brand deck", "upload-deck"],
  };
  const fallbackToAdd = [
    !hasSvg && { key: "logo", detail: "Only a PNG logo is uploaded. The header needs a vector." },
    !hasPolicy && { key: "policy", detail: `Not found on ${home?.hostname ?? "the site"}. Shopify checkout requires one.` },
    small > 0 && { key: "photos", detail: `${small} of ${pulled.length} to replace` },
  ].filter(Boolean) as { key: string; detail: string }[];
  a.toAdd = (otto?.toAdd ?? fallbackToAdd).map((t) => ({ key: t.key, title: TITLE[t.key][0], detail: t.detail, action: TITLE[t.key][1] }));
  a.otto = otto?.otto ?? (small ? [{ title: `Replace ${small} small product photos`, action: "Review" as const }] : []);
  await set("missing", { status: "done", detail: `${a.toAdd.length} found` });

  // Iris writes the profile, with where each value came from.
  a.current = "Writing the brand profile";
  await save();
  const b = ob.basics;
  const profile = await ask("iris", {
    effort: "medium",
    system: "You are Iris, Kaviar's brand analyst. Write the brand profile the team will confirm before Remy builds the Shopify store. Each field: the value, where it came from (website, deck, shopify, suggested = your own proposal, entered = typed by the team), and a short provenance note. Prefer the brand's own words. Keep values short (under 30 words). Palette: list the colour names and hexes. Catalog: counts like '12 products · 38 variants · 5 categories'.",
    content: JSON.stringify({
      basics: b, scan: ob.scan && { tagline: ob.scan.tagline, category: ob.scan.category, heroProduct: ob.scan.heroProduct, platform: ob.scan.platform, languages: ob.scan.languages, priceMin: ob.scan.priceMin, priceMax: ob.scan.priceMax },
      deck: deckRead, palette: a.palette, font: a.font, categories: a.categories, products: productNames.slice(0, 40),
      pages: pages.slice(0, 10).map((p) => ({ url: p.url, title: p.title, text: p.text.slice(0, 600) })),
    }),
    schema: ProfileOut,
  });
  if (profile) {
    const prev = ob.profile ?? {};
    const merged: Profile = {};
    for (const [k, v] of Object.entries(profile) as [string, Field][]) merged[k] = prev[k]?.from === "entered" ? prev[k] : { value: v.value, from: v.from, note: v.note || null };
    await patchOnboarding(id, { profile: merged });
  }
  a.finishedAt = now();
  a.current = undefined;
  await patchOnboarding(id, { analysis: a }, 5);
}

/** Iris drafts a return & refund policy the team can edit, from what the site already says. */
export async function draftPolicy(id: string): Promise<string | null> {
  const ob = await readOnboarding(id);
  const [b] = await db.select({ name: schema.brands.name }).from(schema.brands).where(eq(schema.brands.id, id));
  const out = await ask("iris", {
    effort: "low",
    system: "You are Iris. Draft a clear, fair return & refund policy for a skincare/consumer brand's Shopify store. Plain language, short sections, no legal guarantees beyond what's typical. Mark anything the brand must confirm in [brackets].",
    content: JSON.stringify({ brand: b?.name, markets: ob.basics?.markets, currency: ob.basics?.currency, website: ob.basics?.website }),
    schema: z.object({ policy: z.string() }),
  });
  return out?.policy ?? null;
}

export type { Onboarding };
