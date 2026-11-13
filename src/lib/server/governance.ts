import "server-only";
import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";
import { audit } from "./audit";
import { currentProfile } from "./country-profile";
import { encryptField } from "./crypto";
import { appUrl, sendEmail } from "./email";
import { upsertTask, closeTasks } from "./cdd";
import { annualReportDoc, type AnnualStats } from "@/lib/firm/annual-report";
import { EU_CORE_VERSION } from "@/lib/rules/eu-core";
import { addCalendarDays, addYears, toIsoDate } from "@/lib/rules/dates";

type Ctx = { firmId: string; userId: string };

export async function isOnePersonFirm(tx: Tx): Promise<boolean> {
  return (await tx.user.count({ where: { deactivatedAt: null, external: false } })) <= 1;
}

// ---------------------------------------------------------------------------
// Appointments (Art. 11). Removing the compliance officer → supervisor notice draft.
// ---------------------------------------------------------------------------

export async function appoint(tx: Tx, ctx: Ctx, fn: "compliance-manager" | "compliance-officer", userId: string, reason: string) {
  const today = toIsoDate(new Date());
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.deactivatedAt) throw new Error("This user has left the firm.");
  if (user.external) throw new Error("External users can't hold this function (Art. 18: these tasks can't be outsourced).");
  const role = fn === "compliance-officer" ? "COMPLIANCE_OFFICER" : "OWNER";
  if (!user.roles.includes(role)) await tx.user.update({ where: { id: userId }, data: { roles: [...user.roles, role] } });
  const current = await tx.appointment.findFirst({ where: { function: fn, toDate: null } });
  if (current?.userId === userId) return { noticeId: null };
  let noticeId: string | null = null;
  if (current) {
    await tx.appointment.update({ where: { id: current.id }, data: { toDate: new Date(today), reason } });
    if (fn === "compliance-officer") {
      const prev = await tx.user.findUniqueOrThrow({ where: { id: current.userId } });
      const { version } = await currentProfile(tx, ctx.firmId);
      const firm = await tx.firm.findUniqueOrThrow({ where: { id: ctx.firmId } });
      const r = await tx.report.create({
        data: {
          firmId: ctx.firmId, type: "SUPERVISOR_NOTICE", format: "text", euCoreVersion: EU_CORE_VERSION, countryProfileVersion: version,
          contentEnc: encryptField(ctx.firmId, JSON.stringify({
            subject: "Removal of the compliance officer (AMLR Art. 11)", firm: firm.name, removedOfficer: prev.name, removedOn: today,
            reasons: reason, newOfficer: user.name, newOfficerFrom: today,
          })),
        },
      });
      noticeId = r.id;
    }
  }
  const a = await tx.appointment.create({ data: { firmId: ctx.firmId, function: fn, userId, fromDate: new Date(today) } });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "Appointment", objectId: a.id, fields: ["function", "userId"] });
  return { noticeId };
}

/** Makes sure the first users holding the roles have appointment records. */
export async function ensureAppointments(tx: Tx, firmId: string) {
  for (const [fn, role] of [["compliance-manager", "OWNER"], ["compliance-officer", "COMPLIANCE_OFFICER"]] as const) {
    if (await tx.appointment.count({ where: { function: fn } })) continue;
    const u = await tx.user.findFirst({ where: { roles: { has: role }, deactivatedAt: null }, orderBy: { createdAt: "asc" } });
    if (u) await tx.appointment.create({ data: { firmId, function: fn, userId: u.id, fromDate: u.createdAt } });
  }
}

// ---------------------------------------------------------------------------
// Annual compliance report
// ---------------------------------------------------------------------------

