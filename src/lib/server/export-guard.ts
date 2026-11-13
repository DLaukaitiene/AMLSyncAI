import "server-only";
import { NextResponse } from "next/server";
import { adminDb } from "./db";
import { getSession, hasRecentMfa, type CurrentSession } from "./session";
import { securityEvent } from "./audit";
import { sendEmail } from "./email";
import { can } from "@/lib/auth/permissions";

/**
 * Supervisor-file and bulk exports (spec §8C.3–8C.4): Owner / Compliance
 * Officer only, fresh MFA, a Security Event, and the Owner is notified.
 */
export async function guardExport(req: Request, back: string): Promise<CurrentSession | NextResponse> {
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE" || !can(s.user.roles, "approve.compliance")) return new NextResponse("Not found", { status: 404 });
  if (!hasRecentMfa(s)) return NextResponse.redirect(new URL(`/reauth?next=${encodeURIComponent(back)}`, req.url));
  return s;
}

export async function afterExport(s: CurrentSession, what: string) {
  await securityEvent({ firmId: s.firm.id, userId: s.user.id, kind: "bulk-export", details: { what } });
  const owners = await adminDb.user.findMany({ where: { firmId: s.firm.id, roles: { has: "OWNER" }, deactivatedAt: null } });
  for (const o of owners) {
    await sendEmail(o.email, "AMLSyncAI: supervisor file exported", `${s.user.name} exported ${what} at ${new Date().toISOString()}. If you didn't expect this, check the security log.`);
  }
}

export const watermarkFor = (s: CurrentSession) => `${s.firm.name} · exported by ${s.user.name} · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · confidential`;
