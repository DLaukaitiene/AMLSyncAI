import { requireUser } from "@/lib/server/session";
import { ActionForm, Field, Submit } from "@/components/form";
import { PartyFields } from "@/components/party-fields";
import { createClientAction } from "../actions";

export default async function NewClientPage() {
  await requireUser("client.edit");
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">New client</h1>
      <p className="text-sm text-muted">
        Enter what you know now. The client is screened at once, and the risk is calculated from the data. The file can&apos;t be accepted while a
        required item is open.
      </p>
      <ActionForm action={createClientAction}>
        <PartyFields />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="National ID number" name="nationalId" hint="Stored encrypted." autoComplete="off" />
          <Field label="Tax ID" name="taxId" hint="Stored encrypted." autoComplete="off" />
        </div>
        <Field label="Purpose and intended nature of the relationship" name="purpose" hint="AMLR Art. 25, e.g. annual accounts and tax returns for a trading company." />
        <Submit>Create client</Submit>
      </ActionForm>
    </div>
  );
}
