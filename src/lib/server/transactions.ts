import "server-only";
import type { Prisma } from "@prisma/client";
import { adminDb, type Tx } from "./db";
import { audit } from "./audit";
import { raiseSuspicion } from "./cases";
import { normalizeFlags, runRules, statusFor, type MonitoringFlag, type RuleContext, type RuleTx } from "@/lib/monitoring/rules";
import { EU_HIGH_RISK_THIRD_COUNTRIES } from "@/lib/rules/high-risk-countries";
import { toIsoDate } from "@/lib/rules/dates";

type Ctx = { firmId: string; userId: string };

/** EU high-risk third countries from the admin-maintained table (falls back to the built-in list if it is empty). */
export async function highRiskCountrySet(): Promise<Set<string>> {
  const rows = await adminDb.highRiskCountry.findMany({ select: { code: true } });
  return new Set(rows.length ? rows.map((r) => r.code.toUpperCase()) : EU_HIGH_RISK_THIRD_COUNTRIES);
}

/** Everything the rules need about a client, read once (also used by the import preview). */
export async function ruleContextFor(tx: Tx, firmId: string, customerId: string, date: string, highRisk?: Set<string>, excludeId?: string): Promise<RuleContext> {
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId }, select: { txCashThresholdEUR: true, txHighValueThresholdEUR: true, txCashLegalLimitEUR: true, txRulesOff: true } });
  const party = await tx.party.findUnique({ where: { id: customerId }, select: { details: true } });
  const files = await tx.cddFile.findMany({ where: { partyId: customerId }, include: { riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const end = new Date(date + "T23:59:59Z");
  const kycComplete = files.some((f) => ["COMPLETE", "SDD", "EDD"].includes(f.status) && !!f.decidedAt && f.decidedAt <= end);
  const from = new Date(Date.parse(date) - 366 * 86_400_000), to = new Date(Date.parse(date) + 31 * 86_400_000);
  const history = await tx.transaction.findMany({ where: { customerId, date: { gte: from, lte: to }, ...(excludeId ? { id: { not: excludeId } } : {}) } });
  return {
    settings: { cashThresholdEUR: firm.txCashThresholdEUR, cashLegalLimitEUR: firm.txCashLegalLimitEUR, highValueThresholdEUR: firm.txHighValueThresholdEUR, occasionalThresholdEUR: 10_000, rulesOff: firm.txRulesOff ?? [] },
    highRiskCountries: highRisk ?? (await highRiskCountrySet()),
    kycComplete,
    clientHighRisk: files.some((f) => f.riskAssessments[0]?.final === "HIGH"),
    clientIsPep: !!(party?.details as { isPep?: boolean } | null)?.isPep,
    history: history.map(ruleTx),
  };
}

export const ruleTx = (x: { id: string; date: Date; amountEUR: unknown; method: string; occasional: boolean; thirdPartyPayer: boolean; fromCountry: string | null }): RuleTx => ({
  id: x.id, date: toIsoDate(x.date), amountEUR: Number(x.amountEUR), method: x.method, occasional: x.occasional, thirdPartyPayer: x.thirdPartyPayer, fromCountry: x.fromCountry,
});

/** Runs the monitoring rules (src/lib/monitoring/rules.ts) on a recorded transaction and stores the flags and status. */
export async function applyTransactionFlags(tx: Tx, ctx: Ctx, transactionId: string, highRisk?: Set<string>): Promise<MonitoringFlag[]> {
  const t = await tx.transaction.findUniqueOrThrow({ where: { id: transactionId } });
  const flags = runRules(ruleTx(t), await ruleContextFor(tx, ctx.firmId, t.customerId, toIsoDate(t.date), highRisk, t.id));
  await tx.transaction.update({ where: { id: t.id }, data: { flags: flags as unknown as Prisma.InputJsonValue, monitorStatus: statusFor(flags) } });
  if (flags.length) await audit(tx, { firmId: ctx.firmId, userId: null, action: "update", objectType: "Transaction", objectId: t.id, fields: ["monitorStatus", ...flags.map((f) => `flag:${f.rule}`)] });
  return flags;
}

export type ReviewAction = "clear" | "investigate" | "flag";
const NEXT: Record<ReviewAction, string> = { clear: "cleared", investigate: "investigated", flag: "flagged" };

/** Every status change needs a written rationale (kept in the record and the audit trail). */
export async function reviewTransaction(tx: Tx, ctx: Ctx, id: string, action: ReviewAction, note: string) {
  if (note.trim().length < 20) throw new Error("Give a reason of at least 20 characters.");
  const t = await tx.transaction.findUniqueOrThrow({ where: { id } });
  const stamp = `${new Date().toISOString().slice(0, 16).replace("T", " ")} ${NEXT[action]}: ${note.trim()}`;
  await tx.transaction.update({
    where: { id },
    data: { monitorStatus: NEXT[action], reviewNote: t.reviewNote ? `${t.reviewNote}\n${stamp}` : stamp, reviewedById: ctx.userId, reviewedAt: new Date() },
  });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: action === "clear" ? "approve" : "update", objectType: "Transaction", objectId: id, fields: ["monitorStatus"] });
}

/**
 * Escalates a transaction to the Compliance Officer as an internal suspicion
 * report (Art. 69) — the CO then decides whether to report to the FIU.
 */
export async function raiseFromTransaction(tx: Tx, ctx: Ctx, id: string, note: string) {
  if (note.trim().length < 20) throw new Error("Describe what makes this suspicious (at least 20 characters).");
  const t = await tx.transaction.findUniqueOrThrow({ where: { id }, include: { matter: { select: { title: true } } } });
  const flags = normalizeFlags(t.flags);
  const caseId = await raiseSuspicion(tx, ctx, {
    partyIds: [t.customerId], matterIds: [t.matterId],
    summary: `Transaction of €${Number(t.amountEUR).toLocaleString("en-IE")} on ${toIsoDate(t.date)} (${t.method}) — ${t.matter.title}`,
    details: [note.trim(), flags.length ? `Flags: ${flags.map((f) => `${f.rule} ${f.message}`).join("; ")}` : "", t.description ? `Description: ${t.description}` : ""].filter(Boolean).join("\n"),
    attempted: false, amountEUR: Number(t.amountEUR),
  });
  // The reason goes into the case only (Compliance Officer); the transaction shows a neutral note,
  // because everyone who can see the client can see it (need-to-know, no tipping-off, Art. 73).
  await reviewTransaction(tx, ctx, id, "investigate", "Escalated to the Compliance Officer for review.");
  await tx.transaction.update({ where: { id }, data: { caseId } });
  return caseId;
}
