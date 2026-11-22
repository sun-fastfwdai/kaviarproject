import { describe, expect, it } from "vitest";
import { cleanUrl, compare, fileKey, guessSites, isSiteOf, measure, metaContent, pageOk, pageTitle, pointOf, productLinks, productList, readPage, show, sitemapLocs, stand, titleBase, valuesOf, type Bench, type SiteRead } from "@/lib/seo/bench-rules";
import type { Audit } from "@/lib/seo/types";

const audit = (over: Partial<Audit> = {}): Audit => ({
  at: "2026-11-22T00:00:00Z", domain: "https://x.com", products: 3, pictures: 10,
  title: { ok: 3, total: 3 }, description: { ok: 3, total: 3 }, alt: { ok: 10, total: 10 }, text: { ok: 3, total: 3 },
  site: [{ key: "open", name: "", ok: true, detail: "" }, { key: "home", name: "", ok: true, detail: "" }, { key: "ai", name: "", ok: true, detail: "" }, { key: "facts", name: "", ok: true, detail: "" }, { key: "reviews", name: "", ok: true, detail: "" }],
  speed: { google: "off", pages: [{ key: "home", name: "Home", url: "https://x.com", google: null, checks: [
    { key: "answer", name: "", ok: true, value: "", raw: 300, detail: "" }, { key: "scripts", name: "", ok: true, value: "", raw: 200_000, detail: "" }, { key: "apps", name: "", ok: true, value: "", raw: 4, detail: "" }, { key: "blocking", name: "", ok: false, value: "", raw: 6, detail: "" }] }] },
  ...over,
});
const site = (name: string, a: Audit | null, you = false): SiteRead => ({ name, url: `https://${name}.com`, you, at: "2026-11-22T00:00:00Z", audit: a, ...(a ? {} : { note: "Didn’t answer" }) });

