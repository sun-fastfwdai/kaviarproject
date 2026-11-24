import "server-only";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { answer, ask } from "../ai/client";
import { getCompete } from "./bench";
import { read, write } from "./run";
import { linkedTo, named, tally, tracked, type AnswerRun, type Asked } from "./answers-rules";

/**
 * AI answers — a real measure of AI visibility, where the page checks only say a store is ready to be read. Kaviar asks an assistant
 * the questions a shopper would ask, with web search on, and counts who it names and whose site it links. The questions never name a
 * brand. They are kept, so the next run asks the same ones and the two can be compared.
 */
const KEY = "ai-answers", ASSISTANT = "Claude, with web search", N = 6;
export type Answers = { runs: AnswerRun[] };

export const getAnswers = async (brandId: string): Promise<AnswerRun[]> => (await read<Answers>(brandId, KEY))?.runs ?? [];

async function questions(brand: { id: string; name: string; category?: string | null }, market: string): Promise<string[]> {
  const [prods, res] = await Promise.all([
    db.execute(sql`select title, product_type as type from shop_products where brand_id = ${brand.id} and lower(coalesce(status, 'active')) = 'active' order by title limit 25`).then((r) => r.rows as { title: string; type: string | null }[]).catch(() => []),
    db.execute(sql`select report->'segments' as segments, positioning->>'statement' as statement from market_research where brand_id = ${brand.id} and report is not null order by updated_at desc limit 1`).then((r) => (r.rows as { segments: { name?: string; need?: string }[] | null; statement: string | null }[])[0] ?? null).catch(() => null),
  ]);
  const out = await ask("kaviar", {
    system: `Write ${N} questions a shopper would type into an AI assistant when looking for products like these, in the market given. Plain and specific to a need: a mix of "best … for …", a comparison and a problem to solve. Never name a brand or a product line, and never use words only this brand uses. One question for each kind of buyer where buyers are given.`,
    content: JSON.stringify({ market, category: brand.category ?? null, products: prods.map((p) => p.type ? `${p.type}: ${p.title.replace(new RegExp(brand.name, "gi"), "").trim()}` : p.title.replace(new RegExp(brand.name, "gi"), "").trim()).slice(0, 25), buyers: (res?.segments ?? []).map((s) => ({ who: s.name, need: s.need })).slice(0, 5) }),
    schema: z.object({ questions: z.array(z.string()).describe("The questions, each one sentence") }),
  });
  return (out?.questions ?? []).map((q) => q.trim()).filter((q) => q.length > 12 && q.length < 220).slice(0, N);
}

export async function runAnswers(brand: { id: string; name: string; category?: string | null }, by: string | null): Promise<{ error?: string }> {
  const c = await getCompete(brand.id), prev = await getAnswers(brand.id);
  const who = [tracked(brand.name, c.own ?? c.mine?.domain ?? null, true), ...c.rivals.slice(0, 8).map((r) => tracked(r.name, r.url, false))];
  if (who.length < 2) return { error: "Add a competitor first — there is nobody to compare with" };
  const market = (await db.execute(sql`select market from market_research where brand_id = ${brand.id} order by updated_at desc limit 1`).then((r) => (r.rows as { market: string }[])[0]?.market).catch(() => undefined)) ?? "US";
  // The same questions as last time, so runs compare; written once from the brand's products and buyers.
  const qs = prev[0]?.questions.length ? prev[0].questions.map((x) => x.q) : await questions(brand, market);
  if (qs.length < 3) return { error: "Kaviar couldn’t write the questions just now — try again" };
  const asked: Asked[] = [];
  for (let i = 0; i < qs.length; i += 3) {
    const got = await Promise.all(qs.slice(i, i + 3).map((q) => answer(q, market)));
    got.forEach((a, k) => { if (a) asked.push({ q: qs[i + k], answer: a.text.slice(0, 2400), named: who.filter((t) => named(a.text, t)).map((t) => t.name), linked: who.filter((t) => linkedTo(a.cited, t)).map((t) => t.name), others: [] }); });
  }
  if (asked.length < 3) return { error: "The assistant didn’t answer enough questions — try again in a minute" };
  // Which other brands each answer names: read off the answers themselves, never guessed.
  const listed = await ask("cleo", {
    system: "For each answer, list every brand name it recommends or mentions, exactly as written. Brands only — not product names, shops, ingredients or websites. Keep the answers' order.",
    content: JSON.stringify(asked.map((a, i) => ({ i, answer: a.answer }))),
    schema: z.object({ answers: z.array(z.object({ i: z.number(), brands: z.array(z.string()) })) }),
  });
  for (const x of listed?.answers ?? []) if (asked[x.i]) asked[x.i].others = x.brands.filter((b) => asked[x.i].answer.toLowerCase().includes(b.toLowerCase().slice(0, 12))).slice(0, 20);
  const run: AnswerRun = { at: new Date().toISOString(), by, assistant: ASSISTANT, market, questions: asked, ...tally(asked, who) };
  await write(brand.id, KEY, { runs: [run, ...prev].slice(0, 6) });
  return {};
}
