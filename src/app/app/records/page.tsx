import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { partiesDueForDeletion } from "@/lib/server/retention";
import { ActionForm, Submit } from "@/components/form";
import { StepUpLink } from "@/components/step-up";
import { purgeAction } from "./actions";

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const s = await requireUser("records.purge");
  const deleted = Number((await searchParams).deleted ?? NaN);
  const due = await withTenant(s.firm.id, (tx) => partiesDueForDeletion(tx));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Records and retention</h1>
      <p className="max-w-3xl text-sm text-muted">
        Client records are kept for 5 years (or longer if your Country Profile says so) from the end of the relationship, the occasional
        transaction or the refusal, then deleted (AMLR Art. 77). Records under a legal hold are not listed. Deletion is permanent. Afterwards the
        audit log shows only that a record was deleted, by whom and when. It contains no client data.
      </p>
      {Number.isInteger(deleted) && deleted >= 0 && (
        <p role="status" className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100">
          {deleted} client record(s) permanently deleted. The audit log keeps only that a deletion happened.
        </p>
      )}
      {due.length === 0 ? (
        <p className="text-sm">No records are due for deletion.</p>
      ) : (
        <ActionForm action={purgeAction}>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {due.map((d) => (
              <li key={d.partyId} className="px-4 py-2">
                <label className="flex items-center gap-3">
                  <input type="checkbox" name="partyId" value={d.partyId} defaultChecked />
                  <span className="font-medium">{d.displayName}</span>
                  <span className="text-muted">retention ended {d.retentionUntil}</span>
                </label>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confirm" /> I understand the selected records will be permanently deleted
          </label>
          <Submit variant="danger">Delete selected records</Submit>
          <StepUpLink />
        </ActionForm>
      )}
    </div>
  );
}
