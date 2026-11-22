import { describe, expect, it } from "vitest";
import { adSetParams, countryFor, creativeParams, ctaType, problem } from "../src/lib/meta/place-rules";

describe("placing ads on Meta", () => {
  it("the ad set carries no budget or bid — the campaign does — and counts purchases", () => {
    const p = adSetParams({ name: "Black Friday · United States", campaignId: "123", pixelId: "999", country: "us" });
    expect(p.campaign_id).toBe("123");
    expect(p.daily_budget).toBeUndefined();
    expect(p.bid_strategy).toBeUndefined();
    expect(p.status).toBeUndefined(); // set by the caller, from the campaign's own state
    expect(JSON.parse(p.promoted_object)).toEqual({ pixel_id: "999", custom_event_type: "PURCHASE" });
    expect(JSON.parse(p.targeting).geo_locations.countries).toEqual(["US"]);
    expect(p.optimization_goal).toBe("OFFSITE_CONVERSIONS");
    expect(p.billing_event).toBe("IMPRESSIONS");
  });
  it("the creative is a link ad from the brand's Page, with the tags that tie orders back to it", () => {
    const c = creativeParams({ name: "Why I added this toner", pageId: "55", hash: "abc", urlTags: "utm_source=facebook", copy: { text: "Calm, not stripped.", headline: "Why I added this toner", link: "https://shop.example/products/toner", cta: "Shop now" } });
    const spec = JSON.parse(c.object_story_spec);
    expect(spec.page_id).toBe("55");
    expect(spec.link_data).toMatchObject({ image_hash: "abc", link: "https://shop.example/products/toner", message: "Calm, not stripped.", name: "Why I added this toner" });
    expect(spec.link_data.call_to_action).toEqual({ type: "SHOP_NOW", value: { link: "https://shop.example/products/toner" } });
    expect(c.url_tags).toBe("utm_source=facebook");
  });
  it("turns Remy's button words into Meta's", () => {
    expect(ctaType("Shop now")).toBe("SHOP_NOW");
    expect(ctaType("Order now")).toBe("ORDER_NOW");
    expect(ctaType("Learn more")).toBe("LEARN_MORE");
    expect(ctaType("Get the offer")).toBe("GET_OFFER");
    expect(ctaType("Treat yourself")).toBe("SHOP_NOW");
  });
  it("picks the country from the researched market, then the store's currency", () => {
    expect(countryFor("GB", "USD")).toBe("GB");
    expect(countryFor("Worldwide", "CAD")).toBe("CA");
    expect(countryFor(null, "EUR")).toBe("US");
  });
  it("says a Page-permission refusal in plain words and keeps Meta's own words otherwise", () => {
    expect(problem(new Error("Meta API: (#200) Requires pages_manage_ads permission (200)"))).toMatch(/Page permission/);
    expect(problem(new Error("Meta API: Invalid parameter (100)"))).toBe("Invalid parameter (100)");
  });
});