describe("reading a public page by the store's own rules", () => {
  const text = "A light toner with sea minerals. " + "word ".repeat(60);
  const page = (o: { title?: string; desc?: string; alts?: [string, string] } = {}) => `<html><head><title>${o.title ?? "Sea-mineral toner for oily skin &amp; breakouts – Acme Skin"}</title>
    <meta content="${o.desc ?? "A light, alcohol-free toner with sea minerals that calms oily, acne-prone skin and preps it for the rest of the routine."}" name="description"><meta property="og:site_name" content="Acme Skin">
    <script type="application/ld+json">{"@type":"Product","name":"Marine Toner","description":"${text}","image":["https://cdn.x/files/toner.jpg","https://cdn.x/files/toner-back.jpg"],"offers":{"price":"30"}}</script></head>
    <body><header><img src="/logo.png" alt=""></header><main>
      <img src="//acme.com/cdn/shop/files/toner.jpg?v=1&width=800" alt="${o.alts?.[0] ?? "Marine Toner bottle on a white shelf"}"><img src="//acme.com/cdn/shop/files/toner_200x.jpg" alt="">
      <img srcset="//acme.com/cdn/shop/files/toner-back.jpg?width=400 400w, //acme.com/cdn/shop/files/toner-back.jpg?width=800 800w" alt="${o.alts?.[1] ?? "Marine Toner"}">
      <img src="/cdn/shop/files/payment-icons.png"><p>${"filler ".repeat(200)}</p></main></body></html>`;
  it("reads the title and the description whichever way round the tag is written", () => {
    expect(pageTitle(page())).toBe("Sea-mineral toner for oily skin & breakouts – Acme Skin");
    expect(metaContent(page(), "description")).toMatch(/^A light, alcohol-free toner/);
    expect(metaContent(page(), "og:site_name")).toBe("Acme Skin");
  });
  it("judges the title without the store's name on it, and only if it was written on purpose", () => {
    expect(titleBase("Sea-mineral toner – Acme Skin", "Acme Skin")).toBe("Sea-mineral toner");
    expect(titleBase("Acme Skin | Sea-mineral toner", "Acme Skin")).toBe("Sea-mineral toner");
    expect(titleBase("Cellinol-5 Duo Set PERCENT SCIENCE", "PERCENT SCIENCE")).toBe("Cellinol-5 Duo Set");
    expect(titleBase("Acme Skin", "Acme Skin")).toBe("Acme Skin");
    expect(pageOk(readPage(page())).title).toBe(true);
    expect(pageOk(readPage(page({ title: "Marine Toner – Acme Skin" }))).title).toBe(false); // just the product's name: nobody wrote it
    expect(pageOk(readPage(page({ title: `${"A very long search title ".repeat(4)}– Acme Skin` }))).title).toBe(false);
    expect(pageOk(readPage(page({ title: `${"x".repeat(62)} – Acme Skin` }))).title).toBe(true); // the store's name doesn't count against the length
  });
  it("counts a description only if it was written, not lifted from the start of the product text", () => {
    expect(pageOk(readPage(page())).description).toBe(true);
    expect(pageOk(readPage(page({ desc: "A light toner with sea minerals. word word word word word word word word word word word word" }))).description).toBe(false);
    expect(pageOk(readPage(page({ desc: "Too short." }))).description).toBe(false);
    expect(pageOk(readPage(page({ desc: "x".repeat(200) }))).description).toBe(false);
  });
  it("counts the product's own pictures once each, and a description only if it says more than the product's name", () => {
    const p = readPage(page());
    expect([p.pictures, p.described]).toEqual([2, 1]); // the logo and payment icons aren't the product's; "Marine Toner" alone is what a theme prints when nothing was written
    expect(readPage(page({ alts: ["", "Back of the bottle with the ingredient list"] })).described).toBe(1);
    expect(fileKey("https://cdn.shopify.com/s/files/1/01/files/Toner_800x.JPG?v=3")).toBe("toner.jpg");
    expect(readPage("<html><title>x</title><main><img src='/a.jpg' alt='a'></main></html>")).toMatchObject({ pictures: null, described: null }); // the site doesn't say which pictures are the product's
  });
  it("counts the words about the product, as the store's own check does", () => {
    expect(readPage(page()).words).toBe(66);
    expect(pageOk(readPage(page())).text).toBe(true);
    expect(pageOk(readPage(page(), { text: "Short." })).text).toBe(false);
  });
  it("takes the products to read from a store's public list, the ones the home page shows first", () => {
    const list = { products: [{ handle: "a", title: "A", body_html: "<p>About A</p>", images: [{ src: "https://c/a.jpg" }] }, { handle: "b", title: "B &amp; C", body_html: null, images: [] }, { handle: "c", title: "C" }, { title: "no handle" }] };
    expect(productList(list, "https://x.com", ["https://x.com/products/c"], 2)).toEqual([{ url: "https://x.com/products/c", name: "C", text: "", images: [] }, { url: "https://x.com/products/a", name: "A", text: "About A", images: ["https://c/a.jpg"] }]);
    expect(productList({ nope: 1 }, "https://x.com")).toEqual([]);
  });
});

describe("finding the pages and the site", () => {
  it("takes each product page once, on the same site only", () => {
    const home = `<a href="/products/toner">a</a><a class="x" href="/collections/all/products/toner?variant=1">b</a><a href="https://other.com/products/z">c</a><a href="/products/serum/">d</a><a href="/collections/all">e</a><a href="/products/all">f</a>`;
    expect(productLinks(home, "https://www.acme.com/")).toEqual(["https://www.acme.com/products/toner", "https://www.acme.com/products/serum"]);
  });
  it("reads a sitemap's addresses", () => expect(sitemapLocs("<urlset><url><loc> https://a.com/products/x </loc></url><url><loc>https://a.com/p?a=1&amp;b=2</loc></url></urlset>")).toEqual(["https://a.com/products/x", "https://a.com/p?a=1&b=2"]));
  it("guesses a competitor's address from the research's own sources first, and only trusts a page that names the brand", () => {
    expect(guessSites("Glow Recipe", ["https://www.sephora.com/brand/glow-recipe", "https://www.glowrecipe.com/pages/about"])).toEqual(["https://www.glowrecipe.com"]);
    expect(guessSites("AB", [])).toEqual([]);
    expect(isSiteOf("<title>Glow Recipe | Fruit-powered skincare</title>", "Glow Recipe")).toBe(true);
    expect(isSiteOf("<title>Domain for sale</title>", "Glow Recipe")).toBe(false);
  });
  it("cleans what a person types into an address", () => {
    expect(cleanUrl("acme.com/products/x")).toBe("https://acme.com");
    expect(cleanUrl(" http://www.acme.co.uk ")).toBe("http://www.acme.co.uk");
    expect(cleanUrl("acme")).toBeNull();
  });
});

