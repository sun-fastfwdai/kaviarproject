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
 */
export const AGENTS = {
  kaviar: { model: "claude-sonnet-5-5", effort: "low" },
  iris: { model: "claude-opus-5-5", effort: "medium" },
  otto: { model: "claude-sonnet-5-5", effort: "low" },
  remy: { model: "claude-sonnet-5-5", effort: "low" },
  cleo: { model: "claude-haiku-5-5", effort: "low" },
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
