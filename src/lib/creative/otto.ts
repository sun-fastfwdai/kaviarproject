/** Otto's checks run on the server and live in the editor, so this module has no server-only imports. */
type AdLike = { hook: string; primaryText: string; headline: string; offer: string; imageUrl: string | null };
export type Check = { label: string; ok: boolean };
const BANNED = /\b(cure|cures|guarantee|guaranteed|miracle|clinically proven|100%|permanent|instant results)\b/i;

/** Otto's checks — the same rules Meta and the brand care about before an ad goes out. */
export function ottoChecks(ad: AdLike, codes: string[]): Check[] {
  const offerHasDiscount = /%|\boff\b|discount|code/i.test(ad.offer) && !/no offer/i.test(ad.offer);
  return [
    { label: "Headline under 40 characters", ok: ad.headline.length <= 40 },
    { label: "Primary text works before “See more”", ok: ad.primaryText.length <= 125 || ad.primaryText.slice(0, 125).includes(".") },
    { label: "Hook under 8 words", ok: ad.hook.trim().split(/\s+/).length <= 8 },
    { label: "Real product photo", ok: Boolean(ad.imageUrl) },
    { label: "No claims Meta rejects", ok: !BANNED.test(`${ad.hook} ${ad.primaryText} ${ad.headline}`) },
    { label: "Offer the brand actually runs", ok: !offerHasDiscount || codes.some((c) => ad.offer.toUpperCase().includes(c.toUpperCase())) },
  ];
}

