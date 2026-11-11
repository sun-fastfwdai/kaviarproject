import { describe, expect, it } from "vitest";
import { attribute } from "@/lib/sync/attribution";
import { mapLine, mapOrder, recordType } from "@/lib/shopify/map";
import { budget, dateWindows, mapInsight, purchaseMetric } from "@/lib/meta/map";

describe("attribution", () => {
  it("proves a paid Meta click from tagged UTMs and pulls the ids", () => {
    const a = attribute({ utm: { source: "facebook", medium: "paid", campaign: "120211234567", content: "120219876543" } });
    expect(a.channel).toBe("meta");
    expect(a.metaCampaignId).toBe("120211234567");
    expect(a.metaAdId).toBe("120219876543");
  });
  it("keeps organic Instagram out of Meta ads", () => {
    expect(attribute({ utm: { source: "instagram", medium: "social" } }).channel).toBe("other");
  });
  it("reads UTMs from the landing page when Shopify has no utmParameters", () => {
    const a = attribute({ landingPage: "https://jmella.com/products/q5?utm_source=ig&utm_medium=paid&utm_campaign=Win-back" });
    expect(a.channel).toBe("meta");
    expect(a.metaCampaignId).toBeNull();
    expect(a.utm.campaign).toBe("Win-back");
  });
  it("classifies email, google and direct", () => {
    expect(attribute({ utm: { source: "klaviyo", medium: "email" } }).channel).toBe("email");
    expect(attribute({ referrerUrl: "https://www.google.com/" }).channel).toBe("google");
    expect(attribute({}).channel).toBe("direct");
    expect(attribute(null, null).channel).toBe("direct");
  });
  it("falls back to the first visit when the last one is empty", () => {
    expect(attribute({}, { utm: { source: "fb", medium: "cpc" } }).channel).toBe("meta");
  });
});

describe("shopify bulk records", () => {
  it("maps an order and its line via __parentId", () => {
    const order = {
      id: "gid://shopify/Order/5001", name: "#1001", createdAt: "2026-11-07T14:22:00Z", test: false, currencyCode: "USD",
      totalPriceSet: { shopMoney: { amount: "48.00" } }, totalRefundedSet: { shopMoney: { amount: "0.0" } },
      customer: { id: "gid://shopify/Customer/77" }, discountCodes: ["WELCOME10"],
      customerJourneySummary: { lastVisit: { landingPage: "https://x.com/?utm_source=facebook&utm_medium=paid&utm_content=1202111", utmParameters: null } },
    };
    expect(recordType(order)).toBe("Order");
    const o = mapOrder("b", order);
    expect(o).toMatchObject({ id: 5001, total: 48, customerId: 77, channel: "meta", metaAdId: "1202111", discountCodes: ["WELCOME10"] });
    const l = mapLine("b", { id: "gid://shopify/LineItem/9", __parentId: "gid://shopify/Order/5001", title: "Queen 5", quantity: 2, product: { id: "gid://shopify/Product/3" } });
    expect(l).toMatchObject({ orderId: 5001, productId: 3, quantity: 2 });
  });
});

describe("meta", () => {
  it("prefers omni_purchase and never double counts", () => {
    expect(purchaseMetric([{ action_type: "purchase", value: "3" }, { action_type: "omni_purchase", value: "4" }])).toBe(4);
    expect(purchaseMetric(undefined)).toBe(0);
  });
  it("converts budgets by currency offset", () => {
    expect(budget("14000", "USD")).toBe(140);
    expect(budget("50000", "KRW")).toBe(50000);
    expect(budget("0", "USD")).toBeNull();
  });
  it("maps an insights row", () => {
    const r = mapInsight("b", { ad_id: "1", date_start: "2026-11-01", spend: "12.5", impressions: "1000", inline_link_clicks: "20", action_values: [{ action_type: "omni_purchase", value: "96" }] });
    expect(r).toMatchObject({ spend: 12.5, impressions: 1000, clicks: 20, purchases: 0, purchaseValue: 96 });
  });
  it("splits date ranges into windows", () => {
    const w = dateWindows("2026-01-01", "2026-03-01", 30);
    expect(w[0]).toEqual({ since: "2026-01-01", until: "2026-01-30" });
    expect(w.at(-1)?.until).toBe("2026-03-01");
    expect(w.length).toBe(2);
  });
});
