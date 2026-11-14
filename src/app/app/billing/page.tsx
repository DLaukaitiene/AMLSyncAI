import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { balanceCents } from "@/lib/server/didit";
import { CHECK_PRICE_CENTS, formatEur } from "@/lib/didit/map";

export default async function BillingPage() {
  const s = await requireUser("approve.compliance");
  const { balance, entries, firm } = await withTenant(s.firm.id, async (tx) => ({
    balance: await balanceCents(tx),
    entries: await tx.creditEntry.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
    firm: await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id }, select: { plan: true } }),
  }));
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Billing and credit</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-border p-4"><span className="block text-sm text-muted">Credit balance</span><span className="text-2xl font-semibold">{formatEur(balance)}</span></div>
        <div className="rounded-md border border-border p-4"><span className="block text-sm text-muted">Price per check</span><span className="text-2xl font-semibold">{formatEur(CHECK_PRICE_CENTS)}</span><span className="block text-xs text-muted">excl. VAT; refunded if a check expires or fails</span></div>
        <div className="rounded-md border border-border p-4"><span className="block text-sm text-muted">Plan</span><span className="text-2xl font-semibold capitalize">{firm.plan}</span></div>
      </div>
      <p className="text-sm text-muted">
        Paid checks: remote identity checks and PEP / sanctions / adverse-media screening (Didit). Screening against EU and UN sanctions lists is included in
        your plan. To top up, contact AMLSyncAI; each charge has a receipt with the client reference so you can re-bill it as a disbursement.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted"><tr><th className="py-1 pr-3 font-normal">Date</th><th className="py-1 pr-3 font-normal">What</th><th className="py-1 pr-3 font-normal">Client</th><th className="py-1 pr-3 text-right font-normal">Amount</th><th className="py-1 font-normal">Receipt</th></tr></thead>
          <tbody className="divide-y divide-border">
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="py-1 pr-3 whitespace-nowrap">{e.createdAt.toISOString().slice(0, 10)}</td>
                <td className="py-1 pr-3">{e.description}</td>
                <td className="py-1 pr-3">{e.clientRef ?? "—"}</td>
                <td className={`py-1 pr-3 text-right ${e.amountCents < 0 ? "" : "text-green-800 dark:text-green-300"}`}>{e.amountCents < 0 ? "−" : "+"}{formatEur(Math.abs(e.amountCents))}</td>
                <td className="py-1">{e.kind === "charge" ? <a className="text-accent underline" href={`/api/receipts/${e.id}`}>PDF</a> : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
