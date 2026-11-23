import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { ActionForm, CountryField, Field, SelectWithOther, Submit } from "@/components/form";
import { Chip, type Tone } from "@/components/chips";
import { EmptyState } from "@/components/empty-state";
import { toIsoDate } from "@/lib/rules/dates";
import { normalizeFlags, RULES, RULE_IDS } from "@/lib/monitoring/rules";
import { clientFileForParties } from "@/lib/server/client-of-party";
import { logTransactionAction, reviewTransactionAction } from "./actions";

/**
 * Transaction Monitoring (ClearAML's layout; AMLR Art. 26): every payment in
 * one log, red flags raised automatically, and a written reason for every
 * review decision. Escalation goes to the Compliance Officer as an internal
 * suspicion report — the CO decides whether to report to the FIU.
 */
const STATUS: Record<string, [string, Tone]> = {
  flagged: ["Flagged (high)", "red"], pending: ["To review", "amber"], clear: ["No flags", "grey"], investigated: ["Investigated", "amber"], cleared: ["Reviewed", "green"],
};
const FILTERS = ["all", "flagged", "pending", "clear", "investigated", "cleared"] as const;
const SEV_TONE: Record<string, string> = { high: "text-red-800 dark:text-red-300", medium: "text-amber-800 dark:text-amber-300", low: "text-muted" };
const eur = (n: number) => `€${n.toLocaleString("en-IE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const sel = "w-full rounded border border-border bg-background px-3 py-2 text-sm";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; client?: string; rule?: string; severity?: string; batch?: string }> }) {
  const s = await requireUser("client.view");
  const sp = await searchParams;
  const status = (FILTERS as readonly string[]).includes(sp.status ?? "") ? sp.status! : "all";
  const q = sp.q?.trim();
  if (sp.client && !/^[0-9a-f-]{36}$/i.test(sp.client)) sp.client = undefined;
  if (sp.batch && !/^[0-9a-f-]{36}$/i.test(sp.batch)) sp.batch = undefined;
  const rule = (RULE_IDS as string[]).includes(sp.rule ?? "") ? sp.rule! : "";
  const severity = ["high", "medium", "low"].includes(sp.severity ?? "") ? sp.severity! : "";
  const r = s.user.roles;
  const data = await withTenant(s.firm.id, async (tx) => {
    const firm = await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id }, select: { txCashThresholdEUR: true, txHighValueThresholdEUR: true, txCashLegalLimitEUR: true, txRulesOff: true } });
    const parties = await tx.party.findMany({ where: q ? { displayName: { contains: q, mode: "insensitive" } } : {}, select: { id: true, displayName: true } });
    const all = await tx.transaction.findMany({
      where: {
        ...(status !== "all" ? { monitorStatus: status } : {}),
        ...(sp.client ? { customerId: sp.client } : {}),
        ...(sp.batch ? { importBatchId: sp.batch } : {}),
        ...(rule || severity ? { flags: { array_contains: [{ ...(rule ? { rule } : {}), ...(severity ? { severity } : {}) }] } } : {}),
        ...(q ? { OR: [{ customerId: { in: parties.map((p) => p.id) } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: { date: "desc" }, take: 300, include: { matter: { select: { id: true, title: true } } },
    });
    // Flagged first, then newest.
    const rank = (x: { monitorStatus: string; flags: unknown }) => (x.monitorStatus === "flagged" ? 2 : x.monitorStatus === "pending" && normalizeFlags(x.flags).length ? 1 : 0);
    all.sort((a, b) => rank(b) - rank(a));
    const sums = await tx.transaction.aggregate({ _sum: { amountEUR: true }, _count: true });
    const counts = Object.fromEntries((await tx.transaction.groupBy({ by: ["monitorStatus"], _count: true })).map((g) => [g.monitorStatus, g._count]));
    const names = new Map((await tx.party.findMany({ where: { id: { in: [...new Set(all.map((t) => t.customerId))] } }, select: { id: true, displayName: true } })).map((p) => [p.id, p.displayName]));
    const links = await tx.matterParty.findMany({ where: { matter: { status: { not: "COMPLETED" } } }, include: { party: { select: { displayName: true } }, matter: { select: { title: true } } }, take: 300 });
    return { firm, all, sums, counts, names, links, files: await clientFileForParties(tx, all.map((t) => t.customerId)) };
  });
  const qs = (st: string) => `/app/transactions?${new URLSearchParams({ ...(st !== "all" ? { status: st } : {}), ...(q ? { q } : {}), ...(sp.client ? { client: sp.client } : {}), ...(rule ? { rule } : {}), ...(severity ? { severity } : {}) })}`;
  const manage = can(r, "approve.compliance");
  const edit = can(r, "client.edit");
  const card = "rounded-2xl border border-border bg-surface p-4";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Transaction Monitoring</h1>
          <p className="text-sm text-muted">Every payment you record — here or on a case — is checked against red-flag rules. Each flag needs a review with a written reason (AMLR Art. 26). Escalate anything suspicious to your Compliance Officer.</p>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <li className={card}><span className="block text-sm text-muted">Total volume</span><span className="block font-[family-name:var(--font-heading)] text-2xl font-extrabold">{eur(Number(data.sums._sum.amountEUR ?? 0))}</span><span className="text-xs text-muted">{data.sums._count} transaction(s)</span></li>
        <li><Link href={qs("flagged")} className={`block h-full ${card} hover:border-accent`}><span className="block text-sm text-muted">Flagged (high)</span><span className={`block font-[family-name:var(--font-heading)] text-2xl font-extrabold ${data.counts.flagged ? "text-red-700 dark:text-red-300" : ""}`}>{data.counts.flagged ?? 0}</span><span className="text-xs text-muted">Need a review</span></Link></li>
        <li><Link href={qs("pending")} className={`block h-full ${card} hover:border-accent`}><span className="block text-sm text-muted">To review</span><span className="block font-[family-name:var(--font-heading)] text-2xl font-extrabold">{data.counts.pending ?? 0}</span><span className="text-xs text-muted">Medium or low flags</span></Link></li>
        <li className={card}><span className="block text-sm text-muted">Rules</span><span className="block text-sm font-semibold">Cash ≥ {eur(data.firm.txCashThresholdEUR)} · legal limit {eur(data.firm.txCashLegalLimitEUR)} · any ≥ {eur(data.firm.txHighValueThresholdEUR)}</span><span className="text-xs text-muted">{RULE_IDS.length - (data.firm.txRulesOff?.length ?? 0)} of {RULE_IDS.length} rules on · <Link href="/app/settings/transaction-monitoring" className="text-accent underline">Settings</Link></span></li>
      </ul>

      <div className="flex flex-wrap gap-3">
        {edit && data.links.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">Transactions belong to a case. <Link href="/app/matters/new" className="text-accent underline">Open a case</Link> for the client first, then log its payments here.</p>
        )}
        {edit && data.links.length > 0 && (
          <details className="w-full rounded-2xl border border-border p-4 lg:w-auto lg:min-w-[40rem]">
            <summary className="cursor-pointer font-semibold">Log Transaction</summary>
              <ActionForm action={logTransactionAction} className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label="Client and case" name="link">
                  <select name="link" className={sel} aria-label="Client and case">{data.links.map((l) => <option key={l.id} value={`${l.matterId}:${l.partyId}`}>{l.party.displayName} — {l.matter.title}</option>)}</select>
                </Field>
                <Field label="Date" name="date" type="date" defaultValue={toIsoDate(new Date())} />
                <Field label="Amount" name="amountEUR" type="number" inputMode="decimal" hint="Dot for decimals, e.g. 12500.00" />
                <Field label="Currency" name="currency" defaultValue="EUR" hint="3 letters, e.g. EUR, USD" />
                <Field label="Exchange rate (only if not EUR)" name="fxRate" inputMode="decimal" hint="Euros per 1 unit of the currency, e.g. 0.92" />
                <SelectWithOther label="Method" name="method" defaultValue="bank-transfer" otherValue="other" options={[["bank-transfer", "Bank transfer"], ["cash", "Cash"], ["card", "Card"], ["crypto", "Crypto-assets"]]} />
                <CountryField label="Funds come from (country)" name="fromCountry" />
                <Field label="Description" name="description" hint="E.g. deposit for the flat at Gedimino pr. 1" />
                <Field label="Direction" name="direction">
                  <select name="direction" className={sel} aria-label="Direction" defaultValue=""><option value="">—</option><option value="in">Received (in)</option><option value="out">Paid out (out)</option></select>
                </Field>
                <Field label="Counterparty name" name="counterpartyName" hint="Who paid or was paid, if not the client" />
                <Field label="Your reference" name="externalId" hint="Invoice number or bank reference" />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="thirdPartyPayer" /> Paid by someone other than the client</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="occasional" /> Occasional transaction (no ongoing relationship)</label>
                <div className="sm:col-span-2"><Submit>Record Transaction</Submit></div>
              </ActionForm>
          </details>
        )}
        {edit && (
          <Link href="/app/transactions/import" className="self-start rounded-2xl border border-border p-4 font-semibold hover:border-accent">Import from CSV or Excel</Link>
        )}
      </div>

      <form className="flex flex-wrap items-center gap-2" role="search" aria-label="Search transactions">
        <input name="q" defaultValue={q} placeholder="Search client or description" aria-label="Search transactions" className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        <select name="status" defaultValue={status} aria-label="Status" className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          {FILTERS.map((f) => <option key={f} value={f}>{f === "all" ? "All statuses" : STATUS[f][0]}</option>)}
        </select>
        <select name="rule" defaultValue={rule} aria-label="Rule" className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="">All rules</option>
          {RULE_IDS.map((id) => <option key={id} value={id}>{id} {RULES[id].label}</option>)}
        </select>
        <select name="severity" defaultValue={severity} aria-label="Severity" className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="">Any severity</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
        </select>
        {sp.client && <input type="hidden" name="client" value={sp.client} />}
        <button className="rounded-full border border-border px-4 py-2 text-sm hover:border-accent">Apply</button>
        {(q || status !== "all" || sp.client || rule || severity || sp.batch) && <Link href="/app/transactions" className="px-2 text-sm text-accent underline">Clear</Link>}
      </form>

      {data.all.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} title="No transactions here" text="Record payments with Log Transaction or on a case. Cash, high-value and unusual payments are flagged automatically." />
      ) : (
        <ul className="space-y-2">
          {data.all.map((t) => {
            const flags = normalizeFlags(t.flags);
            const [label, tone] = STATUS[t.monitorStatus] ?? STATUS.pending;
            const amount = Number(t.amountEUR);
            const fileId = data.files.get(t.customerId);
            const orange = (t.method === "cash" && amount >= data.firm.txCashThresholdEUR) || amount >= data.firm.txHighValueThresholdEUR;
            return (
              <li key={t.id} className={`rounded-2xl border p-4 text-sm ${t.monitorStatus === "flagged" ? "border-red-300 dark:border-red-800" : t.monitorStatus === "pending" && flags.length ? "border-amber-300 dark:border-amber-800" : "border-border"}`} data-testid="transaction">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <p>
                      <span className={`font-semibold ${orange ? "text-orange-700 dark:text-orange-300" : ""}`}>{eur(amount)}</span>{" "}
                      <span className="text-muted">· {t.method}{t.fromCountry ? ` · from ${t.fromCountry}` : ""}{t.thirdPartyPayer ? " · third-party payer" : ""} · {toIsoDate(t.date)}</span>
                    </p>
                    <p>
                      {fileId ? <Link href={`/app/clients/${fileId}?tab=transactions`} className="font-medium text-accent hover:underline">{data.names.get(t.customerId) ?? "Client"}</Link> : <span className="font-medium">{data.names.get(t.customerId) ?? "Client"}</span>}
                      <span className="text-muted"> · <Link href={`/app/matters/${t.matter.id}`} className="hover:underline">{t.matter.title}</Link></span>
                    </p>
                    {t.description && <p className="text-muted">{t.description}</p>}
                  </div>
                  <Chip tone={tone}>{label}</Chip>
                </div>
                {flags.length > 0 && (
                  <ul className="mt-2 space-y-0.5" data-testid="flags">{flags.map((f, i) => <li key={i} className={SEV_TONE[f.severity] ?? ""}><span className="font-semibold">{f.rule}</span> · {f.severity} · {f.message}</li>)}</ul>
                )}
                {t.reviewNote && <p className="mt-2 whitespace-pre-line text-xs text-muted">{t.reviewNote}</p>}
                {t.caseId && can(r, "case.view") && <p className="mt-1 text-xs"><Link href={`/app/cases/${t.caseId}`} className="text-accent underline">Open the internal report</Link></p>}
                {edit && t.monitorStatus !== "investigated" && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-accent">Review</summary>
                    <ActionForm action={reviewTransactionAction.bind(null, t.id)} className="mt-2 space-y-2 rounded-lg border border-border p-3">
                      <fieldset className="flex flex-wrap gap-4">
                        <legend className="sr-only">Decision</legend>
                        {manage && t.monitorStatus !== "cleared" && <label className="flex items-center gap-2"><input type="radio" name="action" value="clear" /> Mark as reviewed (legitimate)</label>}
                        {manage && <label className="flex items-center gap-2"><input type="radio" name="action" value="investigate" /> Mark as investigated</label>}
                        {t.monitorStatus !== "flagged" && <label className="flex items-center gap-2"><input type="radio" name="action" value="flag" /> Flag for review</label>}
                        {can(r, "case.raise") && <label className="flex items-center gap-2"><input type="radio" name="action" value="raise" /> Create investigation (internal suspicion report to the Compliance Officer)</label>}
                      </fieldset>
                      <Field label="Reason" name="note" required hint="At least 20 characters. Kept in the record and the audit trail." />
                      <Submit variant="secondary">Record decision</Submit>
                    </ActionForm>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
