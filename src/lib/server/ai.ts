import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import type { Tx } from "./db";
import type { Prisma } from "@prisma/client";
import { encryptField } from "./crypto";
import { hit } from "./rate-limit";
import { buildUserPrompt, SYSTEM_PROMPT, type DraftPurpose } from "@/lib/ai/prompt";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { costCents, draftToPeople, OWNERSHIP_AI_CAP_CENTS, OWNERSHIP_AI_RESERVE_CENTS, OWNERSHIP_PROMPT, OwnershipDraftSchema, type OwnershipDraft } from "@/lib/ai/ownership";
import { readBlob } from "./storage";

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

export function aiProviderLabel(): string {
  const p = provider();
  return p === "vertex" ? `Anthropic Claude on Google Cloud, ${process.env.VERTEX_REGION ?? "europe-west1"}` : p === "anthropic" ? "Anthropic Claude" : p === "mock" ? "test provider" : "none";
}

export function aiEnabled(): boolean {
  const p = provider();
  if (p === "mock") return process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_EMAIL === "1";
  return p === "vertex" || p === "anthropic";
}

export type DraftResult = { ok: true; text: string } | { ok: false; error: string };

/** Monthly AI draft caps per plan [decided 20 Nov 2026]: STR narratives. */
export const AI_STR_CAP: Record<string, number> = { solo: 30, starter: 80, custom: 80 };

/** AI drafting is available to a firm when the installation has a provider and the firm switched it on. */
export async function aiForFirm(tx: Tx, firmId: string): Promise<boolean> {
  if (!aiEnabled()) return false;
  return (await tx.firm.findUniqueOrThrow({ where: { id: firmId }, select: { aiDrafting: true } })).aiDrafting;
}

export async function aiUsageThisMonth(tx: Tx, firmId: string) {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId }, select: { plan: true } });
  const str = await tx.aiCall.count({ where: { purpose: "str-narrative", error: null, createdAt: { gte: from } } });
  return { str, strCap: AI_STR_CAP[firm.plan] ?? 80, ownershipCents: await ownershipAiSpentCents(tx), ownershipCapCents: OWNERSHIP_AI_CAP_CENTS };
}

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
  if (!(await aiForFirm(tx, ctx.firmId))) return { ok: false, error: "AI drafting is switched off for your firm. Switch it on in Compliance Hub → Overview." };
  if (purpose === "str-narrative") {
    const u = await aiUsageThisMonth(tx, ctx.firmId);
    if (u.str >= u.strCap) return { ok: false, error: `Your plan includes ${u.strCap} AI report drafts a month and they are used up. Write this one yourself, or contact contact@amlsync.com for more.` };
  }
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

// ---------------------------------------------------------------------------
// Ownership structure from a document (decided 20 Nov 2026: capped at €3 a month per firm)
// ---------------------------------------------------------------------------

const OWNERSHIP_MIME = ["application/pdf", "image/png", "image/jpeg"] as const;

export async function ownershipAiSpentCents(tx: Tx): Promise<number> {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await tx.aiCall.findMany({ where: { purpose: "ownership-chart", createdAt: { gte: from } }, select: { inputTokens: true, outputTokens: true } });
  return rows.reduce((a, r) => a + costCents(r.inputTokens ?? 0, r.outputTokens ?? 0), 0);
}

async function callOwnershipModel(bytes: Buffer, mime: string, prompt: string): Promise<{ draft: OwnershipDraft | null; stopReason: string | null; input: number; output: number }> {
  const p = provider();
  if (p === "mock") {
    return {
      draft: { documentType: "shareholder register (test)", people: [
        { name: "Jonas Savininkas", entityType: "person", roles: ["shareholder"], ownershipPct: 60, registrationNumber: null, birthDate: "1975-04-02", nationality: "LT" },
        { name: "Ona Savininkė", entityType: "person", roles: ["shareholder"], ownershipPct: 40, registrationNumber: null, birthDate: null, nationality: "LT" },
        { name: "Petras Vadovas", entityType: "person", roles: ["director"], ownershipPct: null, registrationNumber: null, birthDate: null, nationality: null },
      ], warnings: [] },
      stopReason: "end_turn", input: 2500, output: 400,
    };
  }
  const source = { type: "base64" as const, media_type: mime as "application/pdf", data: bytes.toString("base64") };
  const content = [
    mime === "application/pdf" ? { type: "document" as const, source } : { type: "image" as const, source: { ...source, media_type: mime as "image/png" | "image/jpeg" } },
    { type: "text" as const, text: prompt },
  ];
  const req = { model: AI_MODEL, max_tokens: 8000, output_config: { effort: "medium" as const, format: zodOutputFormat(OwnershipDraftSchema) }, messages: [{ role: "user" as const, content }] };
  const client = p === "vertex"
    ? new AnthropicVertex({ projectId: process.env.VERTEX_PROJECT_ID, region: process.env.VERTEX_REGION ?? "europe-west1", timeout: 120_000, maxRetries: 1 })
    : new Anthropic({ timeout: 120_000, maxRetries: 1 });
  const r = await client.messages.parse(req);
  return { draft: r.parsed_output ?? null, stopReason: r.stop_reason, input: r.usage.input_tokens, output: r.usage.output_tokens };
}

