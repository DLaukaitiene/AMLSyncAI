import { ActionForm, Field, Honeypot, Submit } from "@/components/form";
import { findInvitation } from "@/lib/server/auth/flows";
import { acceptInviteAction } from "../../actions";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await findInvitation(token);
  if (!inv) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Invitation not valid</h1>
        <p className="text-sm text-muted">This invitation has expired, was already used or was withdrawn. Ask for a new one.</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Join {inv.firmName}</h1>
      <p className="text-sm text-muted">
        You&apos;re joining as <strong>{inv.name}</strong> ({inv.email}){inv.external ? ", as an external user" : ""}.
      </p>
      <ActionForm action={acceptInviteAction.bind(null, token)}>
        <Honeypot />
        <Field label="Choose a password" name="password" type="password" required autoComplete="new-password" hint="At least 12 characters." />
        <Submit>Accept invitation</Submit>
      </ActionForm>
    </div>
  );
}