export async function collectAnnualStats(tx: Tx, firmId: string): Promise<AnnualStats> {
  const to = toIsoDate(new Date());
  const from = addYears(to, -1);
  const since = new Date(from);
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId } });
  const users = await tx.user.findMany({ where: { deactivatedAt: null } });
  const name = (fn: string) => tx.appointment.findFirst({ where: { function: fn, toDate: null } }).then((a) => users.find((u) => u.id === a?.userId)?.name ?? "—");
  const files = await tx.cddFile.findMany({ where: { role: "CLIENT" }, include: { riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 }, party: true } });
  const active = files.filter((f) => ["COMPLETE", "SDD", "EDD"].includes(f.status));
  const byRisk: Record<string, number> = {};
  for (const f of active) byRisk[f.riskAssessments[0]?.final ?? "—"] = (byRisk[f.riskAssessments[0]?.final ?? "—"] ?? 0) + 1;
  const cases = await tx.case.findMany({ where: { createdAt: { gte: since } } });
  const ra = await tx.firmRiskAssessment.findFirst({ where: { status: "IN_FORCE" }, orderBy: { version: "desc" } });
  const raApproval = ra?.approvalId ? await tx.approval.findUnique({ where: { id: ra.approvalId } }) : null;
  const pol = await tx.policyDocument.findFirst({ where: { kind: "policy", status: "IN_FORCE" }, orderBy: { version: "desc" }, include: { acknowledgements: true } });
  const polApproval = pol?.approvalId ? await tx.approval.findUnique({ where: { id: pol.approvalId } }) : null;
  return {
    period: { from, to },
    firm: { name: firm.name, sectors: firm.sectors },
    officers: { manager: await name("compliance-manager"), officer: await name("compliance-officer") },
    clients: {
      active: active.length, byRisk,
      accepted: files.filter((f) => f.decidedAt && f.decidedAt >= since && ["COMPLETE", "SDD", "EDD"].includes(f.status)).length,
      refused: files.filter((f) => f.status === "REFUSED" && f.decidedAt && f.decidedAt >= since).length,
      terminated: files.filter((f) => f.status === "TERMINATED" && f.decidedAt && f.decidedAt >= since).length,
      pep: active.filter((f) => (f.party.details as { isPep?: boolean }).isPep).length,
    },
    overdueRefreshes: await tx.task.count({ where: { kind: "refresh", status: "OPEN", dueOn: { lt: new Date(to) } } }),
    screening: {
      checks: await tx.screeningResult.count({ where: { screenedAt: { gte: since } } }),
      hits: await tx.screeningResult.count({ where: { screenedAt: { gte: since }, decision: { in: ["PENDING", "TRUE_MATCH", "FALSE_POSITIVE"] } } }),
      trueMatches: await tx.screeningResult.count({ where: { screenedAt: { gte: since }, decision: "TRUE_MATCH" } }),
    },
    cases: {
      internalReports: cases.filter((c) => c.type === "INTERNAL_SUSPICION").length,
      strFiled: await tx.report.count({ where: { type: "STR", status: "SUBMITTED", submittedAt: { gte: since } } }),
      noReport: cases.filter((c) => c.type === "INTERNAL_SUSPICION" && (c.decision === "no-report" || c.decision === "privilege")).length,
      fiuRequests: cases.filter((c) => c.type === "FIU_REQUEST").length,
      discrepancies: cases.filter((c) => c.type === "DISCREPANCY").length,
      sanctionsHits: cases.filter((c) => c.type === "SANCTIONS_HIT").length,
    },
    thresholdReports: await tx.report.count({ where: { type: "THRESHOLD", createdAt: { gte: since } } }),
    training: {
      assigned: await tx.trainingAssignment.count({ where: { assignedAt: { gte: since } } }),
      completed: await tx.trainingAssignment.count({ where: { assignedAt: { gte: since }, completedAt: { not: null } } }),
    },
    riskAssessment: { version: ra?.version ?? null, residual: (ra?.result as { overallResidual?: string } | null)?.overallResidual ?? null, approvedOn: raApproval ? toIsoDate(raApproval.createdAt) : null },
    policy: { version: pol?.version ?? null, approvedOn: polApproval ? toIsoDate(polApproval.createdAt) : null, unacknowledged: pol ? users.filter((u) => !pol.acknowledgements.some((a) => a.userId === u.id)).length : 0 },
    outsourcing: await tx.outsourcingArrangement.count({ where: { OR: [{ endOn: null }, { endOn: { gte: new Date(to) } }] } }),
    whistleblowing: await tx.whistleblowingReport.count({ where: { createdAt: { gte: since } } }),
    openActions: ((ra?.result as { actions?: string[] } | null)?.actions ?? []).slice(0, 10),
  };
}

