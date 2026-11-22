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
