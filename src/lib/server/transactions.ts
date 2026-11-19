import "server-only";
import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";
import { audit } from "./audit";
import { raiseSuspicion } from "./cases";
import { flagTransaction, type Flag } from "@/lib/rules/transaction-flags";
import { toIsoDate } from "@/lib/rules/dates";

type Ctx = { firmId: string; userId: string };

/** Runs the red-flag rules on a newly recorded transaction and stores the result. */
export async function applyTransactionFlags(tx: Tx, ctx: Ctx, transactionId: string): Promise<Flag[]> {
  const t = await tx.transaction.findUniqueOrThrow({ where: { id: transactionId } });
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: ctx.firmId }, select: { txCashThresholdEUR: true, txHighValueThresholdEUR: true } });
  const party = await tx.party.findUnique({ where: { id: t.customerId }, select: { details: true } });
  const file = await tx.cddFile.findFirst({ where: { partyId: t.customerId }, include: { riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const since = new Date(t.date.getTime() - 31 * 86_400_000);
  const history = await tx.transaction.findMany({ where: { customerId: t.customerId, id: { not: t.id }, date: { gte: since } } });
  const shape = (x: typeof t) => ({ id: x.id, date: toIsoDate(x.date), amountEUR: Number(x.amountEUR), method: x.method, thirdPartyPayer: x.thirdPartyPayer, fromCountry: x.fromCountry });
  const flags = flagTransaction(shape(t), {
    cashThresholdEUR: firm.txCashThresholdEUR,
    highValueThresholdEUR: firm.txHighValueThresholdEUR,
    clientHighRisk: file?.riskAssessments[0]?.final === "HIGH",
    clientIsPep: !!(party?.details as { isPep?: boolean } | null)?.isPep,
    history: history.map(shape),
  });
  await tx.transaction.update({ where: { id: t.id }, data: { flags: flags as unknown as Prisma.InputJsonValue, monitorStatus: flags.length ? "flagged" : "pending" } });
  if (flags.length) await audit(tx, { firmId: ctx.firmId, userId: null, action: "update", objectType: "Transaction", objectId: t.id, fields: ["monitorStatus", ...flags.map((f) => `flag:${f.code}`)] });
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
  const flags = (t.flags as unknown as Flag[]) ?? [];
  const caseId = await raiseSuspicion(tx, ctx, {
    partyIds: [t.customerId], matterIds: [t.matterId],
    summary: `Transaction of €${Number(t.amountEUR).toLocaleString("en-IE")} on ${toIsoDate(t.date)} (${t.method}) — ${t.matter.title}`,
    details: [note.trim(), flags.length ? `Flags: ${flags.map((f) => f.text).join("; ")}` : "", t.description ? `Description: ${t.description}` : ""].filter(Boolean).join("\n"),
    attempted: false, amountEUR: Number(t.amountEUR),
  });
  // The reason goes into the case only (Compliance Officer); the transaction shows a neutral note,
  // because everyone who can see the client can see it (need-to-know, no tipping-off, Art. 73).
  await reviewTransaction(tx, ctx, id, "investigate", "Escalated to the Compliance Officer for review.");
  await tx.transaction.update({ where: { id }, data: { caseId } });
  return caseId;
}
