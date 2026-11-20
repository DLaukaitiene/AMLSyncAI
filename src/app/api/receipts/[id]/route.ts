import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { renderPdf } from "@/lib/docs/pdf";
import { can } from "@/lib/auth/permissions";
import { formatEur } from "@/lib/didit/map";
import { SELLER } from "@/lib/billing/invoice";

/** Statement per check with the client reference (re-billable as a disbursement). The VAT document is the monthly invoice. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE" || !can(s.user.roles, "approve.compliance")) return new NextResponse("Not found", { status: 404 });
  const e = await withTenant(s.firm.id, (tx) => tx.creditEntry.findUnique({ where: { id } }));
  if (!e || e.kind !== "charge") return new NextResponse("Not found", { status: 404 });
  const pdf = await renderPdf({
    title: "Check statement",
    subtitle: `${SELLER.name} · not a VAT invoice: the check is billed on your monthly invoice`,
    meta: [`Statement ${e.id.slice(0, 8).toUpperCase()} · ${e.createdAt.toISOString().slice(0, 10)}`],
    sections: [
      { id: "to", heading: "Customer", blocks: [{ p: s.firm.name }] },
      { id: "item", heading: "Item", blocks: [{ table: { head: ["Description", "Client / case reference", "Check reference", "Price excl. VAT"], rows: [[e.description, e.clientRef ?? "—", e.reference ?? "—", formatEur(-e.amountCents)]] } }] },
      { id: "note", heading: "Note", blocks: [{ p: "You may re-bill this check to your client as a disbursement. VAT is shown on the monthly invoice." }] },
    ],
  });
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="statement-${e.id.slice(0, 8)}.pdf"`, "Cache-Control": "private, no-store" } });
}
