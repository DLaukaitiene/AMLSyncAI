import { redirect } from "next/navigation";
import { ActionForm, Field, Submit } from "@/components/form";
import { getSession } from "@/lib/server/session";
import { mfaAction } from "../../actions";

export default async function MfaPage() {
  const s = await getSession();
  if (!s || s.stage !== "MFA_PENDING") redirect("/login");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Two-factor authentication</h1>
      <ActionForm action={mfaAction}>
        <Field label="6-digit code from your authenticator app" name="code" inputMode="numeric" autoComplete="one-time-code" required hint="Lost your phone? Enter one of your recovery codes instead." />
        <Submit>Sign in</Submit>
      </ActionForm>
    </div>
  );
}
