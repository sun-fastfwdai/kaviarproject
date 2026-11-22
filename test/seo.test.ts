import { describe, expect, it } from "vitest";
import { blockedBots, check, fit, productFacts, score, type ProductRead } from "@/lib/seo/types";

const product = (over: Partial<ProductRead> = {}): ProductRead => ({
  id: "gid://shopify/Product/11", title: "Marine Toner 300ml", handle: "marine-toner", onlineStoreUrl: "https://x.com/products/marine-toner",
  description: Array.from({ length: 80 }, (_, i) => `word${i}`).join(" "), seo: { title: "Marine Toner 300ml — hydrating toner for oily skin", description: "A light, alcohol-free toner with sea minerals that calms oily, acne-prone skin and preps it for the rest of your routine." },
  media: { nodes: [{ id: "gid://shopify/MediaImage/5", alt: "Marine Toner bottle on a white shelf", image: { url: "https://cdn/x.jpg" } }] }, ...over,
});

describe("store checks", () => {
  it("finds nothing on a product that is filled in", () => expect(check(product())).toEqual([]));

  it("flags each empty field once, keyed by product and picture", () => {
    const found = check(product({ seo: { title: null, description: "  " }, description: "Short.", media: { nodes: [{ id: "gid://shopify/MediaImage/5", alt: "", image: { url: "u" } }, { id: "gid://shopify/MediaImage/6", alt: null, image: { url: "v" } }, {}] } }));
    expect(found.map((f) => f.key).sort()).toEqual(["alt:11:5", "alt:11:6", "search_description:11", "search_title:11", "thin:11"]);
    expect(found.find((f) => f.kind === "alt")?.before).toBe("");
  });

  it("flags text Google would cut, and keeps what is there as the 'before'", () => {
    const long = "x".repeat(200);
    const [t, d] = check(product({ seo: { title: long, description: long } }));
    expect(t.before).toBe(long);
    expect(t.problem).toContain("200 letters");
    expect(d.kind).toBe("search_description");
  });

  it("cuts a replacement at a word, inside the limit", () => {
    const out = fit("Hydrating toner for oily and acne-prone skin with sea minerals and niacinamide", 60);
    expect(out.length).toBeLessThanOrEqual(60);
    expect("Hydrating toner for oily and acne-prone skin with sea minerals and niacinamide".startsWith(out)).toBe(true);
    expect(out.endsWith(" ")).toBe(false);
  });
});

describe("robots.txt", () => {
  it("names the AI crawlers a store shuts out", () => {
    expect(blockedBots("User-agent: *\nDisallow: /admin\n\nUser-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n")).toEqual(["ChatGPT", "Claude"]);
  });
  it("treats a blanket block as blocking all of them, and a normal Shopify file as open", () => {
    expect(blockedBots("User-agent: *\nDisallow: /")).toHaveLength(5);
    expect(blockedBots("# we use Shopify\nUser-agent: *\nDisallow: /cart\nDisallow: /checkout\nSitemap: https://x.com/sitemap.xml")).toEqual([]);
  });
});

describe("product facts on a page", () => {
  it("reads price and rating from JSON-LD, also inside @graph", () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":"Product","name":"x","offers":{"price":"19"},"aggregateRating":{"ratingValue":4.8}}]}</script>`;
    expect(productFacts(html)).toEqual({ found: true, price: true, reviews: true });
  });
  it("says so when there is none, and survives a broken block", () => {
    expect(productFacts(`<script type="application/ld+json">{oops</script><p>hi</p>`)).toEqual({ found: false, price: false, reviews: false });
    expect(productFacts(`<script type='application/ld+json'>{"@type":["Product"],"name":"x"}</script>`)).toEqual({ found: true, price: false, reviews: false });
  });
});

describe("score", () => {
  it("counts only the store-wide checks that could be read", () => {
    const part = { ok: 1, total: 2 };
    expect(score({ at: "", domain: null, products: 2, pictures: 2, title: part, description: part, alt: part, text: part,
      site: [{ key: "open", name: "", ok: true, detail: "" }, { key: "ai", name: "", ok: false, detail: "" }, { key: "facts", name: "", ok: null, detail: "" }] })).toEqual({ ok: 5, total: 10 });
  });
});

import { readGoogle, speedChecks, weigh } from "@/lib/seo/speed-rules";
import { scores } from "@/lib/seo/types";

