import { PowChallenge } from "@/components/pow-challenge";
import { ActionForm, Field, Honeypot, Submit } from "@/components/form";
import { recoverAction } from "../actions";

export default function RecoverPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Lost your phone and recovery codes?</h1>
      <p className="text-sm text-muted">
        In a firm with several users, ask another Owner or Compliance Officer to reset your two-factor authentication in Team. If you&apos;re the only
        Owner, confirm your password here. You&apos;ll get an email to confirm, and you can set up two-factor again after 72 hours. The firm&apos;s Owner is
        notified and can cancel.
      </p>
      <ActionForm action={recoverAction}>
        <Honeypot />
        <PowChallenge purpose="recover" />
        <Field label="Email" name="email" type="email" required autoComplete="username" />
        <Field label="Password" name="password" type="password" required autoComplete="current-password" />
        <Submit>Start recovery</Submit>
      </ActionForm>
    </div>
  );
}
