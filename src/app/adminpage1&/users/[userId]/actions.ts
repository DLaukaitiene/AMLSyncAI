"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { adminDb } from "@/lib/server/db";
import { revokeAllSessions } from "@/lib/server/session";
import { securityEvent } from "@/lib/server/audit";
import { adminAction, isActionError } from "@/lib/server/backoffice/access";
import { adminAudit } from "@/lib/server/backoffice/audit";

/** Account security actions (§6.3). The firm sees each one in its security log. */
export async function secureUserAction(userId: string, op: "lock" | "unlock" | "revoke", _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("users.secure", `/adminpage1&/users/${userId}`); if (isActionError(a)) return a;
  const reason = String(fd.get("reason") ?? "").trim();
  if (reason.length < 5) return { error: "Give a reason (logged, visible to the firm)." };
  const u = await adminDb.user.findUnique({ where: { id: userId }, select: { firmId: true, email: true } });
  if (!u) return { error: "Not found" };
  if (u.email.toLowerCase() === a.email) return { error: "You can't change your own account here." };
  if (op === "lock") {
    await adminDb.user.update({ where: { id: userId }, data: { lockedUntil: new Date(Date.now() + 365 * 86_400_000) } });
    await revokeAllSessions(userId);
  } else if (op === "unlock") {
    await adminDb.user.update({ where: { id: userId }, data: { lockedUntil: null, failedLogins: 0 } });
  } else {
    await revokeAllSessions(userId);
  }
  await adminAudit({ adminEmail: a.email, action: `user.${op}`, targetType: "User", targetId: userId, reason, details: { firmId: u.firmId } });
  await securityEvent({ firmId: u.firmId, userId, kind: `admin-${op === "revoke" ? "sessions-revoked" : op}`, details: { by: "AMLSyncAI", reason } });
  revalidatePath(`/adminpage1&/users/${userId}`);
  return { message: op === "lock" ? "Locked and signed out everywhere." : op === "unlock" ? "Unlocked." : "All sessions revoked." };
}
