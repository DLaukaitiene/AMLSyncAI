import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { adminDb, withTenant } from "@/lib/server/db";
import { renderPdf } from "@/lib/docs/pdf";
import { can } from "@/lib/auth/permissions";
import { isPlatformAdmin } from "@/lib/server/feedback";
import { formatEur } from "@/lib/didit/map";
import type { InvoiceLine } from "@/lib/billing/invoice";

const countryName = (c?: string) => { try { return c ? new Intl.DisplayNames(["en"], { type: "region" }).of(c) ?? c : ""; } catch { return c ?? ""; } };
const eur = (c: number) => (c < 0 ? "−" : "") + formatEur(Math.abs(c));

type Party = { name: string; address?: string | null; country?: string; vatId?: string | null; companyCode?: string | null; iban?: string | null; bic?: string | null; bank?: string | null };

/** VAT invoice PDF (PVM sąskaita faktūra) for the firm's own billing users, or AMLSyncAI admins. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE" || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const inv = isPlatformAdmin(s.user.email)
    ? await adminDb.invoice.findUnique({ where: { id } })
    : can(s.user.roles, "approve.compliance") ? await withTenant(s.firm.id, (tx) => tx.invoice.findUnique({ where: { id } })) : null;
  if (!inv) return new NextResponse("Not found", { status: 404 });
  const seller = inv.seller as Party, buyer = inv.buyer as Party;
  const lines = inv.lines as unknown as InvoiceLine[];
  const party = (p: Party): [string, string][] => [
    ["Name", p.name],
    ...(p.companyCode ? [["Company code", p.companyCode] as [string, string]] : []),
    ...(p.vatId ? [["VAT number", p.vatId] as [string, string]] : []),
    ["Address", [p.address, countryName(p.country)].filter(Boolean).join(", ") || "—"],
  ];
  const pdf = await renderPdf({
    title: inv.status === "void" ? `Invoice ${inv.number} (CANCELLED)` : `VAT invoice ${inv.number}`,
    subtitle: `PVM sąskaita faktūra · Serija AMS · Nr. ${inv.number.split("-").slice(1).join("-")}`,
    meta: [`Issued ${inv.issuedOn} · Period ${inv.period} · Due ${inv.dueOn}`],
    sections: [
      { id: "seller", heading: "Seller", blocks: [{ kv: party(seller) }] },
      { id: "buyer", heading: "Buyer", blocks: [{ kv: party(buyer) }] },
      {
        id: "lines", heading: "Items",
        blocks: [
          { table: { head: ["Description", "Qty", "Unit price", "Amount"], rows: lines.map((l) => [l.description, String(l.quantity), eur(l.unitCents), eur(l.netCents)]) } },
          { kv: [["Total excl. VAT", formatEur(inv.netCents)], [`VAT ${(inv.vatRateBp / 100).toFixed(0)} %`, formatEur(inv.vatCents)], ["Total to pay (EUR)", formatEur(inv.totalCents)]] },
          ...(inv.vatNote ? [{ p: inv.vatNote }] : []),
        ],
      },
      {
        id: "pay", heading: "Payment",
        blocks: [{ kv: [["Pay by", inv.dueOn], ["Account holder", seller.name.toUpperCase()], ["IBAN", seller.iban ?? "—"], ["BIC / SWIFT", seller.bic ?? "—"], ...(seller.bank ? [["Bank", seller.bank] as [string, string]] : []), ["Payment reference", inv.number]] }],
      },
    ],
  });
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${inv.number}.pdf"`, "Cache-Control": "private, no-store" } });
}
