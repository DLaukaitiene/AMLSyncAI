import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import type { Tx } from "./db";
import { encryptField } from "./crypto";
import { hit } from "./rate-limit";
import { buildUserPrompt, SYSTEM_PROMPT, type DraftPurpose } from "@/lib/ai/prompt";

/**
 * AI drafting (spec §5 V1, §8C.8, §11.12). AI drafts text; it never changes
 * records, never calls other systems and never sets a risk rating. A named
 * user reviews and approves every draft. Every call is logged (encrypted).
 *
 * AI_PROVIDER:
 *   off (default) — AI drafting is unavailable
 *   vertex        — Claude on Google Vertex AI in an EU region (VERTEX_PROJECT_ID, VERTEX_REGION, default "europe-west1")
 *   anthropic     — Claude API (ANTHROPIC_API_KEY)
 *   mock          — deterministic text for tests; never in production
 * The spec requires EU-only AI processing: use "vertex" with an EU region, or
 * confirm the data-processing location of the chosen provider. [decision]
 */

export const AI_MODEL = process.env.AI_MODEL ?? "claude-opus-5-5";
const provider = () => process.env.AI_PROVIDER ?? "off";

export function aiEnabled(): boolean {
  const p = provider();
  if (p === "mock") return process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_EMAIL === "1";
  return p === "vertex" || p === "anthropic";
}

export type DraftResult = { ok: true; text: string } | { ok: false; error: string };

function textOf(content: { type: string; text?: string }[]): string {
  return content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
}

async function callModel(userPrompt: string): Promise<{ text: string; stopReason: string | null; input?: number; output?: number }> {
  const p = provider();
  if (p === "mock") {
    return { text: `[AI draft] ${userPrompt.split("<data>")[1]?.slice(0, 200).replace(/\s+/g, " ").trim() ?? ""}`, stopReason: "end_turn" };
  }
  if (p === "vertex") {
    const client = new AnthropicVertex({ projectId: process.env.VERTEX_PROJECT_ID, region: process.env.VERTEX_REGION ?? "europe-west1", timeout: 60_000, maxRetries: 1 });
    const r = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      output_config: { effort: "medium" },
      messages: [{ role: "user", content: userPrompt }],
    });
    return { text: textOf(r.content), stopReason: r.stop_reason, input: r.usage.input_tokens, output: r.usage.output_tokens };
  }
  // Claude API: server-side fallback on a policy decline (beta).
  const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
  const r = await client.beta.messages.create({
    model: AI_MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    output_config: { effort: "medium" },
    messages: [{ role: "user", content: userPrompt }],
  });
  return { text: textOf(r.content), stopReason: r.stop_reason, input: r.usage.input_tokens, output: r.usage.output_tokens };
}

export async function draftText(
  tx: Tx,
  ctx: { firmId: string; userId: string },
  purpose: DraftPurpose,
  objectId: string,
  data: Record<string, unknown>,
): Promise<DraftResult> {
  if (!aiEnabled()) return { ok: false, error: "AI drafting is not switched on for this installation." };
  if (!(await hit(`ai:${ctx.userId}`, { limit: 30, windowSec: 3600 }))) return { ok: false, error: "Too many AI drafts in the last hour. Try again later." };
  const prompt = buildUserPrompt(purpose, data);
  const log = await tx.aiCall.create({
    data: { firmId: ctx.firmId, userId: ctx.userId, purpose, objectId, provider: provider(), model: AI_MODEL, promptEnc: encryptField(ctx.firmId, `${SYSTEM_PROMPT}\n\n---\n\n${prompt}`) },
  });
  try {
    const r = await callModel(prompt);
    await tx.aiCall.update({
      where: { id: log.id },
      data: { outputEnc: encryptField(ctx.firmId, r.text), stopReason: r.stopReason, inputTokens: r.input ?? null, outputTokens: r.output ?? null },
    });
    if (r.stopReason === "refusal") return { ok: false, error: "The AI declined to draft this. Write it yourself." };
    if (!r.text) return { ok: false, error: "The AI returned no text. Try again or write it yourself." };
    return { ok: true, text: r.text };
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `${e.status ?? ""} ${e.message}`.trim() : (e as Error).message;
    await tx.aiCall.update({ where: { id: log.id }, data: { error: msg.slice(0, 500) } });
    return { ok: false, error: "The AI service is not available right now. Write the text yourself or try again later." };
  }
}
