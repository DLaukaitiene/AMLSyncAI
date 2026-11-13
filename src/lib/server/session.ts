import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Role, SessionStage } from "@prisma/client";
import { adminDb } from "./db";
import { randomToken, sha256 } from "./crypto";
import { can, type Action, type AppRole } from "@/lib/auth/permissions";

/** Session rules (spec §8C.3). */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
export const STEP_UP_MS = 5 * 60 * 1000;
const PRE_AUTH_TIMEOUT_MS = 10 * 60 * 1000;

// Secure, host-only cookie whenever the app is served over HTTPS (always in production deployments).
const SECURE = (process.env.APP_URL ?? "").startsWith("https://");
const COOKIE = SECURE ? "__Host-aml_session" : "aml_session";

export async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
    userAgent: h.get("user-agent"),
  };
}

export async function createSession(user: { id: string; firmId: string }, stage: SessionStage, mfaAt?: Date) {
  const token = randomToken();
  const meta = await requestMeta();
  const now = Date.now();
  await adminDb.session.create({
    data: {
      id: sha256(token),
      userId: user.id,
      firmId: user.firmId,
      stage,
      mfaAt: mfaAt ?? null,
      expiresAt: new Date(now + (stage === "ACTIVE" ? ABSOLUTE_TIMEOUT_MS : PRE_AUTH_TIMEOUT_MS)),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 300),
    },
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: SECURE,
    sameSite: "strict",
    path: "/",
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await adminDb.session.updateMany({ where: { id: sha256(token) }, data: { revokedAt: new Date() } });
  jar.delete(COOKIE);
}

export interface CurrentSession {
  sessionId: string;
  stage: SessionStage;
  mfaAt: Date | null;
  user: { id: string; firmId: string; email: string; name: string; roles: AppRole[]; external: boolean; mfaEnrolled: boolean };
  firm: { id: string; name: string; homeState: string };
}

/** Reads and validates the session; enforces idle and absolute timeouts. */
export async function getSession(): Promise<CurrentSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const s = await adminDb.session.findUnique({
    where: { id: sha256(token) },
    include: { user: { include: { firm: true } } },
  });
  const now = Date.now();
  if (!s || s.revokedAt || s.expiresAt.getTime() < now || s.user.deactivatedAt) return null;
  if (s.stage === "ACTIVE" && now - s.lastSeenAt.getTime() > IDLE_TIMEOUT_MS) {
    await adminDb.session.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
    return null;
  }
  // Touch at most once a minute to limit writes.
  if (now - s.lastSeenAt.getTime() > 60_000) {
    await adminDb.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
  }
  return {
    sessionId: s.id,
    stage: s.stage,
    mfaAt: s.mfaAt,
    user: {
      id: s.user.id,
      firmId: s.user.firmId,
      email: s.user.email,
      name: s.user.name,
      roles: s.user.roles as AppRole[],
      external: s.user.external,
      mfaEnrolled: !!s.user.mfaEnrolledAt,
    },
    firm: { id: s.user.firm.id, name: s.user.firm.name, homeState: s.user.firm.homeState },
  };
}

/** For pages and actions inside the app: requires a fully authenticated session. */
export async function requireUser(action?: Action): Promise<CurrentSession> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.stage === "MFA_SETUP") redirect("/mfa/setup");
  if (s.stage === "MFA_PENDING") redirect("/login/mfa");
  // No permission: answer as if the page didn't exist (doesn't reveal what's there).
  if (action && !can(s.user.roles, action)) notFound();
  return s;
}

export class Forbidden extends Error {
  constructor(action: string) {
    super(`You don't have permission for this action (${action}).`);
  }
}

/** Step-up re-authentication (spec §8C.3): fresh MFA within the last 5 minutes. */
export function hasRecentMfa(s: CurrentSession): boolean {
  return !!s.mfaAt && Date.now() - s.mfaAt.getTime() < STEP_UP_MS;
}

export async function requireRecentMfa(s: CurrentSession, returnTo: string) {
  if (!hasRecentMfa(s)) redirect(`/reauth?next=${encodeURIComponent(returnTo)}`);
}

export async function markMfa(sessionId: string, promote: boolean) {
  await adminDb.session.update({
    where: { id: sessionId },
    data: promote
      ? { mfaAt: new Date(), stage: "ACTIVE", lastSeenAt: new Date(), expiresAt: new Date(Date.now() + ABSOLUTE_TIMEOUT_MS) }
      : { mfaAt: new Date() },
  });
}

/** Revoke every session of a user (removal, role reduction, password reset, "sign out everywhere"). */
export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await adminDb.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}

export type { Role };
