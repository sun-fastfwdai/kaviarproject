import { describe, expect, it } from "vitest";
import { cleanUrl, compare, guessSites, isSiteOf, measure, metaContent, pageOk, pageTitle, pointOf, productLinks, readPage, show, sitemapLocs, stand, valuesOf, type Bench, type SiteRead } from "@/lib/seo/bench-rules";
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

describe("reading a public page", () => {
  const page = `<html><head><title>Marine Toner &amp; Mist – Acme</title><meta content="A light toner with sea minerals that calms oily skin and preps it for the rest of the routine." name="description"><meta property="og:site_name" content="Acme Skin"></head>
    <body><header><img src="/logo.png" alt=""></header><main><img src="/a.jpg" alt="Toner bottle" width="800"><img src="/b.jpg" width="800"><img src="/icon.png" alt="" width="16"><img src="data:image/gif;base64,x">
    <noscript><img src="/c.jpg"></noscript><p>${"word ".repeat(160)}</p><script>var x = "<img src='/d.jpg'>";</script></main><footer><img src="/f.jpg"></footer></body></html>`;
  it("reads the title and the description whichever way round the tag is written", () => {
    expect(pageTitle(page)).toBe("Marine Toner & Mist – Acme");
    expect(metaContent(page, "description")).toMatch(/^A light toner/);
    expect(metaContent(page, "og:site_name")).toBe("Acme Skin");
  });
  it("counts only the pictures a shopper sees in the page itself, and which of them say what they show", () => {
    const p = readPage(page);
    expect([p.pictures, p.described]).toEqual([2, 1]); // not the logo, the footer, the 16px icon, the inline one, the fall-back or the one inside a script
    expect(p.words).toBeGreaterThanOrEqual(160);
    expect(pageOk(p)).toEqual({ title: true, description: true, text: true });
  });
  it("fails a page with no description, a title Google would cut, or too little to quote", () => {
    expect(pageOk({ title: "x".repeat(90), description: "", pictures: 0, described: 0, words: 20 })).toEqual({ title: false, description: false, text: false });
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
    const c = compare(b), row = (k: string) => c.rows.find((r) => r.m.key === k)!;
    expect(c.rivals.map((r) => r.name)).toEqual(["a", "b", "c"]);
    expect(row("reviews").s).toMatchObject({ you: 0, verdict: "behind", n: 2 });
    expect(row("description").each).toEqual([33, 100, null]);
    expect(row("apps").s.verdict).toBe("level");
    expect(pointOf(b)).toMatchObject({ you: { speed: 75 }, avg: { speed: 75 } });
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
