import { requireUser } from "@/lib/server/session";
import { ActionForm, Field, Submit } from "@/components/form";
import { PartyFields } from "@/components/party-fields";
import { createClientAction } from "../actions";

export default async function NewClientPage() {
  await requireUser("client.edit");
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl">Add Client</h1>
      <div className="rounded-2xl border border-accent/40 bg-brand/10 p-4 text-sm">
        <p className="font-semibold">Quickest way: just the name and an email.</p>
        <p className="text-muted">Create the client and we send them a secure link — they fill in the rest, upload documents and verify their identity. Everything else below is optional. The client is screened at once and the risk is calculated from the data.</p>
      </div>
      <ActionForm action={createClientAction}>
        <PartyFields chooser />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="National ID number" name="nationalId" hint="Stored encrypted." autoComplete="off" />
          <Field label="Tax ID" name="taxId" hint="Stored encrypted." autoComplete="off" />
        </div>
        <Field label="Purpose and intended nature of the relationship" name="purpose" hint="AMLR Art. 25, e.g. annual accounts and tax returns for a trading company." />
        <label className="flex items-start gap-2 rounded-xl border border-border bg-surface p-3 text-sm">
          <input type="checkbox" name="sendLink" defaultChecked className="mt-1" />
          <span><span className="font-semibold">Send the client their secure link now</span><span className="block text-xs text-muted">Sent to the address above, if given: the client fills in the rest, uploads documents and verifies their identity. Reminders go out on day 1, 3 and 7.</span></span>
        </label>
        <Submit>Create client</Submit>
      </ActionForm>
    </div>
  );
}
