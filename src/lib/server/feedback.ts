import "server-only";
import type { FeatureRequestStatus } from "@prisma/client";
import { adminDb } from "./db";
import { appUrl, sendEmail } from "./email";
import { securityEvent } from "./audit";
import type { CurrentSession } from "./session";
import { canSubmitFreeText } from "@/lib/security/pii-scan";
import { MAX_REQUESTS_PER_DAY, similarRequests, spamReason, statusChangeProblem, STATUS_LABELS } from "@/lib/feedback/rules";

/**
 * Feature requests (spec §4.10, §11.13). Shared across firms, so this module
 * uses the owner connection and selects fields explicitly: other firms never
 * see a firm's name, and the AMLSyncAI team never sees client data (requests
 * hold no links to tenant records).
 */

export function isPlatformAdmin(email: string): boolean {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

const visible = { hidden: false, mergedIntoId: null };

export async function listRequests(s: CurrentSession, filter: { mine?: boolean; status?: string; q?: string }) {
  const rows = await adminDb.featureRequest.findMany({
    where: {
      ...visible,
      ...(filter.mine ? { OR: [{ userId: s.user.id }, { votes: { some: { userId: s.user.id } } }, ...(s.user.roles.includes("OWNER") ? [{ firmId: s.firm.id }] : [])] } : {}),
      ...(filter.status ? { status: filter.status as FeatureRequestStatus } : {}),
      ...(filter.q ? { title: { contains: filter.q, mode: "insensitive" as const } } : {}),
    },
    select: { id: true, title: true, module: true, status: true, regulatory: true, createdAt: true, userId: true, firmId: true, _count: { select: { votes: true, comments: true } }, votes: { where: { userId: s.user.id }, select: { id: true } } },
    orderBy: [{ votes: { _count: "desc" } }, { createdAt: "desc" }],
    take: 200,
  });
  return rows.map(({ firmId, userId, votes, ...r }) => ({ ...r, mine: userId === s.user.id, ownFirm: firmId === s.firm.id, voted: votes.length > 0 }));
}

export async function similarTitles(q: string) {
  if (q.trim().length < 3) return [];
  const all = await adminDb.featureRequest.findMany({ where: visible, select: { id: true, title: true, status: true, _count: { select: { votes: true } } }, take: 2000, orderBy: { createdAt: "desc" } });
  return similarRequests(q, all);
}

export interface NewRequest {
  title: string;
  problem: string;
  frequency: string;
  importance: string;
  module: string;
  regulatory: boolean;
  legalReference?: string;
  confirmNoClientData: boolean;
}

export async function createRequest(s: CurrentSession, r: NewRequest): Promise<{ ok: true; id: string } | { ok: false; error: string; pii?: boolean }> {
  const user = await adminDb.user.findUniqueOrThrow({ where: { id: s.user.id } });
  if (!user.emailVerifiedAt) return { ok: false, error: "Confirm your company email before suggesting features." };
  const since = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  if ((await adminDb.featureRequest.count({ where: { userId: s.user.id, createdAt: { gte: since } } })) >= MAX_REQUESTS_PER_DAY) {
    await securityEvent({ firmId: s.firm.id, userId: s.user.id, kind: "rate-limit", details: { endpoint: "feature-request" } });
    return { ok: false, error: `You can submit up to ${MAX_REQUESTS_PER_DAY} requests a day. Try again tomorrow.` };
  }
  const text = [r.title, r.problem, r.legalReference ?? ""].join("\n");
  const spam = spamReason(text);
  if (spam) return { ok: false, error: spam };
  const pii = canSubmitFreeText(text, r.confirmNoClientData);
  if (!pii.allowed) {
    return { ok: false, pii: true, error: `This looks like personal data (${[...new Set(pii.findings.map((f) => f.kind))].join(", ")}). Remove client data, or confirm it isn't client data.` };
  }
  const row = await adminDb.featureRequest.create({
    data: {
      firmId: s.firm.id, userId: s.user.id, title: r.title, problem: r.problem, frequency: r.frequency, importance: r.importance, module: r.module,
      regulatory: r.regulatory, legalReference: r.regulatory ? r.legalReference || null : null,
      history: { create: { status: "RECEIVED", byEmail: "system" } },
    },
  });
  return { ok: true, id: row.id };
}

export async function getRequest(s: CurrentSession | null, id: string, asTeam = false) {
  const r = await adminDb.featureRequest.findUnique({
    where: { id },
    select: {
      id: true, title: true, problem: true, frequency: true, importance: true, module: true, status: true, statusReason: true, releaseNoteUrl: true,
      regulatory: true, legalReference: true, hidden: true, mergedIntoId: true, createdAt: true, userId: true, firmId: true,
      _count: { select: { votes: true } },
      comments: { where: asTeam ? {} : { hidden: false }, orderBy: { createdAt: "asc" }, select: { id: true, text: true, fromTeam: true, firmId: true, createdAt: true, hidden: true } },
      history: { orderBy: { createdAt: "asc" }, select: { status: true, note: true, createdAt: true } },
      votes: s ? { where: { userId: s.user.id }, select: { id: true } } : false,
    },
  });
  if (!r || (!asTeam && (r.hidden || r.mergedIntoId))) return null;
  const { firmId, userId, votes, comments, ...rest } = r;
  return {
    ...rest,
    mine: !!s && userId === s.user.id,
    voted: Array.isArray(votes) && votes.length > 0,
    // Firm names are never shown; other firms appear only as "Another firm".
    comments: comments.map((c) => ({ id: c.id, text: c.text, createdAt: c.createdAt, hidden: c.hidden, author: c.fromTeam ? "AMLSyncAI team" : s && c.firmId === s.firm.id ? "Your firm" : "Another firm" })),
    ownFirm: !!s && firmId === s.firm.id,
  };
}

export async function vote(s: CurrentSession, id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await adminDb.user.findUniqueOrThrow({ where: { id: s.user.id } });
  if (!user.emailVerifiedAt) return { ok: false, error: "Confirm your company email before voting." };
  const r = await adminDb.featureRequest.findFirst({ where: { id, ...visible } });
  if (!r) return { ok: false, error: "Not found." };
  try {
    await adminDb.featureVote.create({ data: { requestId: id, userId: s.user.id } });
    return { ok: true };
  } catch {
    return { ok: false, error: "You have already voted for this request." };
  }
}

export async function comment(s: CurrentSession, id: string, text: string, confirmNoClientData: boolean, fromTeam = false) {
  if (text.trim().length < 2) return { ok: false, error: "Write a comment." };
  const spam = spamReason(text);
  if (spam) return { ok: false, error: spam };
  const pii = canSubmitFreeText(text, confirmNoClientData);
  if (!pii.allowed) return { ok: false, pii: true, error: "This looks like personal data. Remove client data, or confirm it isn't client data." };
  await adminDb.featureComment.create({ data: { requestId: id, userId: s.user.id, firmId: s.firm.id, text: text.trim(), fromTeam } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// AMLSyncAI triage
// ---------------------------------------------------------------------------

export async function triageList(filter: { module?: string; status?: string; regulatory?: boolean }) {
  const rows = await adminDb.featureRequest.findMany({
    where: { mergedIntoId: null, ...(filter.module ? { module: filter.module } : {}), ...(filter.status ? { status: filter.status as FeatureRequestStatus } : {}), ...(filter.regulatory ? { regulatory: true } : {}) },
    select: { id: true, title: true, module: true, status: true, regulatory: true, hidden: true, createdAt: true, importance: true, firm: { select: { homeState: true, sectors: true } }, _count: { select: { votes: true } } },
    take: 500,
  });
  // Regulatory requests first (they may affect the EU Core or Country Profile fields), then by votes.
  return rows.sort((a, b) => Number(b.regulatory) - Number(a.regulatory) || b._count.votes - a._count.votes || +b.createdAt - +a.createdAt);
}

export async function setStatus(byEmail: string, id: string, status: FeatureRequestStatus, reason?: string, releaseNoteUrl?: string) {
  const problem = statusChangeProblem(status, reason, releaseNoteUrl);
  if (problem) return { ok: false, error: problem };
  const r = await adminDb.featureRequest.update({
    where: { id },
    data: { status, statusReason: reason || null, releaseNoteUrl: status === "RELEASED" ? releaseNoteUrl : null, history: { create: { status, note: reason || releaseNoteUrl || null, byEmail } } },
    include: { votes: { select: { userId: true } } },
  });
  // Notify the requester and every voter.
  const users = await adminDb.user.findMany({ where: { id: { in: [r.userId, ...r.votes.map((v) => v.userId)] }, deactivatedAt: null }, select: { email: true } });
  for (const u of users) {
    await sendEmail(u.email, `Feature request: ${STATUS_LABELS[status]}`, `"${r.title}" is now: ${STATUS_LABELS[status]}.${reason ? `\n\n${reason}` : ""}${releaseNoteUrl && status === "RELEASED" ? `\n\nRelease note: ${releaseNoteUrl}` : ""}\n\n${appUrl(`/app/feature-requests/${id}`)}`);
  }
  return { ok: true, notified: users.length };
}

/** Merges a duplicate into another request; votes are combined (one per user). */
export async function merge(byEmail: string, sourceId: string, targetId: string): Promise<{ ok: boolean; error?: string }> {
  if (sourceId === targetId) return { ok: false, error: "Choose a different request." };
  return adminDb.$transaction(async (tx) => {
    const source = await tx.featureRequest.findUniqueOrThrow({ where: { id: sourceId }, include: { votes: true } });
    await tx.featureRequest.findUniqueOrThrow({ where: { id: targetId } });
    for (const uid of new Set([source.userId, ...source.votes.map((v) => v.userId)])) {
      await tx.featureVote.upsert({ where: { requestId_userId: { requestId: targetId, userId: uid } }, create: { requestId: targetId, userId: uid }, update: {} });
    }
    await tx.featureRequest.update({ where: { id: sourceId }, data: { mergedIntoId: targetId, history: { create: { status: source.status, note: `Merged into ${targetId}`, byEmail } } } });
    return { ok: true };
  });
}

export async function hideRequest(id: string, hidden: boolean) {
  await adminDb.featureRequest.update({ where: { id }, data: { hidden } });
}

export async function hideComment(id: string) {
  await adminDb.featureComment.update({ where: { id }, data: { hidden: true } });
}
