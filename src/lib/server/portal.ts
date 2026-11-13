import "server-only";
import { cookies } from "next/headers";
import { randomInt } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { adminDb, withTenant, type Tx } from "./db";
import { decryptField, encryptField, randomToken, safeEqual, sha256 } from "./crypto";
import { appUrl, sendEmail } from "./email";
import { audit, securityEvent } from "./audit";
import { hit } from "./rate-limit";
import { loadClientFile, persistRiskIfChanged, runScreening, upsertTask } from "./cdd";
import { displayName } from "@/lib/cdd/party";
import { toIsoDate } from "@/lib/rules/dates";
import { openCddItems } from "@/lib/rules/gates";
import { refreshDue } from "@/lib/rules/deadlines";

/**
 * Client self-service portal (spec §4A.1, §8C.5, §11.5).
 * - Each party gets its own random link (no personal data in the URL), valid 14 days.
 * - Opening it needs a one-time code sent to the address the link went to.
 * - A party sees only its own data and uploads.
 * - Reminders on day 1, 3 and 7; after day 7 a task is created for staff.
 */

export const LINK_DAYS = 14;
const CODE_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const SESSION_MINUTES = 30;
const COOKIE = "aml_portal";

export async function createPortalLink(tx: Tx, ctx: { firmId: string; userId: string }, cddFileId: string, email: string, days = LINK_DAYS, purpose: "onboarding" | "refresh" = "onboarding") {
  const file = await tx.cddFile.findUniqueOrThrow({ where: { id: cddFileId }, include: { party: true } });
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: ctx.firmId } });
  // One active link per file: earlier links stop working.
  await tx.portalLink.updateMany({ where: { cddFileId, status: { in: ["SENT", "OPENED"] } }, data: { status: "REVOKED" } });
  const token = randomToken();
  const link = await tx.portalLink.create({
    data: {
      firmId: ctx.firmId, partyId: file.partyId, cddFileId, tokenHash: sha256(token), tokenEnc: encryptField(ctx.firmId, token), sentTo: email.toLowerCase(), purpose,
      expiresAt: new Date(Date.now() + Math.min(days, LINK_DAYS) * 86_400_000), createdById: ctx.userId,
    },
  });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "PortalLink", objectId: link.id });
  if (purpose === "refresh") {
    await sendEmail(email, `${firm.name}: please confirm your information is up to date`,
      `Hello,\n\nEU anti-money-laundering rules require ${firm.name} to keep your client information up to date. It takes a minute: confirm that nothing has changed, or update what has.\n\n${appUrl(`/p/${token}`)}\n\nYou'll get a one-time code by email to open the page.`);
    return link.id;
  }
  await sendEmail(
    email,
    `${firm.name}: please complete your client information`,
    `Hello,\n\n${firm.name} needs some information from you to meet its legal obligations under EU anti-money-laundering rules.\n\nOpen your secure page:\n${appUrl(`/p/${token}`)}\n\nYou'll get a one-time code by email to open it. The link expires in ${days} days.\n\nIf you weren't expecting this, contact ${firm.name}.`,
  );
  return link.id;
}

export async function revokePortalLink(tx: Tx, ctx: { firmId: string; userId: string }, linkId: string) {
  await tx.portalLink.update({ where: { id: linkId }, data: { status: "REVOKED", sessionHash: null } });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "update", objectType: "PortalLink", objectId: linkId, fields: ["status"] });
}

type Link = NonNullable<Awaited<ReturnType<typeof adminDb.portalLink.findUnique>>>;

/** A link that may be used: not revoked, not expired, not yet submitted. */
async function usableLink(token: string): Promise<Link | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const l = await adminDb.portalLink.findUnique({ where: { tokenHash: sha256(token) } });
  if (!l || l.status === "REVOKED" || l.expiresAt < new Date()) return null;
  return l;
}

/** Masked address for the "we sent a code to j•••@example.lt" message. */
export function maskEmail(e: string) {
  const [u, d] = e.split("@");
  return `${u.slice(0, 1)}•••@${d}`;
}

export async function linkLanding(token: string) {
  const l = await usableLink(token);
  if (!l) return null;
  const firm = await adminDb.firm.findUniqueOrThrow({ where: { id: l.firmId }, select: { name: true } });
  return { firmName: firm.name, maskedEmail: maskEmail(l.sentTo), submitted: l.status === "SUBMITTED" };
}

