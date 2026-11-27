import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { appointeeName, ensureAppointments, isOnePersonFirm } from "@/lib/server/governance";
import type { GeneratedDoc } from "@/lib/docs/model";
import { ActionForm, Submit } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { DocView } from "@/components/doc-view";
import { annualReportAction, approveAnnualReportAction, inviteAndAppointAction } from "../records-actions";
import { reassignDutyAction, saveAppointmentsAction, setDeputyAction } from "./actions";
import { InviteAppoint } from "@/components/invite-appoint";
import { AppointmentsForm } from "@/components/appointments-form";
import { resolveDuties, withoutArticles, type DutyRole, type Holder } from "@/lib/firm/responsibilities";
import { Help, PageTitle } from "@/components/help";
import { ROLE_HELP } from "@/components/role-help";

const FN = { "compliance-manager": "Compliance Manager", "compliance-officer": "Compliance Officer" } as const;
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const small = "rounded border border-border bg-background px-2 py-1 text-sm";
const below = "[&>[role=alert]]:order-last [&>[role=alert]]:basis-full [&>[role=status]]:order-last [&>[role=status]]:basis-full";

export default async function GovernancePage() {
  const s = await requireUser();
  const data = await withTenant(s.firm.id, async (tx) => {
    await ensureAppointments(tx, s.firm.id);
    return {
      appts: await tx.appointment.findMany({ orderBy: { fromDate: "desc" } }),
      users: await tx.user.findMany({ where: { deactivatedAt: null, external: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      allUsers: new Map((await tx.user.findMany()).map((u) => [u.id, u.name])),
      reports: await tx.policyDocument.findMany({ where: { kind: "annual-report", status: { in: ["DRAFT", "IN_FORCE"] } }, orderBy: { version: "desc" } }),
      duties: ((await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id }, select: { responsibilities: true } })).responsibilities ?? {}) as Record<string, unknown>,
      onePerson: await isOnePersonFirm(tx, s.firm.id),
    };
  });
  const mgmt = can(s.user.roles, "approve.management");
  const manageDuties = can(s.user.roles, "approve.compliance");
  const current = { "compliance-manager": data.appts.find((a) => a.function === "compliance-manager" && !a.toDate), "compliance-officer": data.appts.find((a) => a.function === "compliance-officer" && !a.toDate) };
  const cm = current["compliance-manager"], co = current["compliance-officer"];
  const samePerson = !!cm && !!co && (cm.userId ? cm.userId === co.userId : !!cm.email && cm.email === co.email);
  const holder = (fn: DutyRole): Holder | null => { const a = current[fn]; return a ? { userId: a.userId, name: appointeeName(a, data.allUsers) } : null; };
  const active = new Map(data.users.map((u) => [u.id, u.name]));
  const rows = resolveDuties(data.duties, { "compliance-manager": holder("compliance-manager"), "compliance-officer": holder("compliance-officer") }, active);
  const uncovered = rows.filter((r) => r.source === "none").length;
  const pendingNotice = (["compliance-manager", "compliance-officer"] as const).filter((fn) => current[fn]?.needsNotice && !current[fn]?.notifiedAt);
  const informed = (["compliance-manager", "compliance-officer"] as const).filter((fn) => current[fn]?.needsNotice && current[fn]?.notifiedAt);
  const history = data.appts.filter((a) => a.toDate);
  const roleName = (fn: DutyRole) => (samePerson ? "Compliance Manager & Officer" : FN[fn]);

  const table = (editable: boolean) => (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-muted">
          <tr><th className="px-3 py-2 font-medium">Duty</th><th className="px-3 py-2 font-medium">Who</th>{editable && <th className="px-3 py-2"><span className="sr-only">Change</span></th>}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.key} data-testid="responsibility" className="align-top">
              <td className="px-3 py-2.5"><span className="block font-medium">{withoutArticles(r.label)}</span><span className="block text-xs text-muted">{withoutArticles(r.hint)}</span></td>
              <td className="px-3 py-2.5">
                {r.source === "outsourced" ? <>Outside provider · <Link href="/app/firm/outsourcing" className="text-accent underline">Outsourcing</Link></>
                  : r.source === "none" ? <span className="text-amber-800 dark:text-amber-300">Nobody yet: appoint the {FN[r.role]}</span>
                  : <>{r.owners.join(", ")}<span className="block text-xs text-muted">{r.source === "role" ? roleName(r.role) : "Reassigned"}</span></>}
                {r.deputies.length ? <span className="block text-xs text-muted">Deputy: {r.deputies.join(", ")}</span> : null}
              </td>
              {editable && (
                <td className="px-3 py-2.5 text-right">
                  {r.locked ? (
                    mgmt && data.users.length > 1 ? (
                      <details className="inline-block text-left">
                        <summary className="cursor-pointer list-none text-accent underline [&::-webkit-details-marker]:hidden">{r.deputies.length ? "Change deputy" : "Add deputy"}</summary>
                        <ActionForm action={setDeputyAction.bind(null, r.key)} className={`mt-2 flex flex-wrap items-center gap-2 ${below}`}>
                          <select name="deputy" defaultValue={r.deputyIds[0] ?? ""} className={small} aria-label={`Deputy: ${withoutArticles(r.label)}`}>
                            <option value="">No deputy</option>
                            {data.users.filter((u) => u.id !== holder(r.role)?.userId).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                          </select>
                          <Submit variant="secondary">Save</Submit>
                        </ActionForm>
                      </details>
                    ) : <span className="text-xs text-muted">Stays with the {FN[r.role]}</span>
                  ) : (
                    <details className="inline-block text-left">
                      <summary className="cursor-pointer list-none text-accent underline [&::-webkit-details-marker]:hidden">Reassign</summary>
                      <ActionForm action={reassignDutyAction.bind(null, r.key)} className={`mt-2 flex flex-wrap items-center gap-2 ${below}`}>
                        <select name="to" defaultValue={r.source === "outsourced" ? "outsourced" : r.to[0] ?? "role"} className={small} aria-label={`Reassign: ${withoutArticles(r.label)}`}>
                          <option value="role">{FN[r.role]}{holder(r.role) ? ` (${holder(r.role)!.name})` : ""}</option>
                          {data.users.filter((u) => u.id !== holder(r.role)?.userId).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                          <option value="outsourced">An outside provider</option>
                        </select>
                        <Submit variant="secondary">Save</Submit>
                      </ActionForm>
                    </details>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <PageTitle className="text-3xl" help={<>Who is responsible for AML in your firm: the two appointments the law requires (in a small firm one person may hold both), and who does each AML duty. Duties follow the two roles automatically; hand one to a colleague or a provider if you need to. Supervisors check both.</>}>Roles and duties</PageTitle>
      </div>

      <section className="space-y-3 rounded-2xl border border-border p-4 text-sm" id="appointments" data-testid="appointments">
        <h2 className="text-xl font-semibold">Appointments</h2>
        {samePerson ? (
          <p className="flex flex-wrap items-center gap-1.5" data-testid="appointment-same">
            <strong className="inline-flex items-center gap-1">Compliance Manager<Help label="What does the Compliance Manager do?">{ROLE_HELP["compliance-manager"]}</Help></strong>
            <strong className="inline-flex items-center gap-1">&amp; Officer<Help label="What does the Compliance Officer do?">{ROLE_HELP["compliance-officer"]}</Help>:</strong>
            {appointeeName(cm!, data.allUsers)} since {day(cm!.fromDate > co!.fromDate ? cm!.fromDate : co!.fromDate)}
          </p>
        ) : (
          (["compliance-manager", "compliance-officer"] as const).map((fn) => (
            <p key={fn} className="flex flex-wrap items-center gap-1.5" data-testid={`appointment-${fn}`}>
              <strong className="inline-flex items-center gap-1">{FN[fn]}<Help label={`What does the ${FN[fn]} do?`}>{ROLE_HELP[fn]}</Help>:</strong>
              {current[fn] ? <>{appointeeName(current[fn]!, data.allUsers)} since {day(current[fn]!.fromDate)}</> : <span className="text-amber-800 dark:text-amber-300">not appointed</span>}
            </p>
          ))
        )}

        {pendingNotice.length > 0 && manageDuties && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <span>Change saved. Tell your supervisor:</span>
            {pendingNotice.map((fn) => (
              <Link key={fn} href={`/app/firm/governance/notify/${current[fn]!.id}`} className="inline-flex rounded-full bg-brand px-4 py-1.5 font-semibold text-brand-ink hover:brightness-105" data-testid={`inform-regulator-${fn}`}>
                Inform the Regulator{pendingNotice.length > 1 ? ` (${FN[fn]})` : ""}
              </Link>
            ))}
          </div>
        )}
        {informed.map((fn) => (
          <p key={fn} className="text-muted">{FN[fn]}: regulator informed on {day(current[fn]!.notifiedAt!)} · <Link href={`/app/firm/governance/notify/${current[fn]!.id}`} className="text-accent underline">View the email</Link></p>
        ))}

        {mgmt && (
          <details className="group">
            <summary className="inline-flex cursor-pointer list-none rounded-full border border-border px-4 py-1.5 font-semibold hover:border-accent [&::-webkit-details-marker]:hidden" data-testid="appointments-change">Change</summary>
            <div className="mt-3 space-y-3">
              <AppointmentsForm action={saveAppointmentsAction} users={data.users} managerId={cm?.userId ?? null} officerId={co?.userId ?? null} />
              <InviteAppoint action={inviteAndAppointAction.bind(null, "compliance-manager")} label="Compliance Manager" withReason={!!cm} title="Compliance Manager not on the app yet? Invite and appoint" />
              <InviteAppoint action={inviteAndAppointAction.bind(null, "compliance-officer")} label="Compliance Officer" withReason={!!co} title="Compliance Officer not on the app yet? Invite and appoint" />
            </div>
          </details>
        )}

        {history.length > 0 && (
          <details className="text-muted">
            <summary className="cursor-pointer">Earlier appointments</summary>
            <ul className="mt-1 space-y-0.5">
              {history.map((a) => <li key={a.id}>{FN[a.function as DutyRole]}: {appointeeName(a, data.allUsers)}, {day(a.fromDate)} – {day(a.toDate!)}{a.reason ? ` (${a.reason})` : ""}</li>)}
            </ul>
          </details>
        )}
      </section>

      <section className="space-y-3" id="duties">
        <h2 className="text-xl font-semibold">Who does each duty</h2>
        {uncovered ? (
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{uncovered} of {rows.length} duties have nobody: appoint both roles above.</p>
        ) : (
          <p className="text-sm font-semibold text-green-800 dark:text-green-300" data-testid="duties-covered">All {rows.length} duties covered ✓</p>
        )}
        {data.onePerson && !uncovered ? (
          <>
            <p className="text-sm text-muted">They&apos;re all with you as Compliance Manager &amp; Officer. Nothing to do here.</p>
            <details className="text-sm"><summary className="cursor-pointer text-accent underline">See the list</summary><div className="mt-2">{table(false)}</div></details>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Each duty follows its role. Hand training or alert review to a colleague with Reassign; if a provider does it, choose &ldquo;An outside provider&rdquo; and record them on the <Link href="/app/firm/outsourcing" className="text-accent underline">Outsourcing</Link> page. Deciding on suspicious activity reports and approving high-risk clients stay with their role; you can add a deputy. Data protection is assigned on the <Link href="/app/firm/privacy" className="text-accent underline">Data Protection</Link> page.</p>
            {table(manageDuties)}
          </>
        )}
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
            {r.status === "DRAFT" && mgmt && <ActionButton action={approveAnnualReportAction.bind(null, r.id)} variant="primary">Approve (Compliance Manager)</ActionButton>}
          </div>
        ))}
      </section>
    </div>
  );
}
