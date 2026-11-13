"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser, hasRecentMfa } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import {
  addOutsourcing, appoint, assignTraining, completeTraining, declareIntegrity, ensureDefaultModule, generateAnnualReport, INTEGRITY_QUESTIONS,
  isOnePersonFirm, submitWhistleblowing, updateWhistleblowing,
} from "@/lib/server/governance";
import { approvePolicy } from "@/lib/server/firm-docs";
import { addCalendarDays, toIsoDate } from "@/lib/rules/dates";

const STEP_UP = (p: string): ActionState => ({ error: "For security, confirm it's you first.", data: { stepUp: p } });
const ctxOf = (s: { firm: { id: string }; user: { id: string } }) => ({ firmId: s.firm.id, userId: s.user.id });

export async function appointAction(fn: "compliance-manager" | "compliance-officer", _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.management");
  if (!hasRecentMfa(s)) return STEP_UP("/app/firm/governance");
  const userId = String(fd.get("userId") ?? "");
  const reason = String(fd.get("reason") ?? "").trim();
  try {
    const r = await withTenant(s.firm.id, (tx) => appoint(tx, ctxOf(s), fn, userId, reason || "Change of appointment"));
    revalidatePath("/app/firm/governance");
    return { message: r.noticeId ? "Appointed. The previous compliance officer's removal must be notified to the supervisor: a draft notice is in Reports." : "Appointed." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function annualReportAction(): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  await withTenant(s.firm.id, (tx) => generateAnnualReport(tx, ctxOf(s)));
  revalidatePath("/app/firm/governance");
  return { message: "Annual report generated from the system data." };
}

export async function approveAnnualReportAction(id: string): Promise<ActionState> {
  const s = await requireUser("approve.management");
  if (!hasRecentMfa(s)) return STEP_UP("/app/firm/governance");
  await withTenant(s.firm.id, (tx) => approvePolicy(tx, ctxOf(s), id));
  revalidatePath("/app/firm/governance");
  return { message: "Annual report approved." };
}

export async function assignTrainingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  const userIds = fd.getAll("userId").map(String);
  if (!userIds.length) return { error: "Choose at least one person." };
  await withTenant(s.firm.id, async (tx) => {
    const m = await ensureDefaultModule(tx, s.firm.id);
    await assignTraining(tx, ctxOf(s), m.id, userIds, addCalendarDays(toIsoDate(new Date()), 30));
  });
  revalidatePath("/app/firm/training");
  return { message: "Training assigned (due in 30 days)." };
}

export async function completeTrainingAction(assignmentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser();
  if (fd.get("attest") !== "on") return { error: "Confirm that you completed the training." };
  await withTenant(s.firm.id, (tx) => completeTraining(tx, { ...ctxOf(s), userName: s.user.name }, assignmentId));
  revalidatePath("/app/firm/training");
  return { message: "Completed. Your attestation is recorded." };
}

export async function integrityAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser();
  const answers: Record<string, string> = {};
  for (const q of INTEGRITY_QUESTIONS) {
    const v = String(fd.get(q.id) ?? "");
    if (v !== "yes" && v !== "no") return { error: "Answer every question.", fieldErrors: { [q.id]: ["Required."] } };
    answers[q.id] = v;
  }
  const r = await withTenant(s.firm.id, async (tx) => {
    const kind = (await tx.integrityDeclaration.count({ where: { userId: s.user.id } })) ? "annual" : "joining";
    return declareIntegrity(tx, ctxOf(s), kind, answers, String(fd.get("conflicts") ?? "").trim());
  });
  revalidatePath("/app/firm/integrity");
  return { message: r.flagged ? "Declaration recorded. The Compliance Officer will follow up on the points you raised." : "Declaration recorded. Next one is due in 12 months." };
}

export async function whistleblowAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser();
  const text = String(fd.get("text") ?? "").trim();
  if (text.length < 20) return { error: "Describe what you want to report (at least 20 characters).", fieldErrors: { text: ["Required."] } };
  await withTenant(s.firm.id, async (tx) => {
    if (await isOnePersonFirm(tx)) throw new Error("Not available for one-person firms.");
    await submitWhistleblowing(tx, ctxOf(s), text, fd.get("anonymous") === "on");
  });
  return { message: "Your report was received. It will be acknowledged within 7 days." };
}

export async function whistleStatusAction(id: string, status: "acknowledged" | "closed"): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  await withTenant(s.firm.id, (tx) => updateWhistleblowing(tx, ctxOf(s), id, status));
  revalidatePath("/app/firm/whistleblowing");
  return { message: status === "acknowledged" ? "Acknowledged." : "Closed." };
}

export async function outsourcingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  const g = (k: string) => String(fd.get(k) ?? "").trim();
  if (!g("provider") || g("tasks").length < 5) return { error: "Enter the provider and the tasks outsourced." };
  await withTenant(s.firm.id, (tx) => addOutsourcing(tx, ctxOf(s), {
    provider: g("provider"), tasks: g("tasks"), agreementSignedOn: g("agreementSignedOn") || undefined, supervisorNotifiedOn: g("supervisorNotifiedOn") || undefined, startOn: g("startOn") || undefined, notes: g("notes"),
  }));
  revalidatePath("/app/firm/outsourcing");
  return { message: g("supervisorNotifiedOn") ? "Added to the register." : "Added. Notify your supervisor before it starts: a draft notice is in Reports." };
}
