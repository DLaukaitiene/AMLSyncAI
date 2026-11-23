import "server-only";
import type { Invoice } from "@prisma/client";
import { renderPdf } from "@/lib/docs/pdf";
import { formatEur } from "@/lib/didit/map";
import type { InvoiceLine } from "@/lib/billing/invoice";

const countryName = (c?: string) => { try { return c ? new Intl.DisplayNames(["en"], { type: "region" }).of(c) ?? c : ""; } catch { return c ?? ""; } };
const eur = (c: number) => (c < 0 ? "−" : "") + formatEur(Math.abs(c));

type Party = { name: string; address?: string | null; country?: string; vatId?: string | null; companyCode?: string | null; iban?: string | null; bic?: string | null; bank?: string | null; office?: string | null; reference?: string | null };

/** VAT invoice PDF (PVM sąskaita faktūra). */
export async function invoicePdf(inv: Invoice): Promise<Buffer> {
  const seller = inv.seller as Party, buyer = inv.buyer as Party;
  const lines = inv.lines as unknown as InvoiceLine[];
  const party = (p: Party): [string, string][] => [
    ["Name", p.name],
    ...(p.companyCode ? [["Company code", p.companyCode] as [string, string]] : []),
    ...(p.vatId ? [["VAT number", p.vatId] as [string, string]] : []),
    ["Address", [p.address, countryName(p.country)].filter(Boolean).join(", ") || "—"],
    ...(p.office ? [["Office receiving the service", p.office] as [string, string]] : []),
    ...(p.reference ? [["Your reference / PO", p.reference] as [string, string]] : []),
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
          { kv: [["Total excl. VAT", formatEur(inv.netCents)], [inv.vatRateBp === 0 ? "VAT" : `VAT ${(inv.vatRateBp / 100).toFixed(0)} %`, inv.vatRateBp === 0 ? "not charged (see below)" : formatEur(inv.vatCents)], ["Total to pay (EUR)", formatEur(inv.totalCents)]] },
          ...(inv.vatNote ? [{ p: inv.vatNote }] : []),
        ],
      },
      {
        id: "pay", heading: "Payment",
        blocks: [{ kv: [["Pay by", inv.dueOn], ["Account holder", seller.name.toUpperCase()], ["IBAN", seller.iban ?? "—"], ["BIC / SWIFT", seller.bic ?? "—"], ...(seller.bank ? [["Bank", seller.bank] as [string, string]] : []), ["Payment reference", inv.number]] }],
      },
    ],
  });
  return Buffer.from(pdf);
}

/** "client invoice (Namai UAB) (2026, 11)" */
export function invoiceCopyName(inv: Pick<Invoice, "period" | "buyer">): string {
  const [y, m] = inv.period.split("-");
  return `client invoice (${(inv.buyer as Party).name.replace(/[\\/:*?"<>|]/g, "")}) (${y}, ${m})`;
}
