import "server-only";
import { adminDb } from "./db";
import { appUrl, notify } from "./email";
import { canSubmitFreeText } from "@/lib/security/pii-scan";
import { slaDue, ticketPriority } from "@/lib/backoffice/ops";
import { OPS_ALERT_EMAIL } from "@/lib/billing/plans";
import { BACKOFFICE_PATH } from "@/lib/backoffice/roles";

/**
 * Support tickets (Backoffice §16). Firms describe problems in their own
 * words; the text is scanned for personal data so client details stay out of
 * support (AMLSync sees the business, not the AML files).
 */
export const CATEGORIES = ["technical", "billing", "account", "advisory", "other"] as const;
export const CATEGORY_LABELS: Record<string, string> = { technical: "Something doesn't work", billing: "Billing or invoices", account: "Sign-in, users or two-factor", advisory: "How to apply an AML rule", other: "Something else" };

type R = { ok: true; id: string } | { ok: false; error: string; pii?: boolean };

function piiCheck(text: string, confirmed: boolean): string | null {
  const p = canSubmitFreeText(text, confirmed);
  return p.allowed ? null : `This looks like personal data (${[...new Set(p.findings.map((f) => f.kind))].join(", ")}). Remove client details, or confirm it isn't client data.`;
}

export async function createTicket(u: { firmId: string; userId: string; email: string; firmName: string }, t: { subject: string; category: string; blocking: boolean; text: string; confirmNoClientData: boolean }): Promise<R> {
  if (t.subject.length < 5) return { ok: false, error: "Give the request a short subject." };
  if (t.text.length < 10) return { ok: false, error: "Describe what happened." };
  if (!(CATEGORIES as readonly string[]).includes(t.category)) return { ok: false, error: "Choose a topic." };
  const pii = piiCheck(`${t.subject}\n${t.text}`, t.confirmNoClientData);
  if (pii) return { ok: false, error: pii, pii: true };
  if ((await adminDb.ticket.count({ where: { userId: u.userId, createdAt: { gte: new Date(Date.now() - 86_400_000) } } })) >= 10) return { ok: false, error: "You opened 10 requests today. Email contact@amlsync.com if it's urgent." };
  const priority = ticketPriority(t.category, t.blocking);
  const now = new Date();
  const ticket = await adminDb.ticket.create({
    data: { firmId: u.firmId, userId: u.userId, subject: t.subject.slice(0, 150), category: t.category, priority, slaDueAt: slaDue(priority, now), messages: { create: { fromTeam: false, authorEmail: u.email, text: t.text.slice(0, 8000) } } },
  });
  await notify(OPS_ALERT_EMAIL, `[${priority}] Support #${ticket.number}: ${t.subject}`, `${u.firmName} (${u.email}) opened a ${t.category} request.\n\n${appUrl(`${BACKOFFICE_PATH}/tickets/${ticket.id}`)}`);
  return { ok: true, id: ticket.id };
}

export async function customerReply(u: { firmId: string; userId: string; email: string }, ticketId: string, text: string, confirmed: boolean): Promise<R> {
  const t = await adminDb.ticket.findUnique({ where: { id: ticketId } });
  if (!t || t.firmId !== u.firmId) return { ok: false, error: "Not found" };
  if (text.length < 2) return { ok: false, error: "Write a reply." };
  const pii = piiCheck(text, confirmed);
  if (pii) return { ok: false, error: pii, pii: true };
  await adminDb.ticket.update({ where: { id: ticketId }, data: { status: "open", resolvedAt: null, messages: { create: { fromTeam: false, authorEmail: u.email, text: text.slice(0, 8000) } } } });
  await notify(OPS_ALERT_EMAIL, `Support #${t.number}: new reply`, `${u.email} replied.\n\n${appUrl(`${BACKOFFICE_PATH}/tickets/${t.id}`)}`);
  return { ok: true, id: t.id };
}

export async function teamReply(adminEmail: string, ticketId: string, text: string, status: string) {
  const t = await adminDb.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  const now = new Date();
  await adminDb.ticket.update({
    where: { id: ticketId },
    data: {
      status, ...(t.firstResponseAt ? {} : text ? { firstResponseAt: now } : {}),
      ...(status === "resolved" || status === "closed" ? { resolvedAt: t.resolvedAt ?? now } : { resolvedAt: null }),
      ...(text ? { messages: { create: { fromTeam: true, authorEmail: adminEmail, text: text.slice(0, 8000) } } } : {}),
    },
  });
  const user = await adminDb.user.findUnique({ where: { id: t.userId }, select: { email: true } });
  if (user && text) await notify(user.email, `AMLSync support #${t.number}: ${t.subject}`, `The AMLSync team replied to your request:\n\n${text}\n\nReply or rate the answer: ${appUrl(`/app/support/${t.id}`)}`);
  return t;
}

export async function rateTicket(u: { firmId: string }, ticketId: string, csat: number) {
  const t = await adminDb.ticket.findUnique({ where: { id: ticketId } });
  if (!t || t.firmId !== u.firmId || !(csat >= 1 && csat <= 5)) return false;
  await adminDb.ticket.update({ where: { id: ticketId }, data: { csat: Math.round(csat), status: "closed" } });
  return true;
}