export async function sendPortalCode(token: string, ip: string | null): Promise<{ ok: boolean; error?: string }> {
  const l = await usableLink(token);
  if (!l) return { ok: false, error: "This link is no longer valid. Ask for a new one." };
  if (!(await hit(`portal-code:${l.id}`, { limit: 5, windowSec: 3600 })) || !(await hit(`portal-code-ip:${ip}`, { limit: 20, windowSec: 3600 }))) {
    await securityEvent({ firmId: l.firmId, kind: "rate-limit", ip, details: { endpoint: "portal-code" } });
    return { ok: false, error: "Too many codes requested. Try again later." };
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await adminDb.portalLink.update({
    where: { id: l.id },
    data: { codeHash: sha256(`${l.id}:${code}`), codeExpiresAt: new Date(Date.now() + CODE_MINUTES * 60_000), codeAttempts: 0 },
  });
  await sendEmail(l.sentTo, "Your one-time code", `Your code is ${code}. It expires in ${CODE_MINUTES} minutes. Don't share it with anyone.`);
  return { ok: true };
}

export async function verifyPortalCode(token: string, code: string, ip: string | null): Promise<{ ok: boolean; error?: string }> {
  const l = await usableLink(token);
  if (!l) return { ok: false, error: "This link is no longer valid. Ask for a new one." };
  if (!(await hit(`portal-verify-ip:${ip}`, { limit: 30, windowSec: 900 }))) return { ok: false, error: "Too many attempts. Try again later." };
  if (!l.codeHash || !l.codeExpiresAt || l.codeExpiresAt < new Date()) return { ok: false, error: "The code has expired. Request a new one." };
  if (l.codeAttempts >= MAX_CODE_ATTEMPTS) return { ok: false, error: "Too many wrong codes. Request a new one." };
  if (!safeEqual(sha256(`${l.id}:${code.trim()}`), l.codeHash)) {
    await adminDb.portalLink.update({ where: { id: l.id }, data: { codeAttempts: { increment: 1 } } });
    return { ok: false, error: "That code is not correct." };
  }
  const session = randomToken();
  await adminDb.portalLink.update({
    where: { id: l.id },
    data: {
      codeHash: null, codeExpiresAt: null, sessionHash: sha256(session), sessionExpiresAt: new Date(Date.now() + SESSION_MINUTES * 60_000),
      status: l.status === "SENT" ? "OPENED" : l.status,
    },
  });
  (await cookies()).set(COOKIE, session, {
    httpOnly: true, sameSite: "strict", path: "/p", secure: (process.env.APP_URL ?? "").startsWith("https://"), maxAge: SESSION_MINUTES * 60,
  });
  await securityEvent({ firmId: l.firmId, kind: "portal-opened", ip, details: { link: l.id } });
  return { ok: true };
}

/** The link + party for a verified portal session, or null. */
export async function portalContext(token: string) {
  const l = await usableLink(token);
  if (!l || !l.sessionHash || !l.sessionExpiresAt || l.sessionExpiresAt < new Date()) return null;
  const s = (await cookies()).get(COOKIE)?.value;
  if (!s || !safeEqual(sha256(s), l.sessionHash)) return null;
  return withTenant(l.firmId, async (tx) => {
    const file = await tx.cddFile.findUniqueOrThrow({ where: { id: l.cddFileId }, include: { party: true } });
    const firm = await tx.firm.findUniqueOrThrow({ where: { id: l.firmId }, select: { name: true } });
    const cf = await loadClientFile(tx, l.firmId, l.cddFileId);
    // Only this party's own uploads — never another party's.
    const documents = await tx.document.findMany({ where: { partyId: l.partyId, uploadedBy: `portal:${l.id}` }, select: { id: true, kind: true, fileName: true, malwareScan: true } });
    return { link: l, party: file.party, file, firmName: firm.name, eddRequired: cf.risk.eddRequired, documents };
  });
}

// ---------------------------------------------------------------------------
// Questionnaire
// ---------------------------------------------------------------------------

const t = (max = 500) => z.string().trim().max(max).optional().default("");
const iso2list = z.string().trim().toUpperCase().regex(/^([A-Z]{2}([,\s]+[A-Z]{2})*)?$/, "Use 2-letter country codes, e.g. LT, PL").optional().default("");

export const portalNaturalSchema = z.object({
  firstNames: z.string().trim().min(1, "Required").max(200),
  lastName: z.string().trim().min(1, "Required").max(200),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth"),
  placeOfBirth: z.string().trim().min(1, "Required").max(200),
  nationalities: iso2list.refine((v) => v.length > 0, "Enter at least one nationality"),
  residenceCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "2-letter code"),
  address: z.string().trim().min(5, "Enter your residential address").max(500),
  occupation: t(200),
  taxResidence: iso2list,
  purpose: z.string().trim().min(5, "Describe what you need the service for").max(1000),
  sourceOfFunds: z.string().trim().min(5, "Describe where the money for this comes from").max(2000),
  sourceOfWealth: t(2000),
  isPep: z.enum(["yes", "no"], { errorMap: () => ({ message: "Answer this question" }) }),
  pepFunction: t(300),
  isPepFamilyOrAssociate: z.enum(["yes", "no"], { errorMap: () => ({ message: "Answer this question" }) }),
  actingForOther: z.enum(["yes", "no"], { errorMap: () => ({ message: "Answer this question" }) }),
  actingForWhom: t(500),
});

