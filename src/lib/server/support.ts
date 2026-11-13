import "server-only";
import { adminDb, withTenant } from "./db";
import { securityEvent } from "./audit";
import { appUrl, sendEmail } from "./email";
import { isPlatformAdmin } from "./feedback";
import { currentProfile } from "./country-profile";
import { setupChecklist } from "@/lib/rules/country-profile";

/**
 * Just-in-time support access (spec §8C.7, §11.14). AMLSyncAI staff have no
 * standing access to firm data. Access is requested with a reason, approved
 * by the firm, limited in time (max 8 h) and to a read-only summary without
 * cases, reports or documents, and every view is in the firm's security log.
 */
export const MAX_HOURS = 8;

export async function requestSupportAccess(requesterEmail: string, emailDomain: string, reason: string, hours: number) {
  if (!isPlatformAdmin(requesterEmail)) throw new Error("Not allowed");
  if (reason.trim().length < 10) throw new Error("Give a reason the firm can judge.");
  const h = Math.max(1, Math.min(MAX_HOURS, Math.round(hours)));
  const firm = await adminDb.firm.findUnique({ where: { emailDomain: emailDomain.trim().toLowerCase() } });
  if (!firm) throw new Error("No firm uses that email domain.");
  const g = await adminDb.supportGrant.create({ data: { firmId: firm.id, requesterEmail, reason: reason.trim(), hours: h } });
  await securityEvent({ firmId: firm.id, kind: "staff-access-requested", details: { grant: g.id, by: requesterEmail, hours: h } });
  const approvers = await adminDb.user.findMany({ where: { firmId: firm.id, roles: { hasSome: ["OWNER", "COMPLIANCE_OFFICER"] }, deactivatedAt: null } });
  for (const a of approvers) {
    await sendEmail(a.email, "AMLSyncAI support asks for access to your firm", `${requesterEmail} asks for read-only access for ${h} hour(s).\nReason: ${reason}\n\nApprove or deny it in the security log: ${appUrl("/app/security")}\nNothing is visible to AMLSyncAI until you approve.`);
  }
  return g.id;
}

export async function decideSupportAccess(firmId: string, userId: string, grantId: string, decision: "approved" | "denied" | "revoked") {
  const g = await adminDb.supportGrant.findUnique({ where: { id: grantId } });
  if (!g || g.firmId !== firmId) throw new Error("Not found");
  if (decision !== "revoked" && g.status !== "requested") throw new Error("Already decided.");
  await adminDb.supportGrant.update({
    where: { id: grantId },
    data: { status: decision, decidedById: userId, decidedAt: new Date(), ...(decision === "approved" ? { expiresAt: new Date(Date.now() + g.hours * 3600_000) } : {}), ...(decision === "revoked" ? { expiresAt: new Date() } : {}) },
  });
  await securityEvent({ firmId, userId, kind: `staff-access-${decision}`, details: { grant: grantId, for: g.requesterEmail } });
}

/** The active grant, or null. Checked on every request. */
export async function activeGrant(requesterEmail: string, grantId: string) {
  const g = await adminDb.supportGrant.findUnique({ where: { id: grantId } });
  if (!g || g.requesterEmail !== requesterEmail || g.status !== "approved" || !g.expiresAt || g.expiresAt < new Date()) return null;
  return g;
}

/** Read-only summary for support: no case content, reports, documents or ID numbers. */
export async function supportSummary(requesterEmail: string, grantId: string, ip: string | null) {
  const g = await activeGrant(requesterEmail, grantId);
  if (!g) return null;
  await securityEvent({ firmId: g.firmId, kind: "staff-access", ip, details: { grant: grantId, by: requesterEmail, viewed: "summary" } });
  return withTenant(g.firmId, async (tx) => {
    const firm = await tx.firm.findUniqueOrThrow({ where: { id: g.firmId }, select: { name: true, homeState: true, sectors: true, plan: true } });
    const { profile, version } = await currentProfile(tx, g.firmId);
    const clients = await tx.cddFile.findMany({
      where: { role: "CLIENT" }, take: 200, orderBy: { createdAt: "desc" },
      select: { status: true, createdAt: true, nextRefreshOn: true, party: { select: { displayName: true, kind: true } }, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1, select: { final: true } } },
    });
    const openTasks = await tx.task.groupBy({ by: ["kind"], where: { status: "OPEN", objectType: { notIn: ["Case", "WhistleblowingReport"] } }, _count: true });
    return { grant: g, firm, profileVersion: version, checklist: setupChecklist(profile), clients, openTasks };
  });
}
