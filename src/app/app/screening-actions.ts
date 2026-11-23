"use server";

import type { ActionState } from "@/components/form";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { securityEvent } from "@/lib/server/audit";
import { sendEmail, appUrl } from "@/lib/server/email";
import { hit } from "@/lib/server/rate-limit";
import { screeningUsage } from "@/lib/server/screening-limits";
import { OPS_ALERT_EMAIL } from "@/lib/billing/plans";
import { audit } from "@/lib/server/audit";
import { charge, DiditError } from "@/lib/server/didit";
import { SCREEN_PACK, SCREEN_PACK_REF } from "@/lib/security/screening-caps";
import { formatEur } from "@/lib/didit/map";
import { can } from "@/lib/auth/permissions";

/** "Request more screenings": tells AMLSync operations, who raise the limit (and invoice extra credits) within 1 business day. */
export async function requestMoreScreeningsAction(): Promise<ActionState> {
  const s = await requireUser();
  if (!(await hit(`more-screenings:${s.firm.id}`, { limit: 3, windowSec: 86_400 }))) return { message: "Your request is already with us. We'll raise your limit within 1 business day." };
  const { limits, used } = await withTenant(s.firm.id, (tx) => screeningUsage(tx, s.firm.id));
  await securityEvent({ firmId: s.firm.id, userId: s.user.id, kind: "screening-more-requested", details: { ...limits, ...used } });
  await sendEmail(OPS_ALERT_EMAIL, `AMLSync App: ${s.firm.name} asks for more screenings`,
    `${s.user.name} (${s.firm.name}) asked for more screenings.\n\nUsed today: ${used.today} of ${limits.perDay}\nUsed this month: ${used.thisMonth} of ${limits.perMonth}\nPer minute: ${limits.perMinute}\n\nRaise the limit (and invoice any extra credits) in ${appUrl("/adminpage1&/billing")} (firm id ${s.firm.id}). Promised: within 1 business day.`);
  return { message: "Thanks: we'll raise your limit within 1 business day and confirm by email." };
}

/** Buys 30 more screenings for €10 (on the next invoice); usable at once. */
export async function buyScreeningPackAction(): Promise<ActionState> {
  const s = await requireUser();
  if (!can(s.user.roles, "client.edit")) return { error: "Ask your Owner or Compliance Officer to buy more screenings." };
  if (!(await hit(`screen-pack:${s.firm.id}`, { limit: 10, windowSec: 86_400 }))) return { error: "That's a lot of extra screenings for one day. Please write to contact@amlsync.com so we can set a higher limit." };
  try {
    await withTenant(s.firm.id, async (tx) => {
      const id = await charge(tx, s.firm.id, s.user.id, `${SCREEN_PACK.screenings} extra screenings`, SCREEN_PACK_REF, SCREEN_PACK.cents);
      await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "create", objectType: "CreditEntry", objectId: id, fields: ["screening-pack"] });
    });
  } catch (e) {
    return { error: e instanceof DiditError ? e.message : "Couldn't add the screenings." };
  }
  // No revalidation: it would re-render the dashboard, where the box (with this confirmation) hides once you're below the limit.
  // Pages read usage fresh on the next visit.
  return { message: `${SCREEN_PACK.screenings} more screenings added for this month (${formatEur(SCREEN_PACK.cents)} on your next invoice). You can screen again now.` };
}
