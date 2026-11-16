import { describe, expect, it } from "vitest";
import { groupAds, libError, mediaFromSnapshot, samePage, statsOf, type Raw } from "@/lib/research/adlib";

const NOW = Date.parse("2026-11-16T12:00:00Z");
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString().replace(".000Z", "+0000");
const ad = (id: string, body: string, startDaysAgo: number, extra: Partial<Raw> = {}): Raw => ({
  id, page_id: "p1", page_name: "medicube", ad_delivery_start_time: ago(startDaysAgo), ad_creative_bodies: [body], ad_creative_link_titles: ["Booster Pro"],
  publisher_platforms: ["facebook", "instagram"], eu_total_reach: 1000, ...extra,
});

describe("groupAds", () => {
  const raw = [
    ad("1", "Glass skin in 7 days", 10, {
      age_country_gender_reach_breakdown: [{ country: "DE", age_gender_breakdowns: [{ age_range: "25-34", female: 600, male: 100, unknown: 0 }, { age_range: "35-44", female: 200, male: 100, unknown: 0 }] }],
      target_ages: ["25", "65"], target_gender: "Women", target_locations: [{ name: "Germany", excluded: false }, { name: "Berlin", excluded: true }], beneficiary_payers: [{ payer: "APR Corp", beneficiary: "medicube" }],
    }),
    ad("2", "Glass  skin in 7 days!", 45, { publisher_platforms: ["messenger"], eu_total_reach: 500 }),
    ad("3", "PDRN gel mask", 3, { eu_total_reach: undefined }),
  ];
  const g = groupAds(raw, "medicube");
  it("puts ads with the same text into one creative, led by the longest-running ad", () => {
    expect(g).toHaveLength(2);
    expect(g[0].id).toBe("2");
    expect(g[0].copies).toBe(2);
    expect(g[0].ids).toEqual(["2", "1"]);
    expect(g[0].reach).toBe(1500);
    expect(g[0].platforms.sort()).toEqual(["facebook", "instagram", "messenger"]);
  });
  it("keeps Meta's reach breakdown, targeting and payer", () => {
    expect(g[0].audience?.top).toBe("Women 25–34");
    expect(g[0].audience?.topShare).toBeCloseTo(0.6);
    expect(g[0].audience?.women).toBeCloseTo(0.8);
    expect(g[0].countries).toEqual([{ code: "DE", reach: 1000 }]);
    expect(g[1].reach).toBeNull();
  });
  it("counts the numbers per competitor without estimating", () => {
    const s = statsOf(g, NOW);
    expect(s.ads).toBe(3);
    expect(s.creatives).toBe(2);
    expect(s.new30).toBe(1);
    expect(s.longest).toBe(45);
    expect(s.proven).toBe(1);
    expect(s.reach).toBe(1500);
    expect(s.women).toBeCloseTo(0.8);
  });
  it("reads targeting from the longest-running ad", () => {
    const one = groupAds([raw[0]], "medicube")[0];
    expect(one.target).toEqual({ ages: "25–65+", gender: "Women", places: ["Germany"] });
    expect(one.payer).toBe("APR Corp");
  });
});

describe("mediaFromSnapshot", () => {
  it("finds a video's cover in the snapshot's data", () => {
    const html = `<script>{"snapshot":{"page_profile_picture_url":"https:\\/\\/scontent.xx.fbcdn.net\\/p60x60\\/a.jpg","videos":[{"video_hd_url":"https:\\/\\/video.xx.fbcdn.net\\/v.mp4","video_preview_image_url":"https:\\/\\/scontent.xx.fbcdn.net\\/v\\/poster.jpg?stp=dst-jpg\\u00261=2"}]}}</script>`;
    expect(mediaFromSnapshot(html)).toEqual({ kind: "video", url: "https://scontent.xx.fbcdn.net/v/poster.jpg?stp=dst-jpg&1=2", n: 1 });
  });
  it("tells a carousel from a single image", () => {
    const html = `"cards":[{"original_image_url":"https:\\/\\/scontent.x\\/1.jpg","resized_image_url":"https:\\/\\/scontent.x\\/1s.jpg"},{"original_image_url":"https:\\/\\/scontent.x\\/2.jpg"}]`;
    expect(mediaFromSnapshot(html)).toEqual({ kind: "carousel", url: "https://scontent.x/1.jpg", n: 2 });
  });
  it("falls back to the page's own tags and skips the profile picture", () => {
    const html = `<img src="https://scontent.xx.fbcdn.net/v/t39/s60x60/pic.jpg"><img class="x" src="https://scontent.xx.fbcdn.net/v/t45/ad.jpg?a=1&amp;b=2">`;
    expect(mediaFromSnapshot(html)).toEqual({ kind: "image", url: "https://scontent.xx.fbcdn.net/v/t45/ad.jpg?a=1&b=2", n: 1 });
    expect(mediaFromSnapshot("<html>Log in</html>")).toBeNull();
  });
});

describe("Ad Library helpers", () => {
  it("matches a competitor's own Pages, not creators who mention them", () => {
    expect(samePage("medicube Global", "Medicube")).toBe(true);
    expect(samePage("Lavendersloveee", "Medicube")).toBe(false);
  });
  it("turns Meta's refusals into what to do", () => {
    expect(libError(new Error("Meta API: Application does not have permission for this action (10)")).blocked).toBe("identity");
    expect(libError(new Error("Meta API: (#613) Calls to this api have exceeded the rate limit. (613)")).blocked).toBe("limit");
    expect(libError(new Error("Meta API: Invalid parameter (100)")).blocked).toBeUndefined();
  });
});
