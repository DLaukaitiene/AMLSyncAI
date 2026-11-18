import "server-only";
import type { Prisma } from "@prisma/client";
import { adminDb, withTenant, type Tx } from "./db";
import { audit, securityEvent } from "./audit";
import { encryptField } from "./crypto";
import { storeDocument } from "./storage";
import { loadClientFile, persistRiskIfChanged, upsertTask } from "./cdd";
import { appUrl } from "./email";
import { autoClear, CHECK_PRICE_CENTS, iso2, mapDecision, type MappedDecision } from "@/lib/didit/map";
import { toIsoDate } from "@/lib/rules/dates";
import { assertCanSpend, SpendError } from "./invoicing";
import { takeScreeningSlots } from "./screening-limits";

/**
 * Didit integration (identity verification + AML screening, EU processing).
 *   DIDIT_API_KEY       x-api-key (sandbox keys mock every check and cost nothing)
 *   DIDIT_WORKFLOW_ID   KYC workflow: eID wallets → document + NFC + liveness + face match (+ AML)
 *   DIDIT_WEBHOOK_SECRET  destination secret for X-Signature-V2
 *   DIDIT_BASE_URL      default https://verification.didit.me
 * Every check is charged to the firm's credit (€3.00) when it is created and
 * refunded when it expires, is abandoned or can't be created.
 */

const BASE = () => process.env.DIDIT_BASE_URL ?? "https://verification.didit.me";
export const diditEnabled = () => !!process.env.DIDIT_API_KEY;
const isSandboxKey = () => (process.env.DIDIT_API_KEY ?? "").startsWith("sk_test_") || process.env.DIDIT_SANDBOX === "1";

export class DiditError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function didit<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${BASE()}${path}`, {
    method,
    headers: { "x-api-key": process.env.DIDIT_API_KEY ?? "", "content-type": "application/json", accept: "application/json", ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new DiditError(`Didit ${method} ${path}: ${res.status} ${text}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Deletes sessions (data, images, video) at Didit at the end of the retention period. Best effort: a session already gone counts as deleted. */
export async function deleteDiditSessions(sessionIds: string[]): Promise<string[]> {
  const failed: string[] = [];
  if (!diditEnabled()) return sessionIds.length ? sessionIds : [];
  for (const id of sessionIds) {
    try {
      await didit("DELETE", `/v3/session/${encodeURIComponent(id)}/delete/`);
    } catch (e) {
      if (!(e instanceof DiditError && e.status === 404)) failed.push(id);
    }
  }
  return failed;
}

// ---------------------------------------------------------------------------
// Usage ledger (postpaid: billed on the monthly invoice; per-check statements)
// ---------------------------------------------------------------------------

export async function balanceCents(tx: Tx): Promise<number> {
  return (await tx.creditEntry.aggregate({ _sum: { amountCents: true } }))._sum.amountCents ?? 0;
}

async function charge(tx: Tx, firmId: string, userId: string | null, description: string, clientRef: string): Promise<string> {
  try {
    await assertCanSpend(tx, firmId, CHECK_PRICE_CENTS);
  } catch (e) {
    if (e instanceof SpendError) throw new DiditError(e.message);
    throw e;
  }
  const e = await tx.creditEntry.create({ data: { firmId, amountCents: -CHECK_PRICE_CENTS, kind: "charge", description, clientRef, createdById: userId } });
  return e.id;
}

async function refund(tx: Tx, firmId: string, chargeId: string, why: string) {
  if (await tx.creditEntry.count({ where: { kind: "refund", reference: chargeId } })) return; // once only
  const c = await tx.creditEntry.findUnique({ where: { id: chargeId } });
  if (!c) return;
  await tx.creditEntry.create({ data: { firmId, amountCents: -c.amountCents, kind: "refund", description: `Refund: ${why}`, reference: chargeId, clientRef: c.clientRef } });
}

// ---------------------------------------------------------------------------
// Identity verification sessions
// ---------------------------------------------------------------------------

