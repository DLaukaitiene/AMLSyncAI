"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser, hasRecentMfa } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import {
  addCaseNote, answerFiuRequest, decideSuspicion, logFiuRequest, markReportSubmitted, raiseSuspicion, recordFiuInstruction,
  resolveDiscrepancy, updateReportNarrative, ensureSanctionsNotice, type CaseDecision,
} from "@/lib/server/cases";

const STEP_UP = (p: string): ActionState => ({ error: "For security, confirm it's you first.", data: { stepUp: p } });

/** Any user can raise an internal report. Afterwards only the Compliance Officer sees it (§11.10). */
export async function raiseSuspicionAction(ref: { partyIds: string[]; matterIds: string[] }, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("case.raise");
  const summary = String(fd.get("summary") ?? "").trim();
  const details = String(fd.get("details") ?? "").trim();
  const amount = Number(fd.get("amountEUR") || 0);
  if (summary.length < 5) return { error: "Say briefly what happened.", fieldErrors: { summary: ["Required."] } };
  if (details.length < 10) return { error: "Describe why it seems suspicious.", fieldErrors: { details: ["At least 10 characters."] } };
  await withTenant(s.firm.id, (tx) =>
    raiseSuspicion(tx, { firmId: s.firm.id, userId: s.user.id }, { ...ref, summary, details, attempted: fd.get("attempted") === "on", amountEUR: amount > 0 ? amount : undefined }),
  );
  return { message: "Sent to the Compliance Officer. Don't tell the client or anyone involved (tipping-off is prohibited, Art. 73)." };
}

export async function decideAction(caseId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("case.view");
  if (!hasRecentMfa(s)) return STEP_UP(`/app/cases/${caseId}`);
  const decision = String(fd.get("decision")) as CaseDecision;
  const reasons = String(fd.get("reasons") ?? "").trim();
  if (!["report", "no-report", "privilege"].includes(decision)) return { error: "Choose a decision.", fieldErrors: { decision: ["Required."] } };
  if (reasons.length < 20) return { error: "Record the reasons for the decision (kept for the supervisor).", fieldErrors: { reasons: ["At least 20 characters."] } };
  const r = await withTenant(s.firm.id, (tx) => decideSuspicion(tx, { firmId: s.firm.id, userId: s.user.id }, caseId, { decision, reasons, hold: fd.get("hold") === "on" }));
  revalidatePath(`/app/cases/${caseId}`);
  return { message: decision === "report" ? `Decision recorded. STR draft created.${r.holdEnds ? ` Transaction on hold until ${r.holdEnds} unless the FIU instructs otherwise.` : ""}` : "Decision recorded and kept." };
}

export async function fiuInstructionAction(caseId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("case.view");
  const instruction = fd.get("instruction") === "stop" ? "stop" : "proceed";
  const note = String(fd.get("note") ?? "").trim();
  if (note.length < 5) return { error: "Record how and when the FIU instructed you.", fieldErrors: { note: ["Required."] } };
  await withTenant(s.firm.id, (tx) => recordFiuInstruction(tx, { firmId: s.firm.id, userId: s.user.id }, caseId, instruction, note));
  revalidatePath(`/app/cases/${caseId}`);
  return { message: instruction === "proceed" ? "Hold lifted." : "The matter stays blocked." };
}

export async function noteAction(caseId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("case.view");
  const text = String(fd.get("text") ?? "").trim();
  if (!text) return { error: "Write a note." };
  await withTenant(s.firm.id, (tx) => addCaseNote(tx, { firmId: s.firm.id, userId: s.user.id }, caseId, text));
  revalidatePath(`/app/cases/${caseId}`);
  return { message: "Note added." };
}

export async function fiuRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("case.view");
  const received = String(fd.get("received") ?? "");
  const reference = String(fd.get("reference") ?? "").trim();
  const request = String(fd.get("request") ?? "").trim();
  const days = Number(fd.get("deadlineWorkingDays") || 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(received)) return { error: "Enter the date received.", fieldErrors: { received: ["YYYY-MM-DD"] } };
  if (!reference || request.length < 5) return { error: "Enter the FIU reference and what they asked for." };
  const r = await withTenant(s.firm.id, (tx) => logFiuRequest(tx, { firmId: s.firm.id, userId: s.user.id }, { received, reference, request, deadlineWorkingDays: days > 0 ? days : undefined, partyIds: [] }));
  revalidatePath("/app/cases");
  return { message: `FIU request logged. Answer by ${r.due}.` };
}

export async function answerFiuAction(caseId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("case.view");
  const note = String(fd.get("note") ?? "").trim();
  if (note.length < 5) return { error: "Record what you sent and how." };
  await withTenant(s.firm.id, (tx) => answerFiuRequest(tx, { firmId: s.firm.id, userId: s.user.id }, caseId, note));
  revalidatePath(`/app/cases/${caseId}`);
  return { message: "Marked as answered." };
}

export async function resolveDiscrepancyAction(caseId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("case.view");
  const note = String(fd.get("note") ?? "").trim();
  if (note.length < 5) return { error: "Record how the client corrected the register." };
  await withTenant(s.firm.id, (tx) => resolveDiscrepancy(tx, { firmId: s.firm.id, userId: s.user.id }, caseId, "client-corrected", note));
  revalidatePath(`/app/cases/${caseId}`);
  return { message: "Resolved: the client corrected the register." };
}

export async function sanctionsNoticeAction(caseId: string): Promise<ActionState> {
  const s = await requireUser("case.view");
  await withTenant(s.firm.id, (tx) => ensureSanctionsNotice(tx, s.firm.id, caseId));
  revalidatePath(`/app/cases/${caseId}`);
  return { message: "Notice drafted." };
}

export async function narrativeAction(reportId: string, back: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("case.view");
  await withTenant(s.firm.id, (tx) => updateReportNarrative(tx, { firmId: s.firm.id, userId: s.user.id }, reportId, String(fd.get("narrative") ?? "")));
  revalidatePath(back);
  return { message: "Draft saved." };
}

export async function submittedAction(reportId: string, back: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("case.view");
  if (!hasRecentMfa(s)) return STEP_UP(back);
  const r = await withTenant(s.firm.id, (tx) => markReportSubmitted(tx, { firmId: s.firm.id, userId: s.user.id }, reportId, String(fd.get("reference") ?? "")));
  if (!r.ok) return { error: r.error };
  revalidatePath(back);
  return { message: "Marked as submitted." };
}
