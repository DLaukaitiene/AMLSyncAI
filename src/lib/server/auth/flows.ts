import "server-only";
import { z } from "zod";
import { adminDb } from "../db";
import { randomToken, sha256, encryptField, decryptField } from "../crypto";
import { appUrl, sendEmail } from "../email";
import { hit, LIMITS } from "../rate-limit";
import { securityEvent } from "../audit";
import { domainLookups } from "../domain-lookups";
import { checkSignupEmail, checkInviteEmail, emailDomain } from "@/lib/security/email-domain";
import { checkNewPassword, dummyHash, hashPassword, verifyPassword } from "./passwords";
import { generateTotpSecret, verifyTotp } from "@/lib/auth/totp";
import { defaultCountryProfile } from "@/lib/rules/country-profile";
import { EU_CORE_VERSION } from "@/lib/rules/eu-core";
import type { Role, Sector } from "@prisma/client";

export const EU_MEMBER_STATES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
] as const;

export const SECTORS: [string, string][] = [
  ["ACCOUNTANT", "Accountant, auditor or tax advisor"],
  ["ESTATE_AGENT", "Real estate agent"],
  ["HVG_TRADER", "Trader in high-value goods"],
  ["PRECIOUS_METALS", "Precious metals and stones trader"],
  ["TCSP", "Trust or company service provider"],
  ["LEGAL", "Lawyer, notary or legal professional"],
  ["ART_TRADER", "Art and cultural goods trader"],
  ["CREDIT_INTERMEDIARY", "Credit intermediary"],
  ["CROWDFUNDING", "Crowdfunding service provider"],
  ["GAMBLING", "Gambling provider"],
  ["INVESTMENT_MIGRATION", "Investment migration operator"],
  ["OTHER", "Other obliged entity"],
];
const SECTOR_VALUES = SECTORS.map(([v]) => v) as [string, ...string[]];

export type SignupMode = "invite" | "open";
export const signupMode = (): SignupMode => (process.env.SIGNUP_MODE === "open" ? "open" : "invite");

export type FlowResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const fail = (error: string, fieldErrors?: Record<string, string[]>): FlowResult => ({ ok: false, error, fieldErrors });

// ---------------------------------------------------------------------------
// Sign-up (§8C.2): company email check → confirmation link (24 h) → firm created
// ---------------------------------------------------------------------------

export const signupSchema = z.object({
  companyName: z.string().trim().min(2, "Enter the company name").max(200),
  name: z.string().trim().min(2, "Enter your name").max(200),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  memberState: z.enum(EU_MEMBER_STATES, { errorMap: () => ({ message: "Choose the member state" }) }),
  sector: z.enum(SECTOR_VALUES, { errorMap: () => ({ message: "Choose your sector" }) }),
  password: z.string(),
  signupCode: z.string().trim().optional(),
});

export async function startSignup(input: z.infer<typeof signupSchema>, ip: string | null): Promise<FlowResult> {
  if (!(await hit(`signup:ip:${ip}`, LIMITS.signupPerIp))) {
    await securityEvent({ kind: "rate-limit", ip, details: { endpoint: "signup" } });
    return fail("Too many sign-up attempts. Try again later.");
  }

  let codeId: string | null = null;
  if (signupMode() === "invite") {
    if (!input.signupCode) return fail("Enter your sign-up code.", { signupCode: ["AMLSyncAI is currently invitation only."] });
    codeId = sha256(input.signupCode.toUpperCase());
    const code = await adminDb.signupCode.findUnique({ where: { id: codeId } });
    if (!code || code.uses >= code.maxUses || (code.expiresAt && code.expiresAt < new Date())) {
      return fail("This sign-up code is not valid.", { signupCode: ["Check the code or ask AMLSyncAI for a new one."] });
    }
  }

  const domainCheck = await checkSignupEmail(input.email, domainLookups);
  if (!domainCheck.accepted) return fail(domainCheck.message!, { email: [domainCheck.message!] });

  const pwProblems = await checkNewPassword(input.password);
  if (pwProblems.length) return fail(pwProblems[0], { password: pwProblems });

  const token = randomToken();
  await adminDb.emailToken.create({
    data: {
      id: sha256(token),
      purpose: "signup-confirm",
      email: input.email,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      data: {
        companyName: input.companyName,
        name: input.name,
        memberState: input.memberState,
        sector: input.sector,
        passwordHash: await hashPassword(input.password),
        codeId,
        checks: domainCheck.checks,
      },
    },
  });
  await sendEmail(
    input.email,
    "Confirm your AMLSyncAI account",
    `Hello ${input.name},\n\nConfirm your company email to activate AMLSyncAI for ${input.companyName}:\n\n${appUrl(`/confirm/${token}`)}\n\nThe link works once and expires in 24 hours. If you did not sign up, ignore this email.`,
  );
  await securityEvent({ kind: "signup-started", ip, details: { domain: domainCheck.domain } });
  return { ok: true };
}

