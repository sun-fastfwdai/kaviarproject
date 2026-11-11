import type { Channel } from "../db/schema";

export type Utm = { source?: string | null; medium?: string | null; campaign?: string | null; content?: string | null; term?: string | null };
export type Visit = { landingPage?: string | null; referrerUrl?: string | null; utm?: Utm | null };

const META_SOURCES = /^(facebook|fb|ig|instagram|meta|an|msg|messenger|threads)$|facebook|instagram/;
const ORGANIC_MEDIUMS = /^(social|organic|bio|link_in_bio|referral|post|story|profile)$/;
const EMAIL = /^(klaviyo|mailchimp|omnisend|email|newsletter|sendgrid|attentive|postscript|sms)$/;
const ID = /^\d{6,}$/;

/** The URL parameters Kaviar asks operators to paste into every Meta ad (Ad → Tracking → URL parameters). */
export const META_URL_PARAMS =
  "utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term={{adset.id}}";

function fromUrl(url?: string | null): Utm {
  if (!url) return {};
  try {
    const q = new URL(url, "https://x.invalid").searchParams;
    return {
      source: q.get("utm_source"),
      medium: q.get("utm_medium"),
      campaign: q.get("utm_campaign"),
      content: q.get("utm_content"),
      term: q.get("utm_term"),
    };
  } catch {
    return {};
  }
}

function host(url?: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

const clean = (v?: string | null) => (v ?? "").trim() || null;

export type Attribution = {
  utm: Required<{ [K in keyof Utm]: string | null }>;
  channel: Channel;
  metaCampaignId: string | null;
  metaAdId: string | null;
};

/**
 * Where did an order come from? Uses the last visit before purchase, falling back to the first.
 * "meta" means a paid Meta click we can prove from UTMs — the number Kaviar trusts for ROAS.
 */
export function attribute(last: Visit | null | undefined, first?: Visit | null, storeHost?: string): Attribution {
  const visit = last?.utm?.source || last?.landingPage || last?.referrerUrl ? last : first ?? last;
  const parsed = fromUrl(visit?.landingPage);
  const u = {
    source: clean(visit?.utm?.source ?? parsed.source),
    medium: clean(visit?.utm?.medium ?? parsed.medium),
    campaign: clean(visit?.utm?.campaign ?? parsed.campaign),
    content: clean(visit?.utm?.content ?? parsed.content),
    term: clean(visit?.utm?.term ?? parsed.term),
  };
  const src = (u.source ?? "").toLowerCase();
  const med = (u.medium ?? "").toLowerCase();
  const ref = host(visit?.referrerUrl);

  let channel: Channel;
  if (src && META_SOURCES.test(src) && !ORGANIC_MEDIUMS.test(med)) channel = "meta";
  else if (med === "email" || EMAIL.test(src)) channel = "email";
  else if (src === "google" || (!src && /(^|\.)google\./.test(ref))) channel = "google";
  else if (!src && (!ref || (storeHost && ref.endsWith(storeHost)))) channel = "direct";
  else channel = "other";

  return {
    utm: u,
    channel,
    metaCampaignId: channel === "meta" && u.campaign && ID.test(u.campaign) ? u.campaign : null,
    metaAdId: channel === "meta" && u.content && ID.test(u.content) ? u.content : null,
  };
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  meta: "Meta ads",
  direct: "Direct",
  google: "Google",
  email: "Email",
  other: "Other",
};
export const CHANNEL_COLOR: Record<Channel, string> = {
  meta: "#0866FF",
  direct: "#121212",
  google: "#8B8883",
  email: "#B5B2AC",
  other: "#E2DFDA",
};
