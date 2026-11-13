import "server-only";
import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";
import { audit } from "./audit";
import { currentProfile } from "./country-profile";
import { upsertTask } from "./cdd";
import { assess, riskAssessmentDoc, type Answers } from "@/lib/firm/risk-assessment";
import { buildPolicy, buildProcedures } from "@/lib/firm/policy-builder";
import { dpiaDoc, privacyNoticeDoc } from "@/lib/firm/privacy";
import { aiEnabled } from "./ai";
import type { GeneratedDoc } from "@/lib/docs/model";
import { EU_CORE_VERSION } from "@/lib/rules/eu-core";
import { addYears, toIsoDate } from "@/lib/rules/dates";

type Ctx = { firmId: string; userId: string };

// ---------------------------------------------------------------------------
// Firm risk assessment
// ---------------------------------------------------------------------------

export async function draftRiskAssessment(tx: Tx, ctx: Ctx) {
  const existing = await tx.firmRiskAssessment.findFirst({ where: { status: { in: ["DRAFT", "PENDING_APPROVAL"] } }, orderBy: { version: "desc" } });
  if (existing) return existing;
  const last = await tx.firmRiskAssessment.findFirst({ orderBy: { version: "desc" } });
  const { version } = await currentProfile(tx, ctx.firmId);
  const ra = await tx.firmRiskAssessment.create({
    data: { firmId: ctx.firmId, version: (last?.version ?? 0) + 1, answers: (last?.answers ?? {}) as Prisma.InputJsonValue, result: {}, euCoreVersion: EU_CORE_VERSION, countryProfileVersion: version },
  });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "FirmRiskAssessment", objectId: ra.id });
  return ra;
}

export async function saveRiskAnswers(tx: Tx, ctx: Ctx, id: string, answers: Answers) {
  const ra = await tx.firmRiskAssessment.findUniqueOrThrow({ where: { id } });
  if (ra.status !== "DRAFT") throw new Error("Only a draft can be changed.");
  const { profile, version } = await currentProfile(tx, ctx.firmId);
  const result = assess(answers, profile.nationalRiskAssessmentReviewed, profile.additionalEddCases.map((c) => c.description));
  await tx.firmRiskAssessment.update({ where: { id }, data: { answers, result: result as unknown as Prisma.InputJsonValue, countryProfileVersion: version } });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "update", objectType: "FirmRiskAssessment", objectId: id, fields: ["answers"] });
  return result;
}

export async function riskAssessmentAsDoc(tx: Tx, firmId: string, id: string): Promise<GeneratedDoc> {
  const ra = await tx.firmRiskAssessment.findUniqueOrThrow({ where: { id } });
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId } });
  const { profile } = await currentProfile(tx, firmId);
  const answers = ra.answers as Answers;
  const approval = ra.approvalId ? await tx.approval.findUnique({ where: { id: ra.approvalId }, include: { user: true } }) : null;
  return riskAssessmentDoc(
    { name: firm.name, sectors: firm.sectors, memberState: firm.homeState },
    answers,
    assess(answers, profile.nationalRiskAssessmentReviewed, profile.additionalEddCases.map((c) => c.description)),
    {
      version: ra.version, date: toIsoDate(ra.createdAt), euCoreVersion: ra.euCoreVersion, countryProfileVersion: ra.countryProfileVersion,
      status: ra.status === "IN_FORCE" ? "Approved, in force" : ra.status === "SUPERSEDED" ? "Superseded" : "Draft",
      approvedBy: approval ? `${approval.user.name} on ${toIsoDate(approval.createdAt)}` : undefined,
    },
  );
}

/** Management approval (Art. 10): makes the assessment final and schedules the yearly review. */
export async function approveRiskAssessment(tx: Tx, ctx: Ctx, id: string): Promise<{ ok: boolean; error?: string }> {
  const ra = await tx.firmRiskAssessment.findUniqueOrThrow({ where: { id } });
  if (ra.status !== "DRAFT") return { ok: false, error: "Only a draft can be approved." };
  const result = ra.result as { unanswered?: string[] };
  if (!result.unanswered || result.unanswered.length) return { ok: false, error: "Answer every question before approval." };
  const approval = await tx.approval.create({
    data: { firmId: ctx.firmId, objectType: "FirmRiskAssessment", objectId: id, decision: "APPROVED", userId: ctx.userId, role: "OWNER", euCoreVersion: ra.euCoreVersion, countryProfileVersion: ra.countryProfileVersion },
  });
  await tx.firmRiskAssessment.updateMany({ where: { status: "IN_FORCE" }, data: { status: "SUPERSEDED" } });
  await tx.firmRiskAssessment.update({ where: { id }, data: { status: "IN_FORCE", approvalId: approval.id } });
  await tx.task.updateMany({ where: { kind: { in: ["risk-assessment-review", "risk-assessment"] }, status: "OPEN" }, data: { status: "DONE" } });
  await upsertTask(tx, { firmId: ctx.firmId, kind: "risk-assessment-review", objectType: "FirmRiskAssessment", objectId: id, dueOn: addYears(toIsoDate(new Date()), 1), article: "Art. 10" });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "approve", objectType: "FirmRiskAssessment", objectId: id, fields: ["status"] });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Policies and procedures
// ---------------------------------------------------------------------------