/** Confirms the email and creates the firm with its owner. Returns the new user. */
export async function confirmSignup(token: string): Promise<{ ok: true; user: { id: string; firmId: string } } | { ok: false; error: string }> {
  const id = sha256(token);
  const t = await adminDb.emailToken.findUnique({ where: { id } });
  if (!t || t.purpose !== "signup-confirm" || t.usedAt || t.expiresAt < new Date()) {
    return { ok: false, error: "This link is invalid or has expired. Sign up again to get a new one." };
  }
  const d = t.data as {
    companyName: string; name: string; memberState: string; sector: string; passwordHash: string; codeId: string | null;
    checks: { freeOrDisposable: boolean; hasMx?: boolean; domainAgeDays?: number | null };
  };
  const domain = emailDomain(t.email)!;

  try {
    const user = await adminDb.$transaction(async (tx) => {
      const used = await tx.emailToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } });
      if (used.count !== 1) throw new Error("used");
      if (d.codeId) {
        const c = await tx.signupCode.updateMany({ where: { id: d.codeId, uses: { lt: tx.signupCode.fields.maxUses } }, data: { uses: { increment: 1 } } });
        if (c.count !== 1) throw new Error("code");
      }
      const firm = await tx.firm.create({
        data: { name: d.companyName, emailDomain: domain, homeState: d.memberState, sectors: [d.sector as Sector] },
      });
      await tx.office.create({ data: { firmId: firm.id, name: "Head office", memberState: d.memberState, isHome: true } });
      await tx.emailDomainVerification.create({
        data: {
          firmId: firm.id, firmName: d.companyName, emailDomain: domain, freeOrDisposable: d.checks.freeOrDisposable,
          hasMx: d.checks.hasMx ?? false, domainAgeDays: d.checks.domainAgeDays ?? null, confirmedAt: new Date(),
        },
      });
      // A new firm's first user holds both roles until they appoint others (one-person firms hold every role).
      const user = await tx.user.create({
        data: {
          firmId: firm.id, email: t.email, name: d.name, roles: ["OWNER", "COMPLIANCE_OFFICER"],
          passwordHash: d.passwordHash, emailVerifiedAt: new Date(),
        },
      });
      await tx.countryProfileVersion.create({
        data: {
          firmId: firm.id, memberState: d.memberState, version: 1, enteredById: user.id, source: "Defaults (EU Core)",
          data: defaultCountryProfile(d.memberState) as object,
        },
      });
      await tx.auditEvent.createMany({
        data: [
          { firmId: firm.id, userId: user.id, action: "create", objectType: "Firm", objectId: firm.id, fields: [] },
          { firmId: firm.id, userId: user.id, action: "create", objectType: "User", objectId: user.id, fields: ["roles"] },
          { firmId: firm.id, userId: user.id, action: "create", objectType: "CountryProfile", objectId: firm.id, fields: ["version"] },
        ],
      });
      return user;
    });
    await securityEvent({ firmId: user.firmId, userId: user.id, kind: "signup-confirmed", details: { euCore: EU_CORE_VERSION } });
    return { ok: true, user };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return { ok: false, error: "A firm already uses this email domain. Ask that firm's Owner to invite you." };
    }
    if ((e as Error).message === "code") return { ok: false, error: "The sign-up code has already been used." };
    return { ok: false, error: "This link is invalid or has expired. Sign up again to get a new one." };
  }
}

// ---------------------------------------------------------------------------
// Login (§8C.3–8C.4): no enumeration, progressive lockout, rate limits
// ---------------------------------------------------------------------------

const GENERIC_LOGIN_ERROR = "Email or password is incorrect.";
const LOCK_AFTER = 10;

