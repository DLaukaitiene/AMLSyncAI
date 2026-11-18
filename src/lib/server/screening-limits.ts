import "server-only";
import type { Tx } from "./db";
import { securityEvent } from "./audit";
import { sendEmail, appUrl } from "./email";
import { hit } from "./rate-limit";
import { allowedNow, limitMessage, unusualVolume, type LimitKind } from "@/lib/security/screening-caps";
import { OPS_ALERT_EMAIL } from "@/lib/billing/plans";
import { serviceBlock } from "./invoicing";

/**
 * Takes screening "slots" for the parties a person asked to screen. Returns the
 * parties that may be screened now; the rest stay unscreened (and block
 * acceptance) until the firm's limit is raised or the window passes.
 */
export async function takeScreeningSlots(tx: Tx, firmId: string, partyIds: string[], source: "lists" | "didit") {
  const blocked = await serviceBlock(tx, firmId);
  if (blocked) return { allowed: [] as string[], notScreened: partyIds.length, message: blocked };
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId }, select: { name: true, screenLimitMinute: true, screenLimitDay: true, screenLimitMonth: true } });
  const limits = { perMinute: firm.screenLimitMinute, perDay: firm.screenLimitDay, perMonth: firm.screenLimitMonth };
  const now = new Date();
  const count = (since: Date) => tx.screeningEvent.count({ where: { createdAt: { gte: since } } });
  const used = {
    lastMinute: await count(new Date(now.getTime() - 60_000)),
    today: await count(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))),
    thisMonth: await count(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
  };
  const { allowed, limitedBy } = allowedNow(limits, used, partyIds.length);
  const ok = partyIds.slice(0, allowed);
  if (ok.length) await tx.screeningEvent.createMany({ data: ok.map((partyId) => ({ firmId, partyId, source })) });
  if (limitedBy) await limitReached(firmId, firm.name, limitedBy, limits, used);
  else if (unusualVolume(used.today + allowed, await tx.cddFile.count({ where: { status: { notIn: ["REFUSED", "TERMINATED"] } } }))) {
    await securityEvent({ firmId, kind: "screening-unusual-volume", details: { today: used.today + allowed } });
  }
  return { allowed: ok, notScreened: partyIds.length - ok.length, message: limitedBy ? limitMessage(limitedBy, limits) : null };
}

/** Logs the event and emails AMLSyncAI (once per firm, limit and day). The minute limit only logs. */
async function limitReached(firmId: string, firmName: string, kind: LimitKind, limits: { perMinute: number; perDay: number; perMonth: number }, used: { lastMinute: number; today: number; thisMonth: number }) {
  await securityEvent({ firmId, kind: `screening-limit-${kind}`, details: { ...limits, ...used } });
  if (kind === "minute") return;
  const day = new Date().toISOString().slice(0, 10);
  if (!(await hit(`screening-limit-alert:${firmId}:${kind}:${day}`, { limit: 1, windowSec: 86_400 }))) return;
  await sendEmail(
    OPS_ALERT_EMAIL,
    `AMLSyncAI: ${firmName} reached its ${kind === "day" ? "daily" : "monthly"} screening limit`,
    `${firmName} reached its screening limit.\n\nUsed today: ${used.today} of ${limits.perDay}\nUsed this month: ${used.thisMonth} of ${limits.perMonth}\nPer minute: ${limits.perMinute}\n\nThe firm was told to contact contact@amlsync.com and that the limit is adjusted within 1 business day.\nAdjust it in ${appUrl("/admin/billing")} (firm id ${firmId}).`,
  );
}
