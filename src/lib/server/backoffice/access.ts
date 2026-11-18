import "server-only";
import { notFound, redirect } from "next/navigation";
import { adminDb } from "../db";
import { getSession, hasRecentMfa, requireUser, type CurrentSession } from "../session";
import { adminCan, envOwners, isAdminRole, type AdminPermission, type AdminRole } from "@/lib/backoffice/roles";
import type { ActionState } from "@/components/form";

/**
 * Backoffice access (§4). Admins sign in like every user (password + mandatory
 * TOTP, 15-minute idle timeout); their admin roles come from AdminMember, and
 * PLATFORM_ADMIN_EMAILS are always Owners. Writes need a fresh step-up.
 */
export interface AdminContext {
  session: CurrentSession;
  email: string;
  roles: AdminRole[];
  can: (p: AdminPermission) => boolean;
}

export async function adminRolesFor(email: string): Promise<AdminRole[]> {
  const e = email.toLowerCase();
  const roles = new Set<AdminRole>();
  if (envOwners().includes(e)) roles.add("OWNER");
  const m = await adminDb.adminMember.findUnique({ where: { email: e } });
  if (m && !m.removedAt) for (const r of m.roles) if (isAdminRole(r)) roles.add(r);
  return [...roles];
}

export async function isAdmin(email: string): Promise<boolean> {
  return (await adminRolesFor(email)).length > 0;
}

/** For Backoffice pages: non-admins get a 404 (the Backoffice does not reveal itself). */
export async function requireAdmin(p: AdminPermission = "dashboard.view"): Promise<AdminContext> {
  const session = await requireUser();
  const roles = await adminRolesFor(session.user.email);
  if (!roles.length || !adminCan(roles, p)) notFound();
  return { session, email: session.user.email.toLowerCase(), roles, can: (x) => adminCan(roles, x) };
}

/** For server actions: permission + fresh MFA. Returns an ActionState error instead of throwing. */
export async function adminAction(p: AdminPermission, returnTo: string): Promise<AdminContext | NonNullable<ActionState>> {
  const session = await getSession();
  if (!session || session.stage !== "ACTIVE") redirect("/login");
  const roles = await adminRolesFor(session.user.email);
  if (!adminCan(roles, p)) return { error: "You don't have permission for this action." };
  if (!hasRecentMfa(session)) return { error: "For security, confirm it's you first.", data: { stepUp: returnTo } };
  return { session, email: session.user.email.toLowerCase(), roles, can: (x) => adminCan(roles, x) };
}

export const isActionError = (x: AdminContext | NonNullable<ActionState>): x is NonNullable<ActionState> => !("session" in x);

export async function ownerCount(): Promise<number> {
  const members = await adminDb.adminMember.findMany({ where: { removedAt: null, roles: { has: "OWNER" } }, select: { email: true } });
  return new Set([...envOwners(), ...members.map((m) => m.email)]).size;
}

export async function hasAdminPermission(email: string, p: AdminPermission): Promise<boolean> {
  return adminCan(await adminRolesFor(email), p);
}
