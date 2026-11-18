"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { adminDb } from "@/lib/server/db";
import { adminAction, isActionError } from "@/lib/server/backoffice/access";
import { adminAudit } from "@/lib/server/backoffice/audit";
import { requestApproval } from "@/lib/server/backoffice/approvals";
import { envOwners, isAdminRole, teamEnabled } from "@/lib/backoffice/roles";

export async function setRolesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("team.manage", "/adminpage1&/team"); if (isActionError(a)) return a;
  if (!teamEnabled()) return { error: "The Backoffice is limited to its Owner; further admins are switched off." };
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const roles = fd.getAll("roles").map(String).filter(isAdminRole);
  const reason = String(fd.get("reason") ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter the admin's email (the address they sign in with)." };
  if (envOwners().includes(email)) return { error: "This admin is the Backoffice Owner." };
  if (reason.length < 5) return { error: "Give a reason (logged)." };
  const user = await adminDb.user.findUnique({ where: { email }, select: { mfaEnrolledAt: true } });
  if (roles.length && !user?.mfaEnrolledAt) return { error: "This person needs an AMLSyncAI account with two-factor set up before they can get admin roles." };
  await requestApproval(a.email, "admin.set-roles", { email, roles }, roles.length ? `Set ${email} to ${roles.join(", ")}` : `Remove ${email} from the Backoffice`, reason);
  revalidatePath("/adminpage1&/approvals");
  return { message: "Requested. The change applies once approved in Approvals." };
}

export async function reviewAction(email: string): Promise<ActionState> {
  const a = await adminAction("team.manage", "/adminpage1&/team"); if (isActionError(a)) return a;
  await adminDb.$transaction(async (tx) => {
    await tx.adminMember.update({ where: { email }, data: { reviewedAt: new Date(), reviewedBy: a.email } });
    await adminAudit({ adminEmail: a.email, action: "admin.access-reviewed", targetType: "AdminMember", targetId: email }, tx);
  });
  revalidatePath("/adminpage1&/team");
  return { message: "Access confirmed for this quarter." };
}
