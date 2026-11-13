import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { loadClientFile } from "@/lib/server/cdd";
import { renderPdf } from "@/lib/docs/pdf";
import { can } from "@/lib/auth/permissions";

/**
 * Explanation of a decision for the client (AMLR Art. 76(5)): which data was
 * used, the risk factors, that a person decided. Not available when an
 * internal report concerns the client — an explanation could tip them off.
 */
export async function GET(_: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE" || !can(s.user.roles, "approve.compliance")) return new NextResponse("Not found", { status: 404 });
  const out = await withTenant(s.firm.id, async (tx) => {
    const f = await tx.cddFile.findUnique({ where: { id: fileId } });
    if (!f) return { status: 404 as const };
    if (await tx.case.count({ where: { partyIds: { has: f.partyId } } })) return { status: 409 as const };
    const cf = await loadClientFile(tx, s.firm.id, fileId);
    const lists = [...new Set(cf.screening.filter((x) => x.partyId === cf.party.id).map((x) => `${x.listName} (version ${x.listVersion})`))];
    const decisionText: Record<string, string> = {
      OPEN: "Our review is not finished yet.", COMPLETE: "We accepted you as a client.", SDD: "We accepted you as a client with simplified checks.",
      EDD: "We accepted you as a client with enhanced checks.", REFUSED: "We were unable to take you on as a client.", TERMINATED: "We ended our business relationship.",
    };
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "export", objectType: "CddFile", objectId: fileId, fields: ["explanation"] });
    const pdf = await renderPdf({
      title: "How we reached our decision",
      subtitle: `${s.firm.name} — for ${cf.party.displayName}`,
      meta: [`Issued ${new Date().toISOString().slice(0, 10)} · AMLR (EU) 2024/1624 Art. 76(5)`],
      sections: [
        { id: "decision", heading: "Decision", blocks: [{ p: decisionText[cf.file.status] }, { p: "The decision was taken by a member of our staff, not by software alone." }] },
        { id: "data", heading: "Information we used", blocks: [{ list: ["Identification data you or public registers provided", "The purpose of our work and, where relevant, the source of funds", "Results of checks against official sanctions lists and lists of politically exposed persons", ...(lists.length ? [`Lists checked: ${lists.join("; ")}`] : [])] }] },
        { id: "risk", heading: "How the risk level was set", blocks: [{ p: `Our software calculates a risk level (Low, Medium or High) from fixed rules; it was ${cf.risk.level}.` }, cf.risk.factors.length ? { list: cf.risk.factors.map((x) => x.label) } : { p: "No higher-risk factors applied." }] },
        { id: "rights", heading: "Your rights", blocks: [{ p: "You can ask us to correct inaccurate information and to reconsider the decision. Contact us and we will review it. Some information may be withheld where the law requires." }] },
      ],
    });
    return { status: 200 as const, pdf, name: cf.party.displayName };
  });
  if (out.status === 404) return new NextResponse("Not found", { status: 404 });
  if (out.status === 409) return new NextResponse("Not available for this client: an explanation could disclose confidential information (AMLR Art. 73, 76(5)). Ask the Compliance Officer.", { status: 409 });
  return new NextResponse(new Uint8Array(out.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="explanation.pdf"`, "Cache-Control": "private, no-store" } });
}