const ownerLine = /^(.+?);\s*(\d{4}-\d{2}-\d{2})?;\s*([A-Za-z]{2})?;\s*(\d+(?:\.\d+)?)\s*%?$/;

export const portalLegalSchema = z.object({
  name: z.string().trim().min(1, "Required").max(300),
  registrationNumber: z.string().trim().min(1, "Required").max(100),
  countryOfCreation: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "2-letter code"),
  registeredOffice: z.string().trim().min(5, "Required").max(500),
  natureOfBusiness: z.string().trim().min(3, "Required").max(500),
  purpose: z.string().trim().min(5, "Describe what you need the service for").max(1000),
  sourceOfFunds: z.string().trim().min(5, "Describe where the money comes from").max(2000),
  owners: z
    .string()
    .trim()
    .max(5000)
    .refine((v) => v.split(/\r?\n/).filter(Boolean).every((l) => ownerLine.test(l.trim())), "One owner per line: name; date of birth; nationality; %"),
  noOwnerOver25: z.boolean().default(false),
  signatoryRole: z.string().trim().min(2, "Your role in the company").max(200),
});

export interface PortalDeclaration {
  confirm: boolean;
  signature: string;
}

export function parseOwners(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = ownerLine.exec(l)!;
      const [first, ...rest] = m[1].trim().split(/\s+/);
      return { name: m[1].trim(), firstNames: rest.length ? first : m[1].trim(), lastName: rest.join(" ") || "-", birthDate: m[2], nationality: m[3]?.toUpperCase(), pct: Number(m[4]) };
    });
}

export async function saveDraft(token: string, data: Record<string, unknown>) {
  const ctx = await portalContext(token);
  if (!ctx || ctx.link.status === "SUBMITTED") return false;
  await adminDb.portalLink.update({ where: { id: ctx.link.id }, data: { submission: data as Prisma.InputJsonValue } });
  return true;
}

/**
 * Copies the client's declaration into the CDD file, screens new persons,
 * recalculates risk and tells staff. Nothing is accepted automatically.
 */
