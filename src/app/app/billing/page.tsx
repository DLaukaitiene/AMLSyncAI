import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { CHECK_PRICE_CENTS, formatEur } from "@/lib/didit/map";
import { buildInvoice, vatTreatment } from "@/lib/billing/invoice";
import { customerOf } from "@/lib/server/invoicing";
import { ActionForm, Field, Submit } from "@/components/form";
import { saveBillingDetails } from "./actions";

export default async function BillingPage() {
  const s = await requireUser("approve.compliance");
  const { open, entries, invoices, firm } = await withTenant(s.firm.id, async (tx) => ({
    open: await tx.creditEntry.findMany({ where: { invoiceId: null } }),
    entries: await tx.creditEntry.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
    invoices: await tx.invoice.findMany({ orderBy: { seq: "desc" } }),
    firm: await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id } }),
  }));
  const customer = customerOf(firm);
  const draft = buildInvoice(firm.monthlyFeeCents, firm.plan, open, customer);
  const vat = vatTreatment(customer);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-border p-4"><span className="block text-sm text-muted">Next invoice so far (excl. VAT)</span><span className="text-2xl font-semibold" data-testid="next-invoice">{formatEur(draft.netCents)}</span><span className="block text-xs text-muted">{draft.carryCents > 0 ? `${formatEur(draft.carryCents)} credit left` : "Invoiced on the 1st of each month"}</span></div>
        <div className="rounded-md border border-border p-4"><span className="block text-sm text-muted">Price per check</span><span className="text-2xl font-semibold">{formatEur(CHECK_PRICE_CENTS)}</span><span className="block text-xs text-muted">excl. VAT; not charged if a check expires or fails</span></div>
        <div className="rounded-md border border-border p-4"><span className="block text-sm text-muted">Monthly limit for paid checks</span><span className="text-2xl font-semibold">{formatEur(firm.spendLimitCents)}</span><span className="block text-xs text-muted">Contact AMLSyncAI to raise it</span></div>
      </div>
      <p className="text-sm text-muted">
        Paid checks: remote identity checks and PEP / sanctions / adverse-media screening (Didit). Screening against EU and UN sanctions lists is included in your plan.
        You receive one invoice per month, payable by bank transfer within 14 days. Each check also has a statement with the client reference, so you can re-bill it as a disbursement.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Invoices</h2>
        {invoices.length === 0 ? <p className="text-sm text-muted">No invoices yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted"><tr><th className="py-1 pr-3 font-normal">Number</th><th className="py-1 pr-3 font-normal">Month</th><th className="py-1 pr-3 font-normal">Due</th><th className="py-1 pr-3 text-right font-normal">Total</th><th className="py-1 pr-3 font-normal">Status</th><th className="py-1 font-normal">PDF</th></tr></thead>
              <tbody className="divide-y divide-border">
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="py-1 pr-3">{i.number}</td>
                    <td className="py-1 pr-3">{i.period}</td>
                    <td className="py-1 pr-3">{i.dueOn}</td>
                    <td className="py-1 pr-3 text-right">{formatEur(i.totalCents)}</td>
                    <td className="py-1 pr-3">{i.status === "paid" ? `Paid ${i.paidOn ?? ""}` : i.status === "void" ? "Cancelled" : i.dueOn < today ? <span className="text-red-700 dark:text-red-300">Overdue</span> : "Open"}</td>
                    <td className="py-1"><a className="text-accent underline" href={`/api/invoices/${i.id}`}>Download</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Invoice details</h2>
        <p className="text-sm text-muted">{vat.rateBp === 0 ? "Your invoices are reverse-charged (no Lithuanian VAT)." : "Lithuanian VAT (21 %) is added. Businesses in other EU countries with a valid VAT number are reverse-charged."}</p>
        <ActionForm action={saveBillingDetails} className="grid gap-3 sm:grid-cols-2">
          <Field label="Legal name *" name="billingName" defaultValue={firm.billingName ?? firm.name} required />
          <Field label="Company code" name="billingCompanyCode" defaultValue={firm.billingCompanyCode ?? ""} />
          <Field label="Address" name="billingAddress" defaultValue={firm.billingAddress ?? ""} />
          <Field label="Country (2 letters) *" name="billingCountry" defaultValue={firm.billingCountry ?? firm.homeState} required />
          <Field label="VAT number" name="vatId" defaultValue={firm.vatId ?? ""} hint="With country prefix, e.g. LT123456789." />
          <Field label="Send invoices to (email)" name="billingEmail" type="email" defaultValue={firm.billingEmail ?? ""} hint="Leave empty to send to the Owner." />
          <div className="sm:col-span-2"><Submit variant="secondary">Save invoice details</Submit></div>
        </ActionForm>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Usage</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted"><tr><th className="py-1 pr-3 font-normal">Date</th><th className="py-1 pr-3 font-normal">What</th><th className="py-1 pr-3 font-normal">Client</th><th className="py-1 pr-3 text-right font-normal">Amount</th><th className="py-1 font-normal">Statement</th></tr></thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="py-1 pr-3 whitespace-nowrap">{e.createdAt.toISOString().slice(0, 10)}</td>
                  <td className="py-1 pr-3">{e.description}</td>
                  <td className="py-1 pr-3">{e.clientRef ?? "—"}</td>
                  <td className={`py-1 pr-3 text-right ${e.amountCents < 0 ? "" : "text-green-800 dark:text-green-300"}`}>{e.amountCents < 0 ? "" : "−"}{formatEur(Math.abs(e.amountCents))}</td>
                  <td className="py-1">{e.kind === "charge" ? <a className="text-accent underline" href={`/api/receipts/${e.id}`}>PDF</a> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
