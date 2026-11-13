import "server-only";
import type { Case, CaseType, ReportType } from "@prisma/client";
import type { Tx } from "./db";
import { audit } from "./audit";
import { decryptField, encryptField } from "./crypto";
import { appUrl, sendEmail } from "./email";
import { currentProfile } from "./country-profile";
import { closeTasks, upsertTask } from "./cdd";
import { canMarkSubmitted } from "@/lib/rules/country-profile";
import { discrepancyDue, fiuRequestDue, transactionHoldEnds } from "@/lib/rules/deadlines";
import { EU_CORE_VERSION } from "@/lib/rules/eu-core";
import { toIsoDate } from "@/lib/rules/dates";

/**
 * Cases (spec §4.6, §11.10): internal suspicion reports, sanctions hits, BO
 * register discrepancies and FIU requests. Case content is encrypted with the
 * firm's key and only the Compliance Officer can open cases — enforced on the
 * server. Every assessment is kept, including "no report".
 */

export interface CaseLogEntry {
  at: string;
  by: string; // user id
  action: string;
  text?: string;
}

export interface CaseContent {
  summary?: string;
  details?: string;
  attempted?: boolean;
  amountEUR?: number;
  raisedBy?: string;
  raisedAt?: string;
  source?: string;
  reason?: string;
  fiu?: { reference: string; received: string; request: string };
  discrepancy?: { register: string; description: string };
  log?: CaseLogEntry[];
  [k: string]: unknown;
}

type Ctx = { firmId: string; userId: string };

export const readContent = (firmId: string, c: Pick<Case, "contentEnc">): CaseContent => JSON.parse(decryptField(firmId, c.contentEnc));
const writeContent = (firmId: string, content: CaseContent) => encryptField(firmId, JSON.stringify(content));

function withLog(content: CaseContent, e: Omit<CaseLogEntry, "at">): CaseContent {
  return { ...content, log: [...(content.log ?? []), { ...e, at: new Date().toISOString() }] };
}

async function notifyOfficers(tx: Tx, firmId: string, subject: string) {
  // The email says only that something needs review — never the content (no tipping-off risk).
  const officers = await tx.user.findMany({ where: { roles: { has: "COMPLIANCE_OFFICER" }, deactivatedAt: null } });
  for (const o of officers) await sendEmail(o.email, subject, `Sign in to AMLSyncAI to review it:\n${appUrl("/app/cases")}`);
}

async function createReport(tx: Tx, firmId: string, type: ReportType, content: Record<string, unknown>, ref: { caseId?: string; matterId?: string }) {
  const { version } = await currentProfile(tx, firmId);
  return tx.report.create({
    data: {
      firmId, type, caseId: ref.caseId ?? null, matterId: ref.matterId ?? null, format: "text", status: "DRAFT",
      contentEnc: encryptField(firmId, JSON.stringify(content)), euCoreVersion: EU_CORE_VERSION, countryProfileVersion: version,
    },
  });
}

// ---------------------------------------------------------------------------
// Internal suspicion report — any user can raise one (Art. 69, §4.6)
// ---------------------------------------------------------------------------

export async function raiseSuspicion(
  tx: Tx,
  ctx: Ctx,
  r: { partyIds: string[]; matterIds: string[]; summary: string; details: string; attempted: boolean; amountEUR?: number },
) {
  const content: CaseContent = withLog(
    { summary: r.summary, details: r.details, attempted: r.attempted, amountEUR: r.amountEUR, raisedBy: ctx.userId, raisedAt: new Date().toISOString() },
    { by: ctx.userId, action: "raised" },
  );
  const c = await tx.case.create({
    data: { firmId: ctx.firmId, type: "INTERNAL_SUSPICION", partyIds: r.partyIds, matterIds: r.matterIds, createdById: ctx.userId, contentEnc: writeContent(ctx.firmId, content) },
  });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "Case", objectId: c.id });
  await notifyOfficers(tx, ctx.firmId, "A new internal report needs your review");
  return c.id;
}

export type CaseDecision = "report" | "no-report" | "privilege";

/**
 * The Compliance Officer's decision. "report" creates the STR draft and, if the
 * transaction is still pending, starts the Art. 71 hold (3 working days).
 */
