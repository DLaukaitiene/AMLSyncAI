import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { screeningUsage } from "@/lib/server/screening-limits";
import { ScreeningUsage } from "@/components/screening-usage";
import { formatEur } from "@/lib/didit/map";
import { currentPricesOrNull } from "@/lib/server/prices";
import { buildInvoice, missingInvoiceDetails, vatTreatment } from "@/lib/billing/invoice";
import { customerOf } from "@/lib/server/invoicing";
import { CONTACT_EMAIL, monthlyFeeFor, planOf } from "@/lib/billing/plans";
import { ActionForm, Field, Submit } from "@/components/form";
import { cancelSubscriptionAction, saveBillingDetails } from "./actions";
import { can } from "@/lib/auth/permissions";
import { Help } from "@/components/help";

export default async function BillingPage() {
  const s = await requireUser("approve.compliance");
  const { open, entries, invoices, firm, usage } = await withTenant(s.firm.id, async (tx) => ({
    open: await tx.creditEntry.findMany({ where: { invoiceId: null } }),
    entries: await tx.creditEntry.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
    invoices: await tx.invoice.findMany({ orderBy: { seq: "desc" } }),
    firm: await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id } }),
    usage: await screeningUsage(tx, s.firm.id),
  }));
  const customer = customerOf(firm);
  const pr = await currentPricesOrNull();
  const now = new Date();
  const monthFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const monthTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  const plan = planOf(firm.plan);
  const draft = buildInvoice(monthlyFeeFor(firm.plan, firm.customFeeCents, firm.trialEndsOn, monthFrom, monthTo), plan.name, open, customer);
  const vat = vatTreatment(customer);
  const missing = missingInvoiceDetails({ ...firm, billingCountry: firm.billingCountry ?? firm.homeState });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-3xl">Billing</h1>
      <div className="rounded-xl border border-border p-4 text-sm">
        <span className="font-medium">{plan.name} plan</span>
        {plan.monthlyCents !== null && <> · {formatEur(firm.customFeeCents ?? plan.monthlyCents)} per month excl. VAT</>}
        {plan.users !== null && <> · up to {plan.users} users</>}
        {firm.trialEndsOn && firm.trialEndsOn > now.toISOString().slice(0, 10) && <> · <strong>free trial until {firm.trialEndsOn}</strong></>}
        <span className="block text-xs text-muted">To change plan, or for more users: {CONTACT_EMAIL}.</span>
      </div>
      <ScreeningUsage limits={usage.limits} used={usage.used} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border p-4"><span className="block text-sm text-muted">Next invoice so far (excl. VAT)</span><span className="text-2xl font-semibold" data-testid="next-invoice">{formatEur(draft.netCents)}</span><span className="block text-xs text-muted">{draft.carryCents > 0 ? `${formatEur(draft.carryCents)} credit left` : "Invoiced on the 1st of each month"}</span></div>
        <div className="rounded-xl border border-border p-4"><span className="block text-sm text-muted">Price per check</span><span className="text-2xl font-semibold">{pr ? <>{formatEur(pr.idv)} / {formatEur(pr.screen)}</> : "updating"}</span><span className="block text-xs text-muted">identity check / provider screening</span>{pr && <span className="block text-xs text-muted">ECB rate USD {pr.rate.usdPerEur.toFixed(4)} per €1 ({pr.rate.date})</span>}<span className="block text-xs text-muted">excl. VAT; not charged if a check expires or fails</span></div>
        <div className="rounded-xl border border-border p-4"><span className="block text-sm text-muted">Monthly limit for paid checks</span><span className="text-2xl font-semibold">{formatEur(firm.spendLimitCents)}</span><span className="block text-xs text-muted">Contact AMLSync to raise it</span></div>
      </div>
      <div className="flex items-start gap-2 text-sm text-muted"><p>One invoice a month: your plan plus the paid checks you used.</p><Help>Paid checks are identity checks, provider screening and company register checks. Screening against EU and UN sanctions lists is included in your plan. Invoices are payable by bank transfer within 14 days. Each check has a statement with the client reference, so you can re-bill it as a disbursement.</Help></div>

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

      <section className="space-y-2" id="invoice-details" data-testid="invoice-details">
        <h2 className="text-lg font-semibold">Invoice details</h2>
        {missing.length > 0 && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50">Before your first invoice, please give us: {missing.join(", ")}.</p>}
        <p className="text-sm text-muted">{vat.rateBp === 0 ? (vat.note?.startsWith("Not subject") ? "Your business is outside the EU: no Lithuanian VAT is added." : "Your VAT number passed the EU VIES check: your invoices are reverse-charged (no Lithuanian VAT).") : "Lithuanian VAT (21 %) is added. EU businesses outside Lithuania whose VAT number passes the EU VIES check are reverse-charged; businesses outside the EU pay no Lithuanian VAT."}</p>
        <ActionForm action={saveBillingDetails} className="grid gap-3 sm:grid-cols-2">
          <Field label="Full legal name *" name="billingName" defaultValue={firm.billingName ?? firm.name} required />
          <Field label="Company code *" name="billingCompanyCode" defaultValue={firm.billingCompanyCode ?? ""} required />
          <Field label="Registered address *" name="billingAddress" defaultValue={firm.billingAddress ?? ""} required />
          <Field label="Country where the business is established (2 letters) *" name="billingCountry" defaultValue={firm.billingCountry ?? firm.homeState} required />
          <Field label="If you have offices in several countries: which office receives the service" name="billingOffice" defaultValue={firm.billingOffice ?? ""} />
          <Field label="VAT number" name="vatId" defaultValue={firm.vatId ?? ""} hint={`With country prefix, e.g. LT123456789.${firm.viesStatus ? ` EU VIES check: ${firm.viesStatus}.` : ""}`} />
          <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="vatNotRegistered" defaultChecked={firm.vatNotRegistered} className="mt-1" /> <span>We aren&apos;t VAT-registered.</span></label>
          <Field label="Email for invoices *" name="billingEmail" type="email" defaultValue={firm.billingEmail ?? ""} required />
          <Field label="PO or reference number for invoices" name="invoiceReference" defaultValue={firm.invoiceReference ?? ""} hint="Optional. Shown on every invoice." />
          <div className="sm:col-span-2"><Submit variant="secondary">Save invoice details</Submit></div>
        </ActionForm>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Your data</h2>
        <p className="text-sm text-muted">Download everything — the firm file and every client&apos;s file with its documents — as one ZIP. Owners are notified of every export.</p>
        <a className="inline-block rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-accent" href="/api/export/all">Download full export</a>
      </section>

      {can(s.user.roles, "approve.management") && firm.status !== "cancelled" && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">End subscription</h2>
          <div className="flex items-start gap-2 text-sm text-muted"><p>Your records stay available read-only for as long as the law requires.</p><Help>You can still show them to a supervisor during the retention period your country requires (at least 5 years); they are deleted after that. The monthly fee stops on the day you cancel and a final invoice follows. Download your full export first if you want your own copy.</Help></div>
          <details className="rounded border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">End my subscription</summary>
            <ActionForm action={cancelSubscriptionAction} className="mt-3 space-y-3">
              <Field label="Type CANCEL to confirm" name="confirm" required autoComplete="off" />
              <Submit variant="danger">End subscription</Submit>
            </ActionForm>
          </details>
        </section>
      )}

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
