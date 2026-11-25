import { describe, expect, it } from "vitest";
import { choosePlaces, type PlaceFacts } from "../src/lib/meta/places-rules";

const f = (code: string, x: Partial<PlaceFacts> = {}): PlaceFacts => ({ code, orders: 0, ships: true, rivalAds: 0, rivalBrands: 0, purchases: 0, spend: 0, ...x });

describe("choosing a campaign's countries", () => {
  it("starts with the researched market, and a small budget stays in one country", () => {
    const r = choosePlaces({ facts: [f("US", { orders: 12 }), f("GB", { rivalAds: 80, rivalBrands: 3 }), f("DE", { rivalAds: 20, rivalBrands: 2 })], market: "US", home: "US", daily: 10, rivals: 3 });
    expect(r.picks).toEqual(["US"]);
    expect(r.room).toBe(1);
    expect(r.places.map((p) => p.code)).toEqual(["US", "GB", "DE"]);
    expect(r.places[0].why).toEqual(["Researched here", "12 of 12 orders"]);
    expect(r.places[1].why).toEqual(["3 of 3 competitors advertise here"]);
  });
  it("adds where the store sells, then where competitors advertise, as the budget allows", () => {
    const facts = [f("US", { orders: 30 }), f("CA", { orders: 8 }), f("GB", { rivalAds: 80, rivalBrands: 3 }), f("FR", { rivalAds: 3, rivalBrands: 1 })];
    expect(choosePlaces({ facts, market: "US", home: "US", daily: 20, rivals: 3 }).picks).toEqual(["US", "CA"]);
    expect(choosePlaces({ facts, market: "US", home: "US", daily: 40, rivals: 3 }).picks).toEqual(["US", "CA", "GB"]); // FR: one competitor, 4% of their ads — listed, not picked
  });
  it("never picks a country the store doesn't ship to", () => {
    const r = choosePlaces({ facts: [f("US", { orders: 5 }), f("GB", { rivalAds: 80, rivalBrands: 3, ships: false })], market: "US", home: "US", daily: 50, rivals: 3 });
    expect(r.picks).toEqual(["US"]);
    expect(r.places.find((p) => p.code === "GB")?.why[0]).toBe("You don’t ship here");
  });
  it("falls back to the store's home country when nothing is known", () => {
    expect(choosePlaces({ facts: [], market: "Worldwide", home: "CA", daily: 10, rivals: 0 }).picks).toEqual(["CA"]);
    expect(choosePlaces({ facts: [], market: null, home: "ZZ", daily: 10, rivals: 0 }).picks).toEqual(["US"]);
  });
  it("ignores countries Kaviar can't place ads in and one-off orders", () => {
    const r = choosePlaces({ facts: [f("US", { orders: 40 }), f("XX", { orders: 30 }), f("AU", { orders: 1 })], market: "US", home: "US", daily: 100, rivals: 0 });
    expect(r.picks).toEqual(["US"]);
    expect(r.places.map((p) => p.code)).toEqual(["US", "AU"]);
  });
});
