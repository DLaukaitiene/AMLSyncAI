import { ActionForm, Field, Submit } from "@/components/form";
import { resetAction } from "../../actions";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <ActionForm action={resetAction.bind(null, token)}>
        <Field label="New password" name="password" type="password" required autoComplete="new-password" hint="At least 12 characters." />
        <Submit>Save password</Submit>
      </ActionForm>
    </div>
  );
}
