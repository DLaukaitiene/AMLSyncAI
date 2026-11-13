"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/components/form";
import {
  acceptInvitation,
  completeTotpEnrollment,
  confirmSignup,
  newDeviceCheck,
  passwordLogin,
  requestPasswordReset,
  resetPassword,
  signupSchema,
  startSignup,
  verifySecondFactor,
} from "@/lib/server/auth/flows";
import { createSession, destroySession, getSession, markMfa, requestMeta } from "@/lib/server/session";
import { formToObject, isBot, safeNext, zodErrors } from "@/lib/server/form";
import { securityEvent } from "@/lib/server/audit";

export async function signupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ip, userAgent } = await requestMeta();
  if (isBot(fd)) {
    await securityEvent({ kind: "bot-block", ip, userAgent, details: { endpoint: "signup" } });
    redirect("/signup/sent");
  }
  const parsed = signupSchema.safeParse(formToObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const r = await startSignup(parsed.data, ip);
  if (!r.ok) return { error: r.error, fieldErrors: r.fieldErrors };
  redirect("/signup/sent");
}

export async function confirmAction(token: string): Promise<ActionState> {
  const r = await confirmSignup(token);
  if (!r.ok) return { error: r.error };
  await createSession(r.user, "MFA_SETUP");
  redirect("/mfa/setup");
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ip, userAgent } = await requestMeta();
  if (isBot(fd)) return { error: "Email or password is incorrect." };
  const r = await passwordLogin(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""), ip, userAgent);
  if (!r.ok) return { error: r.error };
  await createSession(r.user, r.user.mfaEnrolled ? "MFA_PENDING" : "MFA_SETUP");
  redirect(r.user.mfaEnrolled ? "/login/mfa" : "/mfa/setup");
}

export async function mfaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSession();
  if (!s || s.stage !== "MFA_PENDING") redirect("/login");
  const ok = await verifySecondFactor(s.user.id, s.sessionId, String(fd.get("code") ?? ""));
  if (!ok) return { error: "That code is not correct." };
  await markMfa(s.sessionId, true);
  const { ip, userAgent } = await requestMeta();
  await securityEvent({ firmId: s.user.firmId, userId: s.user.id, kind: "login", ip, userAgent });
  await newDeviceCheck(s.user.id, ip, userAgent);
  redirect("/app");
}

export async function enrollTotpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSession();
  if (!s || s.stage !== "MFA_SETUP") redirect("/login");
  const r = await completeTotpEnrollment(s.user.id, String(fd.get("code") ?? ""));
  if (!r.ok) return { error: r.error };
  await markMfa(s.sessionId, true);
  const { ip, userAgent } = await requestMeta();
  await securityEvent({ firmId: s.user.firmId, userId: s.user.id, kind: "login", ip, userAgent });
  return { data: { recoveryCodes: r.recoveryCodes } };
}

export async function reauthAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE") redirect("/login");
  const ok = await verifySecondFactor(s.user.id, s.sessionId, String(fd.get("code") ?? ""));
  if (!ok) return { error: "That code is not correct." };
  await markMfa(s.sessionId, false);
  redirect(safeNext(fd.get("next")));
}

export async function acceptInviteAction(token: string, _: ActionState, fd: FormData): Promise<ActionState> {
  if (isBot(fd)) return { error: "This invitation is invalid or has expired." };
  const r = await acceptInvitation(token, String(fd.get("password") ?? ""));
  if (!r.ok) return { error: r.error, fieldErrors: r.fieldErrors };
  await createSession(r.user, "MFA_SETUP");
  redirect("/mfa/setup");
}

export async function forgotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ip } = await requestMeta();
  if (!isBot(fd)) await requestPasswordReset(String(fd.get("email") ?? ""), ip);
  return { message: "If an account exists for this email, we've sent a link to reset the password." };
}

export async function resetAction(token: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const r = await resetPassword(token, String(fd.get("password") ?? ""));
  if (!r.ok) return { error: r.error, fieldErrors: r.fieldErrors };
  redirect("/login?reset=1");
}

export async function logoutAction() {
  const s = await getSession();
  if (s) await securityEvent({ firmId: s.user.firmId, userId: s.user.id, kind: "logout" });
  await destroySession();
  redirect("/login");
}