export async function generateAnnualReport(tx: Tx, ctx: Ctx) {
  await tx.policyDocument.deleteMany({ where: { kind: "annual-report", status: "DRAFT" } });
  const last = await tx.policyDocument.findFirst({ where: { kind: "annual-report" }, orderBy: { version: "desc" } });
  const version = (last?.version ?? 0) + 1;
  const doc = annualReportDoc(await collectAnnualStats(tx, ctx.firmId), version, toIsoDate(new Date()));
  const row = await tx.policyDocument.create({ data: { firmId: ctx.firmId, kind: "annual-report", version, content: doc as unknown as Prisma.InputJsonValue, euCoreVersion: EU_CORE_VERSION } });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "PolicyDocument", objectId: row.id });
  return row.id;
}

// ---------------------------------------------------------------------------
// Training (lite, Art. 12)
// ---------------------------------------------------------------------------

export const DEFAULT_TRAINING = {
  title: "AML essentials under the EU AML Regulation",
  minutes: 30,
  content: [
    "Why it matters: from 10 July 2027 the EU AML Regulation (EU) 2024/1624 applies directly to our firm. Breaches can lead to fines for the firm and for managers.",
    "Know your client: before we work for a client we identify and verify them and the people who own or control them (25% or more, or control by other means), understand the purpose of the work and screen everyone against sanctions lists. A client can't be accepted while anything is open.",
    "Higher risk: politically exposed persons, links with high-risk countries, complex structures, cash and unusual transactions need enhanced due diligence and senior approval.",
    "Cash: we never accept cash of €10,000 or more (or the lower national limit). Several smaller payments that belong together count as one.",
    "Suspicion: if something feels wrong, report it to the Compliance Officer at once using 'Report a suspicion'. Don't investigate on your own and don't complete the transaction until told it may go ahead.",
    "Tipping-off: never tell the client or anyone else that a report has been or may be made.",
    "Sanctions: a true sanctions match means we stop immediately and make nothing available to the person. The Compliance Officer notifies the authority.",
    "Records: everything we do is recorded and kept for 5 years after the relationship ends.",
  ].join("\n\n"),
};

export async function ensureDefaultModule(tx: Tx, firmId: string) {
  const m = await tx.trainingModule.findFirst({ orderBy: { createdAt: "asc" } });
  return m ?? tx.trainingModule.create({ data: { firmId, ...DEFAULT_TRAINING } });
}

export async function assignTraining(tx: Tx, ctx: Ctx, moduleId: string, userIds: string[], dueOn: string) {
  for (const userId of userIds) {
    const exists = await tx.trainingAssignment.findFirst({ where: { moduleId, userId, completedAt: null } });
    if (exists) continue;
    const a = await tx.trainingAssignment.create({ data: { firmId: ctx.firmId, moduleId, userId, dueOn: new Date(dueOn) } });
    await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "TrainingAssignment", objectId: a.id });
  }
}

export async function completeTraining(tx: Tx, ctx: Ctx & { userName: string }, assignmentId: string) {
  const a = await tx.trainingAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
  if (a.userId !== ctx.userId) throw new Error("You can only complete your own training.");
  await tx.trainingAssignment.update({ where: { id: assignmentId }, data: { completedAt: new Date(), attestation: `I completed this training and understood it. — ${ctx.userName}` } });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "update", objectType: "TrainingAssignment", objectId: assignmentId, fields: ["completedAt"] });
}

// ---------------------------------------------------------------------------
// Integrity declarations (Art. 13) — not for one-person firms
// ---------------------------------------------------------------------------

export const INTEGRITY_QUESTIONS = [
  { id: "convictions", text: "Have you been convicted of, or are you being prosecuted for, a financial crime, fraud, corruption or money laundering?" },
  { id: "aml-sanctions", text: "Have you been subject to sanctions by a supervisor or professional body?" },
  { id: "pep", text: "Are you, or a close family member, a politically exposed person?" },
  { id: "understood", text: "Have you read and understood the firm's AML/CTF policy and procedures?", expect: "yes" },
] as const;

