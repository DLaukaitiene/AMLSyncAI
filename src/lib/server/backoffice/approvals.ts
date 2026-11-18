import "server-only";
import { adminDb } from "../db";
import { securityEvent } from "../audit";
import { adminAudit } from "./audit";
import { ownerCount } from "./access";
import { APPROVAL_TTL_MS, canDecide, type FourEyesAction } from "@/lib/backoffice/four-eyes";
import { envOwners, isAdminRole } from "@/lib/backoffice/roles";

/**
 * Four-eyes requests (§2.5). The payload is validated again when it runs, so a
 * request approved later cannot do more than what was checked at request time.
 */
export async function requestApproval(by: string, action: FourEyesAction, payload: Record<string, unknown>, summary: string, reason: string) {
  const a = await adminDb.adminApproval.create({
    data: { action, payload: payload as object, summary, reason, requestedBy: by, expiresAt: new Date(Date.now() + APPROVAL_TTL_MS) },
  });
  await adminAudit({ adminEmail: by, action: "approval.requested", targetType: "AdminApproval", targetId: a.id, reason, details: { action, summary } });
  return a;
}

export async function rejectApproval(id: string, by: string, reason: string) {
  const a = await adminDb.adminApproval.findUnique({ where: { id } });
  if (!a || a.status !== "pending") throw new Error("This request is no longer pending.");
  await adminDb.$transaction(async (tx) => {
    await tx.adminApproval.update({ where: { id }, data: { status: "rejected", decidedBy: by, decidedAt: new Date(), result: reason } });
    await adminAudit({ adminEmail: by, action: "approval.rejected", targetType: "AdminApproval", targetId: id, reason, details: { action: a.action, summary: a.summary } }, tx);
  });
}

export async function approveAndRun(id: string, by: string): Promise<string> {
  const a = await adminDb.adminApproval.findUnique({ where: { id } });
  if (!a) throw new Error("Not found");
  const check = canDecide(a, by, await ownerCount());
  if (!check.ok) throw new Error(check.reason);
  const p = a.payload as Record<string, unknown>;
  const approver = check.selfApproved ? `${by} (self-approved, single owner)` : by;
  try {
    const result = await adminDb.$transaction(async (tx) => {
      // Claim the request first: a concurrent second approval finds it no longer pending.
      const claimed = await tx.adminApproval.updateMany({ where: { id, status: "pending" }, data: { status: "executed", decidedBy: by, decidedAt: new Date() } });
      if (claimed.count !== 1) throw new Error("This request is no longer pending.");
      let result: string;
      switch (a.action as FourEyesAction) {
        case "credit.grant": {
          const cents = Number(p.cents);
          if (!(cents > 0 && cents <= 1_000_000)) throw new Error("Invalid amount.");
          const firm = await tx.firm.findUniqueOrThrow({ where: { id: String(p.firmId) } });
          await tx.creditEntry.create({ data: { firmId: firm.id, amountCents: cents, kind: "topup", description: `Credit (${String(p.reference)})`, reference: String(p.reference) } });
          result = `Credit of €${(cents / 100).toFixed(2)} added for ${firm.name}.`;
          break;
        }
        case "admin.set-roles": {
          const email = String(p.email).toLowerCase();
          const roles = (p.roles as string[]).filter(isAdminRole);
          if (envOwners().includes(email)) throw new Error("This admin is an Owner by configuration (PLATFORM_ADMIN_EMAILS).");
          if (roles.length) {
            await tx.adminMember.upsert({ where: { email }, create: { email, roles, addedBy: a.requestedBy }, update: { roles, removedAt: null } });
            result = `${email}: ${roles.join(", ")}.`;
          } else {
            await tx.adminMember.updateMany({ where: { email }, data: { removedAt: new Date() } });
            result = `${email} removed from the Backoffice.`;
          }
          break;
        }
        case "firm.close": {
          const firm = await tx.firm.update({ where: { id: String(p.firmId) }, data: { status: "closed", statusReason: String(p.reason ?? a.reason), statusChangedAt: new Date() } });
          result = `${firm.name} closed. Checks are blocked; records stay until their retention ends (§12.4).`;
          break;
        }
        case "firms.export":
          result = "Export approved. Download it from the firm list within 7 days.";
          break;
        default:
          throw new Error(`Unknown action ${a.action}`);
      }
      await tx.adminApproval.update({ where: { id }, data: { result } });
      await adminAudit({ adminEmail: a.requestedBy, action: a.action, targetType: "AdminApproval", targetId: id, reason: a.reason, details: { ...p, summary: a.summary }, approverEmail: approver }, tx);
      return result;
    });
    if (a.action === "credit.grant") await securityEvent({ firmId: String(p.firmId), kind: "credit-added", details: { by: a.requestedBy, approvedBy: by, cents: p.cents } });
    return result;
  } catch (e) {
    const msg = (e as Error).message;
    if (msg !== "This request is no longer pending.") await adminDb.adminApproval.updateMany({ where: { id, status: "pending" }, data: { status: "failed", decidedBy: by, decidedAt: new Date(), result: msg } });
    throw e;
  }
}

/** An executed, unexpired export approval for this admin, if any. */
export async function exportApproval(by: string) {
  return adminDb.adminApproval.findFirst({ where: { action: "firms.export", requestedBy: by, status: "executed", decidedAt: { gte: new Date(Date.now() - APPROVAL_TTL_MS) } }, orderBy: { decidedAt: "desc" } });
}
