import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { ensureAppointments } from "@/lib/server/governance";
import type { GeneratedDoc } from "@/lib/docs/model";
import { ActionForm, Field, Submit } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { StepUpLink } from "@/components/step-up";
import { DocView } from "@/components/doc-view";
import { annualReportAction, appointAction, approveAnnualReportAction } from "../records-actions";

const FN = { "compliance-manager": "Compliance manager (member of the management body)", "compliance-officer": "Compliance officer" } as const;

export default async function GovernancePage() {
  const s = await requireUser();
  const data = await withTenant(s.firm.id, async (tx) => {
    await ensureAppointments(tx, s.firm.id);
    return {
      appts: await tx.appointment.findMany({ orderBy: { fromDate: "desc" } }),
      users: await tx.user.findMany({ where: { deactivatedAt: null, external: false } }),
      allUsers: new Map((await tx.user.findMany()).map((u) => [u.id, u.name])),
      reports: await tx.policyDocument.findMany({ where: { kind: "annual-report", status: { in: ["DRAFT", "IN_FORCE"] } }, orderBy: { version: "desc" } }),
    };
  });
  const mgmt = can(s.user.roles, "approve.management");
  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="text-2xl font-semibold">Governance</h1>
      <p className="text-sm text-muted">AMLR Art. 11. In a small firm one person may hold both functions.</p>
      {(Object.keys(FN) as (keyof typeof FN)[]).map((fn) => {
        const current = data.appts.find((a) => a.function === fn && !a.toDate);
        return (
          <section key={fn} className="space-y-2 rounded-md border border-border p-4 text-sm">
            <h2 className="font-semibold">{FN[fn]}</h2>
            <p>{current ? `${data.allUsers.get(current.userId)} since ${current.fromDate.toISOString().slice(0, 10)}` : "Not appointed."}</p>
            {data.appts.filter((a) => a.function === fn && a.toDate).map((a) => (
              <p key={a.id} className="text-muted">Previously {data.allUsers.get(a.userId)}: {a.fromDate.toISOString().slice(0, 10)} – {a.toDate!.toISOString().slice(0, 10)}{a.reason ? ` (${a.reason})` : ""}</p>
            ))}
            {mgmt && (
              <ActionForm action={appointAction.bind(null, fn)} className="grid gap-3 sm:grid-cols-3">
                <Field label="Appoint" name="userId">
                  <select name="userId" aria-label={`Appoint ${fn}`} className="w-full rounded border border-border bg-background px-3 py-2 text-sm">{data.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                </Field>
                <Field label="Reason for the change" name="reason" />
                <div className="flex items-end gap-2"><Submit variant="secondary">Appoint</Submit><StepUpLink /></div>
              </ActionForm>
            )}
          </section>
        );
      })}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Annual compliance report</h2>
          {can(s.user.roles, "approve.compliance") && <ActionButton action={annualReportAction} variant="primary">Generate from system data</ActionButton>}
        </div>
        {data.reports.map((r) => (
          <div key={r.id} className={`space-y-3 rounded-md border p-4 ${r.status === "DRAFT" ? "border-amber-400" : "border-border"}`}>
            <div className="flex items-center justify-between"><strong className="text-sm">{r.status === "DRAFT" ? "Draft" : "Approved"} v{r.version}</strong><a className="text-sm text-accent underline" href={`/api/docs/policy/${r.id}`}>Download PDF</a></div>
            <DocView doc={r.content as unknown as GeneratedDoc} />
            {r.status === "DRAFT" && mgmt && <ActionButton action={approveAnnualReportAction.bind(null, r.id)} variant="primary">Approve (compliance manager)</ActionButton>}
          </div>
        ))}
      </section>
    </div>
  );
}
