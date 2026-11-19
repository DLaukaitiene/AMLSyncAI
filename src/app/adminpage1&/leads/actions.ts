"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { adminDb } from "@/lib/server/db";
import { adminAction, isActionError } from "@/lib/server/backoffice/access";
import { adminAudit } from "@/lib/server/backoffice/audit";
import { unfinishedSignups } from "@/lib/server/backoffice/leads";
import { LEAD_STAGES } from "@/lib/backoffice/ops";

const P = "/adminpage1&/leads";
const g = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function createLeadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("leads.manage", P); if (isActionError(a)) return a;
  const email = g(fd, "email").toLowerCase(), name = g(fd, "name");
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a name and a valid email." };
  const l = await adminDb.lead.create({ data: { name: name.slice(0, 120), email, company: g(fd, "company") || null, country: g(fd, "country").toUpperCase().slice(0, 2) || null, need: g(fd, "need") || null, source: g(fd, "source") || "manual", owner: a.email } });
  await adminAudit({ adminEmail: a.email, action: "lead.create", targetType: "Lead", targetId: l.id });
  redirect(`${P}/${l.id}`);
}

export async function importSignupAction(email: string): Promise<ActionState> {
  const a = await adminAction("leads.manage", P); if (isActionError(a)) return a;
  const s = (await unfinishedSignups()).find((x) => x.email === email);
  if (!s) return { error: "Already a lead or a firm." };
  const l = await adminDb.lead.create({ data: { name: s.name || email, email, company: s.company || null, country: s.country, source: "unfinished-signup", need: "AMLSync App (software)", owner: a.email } });
  await adminAudit({ adminEmail: a.email, action: "lead.create", targetType: "Lead", targetId: l.id, details: { source: "unfinished-signup" } });
  revalidatePath(P);
  return { message: `${email} added as a lead.` };
}

export async function updateLeadAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("leads.manage", `${P}/${id}`); if (isActionError(a)) return a;
  const stage = g(fd, "stage");
  if (!(LEAD_STAGES as readonly string[]).includes(stage)) return { error: "Choose a stage." };
  const nextStepOn = g(fd, "nextStepOn");
  if (nextStepOn && !/^\d{4}-\d{2}-\d{2}$/.test(nextStepOn)) return { error: "Next step date: YYYY-MM-DD." };
  if (stage === "lost" && !g(fd, "lostReason")) return { error: "Give the reason the lead was lost." };
  await adminDb.lead.update({ where: { id }, data: { stage, owner: g(fd, "owner") || null, nextStep: g(fd, "nextStep") || null, nextStepOn: nextStepOn || null, lostReason: stage === "lost" ? g(fd, "lostReason") : null } });
  await adminAudit({ adminEmail: a.email, action: "lead.update", targetType: "Lead", targetId: id, details: { stage } });
  revalidatePath(`${P}/${id}`);
  return { message: "Saved." };
}

export async function addLeadNoteAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("leads.manage", `${P}/${id}`); if (isActionError(a)) return a;
  const text = g(fd, "text").slice(0, 4000);
  if (text.length < 2) return { error: "Write a note." };
  await adminDb.leadNote.create({ data: { leadId: id, authorEmail: a.email, text } });
  revalidatePath(`${P}/${id}`);
  return { message: "Note added." };
}

/** GDPR erasure or "don't contact me": removes the lead and its notes. */
export async function deleteLeadAction(id: string): Promise<ActionState> {
  const a = await adminAction("leads.manage", `${P}/${id}`); if (isActionError(a)) return a;
  await adminDb.lead.delete({ where: { id } });
  await adminAudit({ adminEmail: a.email, action: "lead.delete", targetType: "Lead", targetId: id });
  redirect(P);
}