export async function submitPortal(
  token: string,
  data: z.infer<typeof portalNaturalSchema> | z.infer<typeof portalLegalSchema>,
  declaration: PortalDeclaration,
  ip: string | null,
) {
  const ctx = await portalContext(token);
  if (!ctx || ctx.link.status === "SUBMITTED") return { ok: false as const, error: "This page can no longer be submitted." };
  const { link, party } = ctx;
  await withTenant(link.firmId, async (tx) => {
    const signed = { signedName: declaration.signature, signedAt: new Date().toISOString(), ip, method: "simple electronic signature (typed name + one-time code)" };
    const prev = (party.details ?? {}) as Record<string, unknown>;
    let newPartyIds: string[] = [party.id];
    if (party.kind === "NATURAL") {
      const d = data as z.infer<typeof portalNaturalSchema>;
      const details = {
        ...prev, firstNames: d.firstNames, lastName: d.lastName, birthDate: d.birthDate, placeOfBirth: d.placeOfBirth,
        nationalities: d.nationalities.split(/[,\s]+/).filter(Boolean), residenceCountry: d.residenceCountry, address: d.address, occupation: d.occupation || undefined,
        taxResidence: d.taxResidence.split(/[,\s]+/).filter(Boolean), sourceOfFunds: d.sourceOfFunds, sourceOfWealth: d.sourceOfWealth || undefined,
        isPep: d.isPep === "yes", pepFunction: d.pepFunction || undefined, isPepFamilyOrAssociate: d.isPepFamilyOrAssociate === "yes",
        actingForOther: d.actingForOther === "yes", actingForWhom: d.actingForWhom || undefined, portalDeclaration: signed,
      };
      await tx.party.update({ where: { id: party.id }, data: { details: details as Prisma.InputJsonValue, displayName: displayName("NATURAL", details) } });
    } else {
      const d = data as z.infer<typeof portalLegalSchema>;
      const details = {
        ...prev, name: d.name, registrationNumber: d.registrationNumber, countryOfCreation: d.countryOfCreation, registeredOffice: d.registeredOffice,
        natureOfBusiness: d.natureOfBusiness, sourceOfFunds: d.sourceOfFunds, declaredNoOwnerOver25: d.noOwnerOver25, signatoryRole: d.signatoryRole, portalDeclaration: signed,
      };
      await tx.party.update({ where: { id: party.id }, data: { details: details as Prisma.InputJsonValue, displayName: d.name } });
      // Declared direct owners: added as declarations (source DECLARATION), to be compared with the register.
      for (const o of parseOwners(d.owners)) {
        const p = await tx.party.create({
          data: {
            firmId: link.firmId, kind: "NATURAL", displayName: o.name,
            details: { firstNames: o.firstNames, lastName: o.lastName, birthDate: o.birthDate, nationalities: o.nationality ? [o.nationality] : [] } as Prisma.InputJsonValue,
          },
        });
        await tx.ownershipLink.create({ data: { firmId: link.firmId, ownerId: p.id, ownedId: party.id, type: "SHAREHOLDING", pct: o.pct, source: "DECLARATION" } });
        newPartyIds = [...newPartyIds, p.id];
      }
    }
    await tx.cddFile.update({ where: { id: link.cddFileId }, data: { purpose: data.purpose } });
    await tx.portalLink.update({ where: { id: link.id }, data: { status: "SUBMITTED", submittedAt: new Date(), submission: { ...data, declaration: signed } as Prisma.InputJsonValue, sessionHash: null } });
    await tx.auditEvent.create({ data: { firmId: link.firmId, userId: null, action: "update", objectType: "Party", objectId: party.id, fields: ["portal-submission"] } });
    await runScreening(tx, link.firmId, newPartyIds);
    await persistRiskIfChanged(tx, link.firmId, await loadClientFile(tx, link.firmId, link.cddFileId));
    await upsertTask(tx, { firmId: link.firmId, kind: "portal-review", objectType: "CddFile", objectId: link.cddFileId, dueOn: toIsoDate(new Date()) });
    const staff = await tx.user.findUnique({ where: { id: link.createdById } });
    if (staff && !staff.deactivatedAt) {
      await sendEmail(staff.email, "A client completed their information", `${party.displayName} submitted their information through the portal. Review the file:\n${appUrl(`/app/clients/${link.cddFileId}`)}`);
    }
  });
  (await cookies()).delete(COOKIE);
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Auto-chasing (spec §4A.1): day 1, 3, 7, then a staff task
// ---------------------------------------------------------------------------

const REMINDER_DAYS = [1, 3, 7];

export async function sendPortalReminders(now = new Date()) {
  const links = await adminDb.portalLink.findMany({ where: { status: { in: ["SENT", "OPENED"] }, expiresAt: { gt: now } } });
  let sent = 0;
  for (const l of links) {
    const ageDays = (now.getTime() - l.createdAt.getTime()) / 86_400_000;
    const due = REMINDER_DAYS.filter((d) => ageDays >= d).length;
    if (due <= l.remindersSent) continue;
    const token = decryptField(l.firmId, l.tokenEnc);
    const firm = await adminDb.firm.findUniqueOrThrow({ where: { id: l.firmId }, select: { name: true } });
    await sendEmail(l.sentTo, `Reminder: ${firm.name} is waiting for your information`, `Please complete your client information here:\n${appUrl(`/p/${token}`)}\n\nThe link expires on ${l.expiresAt.toISOString().slice(0, 10)}.`);
    await adminDb.portalLink.update({ where: { id: l.id }, data: { remindersSent: due, lastReminderAt: now } });
    sent++;
    if (due >= REMINDER_DAYS.length) {
      await withTenant(l.firmId, (tx) => upsertTask(tx, { firmId: l.firmId, kind: "portal-stalled", objectType: "CddFile", objectId: l.cddFileId, dueOn: toIsoDate(now) }));
    }
  }
  return { checked: links.length, sent };
}

// ---------------------------------------------------------------------------
// Periodic refresh (spec §4A.5, §11.9): "nothing changed" renews the file when
// screening is clean; otherwise staff review the exception.
// ---------------------------------------------------------------------------

export async function confirmNoChange(token: string, signature: string, ip: string | null) {
  const ctx = await portalContext(token);
  if (!ctx || ctx.link.purpose !== "refresh" || ctx.link.status === "SUBMITTED") return { ok: false as const, error: "This page can no longer be submitted." };
  const { link, party } = ctx;
  await withTenant(link.firmId, async (tx) => {
    const signed = { signedName: signature, signedAt: new Date().toISOString(), ip, statement: "Nothing has changed since my last information." };
    const d = (party.details ?? {}) as Record<string, unknown>;
    await tx.party.update({ where: { id: party.id }, data: { details: { ...d, refreshConfirmations: [...((d.refreshConfirmations as unknown[]) ?? []), signed] } as Prisma.InputJsonValue } });
    await tx.portalLink.update({ where: { id: link.id }, data: { status: "SUBMITTED", submittedAt: new Date(), submission: { noChange: true, declaration: signed } as Prisma.InputJsonValue, sessionHash: null } });
    await tx.auditEvent.create({ data: { firmId: link.firmId, userId: null, action: "update", objectType: "CddFile", objectId: link.cddFileId, fields: ["refresh-confirmation"] } });
    await renewIfClean(tx, link.firmId, link.cddFileId, "client confirmed nothing changed");
  });
  (await cookies()).delete(COOKIE);
  return { ok: true as const };
}

/** Renews the refresh date when screening is clean and nothing needs attention; otherwise a staff task. */
export async function renewIfClean(tx: Tx, firmId: string, cddFileId: string, why: string) {
  const cf = await loadClientFile(tx, firmId, cddFileId);
  await runScreening(tx, firmId, [...cf.tree.parties.keys()]);
  const fresh = await loadClientFile(tx, firmId, cddFileId);
  await persistRiskIfChanged(tx, firmId, fresh);
  const open = openCddItems(fresh.state);
  const levelChanged = fresh.risk.eddRequired !== (cf.file.status === "EDD");
  if (open.length === 0 && !levelChanged) {
    const due = refreshDue(toIsoDate(new Date()), fresh.risk.eddRequired).due;
    await tx.cddFile.update({ where: { id: cddFileId }, data: { nextRefreshOn: new Date(due) } });
    await tx.task.updateMany({ where: { objectId: cddFileId, kind: { in: ["refresh", "refresh-review"] }, status: "OPEN" }, data: { status: "DONE" } });
    await upsertTask(tx, { firmId, kind: "refresh", objectType: "CddFile", objectId: cddFileId, dueOn: due, article: "Art. 26(2)" });
    await tx.auditEvent.create({ data: { firmId, userId: null, action: "update", objectType: "CddFile", objectId: cddFileId, fields: ["nextRefreshOn"] } });
    return { renewed: true as const, why };
  }
  await upsertTask(tx, { firmId, kind: "refresh-review", objectType: "CddFile", objectId: cddFileId, dueOn: toIsoDate(new Date()), article: "Art. 26" });
  return { renewed: false as const, reasons: open.map((i) => i.message) };
}

/** Daily: 30 days before the refresh date, re-screen and send the client a refresh link. */
export async function startDueRefreshes(firmId: string, now = new Date()) {
  const horizon = new Date(now.getTime() + 30 * 86_400_000);
  return withTenant(firmId, async (tx) => {
    const files = await tx.cddFile.findMany({ where: { status: { in: ["COMPLETE", "SDD", "EDD"] }, nextRefreshOn: { lte: horizon } }, include: { party: true } });
    const officer = await tx.user.findFirst({ where: { roles: { has: "COMPLIANCE_OFFICER" }, deactivatedAt: null }, orderBy: { createdAt: "asc" } });
    let sent = 0;
    for (const f of files) {
      if (await tx.portalLink.count({ where: { cddFileId: f.id, purpose: "refresh", OR: [{ status: { in: ["SENT", "OPENED"] } }, { submittedAt: { gte: new Date(now.getTime() - 60 * 86_400_000) } }] } })) continue;
      const cf = await loadClientFile(tx, firmId, f.id);
      await runScreening(tx, firmId, [...cf.tree.parties.keys()]);
      const lastLink = await tx.portalLink.findFirst({ where: { cddFileId: f.id }, orderBy: { createdAt: "desc" } });
      const email = ((f.party.details as { email?: string }).email ?? lastLink?.sentTo) || null;
      if (email && officer) {
        await createPortalLink(tx, { firmId, userId: officer.id }, f.id, email, LINK_DAYS, "refresh");
        sent++;
      }
    }
    return { due: files.length, sent };
  });
}
