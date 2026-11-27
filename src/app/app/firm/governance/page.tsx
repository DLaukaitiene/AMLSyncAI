import Link from "next/link";
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
import { RESPONSIBILITIES } from "@/lib/firm/responsibilities";
import { saveResponsibilitiesAction } from "../../team/training-register/actions";
import { PageTitle } from "@/components/help";

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
      active: await tx.user.findMany({ where: { deactivatedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      duties: ((await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id }, select: { responsibilities: true } })).responsibilities ?? {}) as Record<string, string[]>,
    };
  });
  const mgmt = can(s.user.roles, "approve.management");
  const manageDuties = can(s.user.roles, "approve.compliance");
  const unassigned = RESPONSIBILITIES.filter((r) => !(data.duties[r.key] ?? []).some((id) => data.active.some((u) => u.id === id))).length;
  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <PageTitle className="text-3xl" help={<>Who is responsible for AML in your firm: the two appointments the law requires (AMLR Art. 11; in a small firm one person may hold both), and a named person for every AML duty. Supervisors check both.</>}>Roles and duties</PageTitle>
      </div>
      <h2 className="text-xl font-semibold" id="appointments">Appointments</h2>
      {(Object.keys(FN) as (keyof typeof FN)[]).map((fn) => {
        const current = data.appts.find((a) => a.function === fn && !a.toDate);
        return (
          <section key={fn} className="space-y-2 rounded-xl border border-border p-4 text-sm" data-testid={`appointment-${fn}`}>
            <h2 className="font-semibold">{FN[fn]}</h2>
            <p>{current ? `${data.allUsers.get(current.userId)} since ${current.fromDate.toISOString().slice(0, 10)}` : "Not appointed."}</p>
            {current && (current.notifiedAt
              ? <p className="text-muted">Regulator informed on {current.notifiedAt.toISOString().slice(0, 10)} · <Link href={`/app/firm/governance/notify/${current.id}`} className="text-accent underline">View the email</Link></p>
              : manageDuties && <Link href={`/app/firm/governance/notify/${current.id}`} className="inline-flex rounded-full bg-brand px-4 py-1.5 font-semibold text-brand-ink hover:brightness-105" data-testid={`inform-regulator-${fn}`}>Inform the Regulator</Link>)}
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

      <section className="space-y-3" id="duties">
        <h2 className="text-xl font-semibold">Who does each duty</h2>
        <p className="text-sm text-muted">{unassigned ? <strong className="text-amber-800 dark:text-amber-300">{unassigned} dut{unassigned === 1 ? "y has" : "ies have"} nobody assigned.</strong> : "Every duty has someone assigned."}</p>
        <ActionForm action={saveResponsibilitiesAction}>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-muted">
                <tr><th className="px-3 py-2 font-medium">Duty</th>{data.active.map((u) => <th key={u.id} className="px-3 py-2 text-center font-medium">{u.name}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {RESPONSIBILITIES.map((r) => {
                  const ids = data.duties[r.key] ?? [];
                  return (
                    <tr key={r.key} data-testid="responsibility">
                      <td className="px-3 py-2"><span className="block font-medium">{r.label}</span><span className="block text-xs text-muted">{r.hint}</span></td>
                      {data.active.map((u) => (
                        <td key={u.id} className="px-3 py-2 text-center">
                          <input type="checkbox" name={`${r.key}`} value={u.id} defaultChecked={ids.includes(u.id)} disabled={!manageDuties} aria-label={`${u.name}: ${r.label}`} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {manageDuties && <Submit>Save responsibilities</Submit>}
        </ActionForm>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Annual compliance report</h2>
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
