import "server-only";
import { adminDb } from "../db";
import { appUrl, notify } from "../email";
import { inAudience, type Audience } from "@/lib/backoffice/ops";

/** Firms in an audience (active, paused and suspended firms; never closed ones). */
export async function audienceFirms(a: Audience) {
  const firms = await adminDb.firm.findMany({ where: { status: { not: "closed" } }, select: { id: true, homeState: true, plan: true, status: true, sectors: true } });
  return firms.filter((f) => inAudience(a, f));
}

/** Emails an announcement to the Owners and Compliance Officers of each firm in its audience. */
export async function sendAnnouncementEmails(id: string): Promise<number> {
  const a = await adminDb.announcement.findUniqueOrThrow({ where: { id } });
  if (a.emailState === "sent") return a.emailCount;
  const firms = await audienceFirms(a.audience as Audience);
  const users = await adminDb.user.findMany({ where: { firmId: { in: firms.map((f) => f.id) }, deactivatedAt: null, roles: { hasSome: ["OWNER", "COMPLIANCE_OFFICER"] } }, select: { email: true } });
  const emails = [...new Set(users.map((u) => u.email))];
  for (const e of emails) await notify(e, `AMLSync App: ${a.title}`, `${a.body}\n\n${appUrl("/app")}\n\nYou receive this service message as an Owner or Compliance Officer of a firm using AMLSync App.`);
  await adminDb.announcement.update({ where: { id }, data: { emailState: "sent", emailCount: emails.length } });
  return emails.length;
}
