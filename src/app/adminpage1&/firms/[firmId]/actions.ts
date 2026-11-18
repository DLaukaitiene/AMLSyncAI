"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { adminDb } from "@/lib/server/db";
import { securityEvent } from "@/lib/server/audit";
import { adminAction, isActionError } from "@/lib/server/backoffice/access";
import { adminAudit } from "@/lib/server/backoffice/audit";
import { requestApproval } from "@/lib/server/backoffice/approvals";
import { decideFirmKyb, runFirmKyb } from "@/lib/server/backoffice/kyb";
import { needsFourEyes } from "@/lib/backoffice/four-eyes";
import { checkVies } from "@/lib/server/backoffice/vies";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const lines = (v: string) => v.split(/\n|;/).map((x) => x.trim()).filter(Boolean).slice(0, 50);
const back = (id: string, tab = "overview") => `/adminpage1&/firms/${id}?tab=${tab}`;

export async function setStatusAction(firmId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("firms.manage", back(firmId)); if (isActionError(a)) return a;
  const status = str(fd, "status"), reason = str(fd, "reason");
  if (!["active", "paused", "suspended"].includes(status)) return { error: "Choose active, paused or suspended. Closing a firm needs four-eyes approval." };
  if (reason.length < 5) return { error: "Give a reason (it is logged and shown to the firm if suspended)." };
  const before = await adminDb.firm.findUniqueOrThrow({ where: { id: firmId }, select: { status: true } });
  if (before.status === "cancelled") return { error: "This firm has cancelled; its records are a read-only archive." };
  await adminDb.$transaction(async (tx) => {
    await tx.firm.update({ where: { id: firmId }, data: { status, statusReason: reason, statusChangedAt: new Date() } });
    await adminAudit({ adminEmail: a.email, action: "firm.status", targetType: "Firm", targetId: firmId, reason, details: { from: before.status, to: status } }, tx);
  });
  await securityEvent({ firmId, kind: "service-status", details: { by: "AMLSyncAI", status } });
  revalidatePath(back(firmId));
  return { message: `Status set to ${status}.` };
}

export async function requestCloseAction(firmId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("firms.manage", back(firmId)); if (isActionError(a)) return a;
  const reason = str(fd, "reason");
  if (reason.length < 10) return { error: "Give the reason for closing (e.g. contract ended on …)." };
  const f = await adminDb.firm.findUniqueOrThrow({ where: { id: firmId }, select: { name: true } });
  await requestApproval(a.email, "firm.close", { firmId, reason }, `Close ${f.name}`, reason);
  revalidatePath("/adminpage1&/approvals");
  return { message: "Closure requested. An Owner must approve it in Approvals." };
}

export async function extendTrialAction(firmId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("firms.manage", back(firmId)); if (isActionError(a)) return a;
  const until = str(fd, "until"), reason = str(fd, "reason");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || Number.isNaN(Date.parse(until))) return { error: "Enter the trial end as YYYY-MM-DD." };
  if (until > new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10)) return { error: "A trial can be extended by at most 90 days from today." };
  if (reason.length < 3) return { error: "Give a reason." };
  const before = await adminDb.firm.findUniqueOrThrow({ where: { id: firmId }, select: { trialEndsOn: true } });
  await adminDb.$transaction(async (tx) => {
    await tx.firm.update({ where: { id: firmId }, data: { trialEndsOn: until } });
    await adminAudit({ adminEmail: a.email, action: "firm.trial", targetType: "Firm", targetId: firmId, reason, details: { from: before.trialEndsOn, to: until } }, tx);
  });
  revalidatePath(back(firmId));
  return { message: `Trial runs until ${until}.` };
}

