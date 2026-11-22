/** The campaign library's rows and the words for each stage — plain data, so the screen can use them. */
export type LibStatus = "live" | "ready" | "test" | "review" | "planned" | "paused";
export type LibRow = {
  key: string; name: string; sub: string; thumb: string | null; where: "Meta" | "Kaviar"; status: LibStatus;
  perDay: number | null; spend: number | null; back: number | null; // back: verified Shopify sales ÷ spend
  next: { label: string; href?: string; make?: string };
};
export const LIB_STATUS: Record<LibStatus, string> = { live: "Live", ready: "Ready to launch", test: "To test", review: "To review", planned: "Planned", paused: "Paused" };
