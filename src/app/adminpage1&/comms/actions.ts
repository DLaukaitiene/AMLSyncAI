"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { adminDb } from "@/lib/server/db";
import { adminAction, isActionError } from "@/lib/server/backoffice/access";
import { adminAudit } from "@/lib/server/backoffice/audit";
import { requestApproval } from "@/lib/server/backoffice/approvals";
import { audienceFirms, sendAnnouncementEmails } from "@/lib/server/backoffice/comms";
import { isAllFirms, type Audience } from "@/lib/backoffice/ops";

const P = "/adminpage1&/comms";
const g = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function createAnnouncementAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("comms.manage", P); if (isActionError(a)) return a;
  const title = g(fd, "title").slice(0, 120), body = g(fd, "body").slice(0, 2000);
  if (title.length < 3 || body.length < 10) return { error: "Write a title and a message." };
  const endsOn = g(fd, "endsOn");
  if (endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) return { error: "Show until: YYYY-MM-DD." };
  const audience: Audience = {};
  for (const k of ["country", "plan", "status", "sector"] as const) { const v = g(fd, k); if (v) audience[k] = k === "country" ? v.toUpperCase().slice(0, 2) : v; }
  const firms = await audienceFirms(audience);
  if (!firms.length) return { error: "No firm matches this audience." };
  const email = fd.get("email") === "on";
  const ann = await adminDb.announcement.create({ data: { title, body, level: g(fd, "level") === "warning" ? "warning" : "info", audience: audience as object, endsAt: endsOn ? new Date(endsOn + "T23:59:59Z") : null, email, createdBy: a.email } });
  await adminAudit({ adminEmail: a.email, action: "comms.create", targetType: "Announcement", targetId: ann.id, details: { audience: audience as Record<string, string>, firms: firms.length, email } });
  let msg = `Banner live for ${firms.length} firm(s).`;
  if (email) {
    if (isAllFirms(audience)) {
      await adminDb.announcement.update({ where: { id: ann.id }, data: { emailState: "awaiting-approval" } });
      await requestApproval(a.email, "comms.broadcast", { announcementId: ann.id }, `Email "${title}" to all firms`, "Message to all firms");
      msg += " Email to all firms waits for approval in Approvals.";
    } else {
      msg += ` Email sent to ${await sendAnnouncementEmails(ann.id)} Owner(s) / Compliance Officer(s).`;
    }
  }
  revalidatePath(P);
  return { message: msg };
}

export async function endAnnouncementAction(id: string): Promise<ActionState> {
  const a = await adminAction("comms.manage", P); if (isActionError(a)) return a;
  await adminDb.announcement.update({ where: { id }, data: { endsAt: new Date() } });
  await adminAudit({ adminEmail: a.email, action: "comms.end", targetType: "Announcement", targetId: id });
  revalidatePath(P);
  return { message: "Banner removed." };
}
