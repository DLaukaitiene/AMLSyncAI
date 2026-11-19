import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { Badge, eur, Page, Section, Table, Tile, Tiles } from "@/components/admin";
import { monthlyFeeFor, planOf } from "@/lib/billing/plans";
import { b2cThreshold, B2C_THRESHOLD_CENTS } from "@/lib/backoffice/vat";
import { CHECK_PRICE_CENTS } from "@/lib/didit/map";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Revenue reporting (§9.4), adapted to the billing model in code: monthly
 * subscription + paid checks invoiced monthly in arrears (postpaid).
 * Definitions follow ChartMogul's metrics library.
 */
export default async function RevenuePage() {
  await requireAdmin("billing.view");
  const now = new Date();
  const year = now.getUTCFullYear();
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(year, now.getUTCMonth() - 11 + i, 1)));
  const [firms, invoices, ledger] = await Promise.all([
    adminDb.firm.findMany({ select: { id: true, plan: true, status: true, customFeeCents: true, trialEndsOn: true, homeState: true, sectors: true, createdAt: true } }),
    adminDb.invoice.findMany({ select: { issuedOn: true, period: true, netCents: true, vatCents: true, totalCents: true, status: true, paidOn: true, dueOn: true, buyer: true, firmId: true } }),
    adminDb.$queryRaw<{ month: Date; kind: string; n: bigint; cents: bigint }[]>`SELECT date_trunc('month', "createdAt") AS month, kind, count(*) AS n, sum("amountCents") AS cents FROM "CreditEntry" WHERE "createdAt" >= ${months[0]} GROUP BY 1, 2`,
  ]);
  const mrrAt = (m: Date) => {
    const from = iso(m), to = iso(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)));
    return firms.filter((f) => f.createdAt < new Date(to + "T00:00:00Z") && f.status !== "cancelled").reduce((s, f) => s + monthlyFeeFor(f.plan, f.customFeeCents, f.trialEndsOn, from, to), 0);
  };
  const series = months.map((m) => {
    const key = m.toISOString().slice(0, 7);
    const rows = ledger.filter((l) => l.month.toISOString().slice(0, 7) === key);
    const charges = rows.find((r) => r.kind === "charge");
    const refunds = rows.find((r) => r.kind === "refund");
    const usage = -Number(charges?.cents ?? 0) - Number(refunds?.cents ?? 0);
    const inv = invoices.filter((i) => i.issuedOn.startsWith(key) && i.status !== "void");
    const paid = invoices.filter((i) => i.paidOn?.startsWith(key));
    return { key, mrr: mrrAt(m), checks: Number(charges?.n ?? 0) - Number(refunds?.n ?? 0), usage, invoiced: inv.reduce((s, i) => s + i.netCents, 0), cash: paid.reduce((s, i) => s + i.totalCents, 0) };
  });
  const cur = series.at(-1)!, prev = series.at(-2)!;
  const activeFirms = firms.filter((f) => f.status === "active").length;
  const today = iso(now);
  const open = invoices.filter((i) => i.status === "issued");
  const overdue = open.filter((i) => i.dueOn < today);
  const vat = b2cThreshold(invoices, year);
  const byPlan = Object.entries(firms.filter((f) => f.status === "active").reduce<Record<string, number>>((acc, f) => { acc[planOf(f.plan).name] = (acc[planOf(f.plan).name] ?? 0) + 1; return acc; }, {}));
  const byCountry = Object.entries(firms.reduce<Record<string, number>>((acc, f) => { acc[f.homeState] = (acc[f.homeState] ?? 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]);
  const mrrChange = prev.mrr ? Math.round((100 * (cur.mrr - prev.mrr)) / prev.mrr) : null;
  return (
    <Page title="Revenue" intro="Subscriptions plus paid checks, invoiced monthly in arrears. Vendor cost per check is not recorded yet, so gross margin needs the monthly Didit invoice.">
      <Tiles>
        <Tile label="MRR" value={eur(cur.mrr)} sub={`ARR ${eur(cur.mrr * 12)}${mrrChange !== null ? ` · ${mrrChange >= 0 ? "+" : ""}${mrrChange}% vs last month` : ""}`} />
        <Tile label="Usage revenue (month)" value={eur(cur.usage)} sub={`${cur.checks} paid check(s) at ${eur(CHECK_PRICE_CENTS)}`} />
        <Tile label="ARPA (month)" value={eur(activeFirms ? Math.round((cur.mrr + cur.usage) / activeFirms) : 0)} sub={`${activeFirms} active firm(s)`} />
        <Tile label="Receivables" value={eur(open.reduce((s, i) => s + i.totalCents, 0))} sub={`${overdue.length} overdue · ${eur(overdue.reduce((s, i) => s + i.totalCents, 0))}`} tone={overdue.length ? "warn" : "ok"} />
      </Tiles>
      <Section title="Last 12 months">
        <Table head={["Month", "MRR", "Paid checks", "Usage revenue", "Invoiced (net)", "Cash collected (gross)"]} rows={series.map((s) => [s.key, eur(s.mrr), s.checks, eur(s.usage), eur(s.invoiced), eur(s.cash)])} />
      </Section>
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title={`EU cross-border B2C sales ${year}`} note="Sales to EU customers outside Lithuania without a VAT number. Above €10,000 a year: customer-country VAT via OSS [verify with the accountant].">
          <p className="text-2xl font-semibold" data-testid="b2c-total">{eur(vat.totalCents)} <span className="text-sm font-normal text-muted">of {eur(B2C_THRESHOLD_CENTS)}</span></p>
          <div className="h-2 rounded bg-border"><div className={`h-2 rounded ${vat.alert ? "bg-red-600" : "bg-accent"}`} style={{ width: `${Math.min(100, Math.round(vat.share * 100))}%` }} /></div>
          {vat.exceeded ? <Badge tone="bad">threshold exceeded: switch to OSS rates</Badge> : vat.alert ? <Badge tone="warn">80% reached</Badge> : null}
        </Section>
        <Section title="Active firms by plan"><Table head={["Plan", "Firms"]} rows={byPlan} /></Section>
        <Section title="Firms by country"><Table head={["Country", "Firms"]} rows={byCountry} /></Section>
      </div>
    </Page>
  );
}
