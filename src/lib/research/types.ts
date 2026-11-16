/** Market research shapes, shared by the research runner (server) and the Market research page (client). */

export type Src = { url: string; title: string };
/** `sources` are 1-based indexes into the report's `sources` list. */
export type Finding = { text: string; sources: number[] };
export type Decision = "accepted" | "rejected";
export type Verdict = "Strong" | "Growing" | "Niche" | "Weak";

export type Segment = {
  id: string; name: string; priority: "Primary" | "Secondary" | "Test";
  who: string; need: string; why: string; objections: string; angle: string;
  reach: { ages: string; gender: "All" | "Women" | "Men"; interests: string[]; placements: string[] };
  sources: number[]; status?: Decision;
};
export type Competitor = { name: string; product: string; price: string; positioning: string; strength: string; weakness: string; sources: number[] };
export type Trend = { text: string; direction: "rising" | "steady" | "fading"; sources: number[] };
export type Opportunity = { id: string; text: string; why: string; sources: number[]; status?: Decision };

export type MarketReport = {
  summary: string;
  demand: { verdict: Verdict; line: string; signals: Finding[] };
  segments: Segment[];
  competitors: Competitor[];
  price: { low: number | null; high: number | null; note: string };
  trends: Trend[];
  opportunities: Opportunity[];
  sources: Src[];
};

/**
 * One creative from the Meta Ad Library. Ads with the same text are grouped the way the Library groups them
 * ("3 ads use this creative and text"); `id` is the longest-running one. Everything here is Meta's own data —
 * from the Ad Library API (`from: "api"`, ads that reached the EU/UK) or read off a screenshot of the Ad Library website (`from: "shot"`).
 */
export type LibAd = {
  id: string; page: string; start: string | null; stop: string | null;
  bodies: string[]; titles: string[]; descriptions: string[]; platforms: string[]; languages: string[];
  /** People reached in the EU (Meta's estimate, summed over the grouped ads). */
  reach: number | null;
  pageId?: string; captions?: string[];
  /** How many ads use this creative and text, and their Library IDs. */
  copies?: number; ids?: string[];
  /** The creative as Meta shows it: a stored copy of the image or video's first frame. */
  media?: { kind: "image" | "video" | "carousel" | "text"; asset: string | null; n?: number } | null;
  /** Who it reached, from Meta's age × gender reach breakdown. */
  audience?: { top: string; topShare: number; women: number; ages: { age: string; share: number }[] } | null;
  countries?: { code: string; reach: number }[];
  /** What the advertiser targeted (shared for EU/UK ads). */
  target?: { ages: string | null; gender: string | null; places: string[] } | null;
  payer?: string | null;
  from?: "api" | "shot";
  /** For screenshot ads: the screenshot, where the ad sat in it, and what the card showed. */
  shot?: string; rank?: number; partner?: string | null; cta?: string | null; status?: "active" | "inactive" | null;
};
export type RivalStats = {
  ads: number; creatives: number; new30: number; longest: number; median: number; proven: number;
  reach: number | null; formats: Record<string, number>; platforms: Record<string, number>; countries: { code: string; reach: number }[]; women: number | null;
};
/** Why the Ad Library refused: the login must confirm identity, the login expired, or the hourly limit was hit. */
export type LibBlock = "identity" | "auth" | "limit";
export type RivalAds = { name: string; ads: LibAd[]; at: string; error?: string; blocked?: LibBlock; added?: boolean; pages?: { id: string; name: string }[]; stats?: RivalStats };
/** A screenshot the team added (US-only ads the API doesn't share). `id` is the brand asset; `ads` are the ad cards Iris read off it. */
export type ManualAd = { id: string; competitor: string; note: string; at: string; ads?: LibAd[]; read?: "done" | "error"; readNote?: string };

export type AdsRead = {
  summary: string; count: number; at: string;
  /** `share` is counted: the share of the creatives Iris tagged with this angle; `ids` are those ads, `proven` how many ran 30+ days. */
  angles: { name: string; share: number; example: string; who: string[]; ids?: string[]; n?: number; proven?: number }[];
  counted?: boolean; creatives?: number;
  offers: string[]; hooks: string[]; positioning: string;
  gaps: { id: string; text: string; why: string; status?: Decision }[];
};

export type TestCell = { id: string; segment: string; angle: string; hypothesis: string; audience: string; hook: string; visual: string; metric: string; on: boolean };
export type TestPlan = { summary: string; cells: TestCell[]; budget: { perDay: number; days: number; note: string }; at: string };

/** Where a positioning line comes from: the store, live ads, the web research, competitors' ads, or the brand profile. */
export type DataSource = "shopify" | "meta" | "research" | "ads" | "brand";
export const SOURCE_NAME: Record<DataSource, string> = { shopify: "Shopify", meta: "Meta ads", research: "Market research", ads: "Ad Library", brand: "Brand profile" };
/** The product's positioning: the one brief every agent writes from — ads, photo prompts, storyboards, casting and plans. */
export type Positioning = {
  statement: string; primary: string; secondary: string[];
  pillars: { id: string; title: string; message: string; proof: string; source: DataSource }[];
  proof: { fact: string; source: DataSource }[];
  price: { stance: string; note: string };
  voice: { say: string[]; avoid: string[] };
  avoid: string[]; where: { placement: string; why: string }[]; next: string[];
  status?: "accepted"; edited?: boolean; at: string;
};

export type StepKey = "context" | "search" | "write" | "adlib" | "read" | "position" | "plan";
export type Step = { key: StepKey; label: string; state: "waiting" | "running" | "done" | "error"; note?: string; ms?: number };
export const STEP_LABEL: Record<StepKey, string> = {
  context: "Read the brand and product", search: "Search the market", write: "Write up the findings",
  adlib: "Pull competitors’ ads from the Meta Ad Library", read: "Read their messaging", position: "Position the product with all the data", plan: "Plan the message test",
};
export type Part = "market" | "ads" | "position" | "plan";
export const PART_STEPS: Record<Part, StepKey[]> = { market: ["context", "search", "write"], ads: ["adlib", "read"], position: ["position"], plan: ["plan"] };

export const MARKETS: [string, string][] = [["US", "United States"], ["CA", "Canada"], ["GB", "United Kingdom"], ["AU", "Australia"]];
export const marketName = (m: string) => MARKETS.find(([k]) => k === m)?.[1] ?? m;

/** The public Ad Library page for an ad, or a search (anyone signed in to Facebook can open these). */
export const adLibraryUrl = (o: { id?: string; q?: string; country?: string }) =>
  o.id ? `https://www.facebook.com/ads/library/?id=${encodeURIComponent(o.id)}`
    : `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${o.country ?? "US"}&q=${encodeURIComponent(o.q ?? "")}&search_type=keyword_unordered`;