describe("standing against competitors", () => {
  it("is ahead, average or behind by a margin — never on a hair", () => {
    const seo = measure("seo"), code = measure("code"), stars = measure("reviews");
    expect(stand(seo, 90, [70, 80]).verdict).toBe("ahead");
    expect(stand(seo, 78, [70, 80]).verdict).toBe("level");
    expect(stand(seo, 60, [70, 80, null]).verdict).toBe("behind");
    expect(stand(code, 900_000, [300_000, 500_000]).verdict).toBe("behind"); // lower is better
    expect(stand(code, 200_000, [300_000, 500_000]).verdict).toBe("ahead");
    expect(stand(stars, 0, [1, 1, 0]).verdict).toBe("behind");
    expect(stand(stars, 1, [1, 1, 0]).verdict).toBe("level");
    expect(stand(stars, 1, [0, 0, 1]).verdict).toBe("ahead");
  });
  it("says nothing when no competitor could be measured, or the brand itself couldn't", () => {
    expect(stand(measure("seo"), 90, [null, null])).toMatchObject({ verdict: null, avg: null, n: 0 });
    expect(stand(measure("seo"), null, [70])).toMatchObject({ verdict: null, avg: 70 });
  });
  it("gives no SEO or AI score to a site whose product pages couldn't be opened", () => {
    const v = valuesOf(audit({ products: 0, pictures: 0, title: { ok: 0, total: 0 }, description: { ok: 0, total: 0 }, alt: { ok: 0, total: 0 }, text: { ok: 0, total: 0 } }));
    expect([v.seo, v.ai, v.title]).toEqual([null, null, null]);
    expect(v.answer).toBe(300); // what the home page showed still counts
  });
  it("lines every site up on the same measures and keeps the headline numbers of each read", () => {
    const b: Bench = { at: "2026-11-22T00:00:00Z", sites: [
      site("you", audit({ site: audit().site.map((c) => (c.key === "reviews" ? { ...c, ok: false } : c)) }), true),
      site("a", audit({ description: { ok: 1, total: 3 } })), site("b", audit()), site("c", null)] };
    const mine = b.sites[0].audit, c = compare(b, mine), row = (k: string) => c.rows.find((r) => r.m.key === k)!;
    expect(c.rivals.map((r) => r.name)).toEqual(["a", "b", "c"]);
    expect(row("reviews").s).toMatchObject({ you: 0, verdict: "behind", n: 2 });
    expect(row("description").each).toEqual([33, 100, null]);
    expect(row("apps").s.verdict).toBe("level");
    expect(pointOf(b, mine)).toMatchObject({ you: { speed: 75 }, avg: { speed: 75 } });
    expect(compare(b, null).rows.every((r) => r.s.verdict == null)).toBe(true); // without the brand's own store check there is nothing to stand against
  });
  it("uses the brand's own store check for its side, so its numbers are the Store screen's numbers", () => {
    const own = audit({ title: { ok: 20, total: 25 }, products: 25 }), b: Bench = { at: "2026-11-22T00:00:00Z", sites: [site("stale-self", audit(), true), site("a", audit())] };
    const c = compare(b, own);
    expect(c.rivals.map((r) => r.name)).toEqual(["a"]); // an older read of the brand's own site is ignored
    expect(c.rows.find((r) => r.m.key === "title")!.s.you).toBe(80);
    expect(valuesOf(audit({ speed: { google: "off", pages: [{ key: "home", name: "", url: "", google: null, checks: [{ key: "answer", name: "", ok: true, value: "", n: "1.8 s", detail: "" }, { key: "scripts", name: "", ok: true, value: "", n: "32 KB", detail: "" }, { key: "apps", name: "", ok: true, value: "", n: "3", detail: "" }] }] } }))).toMatchObject({ answer: 1800, code: 32000, apps: 3 }); // saved before the plain number was kept
  });
  it("writes each kind of number the way a person reads it", () => {
    expect(show(measure("answer"), 426)).toBe("426 ms");
    expect(show(measure("answer"), 1840)).toBe("1.8 s");
    expect(show(measure("code"), 676_000)).toBe("676 KB");
    expect(show(measure("reviews"), 1)).toBe("Yes");
    expect(show(measure("title"), 66.6)).toBe("67%");
    expect(show(measure("seo"), null)).toBe("–");
  });
});
