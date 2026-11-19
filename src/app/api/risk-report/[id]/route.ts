import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { can } from "@/lib/auth/permissions";
import { renderPdf } from "@/lib/docs/pdf";
import type { GeneratedDoc } from "@/lib/docs/model";
import { safeFileName } from "@/lib/files/validate";

/** One client risk assessment as a PDF (client profile → Risk reports). Staff of the owning firm only. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE" || !can(s.user.roles, "client.view") || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const r = await withTenant(s.firm.id, async (tx) => {
    const ra = await tx.clientRiskAssessment.findUnique({ where: { id }, include: { cddFile: { include: { party: { select: { displayName: true, kind: true } } } } } });
    if (!ra) return null;
    const by = ra.overrideById ? (await tx.user.findUnique({ where: { id: ra.overrideById }, select: { name: true } }))?.name : null;
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "export", objectType: "ClientRiskAssessment", objectId: ra.id });
    return { ra, by };
  });
  if (!r) return new NextResponse("Not found", { status: 404 });
  const { ra, by } = r;
  const factors = (ra.factors as { label: string; points: number }[]) ?? [];
  const when = ra.createdAt.toISOString().slice(0, 16).replace("T", " ");
  const doc: GeneratedDoc = {
    title: `Client risk assessment: ${ra.cddFile.party.displayName}`,
    subtitle: `${s.firm.name} · ${ra.cddFile.party.kind === "NATURAL" ? "Individual" : "Entity"} · client file ${ra.cddFileId.slice(0, 8)}`,
    meta: [`Assessed ${when} UTC`, `Rule set ${ra.rulesetVersion}`, `EU Core ${ra.euCoreVersion}`, `Country Profile v${ra.countryProfileVersion}`],
    sections: [
      { id: "result", heading: "1. Result", blocks: [{ kv: [
        ["Risk rating", ra.final], ["Calculated rating", ra.calculated], ["Score", String(ra.score)],
        ...(ra.overrideReason ? [["Changed by", by ?? "—"], ["Reason for the change", ra.overrideReason]] as [string, string][] : []),
      ] }] },
      { id: "factors", heading: "2. Risk factors (AMLR Art. 20, Annexes I–III)", blocks: [
        factors.length ? { table: { head: ["Factor", "Points"], rows: factors.map((f) => [f.label, `+${f.points}`]) } } : { p: "No risk-increasing factors found." },
        { p: "The rating is calculated from the data in the client file using a transparent rule set. Any change by a person is recorded with the reason." },
      ] },
    ],
  };
  const pdf = await renderPdf(doc, { watermark: `${s.firm.name} · exported by ${s.user.name} · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · confidential` });
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safeFileName(`risk-assessment-${ra.cddFile.party.displayName}-${ra.createdAt.toISOString().slice(0, 10)}.pdf`)}"`, "Cache-Control": "private, no-store" },
  });
}
