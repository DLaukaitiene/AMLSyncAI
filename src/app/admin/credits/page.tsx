import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, hasRecentMfa } from "@/lib/server/session";
import { isPlatformAdmin } from "@/lib/server/feedback";
import { adminDb } from "@/lib/server/db";
import { ActionForm, Field, Submit, type ActionState } from "@/components/form";
import { StepUpLink } from "@/components/step-up";
import { securityEvent } from "@/lib/server/audit";

async function topUp(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const s = await requireUser();
  if (!isPlatformAdmin(s.user.email)) redirect("/app");
  if (!hasRecentMfa(s)) return { error: "For security, confirm it's you first.", data: { stepUp: "/admin/credits" } };
  const firm = await adminDb.firm.findUnique({ where: { emailDomain: String(fd.get("domain") ?? "").trim().toLowerCase() } });
  const euros = Number(fd.get("euros"));
  const ref = String(fd.get("reference") ?? "").trim();
  if (!firm) return { error: "No firm uses that domain." };
  if (!(euros > 0 && euros <= 10_000)) return { error: "Enter an amount between €1 and €10,000." };
  if (ref.length < 3) return { error: "Enter the payment or invoice reference." };
  await adminDb.creditEntry.create({ data: { firmId: firm.id, amountCents: Math.round(euros * 100), kind: "topup", description: `Top-up (${ref})`, reference: ref } });
  await securityEvent({ firmId: firm.id, kind: "credit-topup", details: { by: s.user.email, euros, ref } });
  revalidatePath("/admin/credits");
  return { message: `Added €${euros.toFixed(2)} to ${firm.name}.` };
}

export default async function CreditsAdmin() {
  const s = await requireUser();
  if (!isPlatformAdmin(s.user.email)) redirect("/app");
  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Top up a firm&apos;s credit</h1>
      <p className="text-sm text-muted">After the bank transfer or invoice payment has arrived. Card payments come once a payment provider is chosen.</p>
      <ActionForm action={topUp}>
        <Field label="Firm email domain" name="domain" required />
        <Field label="Amount (EUR, excl. VAT)" name="euros" type="number" required />
        <Field label="Payment / invoice reference" name="reference" required />
        <Submit>Add credit</Submit>
        <StepUpLink />
      </ActionForm>
    </main>
  );
}