export type OwnershipDraftResult = { ok: true; extractId: string; people: number; warnings: string[] } | { ok: false; error: string };

/**
 * Reads one of the client's uploaded documents and proposes the owners and
 * controllers it names, as a "Drafted by AI" extract on the client file. Nothing
 * is added to the structure until a person clicks "Add to ownership" per person.
 */
export async function draftOwnershipFromDocument(tx: Tx, ctx: { firmId: string; userId: string }, partyId: string, documentId: string): Promise<OwnershipDraftResult> {
  if (!(await aiForFirm(tx, ctx.firmId))) return { ok: false, error: "AI drafting is switched off for your firm. Switch it on in Compliance Hub → Overview." };
  const doc = await tx.document.findUnique({ where: { id: documentId } });
  if (!doc || doc.partyId !== partyId) return { ok: false, error: "Choose one of this client's documents." };
  if (doc.malwareScan === "quarantined") return { ok: false, error: "This file was quarantined by the virus check." };
  if (!(OWNERSHIP_MIME as readonly string[]).includes(doc.mimeType)) return { ok: false, error: "The AI can read PDF, PNG and JPEG files." };
  if (doc.sizeBytes > 4_500_000) return { ok: false, error: "The file is too large for the AI (4.5 MB at most). Upload only the pages that list the owners." };
  const spent = await ownershipAiSpentCents(tx);
  if (spent + OWNERSHIP_AI_RESERVE_CENTS > OWNERSHIP_AI_CAP_CENTS) return { ok: false, error: "This month's AI allowance for ownership drafts is used up. Add the owners by hand, or try again next month." };
  if (!(await hit(`ai:${ctx.userId}`, { limit: 30, windowSec: 3600 }))) return { ok: false, error: "Too many AI drafts in the last hour. Try again later." };
  const party = await tx.party.findUniqueOrThrow({ where: { id: partyId }, select: { displayName: true } });
  const prompt = OWNERSHIP_PROMPT.replace("{client}", party.displayName.replace(/["<>]/g, ""));
  const log = await tx.aiCall.create({
    data: { firmId: ctx.firmId, userId: ctx.userId, purpose: "ownership-chart", objectId: documentId, provider: provider(), model: AI_MODEL, promptEnc: encryptField(ctx.firmId, `${prompt}\n\n[document ${doc.id}, ${doc.mimeType}, ${doc.sizeBytes} bytes]`) },
  });
  try {
    const bytes = await readBlob(ctx.firmId, doc.storageKey);
    const r = await callOwnershipModel(bytes, doc.mimeType, prompt);
    await tx.aiCall.update({ where: { id: log.id }, data: { outputEnc: encryptField(ctx.firmId, JSON.stringify(r.draft)), stopReason: r.stopReason, inputTokens: r.input, outputTokens: r.output } });
    if (r.stopReason === "refusal") return { ok: false, error: "The AI declined to read this document. Add the owners by hand." };
    if (!r.draft) return { ok: false, error: "The AI couldn't read the owners from this document. Add them by hand." };
    const people = draftToPeople(r.draft);
    if (!people.length) return { ok: false, error: "The AI found no owners or controllers in this document." };
    const x = await tx.registryExtract.create({
      data: {
        firmId: ctx.firmId, partyId, register: `Drafted by AI from ${doc.fileName}`, source: "UPLOADED_EXTRACT", documentId: doc.id, retrievedAt: new Date(),
        data: { provider: "AI", extractDate: new Date().toISOString().slice(0, 10), notes: `${r.draft.documentType}. Check every entry against the document before adding it.`, warnings: r.draft.warnings.slice(0, 10).map((w) => w.slice(0, 300)), people } as unknown as Prisma.InputJsonValue,
      },
    });
    return { ok: true, extractId: x.id, people: people.length, warnings: r.draft.warnings };
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `${e.status ?? ""} ${e.message}`.trim() : (e as Error).message;
    await tx.aiCall.update({ where: { id: log.id }, data: { error: msg.slice(0, 500) } });
    return { ok: false, error: "The AI service is not available right now. Add the owners by hand or try again later." };
  }
}
