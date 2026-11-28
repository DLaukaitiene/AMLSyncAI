import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import type { GeneratedDoc } from "@/lib/docs/model";
import { ActionButton } from "@/components/action-button";
import { DocView } from "@/components/doc-view";
import { annualReportAction, approveAnnualReportAction } from "../records-actions";

/** Annual compliance report: the Compliance Officer's yearly report to management, built from the app's data. */
export default async function AnnualReportPage() {
  const s = await requireUser();
  const reports = await withTenant(s.firm.id, (tx) => tx.policyDocument.findMany({ where: { kind: "annual-report", status: { in: ["DRAFT", "IN_FORCE"] } }, orderBy: { version: "desc" } }));
  const mgmt = can(s.user.roles, "approve.management");
  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl">Annual Report</h1>
          <p className="text-muted">Once a year the Compliance Officer reports to management on how anti-money-laundering work went: clients checked, alerts, reports, training and what to improve. AMLSync builds it from the data in the app; the Compliance Manager approves it.</p>
        </div>
        {can(s.user.roles, "approve.compliance") && <ActionButton action={annualReportAction} variant="primary">Generate from system data</ActionButton>}
      </div>
      {reports.length === 0 && <p className="text-sm text-muted">No report yet. Generate one to see this year&apos;s numbers.</p>}
      {reports.map((r) => (
        <div key={r.id} className={`space-y-3 rounded-md border p-4 ${r.status === "DRAFT" ? "border-amber-400" : "border-border"}`}>
          <div className="flex items-center justify-between"><strong className="text-sm">{r.status === "DRAFT" ? "Draft" : "Approved"} v{r.version}</strong><a className="text-sm text-accent underline" href={`/api/docs/policy/${r.id}`}>Download PDF</a></div>
          <DocView doc={r.content as unknown as GeneratedDoc} />
          {r.status === "DRAFT" && mgmt && <ActionButton action={approveAnnualReportAction.bind(null, r.id)} variant="primary">Approve (Compliance Manager)</ActionButton>}
        </div>
      ))}
    </div>
  );
}
