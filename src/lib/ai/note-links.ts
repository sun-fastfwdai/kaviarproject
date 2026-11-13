import type { Link } from "./notes";

export function noteHref(base: string, link: Link): string | undefined {
  return link ? `${base}/${link}` : undefined;
}
export const TONE: Record<string, [string, string]> = { good: ["trend-up", "#1F8A5B"], warn: ["trend-down", "#B7791F"], info: ["info", "#4C7BD9"] };
