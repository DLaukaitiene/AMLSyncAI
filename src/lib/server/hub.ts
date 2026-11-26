import "server-only";
import type { Tx } from "./db";
import { firmObligations } from "./obligations";
import type { ObligationState } from "@/lib/obligations/evaluate";
import { dueText, earliest, type DueTone } from "@/lib/obligations/due";

const YEAR = 365 * 86_400_000;
const addYear = (d: Date) => new Date(d.getTime() + YEAR);

export type HubKey = "risk-assessment" | "policies" | "governance" | "training" | "integrity" | "whistleblowing" | "outsourcing" | "privacy";
export interface HubStatus { state: ObligationState; detail: string; next: { text: string; tone: DueTone } | null }

/**
 * Status of each Compliance Hub part (same evaluation as the dashboard) plus
 * the next date that matters: yearly reviews, training, declarations, contracts.
 */
export async function hubStatuses(tx: Tx, firmId: string): Promise<Record<HubKey, HubStatus>> {
  const now = new Date();
  const { statuses, input } = await firmObligations(tx, firmId, { seeCases: false });
  const ob = (id: string) => statuses.find((s) => s.id === id)!;
  const staffIds = new Set(input.staff.map((s) => s.id));
  const openTaskDue = async (kind: string) => (await tx.task.findFirst({ where: { kind, status: "OPEN" }, orderBy: { dueOn: "asc" }, select: { dueOn: true } }))?.dueOn ?? null;

  const [ra, policy, procedure, raReview, policyReview, assignments, completed, external, declarations, outsourcing, privacyDocs] = await Promise.all([
    tx.firmRiskAssessment.findFirst({ where: { status: "IN_FORCE" }, orderBy: { version: "desc" }, select: { version: true } }),
    tx.policyDocument.findFirst({ where: { kind: "policy", status: "IN_FORCE" }, orderBy: { version: "desc" }, select: { version: true } }),
    tx.policyDocument.findFirst({ where: { kind: "procedure", status: "IN_FORCE" }, orderBy: { version: "desc" }, select: { version: true } }),
    openTaskDue("risk-assessment-review"),
    openTaskDue("policy-review"),
    tx.trainingAssignment.findMany({ where: { completedAt: null }, select: { dueOn: true, userId: true } }),
    tx.trainingAssignment.findMany({ where: { completedAt: { not: null } }, select: { userId: true, completedAt: true } }),
    tx.externalTraining.findMany({ select: { date: true, attendeeIds: true } }),
    tx.integrityDeclaration.findMany({ select: { userId: true, declaredAt: true } }),
    tx.outsourcingArrangement.findMany({ select: { provider: true, agreementSignedOn: true, supervisorNotifiedOn: true, endOn: true } }),
    tx.policyDocument.findMany({ where: { kind: { in: ["privacy-notice", "dpia"] }, status: { in: ["DRAFT", "IN_FORCE"] } }, select: { kind: true, status: true, version: true } }),
  ]);

  // Training: open assignments first; otherwise each person's yearly refresher.
  const lastTrained = new Map<string, Date>();
  const seen = (u: string, d: Date | null) => { if (d && staffIds.has(u) && (!lastTrained.get(u) || d > lastTrained.get(u)!)) lastTrained.set(u, d); };
  completed.forEach((c) => seen(c.userId, c.completedAt));
  external.forEach((e) => e.attendeeIds.forEach((u) => seen(u, e.date)));
  const trainingNext = earliest(assignments.filter((a) => staffIds.has(a.userId)).map((a) => a.dueOn))
    ?? (lastTrained.size === staffIds.size && staffIds.size ? earliest([...lastTrained.values()].map(addYear)) : null);

  // Integrity: each colleague declares every year.
  const lastDeclared = new Map<string, Date>();
  declarations.forEach((d) => { if (staffIds.has(d.userId) && (!lastDeclared.get(d.userId) || d.declaredAt > lastDeclared.get(d.userId)!)) lastDeclared.set(d.userId, d.declaredAt); });
  const integrityNext = lastDeclared.size === staffIds.size && staffIds.size ? earliest([...lastDeclared.values()].map(addYear)) : null;

  // Outsourcing: written agreement and supervisor notice for each arrangement.
  const live = outsourcing.filter((o) => !o.endOn || o.endOn >= now);
  const incomplete = live.filter((o) => !o.agreementSignedOn || !o.supervisorNotifiedOn).length;
  const ending = earliest(live.map((o) => o.endOn));
  const outsourcingStatus: HubStatus = !live.length
    ? { state: "na", detail: "Nothing outsourced. Record it here before you outsource any AML task.", next: null }
    : incomplete
      ? { state: "todo", detail: `${incomplete} of ${live.length} arrangement${live.length === 1 ? "" : "s"} without a signed agreement or supervisor notice.`, next: dueText("Next contract end", ending, now) }
      : { state: "done", detail: `${live.length} arrangement${live.length === 1 ? "" : "s"}, agreements signed and supervisor notified.`, next: dueText("Next contract end", ending, now) };

  // Privacy notice and DPIA.
  const inForce = (k: string) => privacyDocs.find((d) => d.kind === k && d.status === "IN_FORCE");
  const draft = (k: string) => privacyDocs.some((d) => d.kind === k && d.status === "DRAFT");
  const missing = ["privacy-notice", "dpia"].filter((k) => !inForce(k));
  const privacyStatus: HubStatus = !missing.length
    ? { state: "done", detail: `Privacy notice v${inForce("privacy-notice")!.version} and DPIA v${inForce("dpia")!.version} in force.`, next: null }
    : missing.some(draft)
      ? { state: "pending", detail: "A draft is waiting for approval.", next: null }
      : { state: "todo", detail: missing.length === 2 ? "Generate and approve the privacy notice and the DPIA." : missing[0] === "dpia" ? "Generate and approve the DPIA." : "Generate and approve the privacy notice.", next: null };

  const raOb = ob("risk-assessment"), polOb = ob("policies");
  return {
    "risk-assessment": { state: raOb.state, detail: ra ? `Version ${ra.version} in force.` : raOb.detail, next: ra ? dueText("Next review", raReview, now) : null },
    policies: {
      state: polOb.state === "done" && !procedure ? "todo" : polOb.state,
      detail: policy && procedure ? `Policy v${policy.version} and procedures v${procedure.version} in force.` : policy ? "Policy in force; procedures not approved yet." : polOb.detail,
      next: policy ? dueText("Next review", policyReview, now) : null,
    },
    governance: { state: ob("compliance-officer").state, detail: ob("compliance-officer").detail, next: null },
    training: { state: ob("training").state, detail: ob("training").detail, next: dueText(assignments.length ? "Next training due" : "Next yearly refresher", trainingNext, now) },
    integrity: { state: ob("staff-integrity").state, detail: ob("staff-integrity").detail, next: ob("staff-integrity").state === "na" ? null : dueText("Next yearly declaration", integrityNext, now) },
    whistleblowing: { state: ob("whistleblowing").state, detail: ob("whistleblowing").detail, next: null },
    outsourcing: outsourcingStatus,
    privacy: privacyStatus,
  };
}