export async function decideSuspicion(tx: Tx, ctx: Ctx, caseId: string, d: { decision: CaseDecision; reasons: string; hold: boolean }) {
  const c = await tx.case.findUniqueOrThrow({ where: { id: caseId } });
  if (c.type !== "INTERNAL_SUSPICION" || c.status !== "open") throw new Error("This case is already decided.");
  const { profile } = await currentProfile(tx, ctx.firmId);
  const content = withLog(readContent(ctx.firmId, c), { by: ctx.userId, action: `decision: ${d.decision}`, text: d.reasons });
  const today = toIsoDate(new Date());
  let holdEnds: string | null = null;
  if (d.decision === "report" && d.hold && c.matterIds.length) holdEnds = transactionHoldEnds(today, profile).due;

  await tx.case.update({
    where: { id: caseId },
    data: {
      decision: d.decision, status: "decided", privilegeApplies: d.decision === "privilege", contentEnc: writeContent(ctx.firmId, content),
      holdStartedOn: holdEnds ? new Date(today) : null, holdEndsOn: holdEnds ? new Date(holdEnds) : null,
    },
  });
  if (d.decision === "report") {
    const parties = await tx.party.findMany({ where: { id: { in: c.partyIds } } });
    await createReport(tx, ctx.firmId, "STR", {
      subjects: parties.map((p) => ({ name: p.displayName, kind: p.kind, details: p.details })),
      grounds: content.details ?? "",
      summary: content.summary ?? "",
      attempted: !!content.attempted,
      amountEUR: content.amountEUR ?? null,
      narrative: draftNarrative(content, parties.map((p) => p.displayName)),
    }, { caseId });
  }
  if (holdEnds) {
    await upsertTask(tx, { firmId: ctx.firmId, kind: "transaction-hold", objectType: "Case", objectId: caseId, dueOn: holdEnds, article: "Art. 71" });
  }
  const { version } = await currentProfile(tx, ctx.firmId);
  await tx.approval.create({
    data: { firmId: ctx.firmId, objectType: "Case:decision", objectId: caseId, decision: "APPROVED", userId: ctx.userId, role: "COMPLIANCE_OFFICER", euCoreVersion: EU_CORE_VERSION, countryProfileVersion: version },
  });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "approve", objectType: "Case", objectId: caseId, fields: ["decision"] });
  return { holdEnds };
}

/** Template-based first draft; the Compliance Officer edits it. (AI drafting comes later, always reviewed.) */
function draftNarrative(c: CaseContent, names: string[]): string {
  return [
    `Subject(s): ${names.join(", ") || "—"}.`,
    `What happened: ${c.summary ?? ""}`,
    `Why it is suspicious: ${c.details ?? ""}`,
    c.amountEUR ? `Amount involved: €${c.amountEUR.toLocaleString("en")}.` : "",
    c.attempted ? "The transaction was attempted but not carried out." : "",
    "Measures taken: the transaction was held pending this report; the client has not been informed (Art. 73).",
  ].filter(Boolean).join("\n\n");
}

/** FIU instruction during the hold (Art. 71): proceed lifts the hold, stop keeps the matter blocked. */
export async function recordFiuInstruction(tx: Tx, ctx: Ctx, caseId: string, instruction: "proceed" | "stop", note: string) {
  const c = await tx.case.findUniqueOrThrow({ where: { id: caseId } });
  const content = withLog(readContent(ctx.firmId, c), { by: ctx.userId, action: `FIU instruction: ${instruction}`, text: note });
  await tx.case.update({
    where: { id: caseId },
    data: { fiuInstruction: instruction, contentEnc: writeContent(ctx.firmId, content), ...(instruction === "proceed" ? { holdEndsOn: new Date(toIsoDate(new Date())) } : {}) },
  });
  await closeTasks(tx, caseId, "transaction-hold");
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "update", objectType: "Case", objectId: caseId, fields: ["fiuInstruction"] });
}

/** True while a matter is held by an STR (3 working days, or an FIU "stop"). */
export async function matterHeld(tx: Tx, matterId: string): Promise<boolean> {
  const today = new Date(toIsoDate(new Date()));
  return (
    (await tx.case.count({
      where: { matterIds: { has: matterId }, OR: [{ fiuInstruction: "stop" }, { fiuInstruction: null, holdEndsOn: { gt: today } }] },
    })) > 0
  );
}

export async function addCaseNote(tx: Tx, ctx: Ctx, caseId: string, text: string) {
  const c = await tx.case.findUniqueOrThrow({ where: { id: caseId } });
  await tx.case.update({ where: { id: caseId }, data: { contentEnc: writeContent(ctx.firmId, withLog(readContent(ctx.firmId, c), { by: ctx.userId, action: "note", text })) } });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "update", objectType: "Case", objectId: caseId, fields: ["note"] });
}

// ---------------------------------------------------------------------------
// FIU requests (Art. 69(1)(b)): answer within 5 working days or the FIU's deadline
// ---------------------------------------------------------------------------

