import "server-only";
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import { db, schema } from "../db";
import { decrypt } from "../crypto";
import { MetaAuthError, metaGet } from "../meta/client";
import type { LibAd } from "./types";

/**
 * Meta Ad Library (Graph API `ads_archive`). Meta shares ordinary (non-political) ads only when they reached someone in the EU,
 * so we search EU delivery: global brands usually run the same messages there. US-only ads are added by hand as screenshots.
 */
const EU = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
const FIELDS = "id,page_id,page_name,ad_delivery_start_time,ad_delivery_stop_time,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,publisher_platforms,languages,eu_total_reach";

/** Any team member's Meta login can read the Ad Library: this brand's first, else another brand's. */
export async function adLibraryToken(brandId: string): Promise<string | null> {
  const C = schema.connections;
  const rows = await db.select({ brandId: C.brandId, token: C.accessToken }).from(C)
    .where(and(eq(C.provider, "meta"), isNotNull(C.accessToken), ne(C.status, "disconnected"))).orderBy(desc(C.connectedAt)).limit(10);
  const row = rows.find((r) => r.brandId === brandId) ?? rows[0];
  try { return row?.token ? decrypt(row.token) : null; } catch { return null; }
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
/** Does a Facebook Page name belong to this competitor? ("COSRX Official" ↔ "COSRX") */
const samePage = (page: string, name: string) => { const a = norm(page), b = norm(name); return Boolean(a && b) && (a.includes(b) || (b.includes(a) && a.length >= 4)); };

type Raw = { id: string; page_name?: string; ad_delivery_start_time?: string; ad_delivery_stop_time?: string; ad_creative_bodies?: string[]; ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[]; publisher_platforms?: string[]; languages?: string[]; eu_total_reach?: number };

/** A competitor's active ads, newest Page match first. Throws a readable message when Meta refuses. */
export async function competitorAds(name: string, token: string): Promise<LibAd[]> {
  let raw: Raw[];
  try {
    const r = await metaGet<{ data: Raw[] }>("ads_archive", {
      search_terms: name.slice(0, 100), ad_type: "ALL", ad_reached_countries: JSON.stringify(EU), ad_active_status: "ACTIVE", limit: "60", fields: FIELDS,
    }, token);
    raw = r.data ?? [];
  } catch (e) {
    if (e instanceof MetaAuthError) throw new Error("The Meta login has expired — reconnect Meta Ads on Integrations.");
    const m = (e as Error).message;
    if (/\((10|200|2332\d+)\)|permission|identity|confirm/i.test(m)) throw new Error("Meta wants the person who connected Meta to confirm their identity for the Ad Library (facebook.com/ID), then accept the Ad Library terms once.");
    throw new Error(m.slice(0, 160));
  }
  return raw.filter((a) => a.page_name && samePage(a.page_name, name)).slice(0, 30).map((a) => ({
    id: a.id, page: a.page_name ?? name, start: a.ad_delivery_start_time ?? null, stop: a.ad_delivery_stop_time ?? null,
    bodies: (a.ad_creative_bodies ?? []).map((x) => x.slice(0, 700)).slice(0, 3), titles: (a.ad_creative_link_titles ?? []).slice(0, 3), descriptions: (a.ad_creative_link_descriptions ?? []).slice(0, 3),
    platforms: a.publisher_platforms ?? [], languages: a.languages ?? [], reach: typeof a.eu_total_reach === "number" ? a.eu_total_reach : null,
  }));
}
