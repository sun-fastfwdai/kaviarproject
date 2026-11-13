import "server-only";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { ask, type Block } from "../ai/client";
import type { StoreContent } from "../db/schema";

/** The sections you can select on the canvas, and which fields of the content each one owns. */
export const SECTIONS: Record<string, { label: string; fields: (keyof StoreContent)[] }> = {
  announcement: { label: "Announcement bar", fields: ["announcement"] },
  header: { label: "Header & navigation", fields: ["nav"] },
  hero: { label: "Hero", fields: ["hero", "heroOptions", "subline", "cta"] },
  promises: { label: "Brand promise strip", fields: ["promises"] },
  bestsellers: { label: "Bestsellers grid", fields: ["bestsellersTitle"] },
  story: { label: "Our story", fields: ["story"] },
  faq: { label: "FAQ", fields: ["faq"] },
  newsletter: { label: "Newsletter & footer", fields: ["newsletter"] },
  about: { label: "Our story page", fields: ["aboutPage"] },
};

type Agent = "remy" | "cleo" | "otto" | "iris" | "you";

/** Save new content as the next revision: the old one goes to history (for undo/compare) and the log says what changed. */
export async function commit(brandId: string, next: StoreContent, entry: { who: string; agent: Agent; what: string; scope: string | null }) {
  const [b] = await db.select({ content: schema.storeBuilds.content, history: schema.storeBuilds.history, log: schema.storeBuilds.log }).from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brandId));
  if (!b) return;
  const rev = (b.log.at(-1)?.rev ?? 0) + 1;
  const now = new Date().toISOString();
  const history = b.content ? [...b.history, { rev: rev - 1, at: now, content: b.content }].slice(-25) : b.history;
  await db.update(schema.storeBuilds).set({ content: next, history, log: [...b.log, { rev, at: now, ...entry }].slice(-200), updatedAt: new Date() }).where(eq(schema.storeBuilds.brandId, brandId));
}

/** Append to the activity log without changing content (agents' progress, comments). */
export async function note(brandId: string, entry: { who: string; agent: Agent; what: string; scope: string | null }) {
  const [b] = await db.select({ log: schema.storeBuilds.log }).from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brandId));
  if (!b) return;
  const rev = b.log.at(-1)?.rev ?? 0;
  await db.update(schema.storeBuilds).set({ log: [...b.log, { rev, at: new Date().toISOString(), ...entry }].slice(-200) }).where(eq(schema.storeBuilds.brandId, brandId));
}

export const Content = z.object({
  announcement: z.string(), heroOptions: z.array(z.string()), hero: z.string(), subline: z.string(), cta: z.string(),
  promises: z.array(z.object({ title: z.string(), body: z.string() })), bestsellersTitle: z.string(),
  story: z.object({ title: z.string(), body: z.string() }), faq: z.array(z.object({ q: z.string(), a: z.string() })),
  newsletter: z.object({ title: z.string(), body: z.string() }), nav: z.array(z.string()), aboutPage: z.string(),
});

/** Ask Remy for a change — to one selected section, or the whole page when nothing is selected. */
export async function revise(brandId: string, who: string, instruction: string, scope: string | null, image?: { mime: string; data: string }): Promise<{ error?: string; summary?: string }> {
  const [b] = await db.select({ content: schema.storeBuilds.content }).from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brandId));
  if (!b?.content) return { error: "Build the store first." };
  const section = scope ? SECTIONS[scope] : null;
  const out = await ask("remy", {
    system: `You are Remy, Kaviar's store builder. Apply the team's instruction to the store copy. ${section ? `Change ONLY the ${section.label} (fields: ${section.fields.join(", ")}). Every other field must come back exactly as it is.` : "It applies to the whole page; keep anything the instruction doesn't touch."} No invented claims, discounts, awards or reviews.`,
    content: image
      ? [{ type: "image", source: { type: "base64", media_type: image.mime as "image/png", data: image.data } }, { type: "text", text: JSON.stringify({ instruction: instruction.slice(0, 600), note: "The image is a reference the team attached.", current: b.content }) }] satisfies Block[]
      : JSON.stringify({ instruction: instruction.slice(0, 600), current: b.content }),
    schema: z.object({ content: Content, changed: z.string().describe("One short line: what you changed") }),
    maxTokens: 6000,
  });
  if (!out) return { error: "Remy couldn’t make that change right now." };
  // A scoped change can only touch its own fields, whatever the model returned.
  const next: StoreContent = section ? { ...b.content, ...Object.fromEntries(section.fields.map((f) => [f, out.content[f]])) } as StoreContent : out.content;
  await commit(brandId, next, { who, agent: "remy", what: out.changed, scope });
  return { summary: out.changed };
}

/** Step back one revision. */
export async function undo(brandId: string, who: string): Promise<{ error?: string }> {
  const [b] = await db.select({ history: schema.storeBuilds.history, log: schema.storeBuilds.log }).from(schema.storeBuilds).where(eq(schema.storeBuilds.brandId, brandId));
  const prev = b?.history.at(-1);
  if (!prev) return { error: "Nothing to undo." };
  const rev = (b!.log.at(-1)?.rev ?? 0) + 1;
  await db.update(schema.storeBuilds).set({
    content: prev.content, history: b!.history.slice(0, -1),
    log: [...b!.log, { rev, at: new Date().toISOString(), who, agent: "you" as const, what: `Went back to r${prev.rev}`, scope: null }].slice(-200), updatedAt: new Date(),
  }).where(eq(schema.storeBuilds.brandId, brandId));
  return {};
}
