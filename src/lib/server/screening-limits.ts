import "server-only";
import type { Tx } from "./db";
import { securityEvent } from "./audit";
import { sendEmail, appUrl } from "./email";
import { hit } from "./rate-limit";
import { allowedNow, effectiveLimits, limitMessage, SCREEN_PACK_REF, unusualVolume, withPacks, type LimitKind } from "@/lib/security/screening-caps";
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
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId }, select: { name: true } });
  const { limits, used } = await screeningUsage(tx, firmId);
  const { allowed, limitedBy } = allowedNow(limits, used, partyIds.length);
  const ok = partyIds.slice(0, allowed);
  if (ok.length) await tx.screeningEvent.createMany({ data: ok.map((partyId) => ({ firmId, partyId, source })) });
  if (limitedBy) await limitReached(firmId, firm.name, limitedBy, limits, used);
  else if (unusualVolume(used.today + allowed, await tx.cddFile.count({ where: { status: { notIn: ["REFUSED", "TERMINATED"] } } }))) {
    await securityEvent({ firmId, kind: "screening-unusual-volume", details: { today: used.today + allowed } });
  }
  return { allowed: ok, notScreened: partyIds.length - ok.length, message: limitedBy ? limitMessage(limitedBy, limits) : null };
}

/** Logs the event and emails AMLSync App (once per firm, limit and day). The minute limit only logs. */
async function limitReached(firmId: string, firmName: string, kind: LimitKind, limits: { perMinute: number; perDay: number; perMonth: number }, used: { lastMinute: number; today: number; thisMonth: number }) {
  await securityEvent({ firmId, kind: `screening-limit-${kind}`, details: { ...limits, ...used } });
  if (kind === "minute") return;
  const day = new Date().toISOString().slice(0, 10);
  if (!(await hit(`screening-limit-alert:${firmId}:${kind}:${day}`, { limit: 1, windowSec: 86_400 }))) return;
  await sendEmail(
    OPS_ALERT_EMAIL,
    `AMLSync App: ${firmName} reached its ${kind === "day" ? "daily" : "monthly"} screening limit`,
    `${firmName} reached its screening limit.\n\nUsed today: ${used.today} of ${limits.perDay}\nUsed this month: ${used.thisMonth} of ${limits.perMonth}\nPer minute: ${limits.perMinute}\n\nThe firm can buy 30 more screenings for €10 itself, or ask for a higher limit.\nAdjust it in ${appUrl("/adminpage1&/billing")} (firm id ${firmId}).`,
  );
}

/** The firm's effective limits (plan or raised by AMLSync App) and what it used. */
export async function screeningUsage(tx: Tx, firmId: string) {
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId }, select: { plan: true, screenLimitMinute: true, screenLimitDay: true, screenLimitMonth: true } });
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const packs = await tx.creditEntry.findMany({ where: { kind: "charge", clientRef: SCREEN_PACK_REF, createdAt: { gte: monthStart } }, select: { id: true, createdAt: true } });
  const refunded = new Set((await tx.creditEntry.findMany({ where: { kind: "refund", reference: { in: packs.map((p) => p.id) } }, select: { reference: true } })).map((r) => r.reference));
  const live = packs.filter((p) => !refunded.has(p.id));
  const limits = withPacks(
    effectiveLimits(firm.plan, { perMinute: firm.screenLimitMinute, perDay: firm.screenLimitDay, perMonth: firm.screenLimitMonth }),
    live.length, live.filter((p) => p.createdAt >= dayStart).length,
  );
  const count = (since: Date) => tx.screeningEvent.count({ where: { createdAt: { gte: since } } });
  const used = {
    lastMinute: await count(new Date(now.getTime() - 60_000)),
    today: await count(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))),
    thisMonth: await count(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
  };
  return { limits, used };
}
