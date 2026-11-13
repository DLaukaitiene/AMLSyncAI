import { PowChallenge } from "@/components/pow-challenge";
import { ActionForm, Field, Honeypot, Submit } from "@/components/form";
import { forgotAction } from "../actions";

export default function ForgotPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="text-sm text-muted">You will still need your authenticator app (or a recovery code) to sign in afterwards.</p>
      <ActionForm action={forgotAction}>
        <Honeypot />
        <PowChallenge purpose="reset" />
        <Field label="Email" name="email" type="email" required autoComplete="username" />
        <Submit>Send reset link</Submit>
      </ActionForm>
    </div>
  );
}