export async function passwordLogin(
  email: string,
  password: string,
  ip: string | null,
  userAgent: string | null,
): Promise<{ ok: true; user: { id: string; firmId: string; mfaEnrolled: boolean } } | { ok: false; error: string }> {
  const normalized = email.trim().toLowerCase();
  const okIp = await hit(`login:ip:${ip}`, LIMITS.loginPerIp);
  const okAcct = await hit(`login:acct:${sha256(normalized)}`, LIMITS.loginPerAccount);
  if (!okIp || !okAcct) {
    await securityEvent({ kind: "rate-limit", ip, userAgent, details: { endpoint: "login" } });
    return { ok: false, error: "Too many attempts. Wait a few minutes and try again." };
  }

  const user = await adminDb.user.findUnique({ where: { email: normalized } });
  if (!user || !user.passwordHash || user.deactivatedAt) {
    await verifyPassword(await dummyHash(), password); // equal timing
    await securityEvent({ kind: "login-failed", ip, userAgent });
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await verifyPassword(await dummyHash(), password);
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    const failed = user.failedLogins + 1;
    // Progressive lockout: from the 10th failure, 15 min, doubling each further failure (max 24 h).
    const lockMs = failed >= LOCK_AFTER ? Math.min(15 * 60_000 * 2 ** (failed - LOCK_AFTER), 24 * 3600_000) : 0;
    await adminDb.user.update({
      where: { id: user.id },
      data: { failedLogins: failed, lockedUntil: lockMs ? new Date(Date.now() + lockMs) : null },
    });
    await securityEvent({ firmId: user.firmId, userId: user.id, kind: "login-failed", ip, userAgent, details: { failed } });
    if (failed === LOCK_AFTER) {
      await sendEmail(user.email, "AMLSyncAI: your account is temporarily locked",
        `There were ${failed} failed sign-in attempts on your account, so it is locked for a short time. If this wasn't you, tell your Compliance Officer.`);
    }
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  await adminDb.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  const recovered = await applyDueRecovery(user.id);
  return { ok: true, user: { id: user.id, firmId: user.firmId, mfaEnrolled: !!user.mfaEnrolledAt && !recovered } };
}

/** Sends a new-device alert when this IP + browser hasn't been seen for the user (§8C.3). */
export async function newDeviceCheck(userId: string, ip: string | null, userAgent: string | null) {
  const seen = await adminDb.session.count({ where: { userId, ip, userAgent: userAgent?.slice(0, 300), stage: "ACTIVE" } });
  if (seen > 1) return;
  const user = await adminDb.user.findUniqueOrThrow({ where: { id: userId } });
  await securityEvent({ firmId: user.firmId, userId, kind: "new-device", ip, userAgent });
  const text = `A new sign-in to AMLSyncAI for ${user.email} from a new device or location.\nTime: ${new Date().toISOString()}\nIf this wasn't you, sign out everywhere and tell your Compliance Officer.`;
  await sendEmail(user.email, "AMLSyncAI: new sign-in", text);
  if (user.roles.some((r) => r === "OWNER" || r === "COMPLIANCE_OFFICER")) {
    const owners = await adminDb.user.findMany({ where: { firmId: user.firmId, roles: { has: "OWNER" }, deactivatedAt: null, NOT: { id: userId } } });
    for (const o of owners) await sendEmail(o.email, "AMLSyncAI: new sign-in by a privileged user", text);
  }
}

// ---------------------------------------------------------------------------
// MFA (§8C.3): TOTP + one-time recovery codes
// ---------------------------------------------------------------------------

export async function getOrCreatePendingTotpSecret(userId: string): Promise<string> {
  const u = await adminDb.user.findUniqueOrThrow({ where: { id: userId } });
  if (u.mfaEnrolledAt) throw new Error("MFA is already set up");
  if (u.totpSecretEnc) return decryptField(u.firmId, u.totpSecretEnc);
  const secret = generateTotpSecret();
  await adminDb.user.update({ where: { id: userId }, data: { totpSecretEnc: encryptField(u.firmId, secret) } });
  return secret;
}

function newRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const s = randomToken(8).replace(/[^A-Za-z0-9]/g, "").toUpperCase().padEnd(10, "X").slice(0, 10);
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

export async function completeTotpEnrollment(userId: string, code: string): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: string }> {
  const u = await adminDb.user.findUniqueOrThrow({ where: { id: userId } });
  if (u.mfaEnrolledAt || !u.totpSecretEnc) return { ok: false, error: "Start the setup again." };
  if (verifyTotp(decryptField(u.firmId, u.totpSecretEnc), code) === null) {
    return { ok: false, error: "That code is not correct. Check the time on your phone and try again." };
  }
  const codes = newRecoveryCodes();
  await adminDb.user.update({
    where: { id: userId },
    data: { mfaEnrolledAt: new Date(), recoveryCodeHashes: await Promise.all(codes.map((c) => hashPassword(c))) },
  });
  await securityEvent({ firmId: u.firmId, userId, kind: "mfa-enrolled", details: { method: "totp" } });
  return { ok: true, recoveryCodes: codes };
}

