import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { ActionForm, Field, Submit } from "@/components/form";
import { outsourcingAction } from "../records-actions";

const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "—");

export default async function OutsourcingPage() {
  const s = await requireUser();
  const rows = await withTenant(s.firm.id, (tx) => tx.outsourcingArrangement.findMany({ orderBy: { createdAt: "desc" } }));
  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="text-2xl font-semibold">Outsourcing register</h1>
      <p className="text-sm text-muted">
        AMLR Art. 18: notify your supervisor before outsourcing starts and sign a written agreement. You stay responsible. Risk decisions, accepting clients
        and reporting can&apos;t be outsourced. Using AMLSync Expert is outsourcing.
      </p>
      {rows.length === 0 ? <p className="text-sm">No outsourcing arrangements.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted"><tr><th className="py-1 pr-3 font-normal">Provider</th><th className="py-1 pr-3 font-normal">Tasks</th><th className="py-1 pr-3 font-normal">Agreement</th><th className="py-1 pr-3 font-normal">Supervisor notified</th><th className="py-1 font-normal">Start</th></tr></thead>
            <tbody className="divide-y divide-border">{rows.map((r) => (
              <tr key={r.id}><td className="py-1 pr-3">{r.provider}</td><td className="py-1 pr-3">{r.tasks}</td><td className="py-1 pr-3">{d(r.agreementSignedOn)}</td><td className={`py-1 pr-3 ${r.supervisorNotifiedOn ? "" : "text-red-700 dark:text-red-300"}`}>{r.supervisorNotifiedOn ? d(r.supervisorNotifiedOn) : "not yet"}</td><td className="py-1">{d(r.startOn)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {can(s.user.roles, "approve.compliance") && (
        <ActionForm action={outsourcingAction} className="max-w-xl space-y-3">
          <h2 className="text-lg font-semibold">Add an arrangement</h2>
          <Field label="Provider" name="provider" required />
          <Field label="Tasks outsourced" name="tasks" required hint="e.g. review of screening hits, preparation of EDD memos" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Agreement signed" name="agreementSignedOn" type="date" />
            <Field label="Supervisor notified" name="supervisorNotifiedOn" type="date" />
            <Field label="Start" name="startOn" type="date" />
          </div>
          <Field label="Notes" name="notes" />
          <Submit>Add</Submit>
        </ActionForm>
      )}
    </div>
  );
}
