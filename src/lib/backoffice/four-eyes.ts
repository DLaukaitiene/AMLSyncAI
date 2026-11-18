/**
 * Four eyes for dangerous actions (§2.5). A second admin with the
 * approvals.decide permission confirms the request before it runs.
 *
 * Single-operator rule (§2.9 "built for one operator first"): while AMLSync
 * has exactly one Owner, that Owner may confirm their own request, but only
 * after a cooling-off period and a fresh step-up; the approval is logged as
 * self-approved. Add a second Owner to get real four-eyes control.
 */
export const CREDIT_FOUR_EYES_CENTS = 10_000; // €100 (§6.2)
export const EXPORT_FOUR_EYES_ROWS = 500; // §6.1
export const APPROVAL_TTL_MS = 7 * 24 * 3600_000;
export const SELF_APPROVAL_COOL_OFF_MS = 15 * 60_000;

export type FourEyesAction = "credit.grant" | "admin.set-roles" | "firm.close" | "firms.export";

export const FOUR_EYES_LABELS: Record<FourEyesAction, string> = {
  "credit.grant": "Credit grant above €100",
  "admin.set-roles": "Admin role change",
  "firm.close": "Firm closure",
  "firms.export": "Large data export",
};

export function needsFourEyes(action: FourEyesAction, size = 0): boolean {
  if (action === "credit.grant") return size > CREDIT_FOUR_EYES_CENTS;
  if (action === "firms.export") return size > EXPORT_FOUR_EYES_ROWS;
  return true;
}

export type DecisionCheck = { ok: true; selfApproved: boolean } | { ok: false; reason: string };

export function canDecide(a: { requestedBy: string; createdAt: Date; expiresAt: Date; status: string }, decider: string, ownerCount: number, now = new Date()): DecisionCheck {
  if (a.status !== "pending") return { ok: false, reason: `This request is already ${a.status}.` };
  if (a.expiresAt <= now) return { ok: false, reason: "This request has expired. Ask again." };
  if (a.requestedBy.toLowerCase() !== decider.toLowerCase()) return { ok: true, selfApproved: false };
  if (ownerCount > 1) return { ok: false, reason: "You can't approve your own request. Another Owner must approve it." };
  const wait = a.createdAt.getTime() + SELF_APPROVAL_COOL_OFF_MS - now.getTime();
  if (wait > 0) return { ok: false, reason: `Only one Owner exists, so you may confirm your own request after a ${SELF_APPROVAL_COOL_OFF_MS / 60_000}-minute cooling-off period (${Math.ceil(wait / 60_000)} min left).` };
  return { ok: true, selfApproved: true };
}
