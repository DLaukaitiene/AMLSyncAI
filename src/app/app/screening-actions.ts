"use server";

import type { ActionState } from "@/components/form";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { securityEvent } from "@/lib/server/audit";
import { sendEmail, appUrl } from "@/lib/server/email";
import { hit } from "@/lib/server/rate-limit";
import { screeningUsage } from "@/lib/server/screening-limits";
import { OPS_ALERT_EMAIL } from "@/lib/billing/plans";

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
