import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { riskAssessmentAsDoc } from "@/lib/server/firm-docs";
import { renderPdf } from "@/lib/docs/pdf";
import type { GeneratedDoc } from "@/lib/docs/model";

/** PDF of a firm document (risk assessment, policy, procedures), watermarked with user and time. */
export async function GET(_: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE") return new NextResponse("Not found", { status: 404 });
  const doc = await withTenant(s.firm.id, async (tx): Promise<GeneratedDoc | null> => {
    if (kind === "risk-assessment") {
      if (!(await tx.firmRiskAssessment.findUnique({ where: { id } }))) return null;
      await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "export", objectType: "FirmRiskAssessment", objectId: id });
      return riskAssessmentAsDoc(tx, s.firm.id, id);
    }
    if (kind === "policy") {
      const p = await tx.policyDocument.findUnique({ where: { id } });
      if (!p) return null;
      await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "export", objectType: "PolicyDocument", objectId: id });
      return p.content as unknown as GeneratedDoc;
    }
    return null;
  });
  if (!doc) return new NextResponse("Not found", { status: 404 });
  const pdf = await renderPdf(doc, { watermark: `${s.firm.name} · exported by ${s.user.name} · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC` });
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${doc.title.replace(/[^A-Za-z0-9]+/g, "-")}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
