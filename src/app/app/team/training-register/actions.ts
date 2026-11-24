"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import type { ActionState } from "@/components/form";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { RESPONSIBILITIES, TRAINING_TYPES } from "@/lib/firm/responsibilities";


export async function saveResponsibilitiesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  await withTenant(s.firm.id, async (tx) => {
    const ids = new Set((await tx.user.findMany({ where: { deactivatedAt: null }, select: { id: true } })).map((u) => u.id));
    const map: Record<string, string[]> = {};
    for (const r of RESPONSIBILITIES) map[r.key] = fd.getAll(r.key).map(String).filter((x) => ids.has(x));
    await tx.firm.update({ where: { id: s.firm.id }, data: { responsibilities: map as Prisma.InputJsonValue } });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "Firm", objectId: s.firm.id, fields: ["responsibilities"] });
  });
  revalidatePath("/app/firm/governance");
  return { message: "Responsibilities saved." };
}

export async function addExternalTrainingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  const title = String(fd.get("title") ?? "").trim();
  const date = String(fd.get("date") ?? "");
  const minutes = Math.round(Number(fd.get("durationMinutes")));
  const typeRaw = String(fd.get("type") ?? "other");
  const type = TRAINING_TYPES.some(([k]) => k === typeRaw) ? typeRaw : `other: ${typeRaw.replace(/^other:?\s*/, "").slice(0, 60)}`;
  if (title.length < 3) return { error: "Enter the training title.", fieldErrors: { title: ["Required."] } };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Enter the date.", fieldErrors: { date: ["Required."] } };
  if (!(minutes > 0 && minutes <= 60 * 24 * 10)) return { error: "Enter the duration in minutes.", fieldErrors: { durationMinutes: ["Minutes."] } };
  const attendees = fd.getAll("attendees").map(String);
  if (!attendees.length) return { error: "Tick who attended." };
  await withTenant(s.firm.id, async (tx) => {
    const ids = new Set((await tx.user.findMany({ select: { id: true } })).map((u) => u.id));
    const row = await tx.externalTraining.create({
      data: {
        firmId: s.firm.id, title: title.slice(0, 200), provider: String(fd.get("provider") ?? "").trim().slice(0, 200) || null, type,
        date: new Date(date), durationMinutes: minutes, attendeeIds: attendees.filter((a) => ids.has(a)), notes: String(fd.get("notes") ?? "").trim().slice(0, 1000) || null, createdById: s.user.id,
      },
    });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "create", objectType: "ExternalTraining", objectId: row.id });
  });
  revalidatePath("/app/team/training-register");
  return { message: "Training recorded." };
}