/** Verifies a TOTP or a one-time recovery code (which is then used up). */
export async function verifySecondFactor(userId: string, sessionId: string, code: string): Promise<boolean> {
  if (!(await hit(`mfa:${sessionId}`, LIMITS.mfaPerSession))) return false;
  const u = await adminDb.user.findUniqueOrThrow({ where: { id: userId } });
  if (!u.mfaEnrolledAt || !u.totpSecretEnc) return false;
  const trimmed = code.trim();
  if (/^\d{3}\s?\d{3}$/.test(trimmed)) {
    const ok = verifyTotp(decryptField(u.firmId, u.totpSecretEnc), trimmed) !== null;
    await securityEvent({ firmId: u.firmId, userId, kind: ok ? "mfa-ok" : "mfa-failed" });
    return ok;
  }
  const upper = trimmed.toUpperCase();
  for (let i = 0; i < u.recoveryCodeHashes.length; i++) {
    if (await verifyPassword(u.recoveryCodeHashes[i], upper)) {
      const remaining = u.recoveryCodeHashes.filter((_, j) => j !== i);
      await adminDb.user.update({ where: { id: userId }, data: { recoveryCodeHashes: remaining } });
      await securityEvent({ firmId: u.firmId, userId, kind: "recovery-code-used", details: { remaining: remaining.length } });
      return true;
    }
  }
  await securityEvent({ firmId: u.firmId, userId, kind: "mfa-failed" });
  return false;
}

// ---------------------------------------------------------------------------
// Invitations (§8C.3): invite only, firm domain unless explicitly external, 72 h, single use
// ---------------------------------------------------------------------------

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  name: z.string().trim().min(2, "Enter the person's name").max(200),
  role: z.enum(["OWNER", "COMPLIANCE_OFFICER", "STAFF", "EXTERNAL_REVIEWER", "READ_ONLY"]),
  allowExternal: z.boolean(),
});

export async function createInvitation(
  firmId: string,
  invitedById: string,
  input: z.infer<typeof inviteSchema>,
): Promise<FlowResult> {
  if (!(await hit(`invite:firm:${firmId}`, LIMITS.invitePerFirm))) return fail("Too many invitations today.");
  const firm = await adminDb.firm.findUniqueOrThrow({ where: { id: firmId } });
  const external = input.role === "EXTERNAL_REVIEWER";
  const check = checkInviteEmail(input.email, firm.emailDomain, input.allowExternal || external);
  if (!check.allowed) return fail(check.message!, { email: [check.message!] });
  if (await adminDb.user.findUnique({ where: { email: input.email } })) {
    return fail("This person already has an AMLSyncAI account.", { email: ["Already a user."] });
  }
  const token = randomToken();
  await adminDb.$transaction(async (tx) => {
    await tx.invitation.updateMany({ where: { firmId, email: input.email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    const inv = await tx.invitation.create({
      data: {
        firmId, email: input.email, name: input.name, roles: [input.role as Role], external: check.external,
        invitedById, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
    });
    await tx.auditEvent.create({ data: { firmId, userId: invitedById, action: "create", objectType: "Invitation", objectId: inv.id, fields: ["roles"] } });
  });
  await sendEmail(
    input.email,
    `You're invited to ${firm.name} on AMLSyncAI`,
    `Hello ${input.name},\n\nYou've been invited to join ${firm.name} on AMLSyncAI.\n\n${appUrl(`/invite/${token}`)}\n\nThe link works once and expires in 72 hours.`,
  );
  return { ok: true };
}

export async function findInvitation(token: string) {
  const inv = await adminDb.invitation.findUnique({ where: { tokenHash: sha256(token) } });
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date()) return null;
  const firm = await adminDb.firm.findUniqueOrThrow({ where: { id: inv.firmId } });
  return { ...inv, firmName: firm.name };
}

export async function acceptInvitation(token: string, password: string): Promise<{ ok: true; user: { id: string; firmId: string } } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }> {
  const inv = await findInvitation(token);
  if (!inv) return { ok: false, error: "This invitation is invalid or has expired. Ask for a new one." };
  const problems = await checkNewPassword(password);
  if (problems.length) return { ok: false, error: problems[0], fieldErrors: { password: problems } };
  const passwordHash = await hashPassword(password);
  try {
    const user = await adminDb.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({ where: { id: inv.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } });
      if (claimed.count !== 1) throw new Error("used");
      const user = await tx.user.create({
        data: {
          firmId: inv.firmId, email: inv.email, name: inv.name, roles: inv.roles, external: inv.external,
          passwordHash, emailVerifiedAt: new Date(),
        },
      });
      await tx.auditEvent.create({ data: { firmId: inv.firmId, userId: user.id, action: "create", objectType: "User", objectId: user.id, fields: ["roles"] } });
      return user;
    });
    return { ok: true, user };
  } catch {
    return { ok: false, error: "This invitation is invalid or has expired. Ask for a new one." };
  }
}

