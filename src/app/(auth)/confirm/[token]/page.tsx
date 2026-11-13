import { ActionForm, Submit } from "@/components/form";
import { confirmAction } from "../../actions";

// The link opens a page with a button instead of confirming on GET, so email
// security scanners that prefetch links can't use up the one-time token.
export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const action = async () => {
    "use server";
    return confirmAction(token);
  };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Confirm your email</h1>
      <p className="text-sm text-muted">Confirm to activate your firm. Next you&apos;ll set up two-factor authentication.</p>
      <ActionForm action={action}>
        <Submit>Confirm and continue</Submit>
      </ActionForm>
    </div>
  );
}
