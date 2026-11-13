import { cancelSelfRecovery } from "@/lib/server/auth/flows";
import { ActionForm, Submit } from "@/components/form";

export default async function CancelRecovery({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const action = async () => {
    "use server";
    return (await cancelSelfRecovery(token)) ? { message: "Recovery cancelled. Consider changing the password of the account." } : { error: "Nothing to cancel." };
  };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Cancel two-factor recovery</h1>
      <ActionForm action={action}><Submit variant="danger">Cancel the recovery</Submit></ActionForm>
    </div>
  );
}
