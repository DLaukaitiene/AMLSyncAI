"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser } from "@/lib/server/session";
import { adminDb } from "@/lib/server/db";
import { createTicket, customerReply, rateTicket } from "@/lib/server/tickets";

const g = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function createTicketAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser();
  const r = await createTicket({ firmId: s.firm.id, userId: s.user.id, email: s.user.email, firmName: s.firm.name }, {
    subject: g(fd, "subject"), category: g(fd, "category"), blocking: fd.get("blocking") === "on", text: g(fd, "text"), confirmNoClientData: fd.get("confirmNoClientData") === "on",
  });
  if (!r.ok) return { error: r.error, data: { pii: r.pii } };
  redirect(`/app/support/${r.id}`);
}

export async function replyAction(ticketId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser();
  const r = await customerReply({ firmId: s.firm.id, userId: s.user.id, email: s.user.email }, ticketId, g(fd, "text"), fd.get("confirmNoClientData") === "on");
  if (!r.ok) return { error: r.error, data: { pii: r.pii } };
  revalidatePath(`/app/support/${ticketId}`);
  return { message: "Sent." };
}

export async function rateAction(ticketId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser();
  if (!(await rateTicket({ firmId: s.firm.id }, ticketId, Number(fd.get("csat"))))) return { error: "Choose a rating from 1 to 5." };
  revalidatePath(`/app/support/${ticketId}`);
  return { message: "Thank you for the rating." };
}

export async function dismissAnnouncementAction(id: string) {
  const s = await requireUser();
  await adminDb.announcementDismissal.upsert({ where: { announcementId_userId: { announcementId: id, userId: s.user.id } }, create: { announcementId: id, userId: s.user.id }, update: {} });
  revalidatePath("/app", "layout");
}
