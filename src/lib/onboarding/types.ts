/** Shapes stored in brands.onboarding (jsonb) while a new brand is being set up. Shared by server and client. */

export type Source = "shopify" | "website" | "ai";
/** Where a profile value came from — shown as a tag on every field. */
export type Provenance = "website" | "deck" | "shopify" | "suggested" | "entered";
export type Field = { value: string; from: Provenance; note?: string | null };

export type ChatOption = string;
export type ChatTurn = {
  who: "kris" | "kaviar" | "iris";
  text: string;
  at: string; // ISO
  options?: ChatOption[];
  chosen?: string;
  site?: { host: string; image: string | null; chips: string[] };
  rec?: Recommendation;
};
export type Recommendation = {
  path: "shopify" | "website" | "specialist";
  title: string;
  confidence: "High" | "Med" | "Low";
  points: { tone: "good" | "wait"; lead: string; text: string }[];
  landsOn: string;
};
export type Understands = { sellsOn: string | null; catalog: string | null; wants: string | null; customerData: string | null; path: string | null };

export type SiteScan = {
  ok: boolean;
  url: string;
  host: string;
  platform: string | null; // Shopify, Cafe24, WooCommerce…
  title: string | null;
  image: string | null;
  brandName: string | null;
  category: string | null;
  tagline: string | null;
  heroProduct: string | null;
  productCount: number | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string | null;
  languages: string[];
  nav: string[];
  markets: string[];
  defaultLanguage: string | null;
  shopName: string | null; // suggested free .myshopify.com name
  shopNameNote: string | null;
  note: string | null; // one-line heads-up from Iris for the basics step
  scannedAt: string;
  error?: string;
};

export type JobStatus = "waiting" | "running" | "done" | "skipped" | "error";
export type Job = { key: string; label: string; agent: "iris" | "cleo" | "otto"; what: string; status: JobStatus; detail: string; done?: number; total?: number };
export type ToAdd = { key: string; title: string; detail: string; action: "upload-logo" | "draft-policy" | "upload-imagery" | "add-story" | "upload-deck"; done?: boolean; draft?: string };
export type Analysis = {
  startedAt: string;
  finishedAt?: string;
  current?: string;
  jobs: Job[];
  palette: { hex: string; role: string; confidence: "High" | "Med" | "Low" }[];
  font: { name: string; note: string; confidence: "High" | "Med" | "Low" } | null;
  paletteSource: string | null;
  categories: { name: string; count: number }[];
  productCount: number;
  pages: { label: string; meta: string; depth: number }[];
  pagesDone: number;
  pagesTotal: number;
  toAdd: ToAdd[];
  otto: { title: string; action: "Review" | "Add" }[];
  deckPages?: number;
};

export type Profile = Record<string, Field>;
export const PROFILE_GROUPS: { title: string; keys: [string, string][] }[] = [
  { title: "Identity", keys: [["tagline", "Tagline"], ["positioning", "Positioning"], ["tone", "Tone of voice"]] },
  { title: "Audience & catalog", keys: [["audience", "Audience"], ["markets", "Markets"], ["catalog", "Catalog"], ["heroProducts", "Hero products"]] },
  { title: "Look & feel", keys: [["palette", "Palette"], ["typography", "Typography"]] },
];

export type Basics = { name: string; category: string; website: string; shopName: string; markets: string[]; language: string; currency: string };

export type Onboarding = {
  source?: Source;
  shop?: string; // x.myshopify.com when connecting an existing store
  chat?: { turns: ChatTurn[]; understands: Understands; answered: number; recommendation: Recommendation | null };
  scan?: SiteScan;
  basics?: Basics;
  inspiration?: string[];
  pulled?: { url: string; w: number | null; h: number | null }[]; // product images Cleo pulled from the site
  analysis?: Analysis;
  profile?: Profile;
  catalog?: { at: string; source: string; products: CatalogProduct[] };
};

/** A product Cleo read from the old website, ready to become a row in Shopify's product import CSV. */
export type CatalogProduct = { handle: string; title: string; body: string; type: string; vendor: string; tags: string; images: string[]; variants: { option: string; price: number | null; compareAt: number | null; sku: string }[] };

export const STEPS: [string, string][] = [
  ["Source", "Shopify, site or Kaviar AI"],
  ["Brand basics", "Name, market, currency"],
  ["Brand assets", "Deck, logos, imagery"],
  ["Analysis", "Iris studies the brand"],
  ["Review", "Confirm the profile"],
];
export const STEP_PATHS = ["source", "basics", "assets", "analysis", "review"] as const;
