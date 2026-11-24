import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { env } from "../env";

/**
 * One model per agent, picked for what each one does:
 * - Kaviar AI (concierge chat): Sonnet 5.5 — quick, friendly turns with sound judgment.
 * - Iris (reads sites and decks, writes the brand profile): Opus 5.5 — the deepest reading and synthesis.
 * - Otto (checks what's missing before launch): Sonnet 5.5 — rule-following review.
 * - Cleo (catalog and sync status notes): Haiku 5.5 — short, frequent, cheap.
 * - Remy (turns signals into ad angles and copy): Sonnet 5.5 — strong writing at speed.
 * - Shoppers (the people on an Audience test panel, many calls per test): Haiku 5.5 — small, fast agents that each play one person.
 */
export const AGENTS = {
  kaviar: { model: "claude-sonnet-5-5", effort: "low" },
  iris: { model: "claude-opus-5-5", effort: "medium" },
  otto: { model: "claude-sonnet-5-5", effort: "low" },
  remy: { model: "claude-sonnet-5-5", effort: "low" },
  cleo: { model: "claude-haiku-5-5", effort: "low" },
  shopper: { model: "claude-haiku-5-5", effort: "low" },
} as const;
export type Agent = keyof typeof AGENTS;
type Effort = "low" | "medium" | "high";

let client: Anthropic | null = null;
const api = () => (client ??= new Anthropic({ maxRetries: 2, timeout: 120_000 }));

export const aiReady = () => env.aiConfigured();

export type Block = Anthropic.Beta.BetaContentBlockParam;

/**
 * Ask an agent for a structured answer. Returns null when the API key is missing, the call fails,
 * or the model declines — callers always have a non-AI fallback.
 * Opus and Sonnet calls carry server-side refusal fallbacks, so a declined request is retried on a fallback model.
 */
export async function ask<S extends z.ZodType>(agent: Agent, opts: {
  system: string; content: string | Block[]; schema: S; effort?: Effort; maxTokens?: number;
}): Promise<z.infer<S> | null> {
  if (!aiReady()) return null;
  const cfg = AGENTS[agent];
  try {
    const res = await api().beta.messages.parse({
      model: cfg.model,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      messages: [{ role: "user", content: opts.content }],
      output_config: { effort: opts.effort ?? cfg.effort, format: betaZodOutputFormat(opts.schema) },
      ...(cfg.model === "claude-haiku-5-5" ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
    });
    if (res.stop_reason === "refusal") return null;
    return (res.parsed_output ?? null) as z.infer<S> | null;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) console.error(`[ai:${agent}] the Claude API key was rejected`);
    else if (e instanceof Anthropic.RateLimitError) console.warn(`[ai:${agent}] rate limited`);
    else if (e instanceof Anthropic.APIError) console.error(`[ai:${agent}] API error ${e.status}`, e.message);
    else console.error(`[ai:${agent}]`, e);
    return null;
  }
}

/**
 * A plain answer to a shopper's question, with web search — the way an AI assistant answers it. Returns the answer's words and the
 * pages it linked. Used to see which brands an assistant names; the question never mentions a brand.
 */
export async function answer(question: string, country = "US"): Promise<{ text: string; cited: string[] } | null> {
  if (!aiReady()) return null;
  const tools: Anthropic.Beta.BetaToolUnion[] = [{ type: "web_search_20260209", name: "web_search", max_uses: 3, user_location: { type: "approximate", country } }];
  let messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: question }];
  const cited: string[] = [], parts: string[] = [];
  try {
    for (let turn = 0; turn < 3; turn++) {
      const msg = await api().beta.messages.stream({
        model: AGENTS.kaviar.model, max_tokens: 2000, tools, messages, output_config: { effort: "low" },
        system: "You are an AI assistant answering a shopper. Search the web, then recommend specific products by brand and name, with a line on why each fits. Keep it short. Do not ask questions back.",
        betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      }).finalMessage();
      for (const b of msg.content) if (b.type === "text") {
        parts.push(b.text);
        for (const x of b.citations ?? []) if (x.type === "web_search_result_location" && !cited.includes(x.url)) cited.push(x.url);
      }
      if (msg.stop_reason !== "pause_turn") break;
      messages = [...messages, { role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] }];
    }
  } catch (e) { console.error("[ai:answer]", (e as Error).message?.slice(0, 160)); return null; }
  const text = parts.join("").trim();
  return text.length > 40 ? { text, cited } : null;
}
