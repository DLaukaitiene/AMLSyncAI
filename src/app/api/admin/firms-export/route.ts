import { NextResponse, type NextRequest } from "next/server";
import { getSession, hasRecentMfa } from "@/lib/server/session";
import { adminRolesFor } from "@/lib/server/backoffice/access";
import { adminCan } from "@/lib/backoffice/roles";
import { firmsCsv, listFirms } from "@/lib/server/backoffice/firms";
import { adminAudit } from "@/lib/server/backoffice/audit";
import { exportApproval, requestApproval } from "@/lib/server/backoffice/approvals";
import { needsFourEyes } from "@/lib/backoffice/four-eyes";

/** Firm-list CSV (§6.1, §20): metadata only; purpose logged; four-eyes above 500 rows. */
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE" || !adminCan(await adminRolesFor(s.user.email), "firms.export")) return new NextResponse("Not found", { status: 404 });
  const back = new URL("/admin/firms" + req.nextUrl.search, req.url);
  if (!hasRecentMfa(s)) return NextResponse.redirect(new URL(`/reauth?next=${encodeURIComponent(back.pathname + back.search)}`, req.url), 303);
  const purpose = String((await req.formData()).get("purpose") ?? "").trim().slice(0, 300);
  if (purpose.length < 5) return new NextResponse("Give the purpose of the export.", { status: 400 });
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const rows = await listFirms(sp);
  const email = s.user.email.toLowerCase();
  if (needsFourEyes("firms.export", rows.length) && !(await exportApproval(email))) {
    await requestApproval(email, "firms.export", { filter: sp, rows: rows.length }, `Export ${rows.length} firm rows`, purpose);
    return NextResponse.redirect(new URL("/admin/approvals", req.url), 303);
  }
  await adminAudit({ adminEmail: email, action: "firms.export", targetType: "Firm", reason: purpose, details: { rows: rows.length, filter: sp } });
  return new NextResponse(firmsCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="amlsync-firms-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" } });
}
