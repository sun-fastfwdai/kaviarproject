/** The shapes Kaviar sends to Meta when it places ads — kept apart from the network so they can be checked on their own. */
export type AdCopy = { text: string; headline: string; link: string; cta: string };

const CTA: [RegExp, string][] = [[/shop/i, "SHOP_NOW"], [/order/i, "ORDER_NOW"], [/buy/i, "BUY_NOW"], [/offer|deal|claim/i, "GET_OFFER"], [/sign/i, "SIGN_UP"], [/subscribe/i, "SUBSCRIBE"], [/learn|more|see|discover|find/i, "LEARN_MORE"]];
/** The button on the ad. Remy writes it in words; Meta takes one of its own. Anything unrecognised becomes "Shop now" — these are sales ads. */
export const ctaType = (words: string): string => CTA.find(([re]) => re.test(words))?.[1] ?? "SHOP_NOW";

export function adSetParams(v: { name: string; campaignId: string; pixelId: string; country: string }): Record<string, string> {
  return {
    name: v.name.slice(0, 200), campaign_id: v.campaignId,
    // The campaign carries the budget and the bid, so the ad set carries neither.
    optimization_goal: "OFFSITE_CONVERSIONS", billing_event: "IMPRESSIONS", destination_type: "WEBSITE",
    promoted_object: JSON.stringify({ pixel_id: v.pixelId, custom_event_type: "PURCHASE" }),
    // One ad set can be shown in several countries; Meta then spends the one budget wherever buyers cost least.
    targeting: JSON.stringify({ geo_locations: { countries: countriesIn(v.country).length ? countriesIn(v.country) : [v.country.toUpperCase().slice(0, 2)] }, targeting_automation: { advantage_audience: 1 } }),
  };
}

export function creativeParams(v: { name: string; pageId: string; hash: string; copy: AdCopy; urlTags: string }): Record<string, string> {
  const link = v.copy.link;
  return {
    name: v.name.slice(0, 200), url_tags: v.urlTags,
    object_story_spec: JSON.stringify({ page_id: v.pageId, link_data: { image_hash: v.hash, link, message: v.copy.text, name: v.copy.headline.slice(0, 255), call_to_action: { type: ctaType(v.copy.cta), value: { link } } } }),
  };
}

/** Meta's refusal in the brand's words where Kaviar knows the cause; Meta's own words otherwise. */
export function problem(e: unknown): string {
  const m = (e instanceof Error ? e.message : String(e)).replace(/^Meta API:\s*/, "");
  if (/pages_manage_ads|pages_read_engagement|permission.*page|\(#?200\)|\(10\)/i.test(m)) return "Meta won’t let Kaviar post as your Page yet — it needs the Page permission. Reconnect Meta in Settings › Integrations.";
  if (/business information|business info/i.test(m)) return "Meta wants your business information before this account can run ads — add it in Ads Manager.";
  if (/payment|funding|billing/i.test(m) && !/billing_event/.test(m)) return "Meta needs a payment method on this ad account before ads can be placed.";
  return m.slice(0, 220);
}

export const COUNTRIES: [string, string][] = [["US", "United States"], ["CA", "Canada"], ["GB", "United Kingdom"], ["AU", "Australia"], ["NZ", "New Zealand"], ["IE", "Ireland"], ["DE", "Germany"], ["FR", "France"], ["ES", "Spain"], ["IT", "Italy"], ["NL", "Netherlands"], ["SE", "Sweden"], ["KR", "South Korea"], ["JP", "Japan"], ["SG", "Singapore"], ["IN", "India"], ["AE", "United Arab Emirates"], ["MX", "Mexico"], ["BR", "Brazil"],
  ["BE", "Belgium"], ["AT", "Austria"], ["PT", "Portugal"], ["DK", "Denmark"], ["FI", "Finland"], ["NO", "Norway"], ["CH", "Switzerland"], ["PL", "Poland"], ["GR", "Greece"], ["CZ", "Czechia"], ["RO", "Romania"], ["HU", "Hungary"]];
/** The countries in a choice ("US" or "US,CA,GB"), in the order chosen: only ones Kaviar offers, each once, ten at most. */
export const countriesIn = (v: string | null | undefined): string[] =>
  [...new Set((v ?? "").split(",").map((c) => c.trim().toUpperCase()).filter((c) => COUNTRIES.some(([k]) => k === c)))].slice(0, 10);
/** Their names, for an ad set's name or a line on screen: "United States", "United States and Canada", "United States + 2 more". */
export const countryNames = (v: string | null | undefined): string => {
  const names = countriesIn(v).map((c) => COUNTRIES.find(([k]) => k === c)![1]);
  return names.length <= 2 ? names.join(" and ") : `${names[0]} + ${names.length - 1} more`;
};
const BY_CURRENCY: Record<string, string> = { USD: "US", CAD: "CA", GBP: "GB", AUD: "AU", NZD: "NZ", KRW: "KR", JPY: "JP", SGD: "SG", INR: "IN", AED: "AE", MXN: "MX", BRL: "BR", SEK: "SE" };
/** Where the ads are shown unless the brand says otherwise: the market it was researched in, else the country of the store's currency. */
export const countryFor = (market: string | null | undefined, currency: string | null | undefined): string => {
  const m = (market ?? "").trim().toUpperCase();
  if (COUNTRIES.some(([c]) => c === m)) return m;
  return BY_CURRENCY[(currency ?? "").toUpperCase()] ?? "US";
};