export async function generatePolicies(tx: Tx, ctx: Ctx) {
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: ctx.firmId } });
  const { profile } = await currentProfile(tx, ctx.firmId);
  const users = await tx.user.findMany({ where: { deactivatedAt: null } });
  const ra = await tx.firmRiskAssessment.findFirst({ where: { status: "IN_FORCE" }, orderBy: { version: "desc" } });
  const raResult = ra?.result as { overallResidual?: string; actions?: string[] } | undefined;
  const input = {
    firm: { name: firm.name, sectors: firm.sectors, memberState: firm.homeState, onePersonFirm: users.length <= 1 },
    officers: {
      complianceManager: users.filter((u) => u.roles.includes("OWNER")).map((u) => u.name).join(", ") || "—",
      complianceOfficer: users.filter((u) => u.roles.includes("COMPLIANCE_OFFICER")).map((u) => u.name).join(", ") || "—",
    },
    riskLevel: raResult?.overallResidual,
    riskActions: raResult?.actions,
    profile,
  };
  const today = toIsoDate(new Date());
  const ids: string[] = [];
  for (const kind of ["policy", "procedure"] as const) {
    await tx.policyDocument.deleteMany({ where: { kind, status: "DRAFT" } }); // regenerate replaces an unapproved draft
    const last = await tx.policyDocument.findFirst({ where: { kind }, orderBy: { version: "desc" } });
    const version = (last?.version ?? 0) + 1;
    const doc = kind === "policy" ? buildPolicy(input, version, today) : buildProcedures(input, version, today);
    const row = await tx.policyDocument.create({ data: { firmId: ctx.firmId, kind, version, content: doc as unknown as Prisma.InputJsonValue, euCoreVersion: EU_CORE_VERSION } });
    await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "PolicyDocument", objectId: row.id });
    ids.push(row.id);
  }
  return ids;
}

/** Edits one section of a draft. Text edits are allowed only on drafts; an in-force document is changed by generating a new version. */
export async function editPolicySection(tx: Tx, ctx: Ctx, id: string, sectionId: string, text: string) {
  const d = await tx.policyDocument.findUniqueOrThrow({ where: { id } });
  if (d.status !== "DRAFT") throw new Error("Only a draft can be edited.");
  const doc = d.content as unknown as GeneratedDoc;
  const sections = doc.sections.map((s) => (s.id === sectionId ? { ...s, blocks: text.split(/\n{2,}/).map((p) => ({ p: p.trim() })).filter((b) => b.p) } : s));
  await tx.policyDocument.update({ where: { id }, data: { content: { ...doc, sections } as unknown as Prisma.InputJsonValue } });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "update", objectType: "PolicyDocument", objectId: id, fields: [sectionId] });
}

/** Policy: management approval. Procedures: compliance manager (Owner role). Staff must re-acknowledge. */
export async function approvePolicy(tx: Tx, ctx: Ctx, id: string) {
  const d = await tx.policyDocument.findUniqueOrThrow({ where: { id } });
  if (d.status !== "DRAFT") throw new Error("Only a draft can be approved.");
  const { version } = await currentProfile(tx, ctx.firmId);
  const approval = await tx.approval.create({
    data: { firmId: ctx.firmId, objectType: `PolicyDocument:${d.kind}`, objectId: id, decision: "APPROVED", userId: ctx.userId, role: "OWNER", euCoreVersion: d.euCoreVersion, countryProfileVersion: version },
  });
  await tx.policyDocument.updateMany({ where: { kind: d.kind, status: "IN_FORCE" }, data: { status: "SUPERSEDED" } });
  await tx.policyDocument.update({ where: { id }, data: { status: "IN_FORCE", approvalId: approval.id } });
  await upsertTask(tx, {
    firmId: ctx.firmId, kind: d.kind === "annual-report" ? "annual-report" : "policy-review", objectType: "PolicyDocument", objectId: id,
    dueOn: addYears(toIsoDate(new Date()), 1), article: d.kind === "annual-report" ? "Art. 11" : "Art. 9",
  });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "approve", objectType: "PolicyDocument", objectId: id, fields: ["status"] });
}

export async function acknowledgePolicy(tx: Tx, ctx: Ctx, id: string) {
  const d = await tx.policyDocument.findUniqueOrThrow({ where: { id } });
  if (d.status !== "IN_FORCE") throw new Error("Only the policy in force can be acknowledged.");
  await tx.policyAcknowledgement.upsert({ where: { policyId_userId: { policyId: id, userId: ctx.userId } }, create: { firmId: ctx.firmId, policyId: id, userId: ctx.userId }, update: {} });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "update", objectType: "PolicyDocument", objectId: id, fields: ["acknowledged"] });
}

/** Privacy notice / DPIA draft from the firm and its Country Profile. */
export async function generatePrivacyDoc(tx: Tx, ctx: Ctx, kind: "privacy-notice" | "dpia") {
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: ctx.firmId } });
  const { profile } = await currentProfile(tx, ctx.firmId);
  await tx.policyDocument.deleteMany({ where: { kind, status: "DRAFT" } });
  const last = await tx.policyDocument.findFirst({ where: { kind }, orderBy: { version: "desc" } });
  const version = (last?.version ?? 0) + 1;
  const input = { firm: { name: firm.name, memberState: firm.homeState, emailDomain: firm.emailDomain }, profile, aiEnabled: aiEnabled() };
  const doc = kind === "privacy-notice" ? privacyNoticeDoc(input, version, toIsoDate(new Date())) : dpiaDoc(input, version, toIsoDate(new Date()));
  const row = await tx.policyDocument.create({ data: { firmId: ctx.firmId, kind, version, content: doc as unknown as Prisma.InputJsonValue, euCoreVersion: EU_CORE_VERSION } });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "PolicyDocument", objectId: row.id });
  return row.id;
}