describe("speed: what a page loads", () => {
  const html = `<html><head>
    <script src="/cdn/shop/t/1/assets/theme.js" defer></script>
    <script src="https://cdn.shopify.com/extensions/abc/reviews.js"></script>
    <script src="https://static.klaviyo.com/onsite/js/klaviyo.js" async></script>
    <script src="//widget.trustpilot.com/boot.js"></script>
    <script type="application/json">{"a":1}</script>
    <script>inline()</script>
  </head><body>
    <img src="a.jpg" width="10" height="10"><img src="b.jpg" loading="lazy">
    <img src="c.jpg" loading="lazy" width="1" height="1"><img src="d.jpg"><img src="data:image/gif;base64,AA">
    <script src="https://www.googletagmanager.com/gtm.js"></script>
  </body></html>`;
  const w = weigh(html, "https://shop.example.com/products/x");

  it("counts files, outside services and app add-ons", () => {
    expect(w.scripts).toHaveLength(5);
    expect(w.outside).toEqual(["googletagmanager.com", "klaviyo.com", "trustpilot.com"]);
    expect(w.addOns).toBe(1);
  });
  it("counts only head scripts that really hold the page back", () => expect(w.blocking).toBe(2)); // the app add-on and trustpilot: no async, no defer
  it("leaves the first two pictures alone, and counts the rest that load early or have no size", () => {
    expect(w.pictures).toBe(4);
    expect(w.notLazy).toBe(1); // d.jpg
    expect(w.unsized).toBe(2); // b.jpg and d.jpg
    expect(w.loose).toEqual(["b.jpg — in “Page”", "d.jpg — in “Page”"]);
  });
  it("on a Shopify page, treats the header and the first part of the page as the first view and names where each late picture sits", () => {
    const page = `<body><header id="shopify-section-sections--9__header"><img src="logo.png" width="1" height="1"></header><main>
      <div id="shopify-section-template--16__hero_NFJLVz"><img src="/a/hero.jpg?v=1" width="1" height="1"><img src="icon.svg" width="1" height="1"></div>
      <div id="shopify-section-template--16__media_with_content_MUN3P3"><img src="poster.jpg"><img src="ok.jpg" loading="lazy" width="1" height="1">
        <video playsinline><source src="v.mp4"><img src="never-loaded.thumbnail.jpg"></video><noscript><img src="noscript.jpg"></noscript></div>
      </main><footer id="shopify-section-sections--9__footer"><img src="logowhite.png" width="2" height="2"></footer></body>`;
    const x = weigh(page, "https://shop.example.com/");
    expect(x.early).toEqual(["poster.jpg — in “Media with content”", "logowhite.png — in “Footer”"]);
    expect(x.loose).toEqual(["poster.jpg — in “Media with content”"]);
    expect(speedChecks(x, { answerMs: null, scriptBytes: null }).find((c) => c.key === "lazy")?.items).toHaveLength(2);
  });
  it("turns a measurement into a check with the number beside it", () => {
    const checks = speedChecks(w, { answerMs: 1400, scriptBytes: 1_250_000 });
    expect(checks.find((c) => c.key === "answer")).toMatchObject({ ok: false, value: "1.4 s" });
    expect(checks.find((c) => c.key === "scripts")).toMatchObject({ ok: false, value: "1.3 MB · 5 files" });
    expect(checks.find((c) => c.key === "apps")).toMatchObject({ ok: true, value: "4 services" });
    expect(speedChecks(w, { answerMs: null, scriptBytes: null }).map((c) => c.key)).toEqual(["apps", "blocking", "lazy", "sized"]);
  });
});

describe("speed: Google's answer", () => {
  it("reads the score, the timings, real-shopper data and the biggest savings in plain words", () => {
    const v = readGoogle({
      lighthouseResult: { categories: { performance: { score: 0.43 } }, audits: {
        "largest-contentful-paint": { score: 0.2, numericValue: 6100 }, "cumulative-layout-shift": { score: 1, numericValue: 0.02 }, "total-blocking-time": { score: 0.3, numericValue: 640 },
        "unused-javascript": { title: "Reduce unused JavaScript", score: 0, details: { overallSavingsMs: 1800 } },
        "legacy-javascript": { title: "Avoid legacy JavaScript", score: 0.5, details: { overallSavingsMs: 300 } },
        "render-blocking-resources": { title: "Eliminate render-blocking resources", score: 0.4, metricSavings: { LCP: 900, FCP: 700 } },
        "some-new-audit": { title: "A new thing", score: 0.1, details: { overallSavingsMs: 150 } },
        "uses-text-compression": { title: "Enable text compression", score: 1, details: { overallSavingsMs: 5000 } },
      } },
      loadingExperience: { overall_category: "SLOW", metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 4300 }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 12 } } },
    })!;
    expect(v).toMatchObject({ score: 43, lcp: 6100, cls: 0.02, tbt: 640, real: { verdict: "SLOW", lcp: 4300, cls: 0.12, inp: null } });
    expect(v.slows.map((s) => [s.name, s.saves])).toEqual([["Code that loads but isn’t needed", 1800], ["Files that hold the page back before anything shows", 900], ["A new thing", 150]]);
  });
  it("gives no score rather than a wrong one when the answer isn't what was expected", () => {
    expect(readGoogle({ error: { code: 429 } })).toBeNull();
    expect(readGoogle(null)).toBeNull();
  });
});

describe("the three scores", () => {
  const audit = (over = {}) => ({ at: "", domain: null, products: 10, pictures: 20, title: { ok: 5, total: 10 }, description: { ok: 10, total: 10 }, alt: { ok: 0, total: 20 }, text: { ok: 10, total: 10 },
    site: [{ key: "open" as const, name: "", ok: true, detail: "" }, { key: "home" as const, name: "", ok: true, detail: "" }, { key: "reviews" as const, name: "", ok: false, detail: "" },
      { key: "ai" as const, name: "", ok: true, detail: "" }, { key: "facts" as const, name: "", ok: null, detail: "" }], ...over });
  it("weighs each group of checks the same, and leaves out what couldn't be read", () => {
    const s = scores(audit());
    expect(s.seo).toBe(54); // titles 50%, descriptions 100%, pictures 0%, store checks 2 of 3
    expect(s.ai).toBe(100); // descriptions, page text, and the two store checks that could be read
    expect(s).toMatchObject({ speed: null, overall: 77 });
  });
  it("counts speed in the overall score only when it is Google's number", () => {
    const check = (ok: boolean) => ({ key: "apps" as const, name: "", ok, value: "", detail: "" });
    const page = (google: number | null) => ({ key: "home" as const, name: "", url: "", checks: [check(true), check(false)], google: google == null ? null : { score: google, lcp: null, cls: null, tbt: null, real: null, slows: [] } });
    expect(scores(audit({ speed: { google: "off", pages: [page(null)] } }))).toMatchObject({ speed: null, overall: 77, speedChecks: { ok: 1, total: 2 } });
    expect(scores(audit({ speed: { google: "on", pages: [page(40), page(60)] } }))).toMatchObject({ speed: 50, overall: 68 });
  });
});
