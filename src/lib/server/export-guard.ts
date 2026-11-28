import "server-only";
import { NextResponse } from "next/server";
import { adminDb } from "./db";
import { getSession, type CurrentSession } from "./session";
import { securityEvent } from "./audit";
import { sendEmail } from "./email";
import { can } from "@/lib/auth/permissions";

/**
 * Downloads with confidential data ask the person to confirm first (instead of re-authenticating) [28 Nov 2026]:
 * without confirmed=1 in the address, send them to a page that says what will happen.
 */
export function confirmDownload(req: Request, kind: "export" | "report"): NextResponse | null {
  const url = new URL(req.url);
  if (url.searchParams.get("confirmed") === "1") return null;
  url.searchParams.set("confirmed", "1");
  return NextResponse.redirect(new URL(`/app/confirm?kind=${kind}&next=${encodeURIComponent(url.pathname + url.search)}`, req.url), 303);
}

/**
 * Supervisor-file and bulk exports (spec §8C.3–8C.4): Owner / Compliance
 * Officer only, confirmed by the person, a Security Event, and the Owner is notified.
 */
export async function guardExport(req: Request, back: string): Promise<CurrentSession | NextResponse> {
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE" || !can(s.user.roles, "approve.compliance")) return new NextResponse("Not found", { status: 404 });
  void back;
  const c = confirmDownload(req, "export");
  if (c) return c;
  return s;
}

export async function afterExport(s: CurrentSession, what: string) {
  await securityEvent({ firmId: s.firm.id, userId: s.user.id, kind: "bulk-export", details: { what } });
  const owners = await adminDb.user.findMany({ where: { firmId: s.firm.id, roles: { has: "OWNER" }, deactivatedAt: null } });
  for (const o of owners) {
    await sendEmail(o.email, "AMLSync App: supervisor file exported", `${s.user.name} exported ${what} at ${new Date().toISOString()}. If you didn't expect this, check the security log.`);
  }
}

export const watermarkFor = (s: CurrentSession) => `${s.firm.name} · exported by ${s.user.name} · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · confidential`;
