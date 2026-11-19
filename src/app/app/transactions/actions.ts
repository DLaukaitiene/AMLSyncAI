"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { can } from "@/lib/auth/permissions";
import { raiseFromTransaction, reviewTransaction, type ReviewAction } from "@/lib/server/transactions";
import { addTransactionAction } from "../matters/actions";

/** Log Transaction from the monitoring page: the select carries "matterId:partyId". */
export async function logTransactionAction(prev: ActionState, fd: FormData): Promise<ActionState> {
  const [matterId, partyId] = String(fd.get("link") ?? "").split(":");
  if (!matterId || !partyId) return { error: "Choose the client and matter.", fieldErrors: { link: ["Required."] } };
  fd.set("customerId", partyId);
  const r = await addTransactionAction(matterId, prev, fd);
  revalidatePath("/app/transactions");
  return r;
}

export async function reviewTransactionAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const action = String(fd.get("action") ?? "");
  const note = String(fd.get("note") ?? "").trim();
  const ctx = { firmId: s.firm.id, userId: s.user.id };
  if (note.length < 20) return { error: "Write a reason of at least 20 characters. It is kept for the supervisor.", fieldErrors: { note: ["At least 20 characters."] } };
  try {
    if (action === "raise") {
      if (!can(s.user.roles, "case.raise")) return { error: "You can't raise internal reports." };
      await withTenant(s.firm.id, (tx) => raiseFromTransaction(tx, ctx, id, note));
      revalidatePath("/app/transactions");
      return { message: "Internal suspicion report sent to the Compliance Officer. The transaction is marked Investigated. Don't tell the client (Art. 73)." };
    }
    if (!["clear", "investigate", "flag"].includes(action)) return { error: "Choose what to do." };
    if (action !== "flag" && !can(s.user.roles, "approve.compliance")) return { error: "Only the Owner or Compliance Officer can clear or investigate a transaction. You can flag it for their review." };
    await withTenant(s.firm.id, (tx) => reviewTransaction(tx, ctx, id, action as ReviewAction, note));
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/app/transactions");
  return { message: action === "clear" ? "Marked as cleared." : action === "investigate" ? "Marked as investigated." : "Flagged for review." };
}

export async function thresholdsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  const cash = Math.round(Number(fd.get("cash")));
  const high = Math.round(Number(fd.get("high")));
  if (!(cash >= 100 && cash <= 10_000)) return { error: "Cash threshold: between €100 and €10,000 (the EU cash limit).", fieldErrors: { cash: ["€100–€10,000"] } };
  if (!(high >= 1_000)) return { error: "High-value threshold: at least €1,000.", fieldErrors: { high: ["At least €1,000"] } };
  await withTenant(s.firm.id, async (tx) => {
    await tx.firm.update({ where: { id: s.firm.id }, data: { txCashThresholdEUR: cash, txHighValueThresholdEUR: high } });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "Firm", objectId: s.firm.id, fields: ["txCashThresholdEUR", "txHighValueThresholdEUR"] });
  });
  revalidatePath("/app/transactions");
  return { message: "Thresholds saved. They apply to transactions recorded from now on." };
}
