import "server-only";
import type { Tx } from "./db";
import { currentProfile } from "./country-profile";
import { isOnePersonFirm } from "./governance";
import { setupChecklist } from "@/lib/rules/country-profile";
import { RESPONSIBILITIES } from "@/lib/firm/responsibilities";
import { evaluateObligations, type ObligationInput } from "@/lib/obligations/evaluate";

const DAY = 86_400_000;

/** Gathers what the obligations dashboard needs. Case data only for people who may see cases. */
export async function obligationInput(tx: Tx, firmId: string, opts: { seeCases: boolean }): Promise<ObligationInput & { sectors: string[]; staff: { id: string; name: string }[] }> {
  const now = new Date();
  const today = new Date(now.toISOString().slice(0, 10));
  const in30 = new Date(now.getTime() + 30 * DAY);
  const yearAgo = new Date(now.getTime() - 365 * DAY);
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId }, select: { sectors: true, responsibilities: true } });
  const users = await tx.user.findMany({ where: { deactivatedAt: null }, select: { id: true, name: true, external: true } });
  const staff = users.filter((u) => !u.external);
  const name = new Map(users.map((u) => [u.id, u.name]));
  const appts = await tx.appointment.findMany({ where: { toDate: null } });
  const appointed = (fn: string) => { const a = appts.find((x) => x.function === fn); return a ? name.get(a.userId) ?? null : null; };
  const resp = (firm.responsibilities ?? {}) as Record<string, string[]>;
  const { profile } = await currentProfile(tx, firmId);
  const openTaskOverdue = (kinds: string[]) => tx.task.count({ where: { status: "OPEN", kind: { in: kinds }, dueOn: { lt: today } } });

  const files = await tx.cddFile.findMany({
    where: { role: "CLIENT", status: { notIn: ["REFUSED", "TERMINATED"] } },
    select: { id: true, status: true, createdAt: true, nextRefreshOn: true, party: { select: { details: true } }, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1, select: { final: true } } },
  });
  const accepted = files.filter((f) => f.status !== "OPEN");
  const approvals = new Set((await tx.approval.findMany({ where: { objectType: { in: ["CddFile:edd", "CddFile:pep"] } }, select: { objectId: true, objectType: true } })).map((a) => `${a.objectType}:${a.objectId}`));
  const high = files.filter((f) => f.riskAssessments[0]?.final === "HIGH");
  const awaiting = files.filter((f) => (f.riskAssessments[0]?.final === "HIGH" && !approvals.has(`CddFile:edd:${f.id}`)) || (!!(f.party.details as { isPep?: boolean }).isPep && !approvals.has(`CddFile:pep:${f.id}`))).length;

  const trained = new Set([
    ...(await tx.trainingAssignment.findMany({ where: { completedAt: { gte: yearAgo } }, select: { userId: true } })).map((x) => x.userId),
    ...(await tx.externalTraining.findMany({ where: { date: { gte: yearAgo } }, select: { attendeeIds: true } })).flatMap((x) => x.attendeeIds),
  ]);
  const declared = new Set((await tx.integrityDeclaration.findMany({ where: { declaredAt: { gte: yearAgo } }, select: { userId: true } })).map((x) => x.userId));
  const screened = new Set((await tx.staffScreening.findMany({ select: { userId: true } })).map((x) => x.userId));
  const onePerson = await isOnePersonFirm(tx);
  const wb = onePerson ? [] : await tx.whistleblowingReport.findMany({ where: { status: "received" }, select: { createdAt: true } });

  return {
    sectors: firm.sectors,
    staff: staff.map((u) => ({ id: u.id, name: u.name })),
    onePerson,
    complianceOfficer: appointed("compliance-officer"),
    responsibleManager: appointed("compliance-manager"),
    unassignedDuties: RESPONSIBILITIES.filter((d) => !(resp[d.key] ?? []).some((id) => name.has(id))).length,
    riskAssessmentInForce: (await tx.firmRiskAssessment.count({ where: { status: "IN_FORCE" } })) > 0,
    riskAssessmentReviewOverdue: (await openTaskOverdue(["risk-assessment-review"])) > 0,
    policyInForce: (await tx.policyDocument.count({ where: { kind: "policy", status: "IN_FORCE" } })) > 0,
    policyReviewOverdue: (await openTaskOverdue(["policy-review"])) > 0,
    countryProfileMissing: setupChecklist(profile).filter((c) => c.status === "required-missing").length,
    clientsTotal: files.length,
    clientsInProgress: files.filter((f) => f.status === "OPEN").length,
    clientsStale: files.filter((f) => f.status === "OPEN" && f.createdAt < new Date(now.getTime() - 30 * DAY)).length,
    openAlerts: (await tx.screeningResult.count({ where: { decision: "PENDING" } })) + (await tx.staffScreening.count({ where: { status: "possible-match" } })),
    highRiskOrPepAwaitingApproval: awaiting,
    highRiskTotal: high.length,
    openMatters: await tx.matter.count({ where: { status: { in: ["OPEN", "ON_HOLD"] } } }),
    flaggedTransactions: await tx.transaction.count({ where: { monitorStatus: "flagged" } }),
    overdueReviews: accepted.filter((f) => f.nextRefreshOn && f.nextRefreshOn < now).length,
    reviewsDue30: accepted.filter((f) => f.nextRefreshOn && f.nextRefreshOn >= now && f.nextRefreshOn <= in30).length,
    internalReportsOpen: opts.seeCases ? await tx.case.count({ where: { type: "INTERNAL_SUSPICION", status: "open" } }) : 0,
    reportDrafts: opts.seeCases ? await tx.report.count({ where: { status: "DRAFT", type: { in: ["STR", "THRESHOLD", "CASH", "SANCTIONS_NOTICE", "DISCREPANCY"] } } }) : 0,
    reportingOverdue: opts.seeCases ? await openTaskOverdue(["fiu-request", "discrepancy-report", "threshold-report"]) : 0,
    trainingOverdue: await tx.trainingAssignment.count({ where: { completedAt: null, dueOn: { lt: now } } }),
    staffWithoutTraining: staff.filter((u) => !trained.has(u.id)).length,
    integrityDue: onePerson ? 0 : staff.filter((u) => !declared.has(u.id)).length,
    staffScreeningOpen: onePerson ? 0 : (await tx.staffScreening.count({ where: { status: "possible-match" } })) + staff.filter((u) => !screened.has(u.id)).length,
    whistleblowingUnacknowledged: wb.length,
    whistleblowingLate: wb.filter((w) => w.createdAt < new Date(now.getTime() - 7 * DAY)).length,
    retentionDue: await tx.cddFile.count({ where: { retentionUntil: { lt: today }, OR: [{ legalHoldUntil: null }, { legalHoldUntil: { lt: today } }] } }),
  };
}

export async function firmObligations(tx: Tx, firmId: string, opts: { seeCases: boolean }) {
  const input = await obligationInput(tx, firmId, opts);
  return { input, statuses: evaluateObligations(input) };
}
