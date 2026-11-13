import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { partiesDueForDeletion } from "@/lib/server/retention";
import { ActionForm, Submit } from "@/components/form";
import { StepUpLink } from "@/components/step-up";
import { purgeAction } from "./actions";

export default async function RecordsPage() {
  const s = await requireUser("records.purge");
  const due = await withTenant(s.firm.id, (tx) => partiesDueForDeletion(tx));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Records and retention</h1>
      <p className="max-w-3xl text-sm text-muted">
        Client records are kept for 5 years (or longer if your Country Profile says so) from the end of the relationship, the occasional
        transaction or the refusal, then deleted (AMLR Art. 77). Records under a legal hold are not listed. Deletion is permanent. Afterwards the
        audit log shows only that a record was deleted, by whom and when. It contains no client data.
      </p>
      {due.length === 0 ? (
        <p className="text-sm">No records are due for deletion.</p>
      ) : (
        <ActionForm action={purgeAction}>
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
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
