import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { renderPdf } from "@/lib/docs/pdf";
import { firmReviewPack } from "@/lib/server/review-pack";

/** The review pack as PDF, for the firm's lawyer or accountant. */
export async function GET() {
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE") return new NextResponse("Not found", { status: 404 });
  const doc = await withTenant(s.firm.id, async (tx) => {
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "export", objectType: "Firm", objectId: s.firm.id, fields: ["review-pack"] });
    return firmReviewPack(tx, s.firm.id);
  });
  const pdf = await renderPdf(doc, { watermark: `${s.firm.name} · ${new Date().toISOString().slice(0, 10)}` });
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="amlsync-review-pack-${new Date().toISOString().slice(0, 10)}.pdf"`, "Cache-Control": "private, no-store" } });
}