export async function declareIntegrity(tx: Tx, ctx: Ctx, kind: "joining" | "annual", answers: Record<string, string>, conflicts: string) {
  const d = await tx.integrityDeclaration.create({ data: { firmId: ctx.firmId, userId: ctx.userId, kind, answers, conflicts: conflicts || null } });
  await closeTasks(tx, ctx.userId, "integrity-declaration");
  await upsertTask(tx, { firmId: ctx.firmId, kind: "integrity-declaration", objectType: "User", objectId: ctx.userId, dueOn: addYears(toIsoDate(new Date()), 1), article: "Art. 13" });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "IntegrityDeclaration", objectId: d.id });
  const flagged = INTEGRITY_QUESTIONS.some((q) => ("expect" in q ? answers[q.id] !== q.expect : answers[q.id] === "yes")) || !!conflicts;
  return { flagged };
}

// ---------------------------------------------------------------------------
// Whistleblowing (Art. 14) — acknowledge within 7 days (Directive 2019/1937 Art. 9)
// ---------------------------------------------------------------------------

export async function submitWhistleblowing(tx: Tx, ctx: Ctx, text: string, anonymous: boolean) {
  const r = await tx.whistleblowingReport.create({
    data: { firmId: ctx.firmId, contentEnc: encryptField(ctx.firmId, JSON.stringify({ text, submittedAt: new Date().toISOString() })), reporterId: anonymous ? null : ctx.userId },
  });
  await upsertTask(tx, { firmId: ctx.firmId, kind: "whistleblowing-ack", objectType: "WhistleblowingReport", objectId: r.id, dueOn: addCalendarDays(toIsoDate(new Date()), 7), article: "Art. 14" });
  // Audit without the reporter, so an anonymous report stays anonymous.
  await tx.auditEvent.create({ data: { firmId: ctx.firmId, userId: null, action: "create", objectType: "WhistleblowingReport", objectId: r.id, fields: [] } });
  const handlers = await tx.user.findMany({ where: { roles: { hasSome: ["OWNER", "COMPLIANCE_OFFICER"] }, deactivatedAt: null } });
  for (const h of handlers) await sendEmail(h.email, "A whistleblowing report was received", `Acknowledge it within 7 days:\n${appUrl("/app/firm/whistleblowing")}`);
}

export async function updateWhistleblowing(tx: Tx, ctx: Ctx, id: string, status: "acknowledged" | "closed") {
  await tx.whistleblowingReport.update({ where: { id }, data: { status, ...(status === "acknowledged" ? { acknowledgedAt: new Date() } : { closedAt: new Date() }) } });
  if (status === "acknowledged") await closeTasks(tx, id, "whistleblowing-ack");
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "update", objectType: "WhistleblowingReport", objectId: id, fields: ["status"] });
}

// ---------------------------------------------------------------------------
// Outsourcing register (Art. 18): prior notice to the supervisor + written agreement
// ---------------------------------------------------------------------------

export async function addOutsourcing(
  tx: Tx,
  ctx: Ctx,
  o: { provider: string; tasks: string; agreementSignedOn?: string; supervisorNotifiedOn?: string; startOn?: string; notes?: string },
) {
  const row = await tx.outsourcingArrangement.create({
    data: {
      firmId: ctx.firmId, provider: o.provider, tasks: o.tasks, notes: o.notes || null,
      agreementSignedOn: o.agreementSignedOn ? new Date(o.agreementSignedOn) : null,
      supervisorNotifiedOn: o.supervisorNotifiedOn ? new Date(o.supervisorNotifiedOn) : null,
      startOn: o.startOn ? new Date(o.startOn) : null,
    },
  });
  if (!o.supervisorNotifiedOn) {
    const { version } = await currentProfile(tx, ctx.firmId);
    const firm = await tx.firm.findUniqueOrThrow({ where: { id: ctx.firmId } });
    await tx.report.create({
      data: {
        firmId: ctx.firmId, type: "SUPERVISOR_NOTICE", format: "text", euCoreVersion: EU_CORE_VERSION, countryProfileVersion: version,
        contentEnc: encryptField(ctx.firmId, JSON.stringify({
          subject: "Prior notification of outsourcing (AMLR Art. 18)", firm: firm.name, provider: o.provider, tasks: o.tasks, plannedStart: o.startOn ?? "",
          statement: "The firm remains fully responsible. Decisions on risk, on establishing relationships and on reporting are not outsourced.",
        })),
      },
    });
  }
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "OutsourcingArrangement", objectId: row.id });
  return row.id;
}
