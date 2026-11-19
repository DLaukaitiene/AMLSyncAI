"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { adminDb } from "@/lib/server/db";
import { adminAction, isActionError } from "@/lib/server/backoffice/access";
import { adminAudit } from "@/lib/server/backoffice/audit";
import { dsrDueOn } from "@/lib/backoffice/deadlines";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const KINDS = ["access", "erasure", "rectification", "portability", "objection", "restriction"];
const STATUSES = ["received", "identity-check", "in-progress", "forwarded", "completed", "rejected"];

export async function createDsrAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("privacy.manage", "/adminpage1&/privacy"); if (isActionError(a)) return a;
  const receivedOn = str(fd, "receivedOn"), kind = str(fd, "kind"), role = str(fd, "role");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) return { error: "Received on: YYYY-MM-DD." };
  if (!KINDS.includes(kind)) return { error: "Choose the type of request." };
  if (!["controller", "processor"].includes(role)) return { error: "Choose whether AMLSync is controller or processor for this data." };
  const name = str(fd, "requesterName"), email = str(fd, "requesterEmail").toLowerCase();
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter the requester's name and email." };
  let firmId: string | null = null;
  if (role === "processor") {
    const f = await adminDb.firm.findUnique({ where: { emailDomain: str(fd, "firmDomain").toLowerCase() } });
    if (!f) return { error: "Processor requests go to the firm: enter the firm's email domain." };
    firmId = f.id;
  }
  await adminDb.$transaction(async (tx) => {
    const r = await tx.dataSubjectRequest.create({ data: { receivedOn, kind, role, firmId, requesterName: name, requesterEmail: email, dueOn: dsrDueOn(receivedOn), notes: str(fd, "notes") || null, createdBy: a.email, status: role === "processor" ? "forwarded" : "received" } });
    await adminAudit({ adminEmail: a.email, action: "dsr.create", targetType: "DataSubjectRequest", targetId: r.id, details: { kind, role } }, tx);
  });
  revalidatePath("/adminpage1&/privacy");
  return { message: role === "processor" ? "Recorded as forwarded. Send it to the firm now: AMLSync does not answer for the firm." : "Recorded. Verify the requester's identity first." };
}

export async function updateDsrAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("privacy.manage", "/adminpage1&/privacy"); if (isActionError(a)) return a;
  const status = str(fd, "status");
  if (!STATUSES.includes(status)) return { error: "Choose a status." };
  const r = await adminDb.dataSubjectRequest.findUniqueOrThrow({ where: { id } });
  const extend = fd.get("extend") === "on" && !r.extended;
  await adminDb.$transaction(async (tx) => {
    await tx.dataSubjectRequest.update({ where: { id }, data: { status, ...(extend ? { extended: true, dueOn: dsrDueOn(r.receivedOn, true) } : {}), ...(["completed", "rejected"].includes(status) ? { closedAt: new Date() } : {}), notes: str(fd, "notes") || r.notes } });
    await adminAudit({ adminEmail: a.email, action: "dsr.update", targetType: "DataSubjectRequest", targetId: id, details: { status, extended: extend } }, tx);
  });
  revalidatePath("/adminpage1&/privacy");
  return { message: "Updated." };
}
