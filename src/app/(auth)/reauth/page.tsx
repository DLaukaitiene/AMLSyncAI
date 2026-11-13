import { redirect } from "next/navigation";
import { ActionForm, Field, Submit } from "@/components/form";
import { getSession } from "@/lib/server/session";
import { reauthAction } from "../actions";

export default async function ReauthPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE") redirect("/login");
  const { next } = await searchParams;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Confirm it&apos;s you</h1>
      <p className="text-sm text-muted">This action needs a fresh code from your authenticator app.</p>
      <ActionForm action={reauthAction}>
        <input type="hidden" name="next" value={next ?? "/app"} />
        <Field label="6-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" required />
        <Submit>Continue</Submit>
      </ActionForm>
    </div>
  );
}
