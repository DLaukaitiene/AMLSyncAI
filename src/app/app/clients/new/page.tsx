import { requireUser } from "@/lib/server/session";
import { ActionForm, Submit } from "@/components/form";
import { can } from "@/lib/auth/permissions";
import { PartyFields } from "@/components/party-fields";
import { createClientAction } from "../actions";
import { Help } from "@/components/help";

export default async function NewClientPage() {
  const s = await requireUser("client.edit");
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl">Add Client</h1>
      <div className="rounded-2xl border border-accent/40 bg-brand/10 p-4 text-sm">
        <p className="font-semibold">Quickest way: just the name and an email.</p>
        <div className="flex items-start gap-2 text-muted"><p>Only the name is needed: the client can fill in the rest through a secure link.</p><Help>We send the client a secure link to fill in their details, upload documents and verify their identity. Everything else on this form is optional. The client is screened at once and the risk is calculated from the data.</Help></div>
      </div>
      <ActionForm action={createClientAction}>
        <PartyFields chooser canOverrideRisk={can(s.user.roles, "risk.override")} />
        <label className="flex items-start gap-2 rounded-xl border border-border bg-surface p-3 text-sm">
          <input type="checkbox" name="sendLink" defaultChecked className="mt-1" />
          <span><span className="font-semibold">Send the client their secure link now</span><span className="block text-xs text-muted">Sent to the address above, if given: the client fills in the rest, uploads documents and verifies their identity. Reminders go out on day 1, 3 and 7.</span></span>
        </label>
        <Submit>Create client</Submit>
      </ActionForm>
    </div>
  );
}