export async function logFiuRequest(
  tx: Tx,
  ctx: Ctx,
  r: { received: string; reference: string; request: string; deadlineWorkingDays?: number; partyIds: string[] },
) {
  const { profile } = await currentProfile(tx, ctx.firmId);
  const due = fiuRequestDue(r.received, profile, r.deadlineWorkingDays).due;
  const content = withLog({ fiu: { reference: r.reference, received: r.received, request: r.request } }, { by: ctx.userId, action: "FIU request logged" });
  const c = await tx.case.create({
    data: { firmId: ctx.firmId, type: "FIU_REQUEST", partyIds: r.partyIds, matterIds: [], createdById: ctx.userId, dueOn: new Date(due), contentEnc: writeContent(ctx.firmId, content) },
  });
  await upsertTask(tx, { firmId: ctx.firmId, kind: "fiu-request", objectType: "Case", objectId: c.id, dueOn: due, article: "Art. 69(1)(b)" });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "Case", objectId: c.id });
  return { id: c.id, due };
}

export async function answerFiuRequest(tx: Tx, ctx: Ctx, caseId: string, note: string) {
  const c = await tx.case.findUniqueOrThrow({ where: { id: caseId } });
  await tx.case.update({
    where: { id: caseId },
    data: { status: "answered", closedAt: new Date(), contentEnc: writeContent(ctx.firmId, withLog(readContent(ctx.firmId, c), { by: ctx.userId, action: "answered", text: note })) },
  });
  await closeTasks(tx, caseId, "fiu-request");
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "update", objectType: "Case", objectId: caseId, fields: ["status"] });
}

// ---------------------------------------------------------------------------
// BO register discrepancies (Art. 24): report within 14 days unless corrected
// ---------------------------------------------------------------------------

export async function openDiscrepancy(tx: Tx, ctx: Ctx, partyId: string, register: string, description: string) {
  const due = discrepancyDue(toIsoDate(new Date())).due;
  const content = withLog({ discrepancy: { register, description } }, { by: ctx.userId, action: "discrepancy found" });
  const c = await tx.case.create({
    data: { firmId: ctx.firmId, type: "DISCREPANCY", partyIds: [partyId], matterIds: [], createdById: ctx.userId, dueOn: new Date(due), contentEnc: writeContent(ctx.firmId, content) },
  });
  const party = await tx.party.findUniqueOrThrow({ where: { id: partyId } });
  await createReport(tx, ctx.firmId, "DISCREPANCY", { entity: party.displayName, register, description }, { caseId: c.id });
  await upsertTask(tx, { firmId: ctx.firmId, kind: "discrepancy-report", objectType: "Case", objectId: c.id, dueOn: due, article: "Art. 24" });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "Case", objectId: c.id });
  return c.id;
}

export async function resolveDiscrepancy(tx: Tx, ctx: Ctx, caseId: string, how: "client-corrected", note: string) {
  const c = await tx.case.findUniqueOrThrow({ where: { id: caseId } });
  await tx.case.update({
    where: { id: caseId },
    data: { status: "resolved", closedAt: new Date(), contentEnc: writeContent(ctx.firmId, withLog(readContent(ctx.firmId, c), { by: ctx.userId, action: how, text: note })) },
  });
  await tx.report.updateMany({ where: { caseId, status: "DRAFT" }, data: { status: "EXPORTED" } }); // no longer needed
  await closeTasks(tx, caseId);
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "update", objectType: "Case", objectId: caseId, fields: ["status"] });
}

// ---------------------------------------------------------------------------
// Sanctions hits: notice to the national sanctions authority (separate from STR)
// ---------------------------------------------------------------------------

export async function ensureSanctionsNotice(tx: Tx, firmId: string, caseId: string) {
  if (await tx.report.count({ where: { caseId, type: "SANCTIONS_NOTICE" } })) return;
  const c = await tx.case.findUniqueOrThrow({ where: { id: caseId } });
  const parties = await tx.party.findMany({ where: { id: { in: c.partyIds } } });
  const content = readContent(firmId, c);
  await createReport(tx, firmId, "SANCTIONS_NOTICE", {
    subjects: parties.map((p) => p.displayName),
    list: content.list, listVersion: content.listVersion, reviewerComment: content.comment,
    measures: "Business relationship and transactions stopped; no funds or economic resources made available; assets frozen where held.",
  }, { caseId });
}

// ---------------------------------------------------------------------------
// Reports: export and "submitted" (needs the channel in the Country Profile + a receipt)
// ---------------------------------------------------------------------------

