import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { renderPdf } from "@/lib/docs/pdf";
import { can } from "@/lib/auth/permissions";
import { formatEur } from "@/lib/didit/map";

/** Receipt per check with the client reference (re-billable as a disbursement). VAT rate is set by SELLER_VAT_RATE. [decision] */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE" || !can(s.user.roles, "approve.compliance")) return new NextResponse("Not found", { status: 404 });
  const e = await withTenant(s.firm.id, (tx) => tx.creditEntry.findUnique({ where: { id } }));
  if (!e || e.kind !== "charge") return new NextResponse("Not found", { status: 404 });
  const net = -e.amountCents;
  const rate = Number(process.env.SELLER_VAT_RATE ?? "0");
  const vat = Math.round(net * rate);
  const pdf = await renderPdf({
    title: "Receipt",
    subtitle: `${process.env.SELLER_NAME ?? "AMLSyncAI (AMLSync)"} · ${process.env.SELLER_VAT_ID ? `VAT ID ${process.env.SELLER_VAT_ID}` : "seller VAT ID to be configured"}`,
    meta: [`Receipt ${e.id.slice(0, 8).toUpperCase()} · ${e.createdAt.toISOString().slice(0, 10)}`],
    sections: [
      { id: "to", heading: "Customer", blocks: [{ p: s.firm.name }] },
      { id: "item", heading: "Item", blocks: [{ table: { head: ["Description", "Client / matter reference", "Check reference", "Net", `VAT ${(rate * 100).toFixed(0)}%`, "Total"], rows: [[e.description, e.clientRef ?? "—", e.reference ?? "—", formatEur(net), formatEur(vat), formatEur(net + vat)]] } }] },
      { id: "note", heading: "Note", blocks: [{ p: "Paid from prepaid credit. You may re-bill this check to your client as a disbursement." }] },
    ],
  });
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="receipt-${e.id.slice(0, 8)}.pdf"`, "Cache-Control": "private, no-store" } });
}
