/** Store pages, sections and device widths — shared by the canvas (client) and the full preview (server). */
export type StorePage = "home" | "collection" | "product" | "story" | "faq";
export const PAGES: [StorePage, string][] = [["home", "Homepage"], ["collection", "Collection"], ["product", "Product page"], ["story", "Our story"], ["faq", "FAQ"]];
export const SECTION_LABEL: Record<string, string> = {
  announcement: "Announcement bar", header: "Header & navigation", hero: "Hero", promises: "Brand promise strip", bestsellers: "Bestsellers grid",
  story: "Our story", faq: "FAQ", newsletter: "Newsletter & footer", about: "Our story page",
};
/** Natural widths the store renders at; the canvas zooms them (75% desktop ≈ board 05). */
export const DEVICE_W = { desktop: 800, tablet: 600, mobile: 375 } as const;
