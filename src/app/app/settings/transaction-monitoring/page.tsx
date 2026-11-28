import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { ActionForm, Field, Submit } from "@/components/form";
import { RULES, RULE_IDS } from "@/lib/monitoring/rules";
import { monitoringSettingsAction } from "./actions";
import { PageTitle, Help } from "@/components/help";

export const metadata = { title: "Transaction Monitoring settings" };

export default async function TransactionMonitoringSettings() {
  const s = await requireUser("client.view");
  const firm = await withTenant(s.firm.id, (tx) => tx.firm.findUniqueOrThrow({ where: { id: s.firm.id }, select: { usesCash: true, txCashThresholdEUR: true, txHighValueThresholdEUR: true, txCashLegalLimitEUR: true, txCashLimitCheckedAt: true, txRulesOff: true } }));
  const edit = can(s.user.roles, "approve.compliance");
  const off = new Set(firm.txRulesOff ?? []);
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <PageTitle className="text-3xl" help={<>The amounts and rules used to check every payment you record or import. {edit ? "" : "Only the Owner or Compliance Officer can change them."}</>}>Transaction Monitoring settings</PageTitle>
      </div>
      <ActionForm action={monitoringSettingsAction} className="space-y-6">
        <fieldset className="space-y-4 rounded-2xl border border-border p-4" disabled={!edit}>
          <legend className="px-1 font-semibold">Amounts</legend>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="usesCash" defaultChecked={firm.usesCash} /> Our firm accepts or pays cash</label>
          {firm.usesCash && (
            <>
              <Field label="Cash: identify and verify the customer from (EUR)" name="cash" type="number" defaultValue={String(firm.txCashThresholdEUR)}
                hint="From 10 July 2027, the EU AML Regulation (2024/1624) requires you to identify and verify a customer who pays or receives cash of €3,000 or more, in one payment or linked payments. Default €3,000." />
              <div>
                <Field label="Legal cash payment limit (EUR)" name="legal" type="number" defaultValue={String(firm.txCashLegalLimitEUR)}
                  hint="The largest cash payment allowed in your country. Many EU countries set a lower limit than the EU-wide cap of €10,000 that applies from 10 July 2027; the lower national limit always applies. Cash above it is flagged." />
                <p className="mt-1 text-xs text-muted" data-testid="legal-limit-checked">Last checked: {firm.txCashLimitCheckedAt ? firm.txCashLimitCheckedAt.toISOString().slice(0, 10) : "not yet"}</p>
                <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" name="checkedNow" /> I checked the legal limit today</label>
              </div>
            </>
          )}
          <Field label="High-value transaction review from (EUR)" name="high" type="number" defaultValue={String(firm.txHighValueThresholdEUR)}
            hint="Your own internal review level for any payment method. Default €50,000. Not a legal limit." />
        </fieldset>
        <fieldset className="space-y-2 rounded-2xl border border-border p-4" disabled={!edit} data-testid="rule-toggles">
          <legend className="px-1 font-semibold">Rules</legend>
          <div className="flex items-start gap-2 text-sm text-muted"><p>All rules are on by default.</p><Help>Switch a rule off only if it doesn&apos;t fit your business, and record why in your risk assessment. Flags never close by themselves: a person reviews each one with a written note.</Help></div>
          {RULE_IDS.map((id) => (
            <label key={id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name={`rule_${id}`} defaultChecked={!off.has(id)} className="mt-1" />
              <span><span className="font-semibold">{id}</span> {RULES[id].label} <span className="text-muted">({RULES[id].severity})</span></span>
            </label>
          ))}
        </fieldset>
        {edit && <Submit>Save settings</Submit>}
      </ActionForm>
    </div>
  );
}
