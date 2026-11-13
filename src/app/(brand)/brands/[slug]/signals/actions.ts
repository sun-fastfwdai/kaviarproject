"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { ask, aiReady } from "@/lib/ai/client";

export type Brief = { audience: string; angle: string; hook: string; primaryText: string; headline: string; offer: string; format: string; avoid: string };
const BriefOut = z.object({
  audience: z.string().describe("Who sees it, in Meta targeting terms (custom audience, exclusions, lookalike seed…)"),
  angle: z.string().describe("The idea in one sentence"),
  hook: z.string().describe("First 3 seconds / first line, under 12 words"),
  primaryText: z.string().describe("Meta primary text, 2–3 short sentences in the brand's voice"),
  headline: z.string().describe("Under 40 characters"),
  offer: z.string().describe("Offer or CTA; 'No offer' if none fits"),
  format: z.string().describe("e.g. 'Carousel of the 3 best-sellers' or '9:16 video, 15s'"),
  avoid: z.string().describe("One thing not to do, e.g. claims to avoid"),
});

/** Remy turns one ad signal into a brief the team can paste into Ads Manager. */
export async function writeBrief(slug: string, signal: { data: string; value: string | null; use: string; evidence: [string, string][] }): Promise<{ brief?: Brief; error?: string }> {
  await requireMember();
  if (!aiReady()) return { error: "Remy needs the Claude API key to write briefs." };
  const [b] = await db.select({ name: schema.brands.name, category: schema.brands.category, currency: schema.brands.currency, website: schema.brands.website, onboarding: schema.brands.onboarding })
    .from(schema.brands).where(eq(schema.brands.slug, slug)).limit(1);
  if (!b) return { error: "Brand not found." };
  const profile = b.onboarding?.profile ? Object.fromEntries(Object.entries(b.onboarding.profile).map(([k, v]) => [k, v.value])) : null;
  const out = await ask("remy", {
    system: "You are Remy, Kaviar's creative agent. Turn one signal from the brand's Shopify data into a Meta ad brief the team can launch today. Be concrete and use the real numbers and product names given. Write in the brand's voice if a profile is given. No medical or guaranteed-result claims. Never invent discounts the brand doesn't run — suggest one only as an option.",
    content: JSON.stringify({ brand: { name: b.name, category: b.category, website: b.website, currency: b.currency, profile }, signal }),
    schema: BriefOut,
    maxTokens: 3000,
  });
  return out ? { brief: out } : { error: "Remy couldn’t write a brief right now. Try again in a minute." };
}
