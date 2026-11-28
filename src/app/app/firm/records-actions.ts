"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser, confirmFirst } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import {
  addOutsourcing, appoint, assignTraining, completeTraining, declareIntegrity, ensureBuiltInModules, generateAnnualReport, INTEGRITY_QUESTIONS,
  isOnePersonFirm, submitWhistleblowing, updateWhistleblowing,
} from "@/lib/server/governance";
import { approvePolicy } from "@/lib/server/firm-docs";
import { addCalendarDays, toIsoDate } from "@/lib/rules/dates";
import { reviewStaffScreening, screenStaff } from "@/lib/server/staff-screening";
import { audit } from "@/lib/server/audit";
import { adminDb } from "@/lib/server/db";
import { createInvitation, inviteSchema } from "@/lib/server/auth/flows";
import { EmailDeliveryError } from "@/lib/server/email";

const ctxOf = (s: { firm: { id: string }; user: { id: string } }) => ({ firmId: s.firm.id, userId: s.user.id });

export async function appointAction(fn: "compliance-manager" | "compliance-officer", _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.management");
  const userId = String(fd.get("userId") ?? "");
  if (!userId) return { error: "Choose a person first." };
  // No 2FA step here: owners asked to appoint or change the Compliance Officer and Compliance Manager
  // without confirming it's them [27 Nov 2026]. The change is still audited and only management can make it.
  const reason = String(fd.get("reason") ?? "").trim();
  try {
    await withTenant(s.firm.id, (tx) => appoint(tx, ctxOf(s), fn, userId, reason || "Change of appointment"));
    revalidatePath("/app/firm/governance");
    revalidatePath("/app");
    return { message: "Appointed. Now inform the regulator: use the Inform the Regulator button." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Invite and appoint: for a Compliance Officer or Compliance Manager who isn't on the app yet.
 * Sends the invitation and records the appointment at once; it is linked to them when they accept.
 */
export async function inviteAndAppointAction(fn: "compliance-manager" | "compliance-officer", _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.management");
  const parsed = inviteSchema.safeParse({ name: fd.get("name"), email: fd.get("email"), role: fn === "compliance-officer" ? "COMPLIANCE_OFFICER" : "OWNER", allowExternal: true });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the name and email." };
  const reason = String(fd.get("reason") ?? "").trim();
  const existing = await adminDb.user.findUnique({ where: { email: parsed.data.email }, select: { firmId: true, deactivatedAt: true } });
  if (existing) return { error: existing.firmId === s.firm.id && !existing.deactivatedAt ? "This person is already on the app: choose them from the list above." : "This email already has an AMLSync App account." };
  try {
    const r = await createInvitation(s.firm.id, s.user.id, parsed.data);
    if (!r.ok) return { error: r.error };
  } catch (e) {
    if (e instanceof EmailDeliveryError) return { error: "The invitation email could not be sent. Try again in a few minutes." };
    throw e;
  }
  try {
    await withTenant(s.firm.id, (tx) => appoint(tx, ctxOf(s), fn, { invited: { name: parsed.data.name, email: parsed.data.email } }, reason || "Change of appointment"));
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/app/firm/governance");
  revalidatePath("/app");
  return { message: `Invitation sent to ${parsed.data.email} and appointed. Now inform the regulator: use the Inform the Regulator button.` };
}

/** Records that the supervisor was informed of an appointment (or un-does it). */
export async function markRegulatorInformedAction(appointmentId: string, informed: boolean): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  await withTenant(s.firm.id, async (tx) => {
    await tx.appointment.update({ where: { id: appointmentId }, data: informed ? { notifiedAt: new Date(), notifiedBy: s.user.id } : { notifiedAt: null, notifiedBy: null } });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "Appointment", objectId: appointmentId, fields: ["notifiedAt"] });
  });
  revalidatePath("/app");
  revalidatePath("/app/firm/governance");
  revalidatePath(`/app/firm/governance/notify/${appointmentId}`);
  return { message: informed ? "Recorded: the regulator has been informed." : "Marked as not yet informed." };
}

export async function annualReportAction(): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  await withTenant(s.firm.id, (tx) => generateAnnualReport(tx, ctxOf(s)));
  revalidatePath("/app/firm/governance");
  return { message: "Annual report generated from the system data." };
}

export async function approveAnnualReportAction(id: string, fd?: FormData): Promise<ActionState> {
  const s = await requireUser("approve.management");
  { const c = confirmFirst(fd, "This approves the annual compliance report on behalf of management."); if (c) return c; }
  await withTenant(s.firm.id, (tx) => approvePolicy(tx, ctxOf(s), id));
  revalidatePath("/app/firm/governance");
  return { message: "Annual report approved." };
}

export async function assignTrainingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  const userIds = fd.getAll("userId").map(String);
  const keys = fd.getAll("module").map(String);
  if (!userIds.length) return { error: "Choose at least one person." };
  if (!keys.length) return { error: "Choose at least one module." };
  await withTenant(s.firm.id, async (tx) => {
    for (const m of await ensureBuiltInModules(tx, s.firm.id, keys)) await assignTraining(tx, ctxOf(s), m.id, userIds, addCalendarDays(toIsoDate(new Date()), 30));
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

export async function screenStaffAction(): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  const r = await withTenant(s.firm.id, (tx) => screenStaff(tx, ctxOf(s)));
  revalidatePath("/app/firm/integrity");
  if (r.listsChecked === 0) return { error: "No sanctions lists are loaded yet, so nothing was checked." };
  return { message: r.possible ? `${r.screened} colleague(s) screened against ${r.listsChecked} list(s): ${r.possible} possible match(es) to review below.` : `${r.screened} colleague(s) screened against ${r.listsChecked} list(s): no matches.` };
}

export async function reviewStaffScreeningAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  const outcome = String(fd.get("outcome") ?? "");
  const note = String(fd.get("note") ?? "").trim();
  if (outcome !== "cleared" && outcome !== "confirmed") return { error: "Choose an outcome." };
  if (note.length < 5) return { error: "Give a short reason.", fieldErrors: { note: ["Required."] } };
  await withTenant(s.firm.id, (tx) => reviewStaffScreening(tx, ctxOf(s), String(fd.get("id")), outcome, note));
  revalidatePath("/app/firm/integrity");
  return { message: outcome === "cleared" ? "Recorded as not the same person." : "Recorded as a confirmed match. Restrict this person's access and take advice before they work on client matters." };
}

export async function whistleblowAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser();
  const text = String(fd.get("text") ?? "").trim();
  if (text.length < 20) return { error: "Describe what you want to report (at least 20 characters).", fieldErrors: { text: ["Required."] } };
  await withTenant(s.firm.id, async (tx) => {
    if (await isOnePersonFirm(tx, s.firm.id)) throw new Error("Not available for one-person firms.");
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