export async function saveMetaAction(firmId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("firms.manage", back(firmId)); if (isActionError(a)) return a;
  const tags = [...new Set(str(fd, "tags").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20).map((t) => t.slice(0, 40));
  const accountManager = str(fd, "accountManager").toLowerCase() || null;
  await adminDb.$transaction(async (tx) => {
    await tx.firmAdminMeta.upsert({ where: { firmId }, create: { firmId, tags, accountManager }, update: { tags, accountManager } });
    await adminAudit({ adminEmail: a.email, action: "firm.meta", targetType: "Firm", targetId: firmId, details: { tags, accountManager } }, tx);
  });
  revalidatePath(back(firmId));
  return { message: "Saved." };
}

export async function addNoteAction(firmId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("firms.notes", back(firmId)); if (isActionError(a)) return a;
  const text = str(fd, "text").slice(0, 4000);
  if (text.length < 3) return { error: "Write a note." };
  await adminDb.$transaction(async (tx) => {
    const n = await tx.firmNote.create({ data: { firmId, authorEmail: a.email, text } });
    await adminAudit({ adminEmail: a.email, action: "firm.note", targetType: "Firm", targetId: firmId, details: { note: n.id } }, tx);
  });
  revalidatePath(back(firmId));
  return { message: "Note added. Never write client names or case details in notes." };
}

export async function grantCreditAction(firmId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("credits.grant", back(firmId, "billing")); if (isActionError(a)) return a;
  const euros = Number(str(fd, "euros")), reference = str(fd, "reference").slice(0, 100);
  if (!(euros > 0 && euros <= 10_000)) return { error: "Enter an amount between €0.01 and €10,000." };
  if (reference.length < 3) return { error: "Give a reason or reference." };
  const cents = Math.round(euros * 100);
  const f = await adminDb.firm.findUniqueOrThrow({ where: { id: firmId }, select: { name: true } });
  if (needsFourEyes("credit.grant", cents)) {
    await requestApproval(a.email, "credit.grant", { firmId, cents, reference }, `Credit €${euros.toFixed(2)} for ${f.name}`, reference);
    revalidatePath("/adminpage1&/approvals");
    return { message: "Above €100: an Owner must approve this credit in Approvals." };
  }
  await adminDb.$transaction(async (tx) => {
    await tx.creditEntry.create({ data: { firmId, amountCents: cents, kind: "topup", description: `Credit (${reference})`, reference } });
    await adminAudit({ adminEmail: a.email, action: "credit.grant", targetType: "Firm", targetId: firmId, reason: reference, details: { cents } }, tx);
  });
  await securityEvent({ firmId, kind: "credit-added", details: { by: a.email, cents, reference } });
  revalidatePath(back(firmId, "billing"));
  return { message: `Credit of €${euros.toFixed(2)} added; it is deducted on the next invoice.` };
}

export async function runKybAction(firmId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("firms.kyb", back(firmId, "kyb")); if (isActionError(a)) return a;
  const rb = str(fd, "russiaBelarus");
  if (!["none", "link-found", "not-checked"].includes(rb)) return { error: "Answer the Russia / Belarus question." };
  const { kyb, lists } = await runFirmKyb(a.email, firmId, { registryRef: str(fd, "registryRef") || null, directors: lines(str(fd, "directors")), beneficialOwners: lines(str(fd, "bos")), russiaBelarus: rb });
  if (rb === "link-found") {
    await adminDb.$transaction(async (tx) => {
      await tx.firm.update({ where: { id: firmId }, data: { status: "suspended", statusReason: "Russia / Belarus restrictions: review needed", statusChangedAt: new Date() } });
      await adminAudit({ adminEmail: a.email, action: "firm.status", targetType: "Firm", targetId: firmId, reason: "Russia / Belarus link found at KYB", details: { to: "suspended" } }, tx);
    });
  }
  revalidatePath(back(firmId, "kyb"));
  if (!lists) return { error: "No official sanctions list is loaded, so nothing was screened. Load lists first (scripts/load-list.mts)." };
  return { message: kyb.result === "clear" ? `Clear against ${lists} official list(s).` : `Possible match(es) found: review below. Service continues until you decide.${rb === "link-found" ? " Firm suspended (Russia / Belarus)." : ""}` };
}

export async function decideKybAction(firmId: string, kybId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("firms.kyb", back(firmId, "kyb")); if (isActionError(a)) return a;
  const decision = str(fd, "decision") as "cleared" | "blocked", note = str(fd, "note");
  if (!["cleared", "blocked"].includes(decision)) return { error: "Choose a decision." };
  if (note.length < 10) return { error: "Explain the decision (what you compared: date of birth, country, registry data…)." };
  await decideFirmKyb(a.email, kybId, decision, note);
  revalidatePath(back(firmId, "kyb"));
  return { message: decision === "blocked" ? "Confirmed hit: firm suspended. Tell the Owner and legal adviser." : "Marked as a false positive." };
}

export async function viesAction(firmId: string): Promise<ActionState> {
  const a = await adminAction("firms.view", back(firmId)); if (isActionError(a)) return a;
  const r = await checkVies(firmId);
  await adminAudit({ adminEmail: a.email, action: "firm.vies", targetType: "Firm", targetId: firmId, details: { status: r.status } });
  revalidatePath(back(firmId));
  return r.status === "unavailable" ? { error: "VIES did not answer (the member state's service may be down). Try again later." } : { message: `VIES: ${r.status}${r.name ? ` — ${r.name}` : ""}.` };
}