// ---------------------------------------------------------------------------
// Password reset: email link resets the password only. MFA is still required
// to sign in, so the account can never be recovered by email alone (§8C.3).
// ---------------------------------------------------------------------------

export async function requestPasswordReset(email: string, ip: string | null): Promise<void> {
  if (!(await hit(`reset:ip:${ip}`, LIMITS.passwordResetPerIp))) return;
  const user = await adminDb.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || user.deactivatedAt) return; // same response either way
  const token = randomToken();
  await adminDb.emailToken.create({
    data: { id: sha256(token), purpose: "password-reset", email: user.email, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  await sendEmail(user.email, "Reset your AMLSyncAI password",
    `Reset your password here (valid for 1 hour, works once):\n\n${appUrl(`/reset/${token}`)}\n\nYou will still need your authenticator app to sign in.`);
  await securityEvent({ firmId: user.firmId, userId: user.id, kind: "password-reset-requested", ip });
}

export async function resetPassword(token: string, password: string): Promise<FlowResult> {
  const id = sha256(token);
  const t = await adminDb.emailToken.findUnique({ where: { id } });
  if (!t || t.purpose !== "password-reset" || t.usedAt || t.expiresAt < new Date()) return fail("This link is invalid or has expired.");
  const problems = await checkNewPassword(password);
  if (problems.length) return fail(problems[0], { password: problems });
  const user = await adminDb.user.findUnique({ where: { email: t.email } });
  if (!user) return fail("This link is invalid or has expired.");
  const passwordHash = await hashPassword(password);
  const used = await adminDb.emailToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count !== 1) return fail("This link is invalid or has expired.");
  await adminDb.user.update({ where: { id: user.id }, data: { passwordHash, failedLogins: 0, lockedUntil: null } });
  await adminDb.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await securityEvent({ firmId: user.firmId, userId: user.id, kind: "password-reset" });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Two-factor recovery (§8C.3): never by email alone.
// - Multi-user firms: another Owner / Compliance Officer resets it (resetUserMfa).
// - Single-user firms: password + re-confirmed company email + 72-hour wait,
//   during which the Owner's email is notified and can cancel.
// ---------------------------------------------------------------------------

export const RECOVERY_WAIT_HOURS = 72;

export async function resetUserMfa(firmId: string, byUserId: string, userId: string) {
  if (byUserId === userId) throw new Error("Ask another Owner or Compliance Officer to reset your two-factor authentication.");
  const u = await adminDb.user.findUniqueOrThrow({ where: { id: userId } });
  if (u.firmId !== firmId) throw new Error("Not found");
  await adminDb.user.update({ where: { id: userId }, data: { mfaEnrolledAt: null, totpSecretEnc: null, recoveryCodeHashes: [] } });
  await adminDb.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await securityEvent({ firmId, userId: byUserId, kind: "mfa-reset", details: { target: userId } });
  await sendEmail(u.email, "AMLSyncAI: your two-factor authentication was reset", "A colleague reset your two-factor authentication. Sign in with your password and set it up again. If you didn't ask for this, contact your Compliance Officer.");
}

export async function requestSelfRecovery(email: string, password: string, ip: string | null): Promise<void> {
  if (!(await hit(`recover:ip:${ip}`, LIMITS.passwordResetPerIp))) return;
  const u = await adminDb.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!u || !u.passwordHash || u.deactivatedAt || !(await verifyPassword(u.passwordHash, password))) {
    await verifyPassword(await dummyHash(), password);
    return; // same response either way
  }
  const others = await adminDb.user.count({ where: { firmId: u.firmId, deactivatedAt: null, id: { not: u.id }, roles: { hasSome: ["OWNER", "COMPLIANCE_OFFICER"] } } });
  if (others > 0) {
    await sendEmail(u.email, "AMLSyncAI: two-factor recovery", "Ask another Owner or Compliance Officer of your firm to reset your two-factor authentication in Team.");
    return;
  }
  const confirm = randomToken();
  const cancel = randomToken();
  const notBefore = new Date(Date.now() + RECOVERY_WAIT_HOURS * 3600_000);
  await adminDb.emailToken.create({ data: { id: sha256(confirm), purpose: "mfa-recovery", email: u.email, expiresAt: new Date(notBefore.getTime() + 7 * 86_400_000), data: { userId: u.id, notBefore: notBefore.toISOString(), cancelId: sha256(cancel), confirmed: false } } });
  await securityEvent({ firmId: u.firmId, userId: u.id, kind: "mfa-recovery-requested", ip });
  const owners = await adminDb.user.findMany({ where: { firmId: u.firmId, roles: { has: "OWNER" }, deactivatedAt: null } });
  for (const o of new Map([...owners, u].map((x) => [x.email, x])).values()) {
    await sendEmail(o.email, "AMLSyncAI: two-factor recovery requested",
      `Someone asked to recover two-factor authentication for ${u.email}.\n\nIf this was you, confirm your email: ${appUrl(`/recover/confirm/${confirm}`)}\nYou can then sign in and set up two-factor again after ${notBefore.toISOString().slice(0, 16).replace("T", " ")} UTC (72 hours).\n\nIf this wasn't you, cancel it now: ${appUrl(`/recover/cancel/${cancel}`)}`);
  }
}

export async function confirmSelfRecovery(token: string): Promise<{ ok: boolean; notBefore?: string }> {
  const t = await adminDb.emailToken.findUnique({ where: { id: sha256(token) } });
  if (!t || t.purpose !== "mfa-recovery" || t.usedAt || t.expiresAt < new Date()) return { ok: false };
  const d = t.data as { notBefore: string };
  await adminDb.emailToken.update({ where: { id: t.id }, data: { data: { ...(t.data as object), confirmed: true } } });
  return { ok: true, notBefore: d.notBefore };
}

export async function cancelSelfRecovery(token: string): Promise<boolean> {
  const all = await adminDb.emailToken.findMany({ where: { purpose: "mfa-recovery", usedAt: null } });
  const t = all.find((x) => (x.data as { cancelId?: string }).cancelId === sha256(token));
  if (!t) return false;
  await adminDb.emailToken.update({ where: { id: t.id }, data: { usedAt: new Date(), data: { ...(t.data as object), cancelled: true } } });
  const d = t.data as { userId: string };
  const u = await adminDb.user.findUnique({ where: { id: d.userId } });
  await securityEvent({ firmId: u?.firmId, userId: d.userId, kind: "mfa-recovery-cancelled" });
  return true;
}

/** At login: a confirmed recovery past its 72-hour wait resets MFA once. */
export async function applyDueRecovery(userId: string): Promise<boolean> {
  const tokens = await adminDb.emailToken.findMany({ where: { purpose: "mfa-recovery", usedAt: null, expiresAt: { gt: new Date() } } });
  const t = tokens.find((x) => {
    const d = x.data as { userId: string; notBefore: string; confirmed: boolean };
    return d.userId === userId && d.confirmed && new Date(d.notBefore) <= new Date();
  });
  if (!t) return false;
  await adminDb.emailToken.update({ where: { id: t.id }, data: { usedAt: new Date() } });
  await adminDb.user.update({ where: { id: userId }, data: { mfaEnrolledAt: null, totpSecretEnc: null, recoveryCodeHashes: [] } });
  const u = await adminDb.user.findUniqueOrThrow({ where: { id: userId } });
  await securityEvent({ firmId: u.firmId, userId, kind: "mfa-recovered" });
  return true;
}
