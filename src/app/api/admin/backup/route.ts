import { NextResponse } from "next/server";
import { getSession, hasRecentMfa } from "@/lib/server/session";
import { adminRolesFor } from "@/lib/server/backoffice/access";
import { adminCan } from "@/lib/backoffice/roles";
import { adminAudit } from "@/lib/server/backoffice/audit";
import { createBackup } from "@/lib/server/backup";

export const maxDuration = 300;

/** Encrypted full-database backup, on demand. Backoffice Owner only, with a fresh two-factor sign-in. */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE" || !adminCan(await adminRolesFor(s.user.email), "team.manage")) return new NextResponse("Not found", { status: 404 });
  if (!hasRecentMfa(s)) return NextResponse.redirect(new URL(`/reauth?next=${encodeURIComponent("/adminpage1&/security")}`, req.url));
  let b;
  try {
    b = await createBackup();
  } catch (e) {
    return new NextResponse(`Backup failed: ${(e as Error).message}`, { status: 500 });
  }
  await adminAudit({ adminEmail: s.user.email.toLowerCase(), action: "backup.download", targetType: "Platform", details: { bytes: b.file.length } });
  return new NextResponse(new Uint8Array(b.file), {
    headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${b.name}"`, "Cache-Control": "private, no-store" },
  });
}
