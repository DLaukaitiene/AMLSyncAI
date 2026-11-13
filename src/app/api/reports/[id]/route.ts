import { NextResponse } from "next/server";
import { getSession, hasRecentMfa } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { decryptField } from "@/lib/server/crypto";
import { audit, securityEvent } from "@/lib/server/audit";
import { renderReport, REPORT_LABELS } from "@/lib/server/cases";
import { can } from "@/lib/auth/permissions";

/**
 * Exports a report as text for upload to the national channel. Compliance
 * Officer only, fresh MFA required (spec §8C.3 step-up for STR export), logged
 * and marked with who exported it and when (§8C.4).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE" || !can(s.user.roles, "case.view")) return new NextResponse("Not found", { status: 404 });
  if (!hasRecentMfa(s)) return NextResponse.redirect(new URL(`/reauth?next=${encodeURIComponent("/app/reports")}`, req.url));
  const out = await withTenant(s.firm.id, async (tx) => {
    const r = await tx.report.findUnique({ where: { id } });
    if (!r) return null;
    const content = JSON.parse(decryptField(s.firm.id, r.contentEnc));
    if (r.status === "DRAFT") await tx.report.update({ where: { id }, data: { status: "EXPORTED" } });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "export", objectType: "Report", objectId: id });
    const text = renderReport(r.type, content, { firmName: s.firm.name, exportedBy: `${s.user.name} <${s.user.email}>`, at: new Date().toISOString(), profileVersion: r.countryProfileVersion });
    return { text, name: `${REPORT_LABELS[r.type].replace(/[^A-Za-z]+/g, "-")}-${id.slice(0, 8)}.txt` };
  });
  if (!out) return new NextResponse("Not found", { status: 404 });
  await securityEvent({ firmId: s.firm.id, userId: s.user.id, kind: "export", details: { report: id } });
  return new NextResponse(out.text, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${out.name}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