export async function createIdvSession(
  tx: Tx,
  ctx: { firmId: string; userId: string | null },
  cddFileId: string,
  via: "staff" | "portal",
  callbackPath: string,
): Promise<{ url: string; id: string }> {
  if (!diditEnabled()) throw new DiditError("Identity checks are not set up for this installation.");
  const file = await tx.cddFile.findUniqueOrThrow({ where: { id: cddFileId }, include: { party: true } });
  if (file.party.kind !== "NATURAL") throw new DiditError("Identity checks are for people. For a company, check its representatives and owners.");
  const d = file.party.details as Record<string, unknown>;
  const chargeId = await charge(tx, ctx.firmId, ctx.userId, "Identity check (document / eID, chip, liveness, face match)", file.party.displayName);
  let created: { session_id: string; url: string; status: string };
  try {
    created = await didit("POST", "/v3/session/", {
      workflow_id: process.env.DIDIT_WORKFLOW_ID,
      vendor_data: file.partyId, // our party id, never personal data
      callback: appUrl(callbackPath),
      callback_method: "both",
      language: "en",
      metadata: { firm: ctx.firmId, cdd_file: cddFileId },
      expected_details: {
        ...(d.firstNames ? { first_name: d.firstNames } : {}),
        ...(d.lastName ? { last_name: d.lastName } : {}),
        ...(d.birthDate ? { date_of_birth: d.birthDate } : {}),
      },
    });
  } catch (e) {
    await refund(tx, ctx.firmId, chargeId, "check could not be created");
    throw e;
  }
  const row = await tx.diditSession.create({
    data: {
      firmId: ctx.firmId, partyId: file.partyId, cddFileId, kind: "idv", diditSessionId: created.session_id, url: created.url, status: created.status,
      sandbox: isSandboxKey(), creditEntryId: chargeId, createdVia: via, createdById: ctx.userId,
    },
  });
  await tx.creditEntry.update({ where: { id: chargeId }, data: { reference: created.session_id } });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "DiditSession", objectId: row.id, fields: ["idv"] });
  return { url: created.url, id: row.id };
}

const TERMINAL = new Set(["Approved", "Declined", "In Review"]);
const NO_RESULT = new Set(["Expired", "Abandoned"]);

/**
 * Fetches the decision and imports it: identity verification record, extracted
 * data (fills blanks, flags mismatches, never overwrites), every image and
 * video into our storage, Didit's PDF report, and AML hits for review.
 */
export async function refreshDiditSession(firmId: string, diditSessionId: string): Promise<{ status: string; imported: boolean }> {
  // Network calls happen outside database transactions (downloads can take minutes).
  const s0 = await withTenant(firmId, (tx) => tx.diditSession.findUnique({ where: { diditSessionId } }));
  if (!s0) throw new DiditError("Unknown check.");
  const decision = await didit<Record<string, unknown>>("GET", `/v3/session/${encodeURIComponent(diditSessionId)}/decision/`);
  const status = String(decision.status ?? s0.status);
  const willImport = TERMINAL.has(status) && !s0.importedAt;
  const m = mapDecision(decision);
  const files = willImport ? await downloadMedia(firmId, m, diditSessionId) : [];
  return withTenant(firmId, async (tx) => {
    const s = await tx.diditSession.findUniqueOrThrow({ where: { diditSessionId } });
    await tx.diditSession.update({ where: { id: s.id }, data: { status } });
    if (NO_RESULT.has(status) && s.creditEntryId) await refund(tx, firmId, s.creditEntryId, `check ${status.toLowerCase()} without a result`);
    if (!willImport || s.importedAt) return { status, imported: false }; // a concurrent webhook got there first
    await importDecision(tx, firmId, s, m, diditSessionId, files);
    await tx.diditSession.update({ where: { id: s.id }, data: { importedAt: new Date() } });
    return { status, imported: true };
  }, { timeoutMs: 120_000 });
}

type Downloaded = { kind: string; fileName: string; bytes: Uint8Array };

/** Media: presigned URLs expire, so pull everything now (time-stamped copies, AMLA CDD RTS), plus Didit's PDF report. */
async function downloadMedia(firmId: string, m: MappedDecision, diditSessionId: string): Promise<Downloaded[]> {
  const out: Downloaded[] = [];
  for (const item of m.media) {
    try {
      const r = await fetch(item.url, { signal: AbortSignal.timeout(120_000) });
      if (!r.ok) throw new Error(String(r.status));
      out.push({ kind: item.kind, fileName: item.fileName, bytes: new Uint8Array(await r.arrayBuffer()) });
    } catch (e) {
      await securityEvent({ firmId, kind: "idv-media-download-failed", details: { session: diditSessionId, kind: item.kind, error: String((e as Error).message).slice(0, 120) } });
    }
  }
  try {
    const r = await fetch(`${BASE()}/v3/session/${encodeURIComponent(diditSessionId)}/generate-pdf/`, { headers: { "x-api-key": process.env.DIDIT_API_KEY ?? "" }, signal: AbortSignal.timeout(60_000) });
    if (r.ok) out.push({ kind: "idv-report", fileName: "didit-report.pdf", bytes: new Uint8Array(await r.arrayBuffer()) });
  } catch {
    /* optional */
  }
  return out;
}

