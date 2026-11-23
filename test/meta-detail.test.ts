import { describe, expect, it } from "vitest";
import { mapCreative, mapDetail } from "../src/lib/meta/map";

describe("the ad as it ran on Meta", () => {
  it("reads a link ad's words, picture, button and link", () => {
    const c = mapCreative({ thumbnail_url: "https://t/x.jpg", object_story_spec: { link_data: { message: "Calm, not stripped.", name: "Why I added this toner", description: "300ml", picture: "https://p/x.jpg", link: "https://shop/products/toner", call_to_action: { type: "SHOP_NOW" } } } });
    expect(c).toEqual({ kind: "image", body: "Calm, not stripped.", title: "Why I added this toner", description: "300ml", cta: "SHOP_NOW", image: "https://p/x.jpg", videoId: null, link: "https://shop/products/toner" });
  });
  it("knows a video and a carousel", () => {
    expect(mapCreative({ object_story_spec: { video_data: { message: "Watch", title: "See it", video_id: "99", image_url: "https://v/x.jpg", call_to_action: { type: "LEARN_MORE", value: { link: "https://shop" } } } } })).toMatchObject({ kind: "video", videoId: "99", link: "https://shop", cta: "LEARN_MORE" });
    expect(mapCreative({ object_story_spec: { link_data: { message: "Three", picture: "https://p", child_attachments: [{}, {}, {}] } } })).toMatchObject({ kind: "carousel", cards: 3 });
  });
  it("falls back to the asset feed of an ad Meta assembles itself, and is null when there is nothing to show", () => {
    expect(mapCreative({ asset_feed_spec: { bodies: [{ text: "Body" }], titles: [{ text: "Title" }], images: [{ url: "https://i" }], link_urls: [{ website_url: "https://shop" }] } })).toMatchObject({ body: "Body", title: "Title", image: "https://i", link: "https://shop" });
    expect(mapCreative({})).toBeNull();
    expect(mapCreative(undefined)).toBeNull();
  });
});

describe("an ad's results in slices", () => {
  const w = { since: "2026-10-25", until: "2026-11-23" };
  const d = mapDetail(
    [{ ad_id: "1", impressions: "3000", reach: "1200", frequency: "2.5", video_play_actions: [{ action_type: "video_view", value: "900" }], video_p25_watched_actions: [{ action_type: "video_view", value: "600" }], video_p100_watched_actions: [{ action_type: "video_view", value: "90" }], video_avg_time_watched_actions: [{ action_type: "video_view", value: "4" }] },
      { ad_id: "2", impressions: "500", reach: "250" }],
    [{ ad_id: "1", date_start: w.since, age: "25-34", gender: "female", impressions: "2000", spend: "40", inline_link_clicks: "30", actions: [{ action_type: "purchase", value: "3" }], action_values: [{ action_type: "purchase", value: "150" }] },
      { ad_id: "1", date_start: w.since, age: "35-44", gender: "male", impressions: "1000", spend: "20" }, { ad_id: "9", date_start: w.since, age: "18-24", gender: "female", impressions: "5" }],
    [{ ad_id: "1", date_start: w.since, publisher_platform: "instagram", platform_position: "instagram_reels", impressions: "2500", spend: "50" }, { ad_id: "1", date_start: w.since, publisher_platform: "facebook", platform_position: "feed", impressions: "500", spend: "10" }],
    w, "2026-11-23T10:00:00Z");
  it("keeps how many people saw it and how often", () => {
    expect(d["1"].reach).toBe(1200);
    expect(d["1"].frequency).toBe(2.5);
    expect(d["2"].frequency).toBe(2); // worked out when Meta leaves it out
  });
  it("keeps how much of the video was watched, and none for an ad with no video", () => {
    expect(d["1"].video).toMatchObject({ plays: 900, p25: 600, p100: 90, avgSeconds: 4 });
    expect(d["2"].video).toBeNull();
  });
  it("splits by who saw it and where, biggest first, and drops slices of ads it does not know", () => {
    expect(d["1"].ages.map((x) => x.key)).toEqual(["female 25-34", "male 35-44"]);
    expect(d["1"].ages[0]).toMatchObject({ impressions: 2000, spend: 40, clicks: 30, purchases: 3, value: 150 });
    expect(d["1"].places.map((x) => x.key)).toEqual(["instagram · reels", "facebook · feed"]);
    expect(d["9"]).toBeUndefined();
  });
});
