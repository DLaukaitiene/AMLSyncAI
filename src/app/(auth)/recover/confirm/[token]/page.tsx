import { confirmSelfRecovery } from "@/lib/server/auth/flows";
import { ActionForm, Submit } from "@/components/form";
import { redirect } from "next/navigation";

export default async function ConfirmRecovery({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const action = async () => {
    "use server";
    const r = await confirmSelfRecovery(token);
    if (!r.ok) return { error: "This link is invalid or has expired." };
    redirect(`/login?recovery=${encodeURIComponent(r.notBefore ?? "")}`);
  };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Confirm two-factor recovery</h1>
      <ActionForm action={action}><Submit>Confirm it was me</Submit></ActionForm>
    </div>
  );
}
