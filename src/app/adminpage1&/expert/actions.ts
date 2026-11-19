"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { adminDb } from "@/lib/server/db";
import { adminAction, isActionError } from "@/lib/server/backoffice/access";
import { adminAudit } from "@/lib/server/backoffice/audit";

const P = "/adminpage1&/expert";
const g = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function createEngagementAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("expert.manage", P); if (isActionError(a)) return a;
  const firm = await adminDb.firm.findUnique({ where: { emailDomain: g(fd, "domain").toLowerCase() } });
  if (!firm) return { error: "No firm uses that email domain." };
  if (g(fd, "scope").length < 5) return { error: "Describe the scope." };
  if (!isDate(g(fd, "agreementOn"))) return { error: "Art. 18 agreement date: YYYY-MM-DD. No work starts without a signed agreement." };
  const rate = g(fd, "rate");
  const e = await adminDb.expertEngagement.create({ data: { firmId: firm.id, scope: g(fd, "scope"), agreementOn: g(fd, "agreementOn"), supervisorNotified: fd.get("supervisorNotified") === "on", hourlyCents: rate ? Math.round(Number(rate) * 100) : null, createdBy: a.email } });
  await adminAudit({ adminEmail: a.email, action: "expert.engagement", targetType: "Firm", targetId: firm.id, details: { engagement: e.id } });
  revalidatePath(P);
  return { message: `Engagement with ${firm.name} recorded.` };
}

export async function addTaskAction(engagementId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("expert.manage", P); if (isActionError(a)) return a;
  if (g(fd, "title").length < 3) return { error: "Name the task (no client names: use the firm's file reference)." };
  if (g(fd, "dueOn") && !isDate(g(fd, "dueOn"))) return { error: "Due: YYYY-MM-DD." };
  await adminDb.expertTask.create({ data: { engagementId, title: g(fd, "title").slice(0, 200), dueOn: g(fd, "dueOn") || null, analyst: g(fd, "analyst") || a.email } });
  revalidatePath(P);
  return { message: "Task added." };
}

export async function updateTaskAction(taskId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("expert.manage", P); if (isActionError(a)) return a;
  const status = g(fd, "status"), add = Number(g(fd, "minutes") || 0);
  if (!["todo", "in-progress", "review", "done"].includes(status)) return { error: "Choose a status." };
  if (!(add >= 0 && add <= 600)) return { error: "Minutes: 0–600 per entry." };
  await adminDb.expertTask.update({ where: { id: taskId }, data: { status, minutes: { increment: Math.round(add) } } });
  revalidatePath(P);
  return { message: add ? `${add} min logged.` : "Updated." };
}

export async function endEngagementAction(id: string): Promise<ActionState> {
  const a = await adminAction("expert.manage", P); if (isActionError(a)) return a;
  await adminDb.expertEngagement.update({ where: { id }, data: { status: "ended" } });
  revalidatePath(P);
  return { message: "Engagement ended." };
}