const KIND: Record<ReportType, Parameters<typeof canMarkSubmitted>[1]> = {
  STR: "str", THRESHOLD: "threshold-report", CASH: "cash-report", DISCREPANCY: "discrepancy-report", SANCTIONS_NOTICE: "sanctions-notice", SUPERVISOR_NOTICE: "supervisor-notice",
};

export const REPORT_LABELS: Record<ReportType, string> = {
  STR: "Suspicious transaction report", THRESHOLD: "Threshold report (Art. 74)", CASH: "National cash report", DISCREPANCY: "BO register discrepancy report",
  SANCTIONS_NOTICE: "Notice to sanctions authority", SUPERVISOR_NOTICE: "Notice to supervisor",
};

export async function updateReportNarrative(tx: Tx, ctx: Ctx, reportId: string, narrative: string) {
  const r = await tx.report.findUniqueOrThrow({ where: { id: reportId } });
  if (r.status === "SUBMITTED") throw new Error("A submitted report can't be changed.");
  const content = JSON.parse(decryptField(ctx.firmId, r.contentEnc));
  await tx.report.update({ where: { id: reportId }, data: { contentEnc: encryptField(ctx.firmId, JSON.stringify({ ...content, narrative, editedBy: ctx.userId, editedAt: new Date().toISOString() })) } });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "update", objectType: "Report", objectId: reportId, fields: ["narrative"] });
}

export async function markReportSubmitted(tx: Tx, ctx: Ctx, reportId: string, reference: string): Promise<{ ok: boolean; error?: string }> {
  const r = await tx.report.findUniqueOrThrow({ where: { id: reportId } });
  if (r.status === "SUBMITTED") return { ok: false, error: "Already submitted." };
  const { profile } = await currentProfile(tx, ctx.firmId);
  const gate = canMarkSubmitted(profile, KIND[r.type]);
  if (!gate.allowed) return { ok: false, error: gate.reason };
  if (reference.trim().length < 3) return { ok: false, error: "Enter the submission reference or receipt number." };
  await tx.report.update({ where: { id: reportId }, data: { status: "SUBMITTED", submittedAt: new Date(), submissionRef: reference.trim() } });
  if (r.caseId) {
    const c = await tx.case.findUniqueOrThrow({ where: { id: r.caseId } });
    const closes = r.type === "DISCREPANCY" || r.type === "SANCTIONS_NOTICE" || (r.type === "STR" && c.status === "decided");
    if (closes) {
      await tx.case.update({ where: { id: c.id }, data: { status: r.type === "STR" ? c.status : "closed", contentEnc: writeContent(ctx.firmId, withLog(readContent(ctx.firmId, c), { by: ctx.userId, action: `${REPORT_LABELS[r.type]} submitted`, text: reference })) } });
      if (r.type === "DISCREPANCY") await closeTasks(tx, c.id, "discrepancy-report");
    }
  }
  if (r.matterId && r.type === "THRESHOLD") await closeTasks(tx, r.matterId, "threshold-report");
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "update", objectType: "Report", objectId: reportId, fields: ["status", "submissionRef"] });
  return { ok: true };
}

/** Plain-text export for upload to the national channel (FIU portal, goAML web form, register, authority). */
export function renderReport(type: ReportType, content: Record<string, unknown>, meta: { firmName: string; exportedBy: string; at: string; profileVersion: number }): string {
  const lines = [
    `${REPORT_LABELS[type].toUpperCase()}`,
    `Reporting entity: ${meta.firmName}`,
    `Prepared: ${meta.at} by ${meta.exportedBy} (EU Core ${EU_CORE_VERSION}, Country Profile v${meta.profileVersion})`,
    "CONFIDENTIAL — do not disclose to the client (AMLR Art. 73).",
    "",
  ];
  const render = (v: unknown, indent = ""): string[] => {
    if (v === null || v === undefined || v === "") return [];
    if (Array.isArray(v)) return v.flatMap((x, i) => [`${indent}- [${i + 1}]`, ...render(x, indent + "    ")]);
    if (typeof v === "object") return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => (typeof x === "object" && x !== null ? [`${indent}${k}:`, ...render(x, indent + "  ")] : x === undefined || x === "" ? [] : [`${indent}${k}: ${String(x)}`]));
    return [`${indent}${String(v)}`];
  };
  const { narrative, ...rest } = content;
  lines.push(...render(rest));
  if (narrative) lines.push("", "NARRATIVE", String(narrative));
  return lines.join("\n") + "\n";
}

export const CASE_LABELS: Record<CaseType, string> = {
  INTERNAL_SUSPICION: "Internal suspicion report", SANCTIONS_HIT: "Sanctions hit", DISCREPANCY: "BO register discrepancy", FIU_REQUEST: "FIU request",
};