async function importDecision(tx: Tx, firmId: string, s: { id: string; partyId: string; cddFileId: string | null; kind: string }, m: MappedDecision, diditSessionId: string, files: Downloaded[]) {
  const party = await tx.party.findUniqueOrThrow({ where: { id: s.partyId } });
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId }, select: { autoClearBelow: true } });
  const now = new Date();

  if (!m.verification && s.kind === "idv" && s.cddFileId) {
    // Approved/declined without any ID data (e.g. a status set by hand in the provider console): a person must look.
    await upsertTask(tx, { firmId, kind: "idv-review", objectType: "CddFile", objectId: s.cddFileId, dueOn: toIsoDate(now), article: "Art. 22" });
  }
  if (m.verification && s.kind === "idv") {
    const v = m.verification;
    const passed = v.status === "Approved";
    const { extracted, ...rest } = v;
    if (passed) {
      const iv = await tx.identityVerification.create({
        data: {
          firmId, partyId: s.partyId, method: v.method, assuranceLevel: v.assuranceLevel, provider: "Didit", providerRef: diditSessionId,
          fallbackReason: v.fallbackReason, verifiedAt: now,
          details: { ...rest, documentType: extracted.documentType, issuingState: extracted.issuingState, expirationDate: extracted.expirationDate, retrievedAt: now.toISOString() } as Prisma.InputJsonValue,
        },
      });
      await tx.auditEvent.create({ data: { firmId, userId: null, action: "create", objectType: "IdentityVerification", objectId: iv.id, fields: ["method", "provider"] } });
    } else if (s.cddFileId) {
      // Declined or in review: no verification is recorded; a person looks at the check.
      await upsertTask(tx, { firmId, kind: "idv-review", objectType: "CddFile", objectId: s.cddFileId, dueOn: toIsoDate(now), article: "Art. 22" });
    }

    // Matching rule (recommendation 10): fill blanks only; never overwrite; flag differences.
    const d = (party.details ?? {}) as Record<string, unknown>;
    const fill: Record<string, unknown> = {};
    const mismatches: string[] = [];
    const cmp = (key: string, ours: unknown, theirs: string | undefined) => {
      if (!theirs) return;
      if (ours === undefined || ours === null || ours === "" || (Array.isArray(ours) && ours.length === 0)) fill[key] = key === "nationalities" ? [theirs] : theirs;
      else if (String(Array.isArray(ours) ? ours.join(",") : ours).toLowerCase().normalize("NFKD") !== theirs.toLowerCase().normalize("NFKD") && !(Array.isArray(ours) && ours.includes(theirs))) mismatches.push(`${key}: file "${Array.isArray(ours) ? ours.join(", ") : String(ours)}" vs ID "${theirs}"`);
    };
    cmp("firstNames", d.firstNames, extracted.firstNames);
    cmp("lastName", d.lastName, extracted.lastName);
    cmp("birthDate", d.birthDate, extracted.birthDate);
    cmp("placeOfBirth", d.placeOfBirth, extracted.placeOfBirth);
    cmp("nationalities", d.nationalities, extracted.nationality);
    cmp("address", d.address, extracted.address);
    await tx.party.update({
      where: { id: s.partyId },
      data: {
        details: { ...d, ...fill, ...(mismatches.length ? { idCheckMismatches: mismatches } : {}) } as Prisma.InputJsonValue,
        ...(extracted.personalNumber || extracted.documentNumber ? (party.nationalIdEnc ? {} : { nationalIdEnc: encryptField(firmId, extracted.personalNumber ?? extracted.documentNumber!) }) : {}),
      },
    });
    if (mismatches.length && s.cddFileId) {
      await upsertTask(tx, { firmId, kind: "idv-mismatch", objectType: "CddFile", objectId: s.cddFileId, dueOn: toIsoDate(now), article: "Art. 22" });
    }
  }

  for (const f of files) {
    const r = await storeDocument(tx, { firmId, partyId: s.partyId, kind: f.kind, fileName: f.fileName, bytes: f.bytes, uploadedBy: `didit:${diditSessionId}`, providerMedia: true });
    if (!r.ok) await securityEvent({ firmId, kind: "idv-media-rejected", details: { session: diditSessionId, kind: f.kind, error: r.error.slice(0, 120) } });
  }

  await importAml(tx, firmId, s.partyId, m, firm.autoClearBelow, diditSessionId);
  if (s.cddFileId) await persistRiskIfChanged(tx, firmId, await loadClientFile(tx, firmId, s.cddFileId));
}

