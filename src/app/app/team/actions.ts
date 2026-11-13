"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser, hasRecentMfa, revokeAllSessions } from "@/lib/server/session";
import { createInvitation, inviteSchema } from "@/lib/server/auth/flows";
import { withTenant } from "@/lib/server/db";
import { audit, securityEvent } from "@/lib/server/audit";
import { formToObject, zodErrors } from "@/lib/server/form";

const STEP_UP = { error: "For security, confirm it's you first.", data: { stepUp: "/app/team" } };

export async function inviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("team.invite");
  if (!hasRecentMfa(s)) return STEP_UP;
  const raw = formToObject(fd);
  const parsed = inviteSchema.safeParse({ ...raw, allowExternal: raw.allowExternal === "on" });
  if (!parsed.success) return zodErrors(parsed.error);
  if (parsed.data.role === "OWNER" && !s.user.roles.includes("OWNER")) return { error: "Only an Owner can invite another Owner." };
  const r = await createInvitation(s.firm.id, s.user.id, parsed.data);
  if (!r.ok) return { error: r.error, fieldErrors: r.fieldErrors };
  revalidatePath("/app/team");
  return { message: `Invitation sent to ${parsed.data.email}. It expires in 72 hours.` };
}

export async function removeUserAction(userId: string): Promise<ActionState> {
  const s = await requireUser("team.remove");
  if (!hasRecentMfa(s)) return STEP_UP;
  if (userId === s.user.id) return { error: "You can't remove yourself." };
  await withTenant(s.firm.id, async (tx) => {
    const target = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (target.roles.includes("OWNER") && !s.user.roles.includes("OWNER")) throw new Error("Only an Owner can remove an Owner.");
    const owners = await tx.user.count({ where: { roles: { has: "OWNER" }, deactivatedAt: null } });
    if (target.roles.includes("OWNER") && owners <= 1) throw new Error("A firm must keep at least one Owner.");
    // Records and approvals stay attributed to the user (§8C.3 leavers).
    await tx.user.update({ where: { id: userId }, data: { deactivatedAt: new Date() } });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "User", objectId: userId, fields: ["deactivatedAt"] });
  });
  await revokeAllSessions(userId);
  await securityEvent({ firmId: s.firm.id, userId: s.user.id, kind: "user-removed", details: { target: userId } });
  revalidatePath("/app/team");
  return { message: "User removed. All their sessions were signed out." };
}

export async function revokeInviteAction(inviteId: string): Promise<ActionState> {
  const s = await requireUser("team.invite");
  await withTenant(s.firm.id, async (tx) => {
    await tx.invitation.update({ where: { id: inviteId }, data: { revokedAt: new Date() } });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "Invitation", objectId: inviteId, fields: ["revokedAt"] });
  });
  revalidatePath("/app/team");
  return { message: "Invitation withdrawn." };
}

export async function signOutEverywhereAction(): Promise<ActionState> {
  const s = await requireUser();
  await revokeAllSessions(s.user.id, s.sessionId);
  await securityEvent({ firmId: s.firm.id, userId: s.user.id, kind: "sign-out-everywhere" });
  return { message: "All your other sessions were signed out." };
}