/** AML hits from Didit → our review queue. Didit's own "False Positive" tag is ignored. */
async function importAml(tx: Tx, firmId: string, partyId: string, m: MappedDecision, autoClearBelow: number | null, ref: string) {
  if (!m.aml.screened) return;
  const now = new Date();
  const listVersion = m.aml.datasetsUpdatedAt ?? toIsoDate(now);
  if (m.aml.hits.length === 0) {
    await tx.screeningResult.create({ data: { firmId, partyId, listKind: "PEP", listName: "Didit AML (PEP, sanctions, adverse media)", listVersion, matchData: { clear: true, ref }, decision: "NO_MATCH", screenedAt: now } });
    return;
  }
  for (const h of m.aml.hits) {
    const ac = autoClear(h, autoClearBelow);
    const kind = h.sanctions ? "SANCTIONS" : h.datasets.some((x) => /adverse|media/i.test(x)) ? "ADVERSE_MEDIA" : "PEP";
    await tx.screeningResult.create({
      data: {
        firmId, partyId, listKind: kind, listName: `Didit AML: ${h.datasets.join(", ") || "watchlists"}`, listVersion, screenedAt: now,
        decision: ac.cleared ? "FALSE_POSITIVE" : "PENDING", comment: ac.cleared ? ac.reason : null, decidedAt: ac.cleared ? now : null,
        matchData: {
          matchedName: h.caption, score: h.matchScore !== null ? h.matchScore / 100 : null, riskScore: h.riskScore, datasets: h.datasets, url: h.url,
          providerReviewStatus: h.providerReviewStatus, ref,
          reasons: [`Match score ${h.matchScore ?? "?"} / risk score ${h.riskScore ?? "?"}`, `Lists: ${h.datasets.join(", ") || "—"}`, ...(h.providerReviewStatus ? [`Provider tag ignored: ${h.providerReviewStatus}`] : [])],
        } as Prisma.InputJsonValue,
      },
    });
    if (ac.cleared) await tx.auditEvent.create({ data: { firmId, userId: null, action: "update", objectType: "ScreeningResult", objectId: partyId, fields: ["auto-clear"] } });
  }
}

/** Paid provider screening of one party (person or company): PEP, sanctions, adverse media. */
export async function screenWithDidit(tx: Tx, ctx: { firmId: string; userId: string }, partyId: string, cddFileId: string | null) {
  if (!diditEnabled()) throw new DiditError("Provider screening is not set up for this installation.");
  const p = await tx.party.findUniqueOrThrow({ where: { id: partyId } });
  const d = (p.details ?? {}) as Record<string, unknown>;
  const slot = await takeScreeningSlots(tx, ctx.firmId, [partyId], "didit");
  if (slot.message) throw new DiditError(slot.message);
  const chargeId = await charge(tx, ctx.firmId, ctx.userId, "Screening: PEP, sanctions, adverse media", p.displayName);
  type AmlResp = { request_id: string; aml?: Record<string, unknown> } & Record<string, unknown>;
  let r: AmlResp;
  try {
    r = await didit<AmlResp>("POST", "/v3/aml/", {
      full_name: p.displayName,
      entity_type: p.kind === "NATURAL" ? "person" : "company",
      ...(d.birthDate ? { date_of_birth: d.birthDate } : {}),
      ...(p.kind === "NATURAL" && Array.isArray(d.nationalities) && d.nationalities[0] ? { nationality: iso2(String(d.nationalities[0])) } : {}),
      ...(p.kind !== "NATURAL" && d.countryOfCreation ? { nationality: d.countryOfCreation } : {}),
      include_adverse_media: true,
      // Return every candidate: we never let the provider hide hits (our own threshold applies).
      aml_match_score_threshold: 50,
      save_api_request: true,
      vendor_data: partyId,
      ...(isSandboxKey() && process.env.DIDIT_SANDBOX_AML_SCENARIO ? { sandbox_scenario: process.env.DIDIT_SANDBOX_AML_SCENARIO } : {}),
    }, { "Idempotency-Key": `${partyId}:${toIsoDate(new Date())}` });
  } catch (e) {
    await refund(tx, ctx.firmId, chargeId, "screening could not be run");
    throw e;
  }
  await tx.diditSession.create({
    data: { firmId: ctx.firmId, partyId, cddFileId, kind: "aml", diditSessionId: r.request_id, status: "Completed", sandbox: isSandboxKey(), creditEntryId: chargeId, createdVia: "staff", createdById: ctx.userId, importedAt: new Date() },
  });
  await tx.creditEntry.update({ where: { id: chargeId }, data: { reference: r.request_id } });
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: ctx.firmId }, select: { autoClearBelow: true } });
  const amlObj = (r.aml ?? r) as Record<string, unknown>;
  const m = mapDecision({ status: "Completed", aml_screenings: [{ ...amlObj, entity_type: p.kind === "NATURAL" ? "person" : "company" }] });
  await importAml(tx, ctx.firmId, partyId, m, firm.autoClearBelow, r.request_id);
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "DiditSession", objectId: partyId, fields: ["aml"] });
  return { hits: m.aml.hits.length };
}

/** Webhook: find the firm that owns the session, then refresh it. */
export async function handleDiditWebhook(sessionId: string) {
  const s = await adminDb.diditSession.findUnique({ where: { diditSessionId: sessionId } });
  if (!s) return { known: false };
  return { known: true, ...(await refreshDiditSession(s.firmId, sessionId)) };
}
