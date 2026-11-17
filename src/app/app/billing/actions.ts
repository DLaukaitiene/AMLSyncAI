"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import type { ActionState } from "@/components/form";

const clean = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max) || null;

export async function saveBillingDetails(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  const country = (clean(fd, "billingCountry", 2) ?? s.firm.homeState).toUpperCase();
  const vatId = clean(fd, "vatId", 20)?.replace(/\s/g, "").toUpperCase() ?? null;
  const email = clean(fd, "billingEmail", 200);
  const fieldErrors: Record<string, string[]> = {};
  if (!/^[A-Z]{2}$/.test(country)) fieldErrors.billingCountry = ["Use the two-letter country code, e.g. LT."];
  if (vatId && !/^[A-Z]{2}[0-9A-Z]{2,13}$/.test(vatId)) fieldErrors.vatId = ["Enter the VAT number with its country prefix, e.g. LT123456789."];
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fieldErrors.billingEmail = ["Enter a valid email address."];
  if (!clean(fd, "billingName")) fieldErrors.billingName = ["Enter the legal name for invoices."];
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  await withTenant(s.firm.id, async (tx) => {
    await tx.firm.update({
      where: { id: s.firm.id },
      data: { billingName: clean(fd, "billingName"), billingAddress: clean(fd, "billingAddress", 300), billingCountry: country, billingCompanyCode: clean(fd, "billingCompanyCode", 40), vatId, billingEmail: email },
    });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "Firm", objectId: s.firm.id, fields: ["billingDetails"] });
  });
  revalidatePath("/app/billing");
  return { message: "Billing details saved. They are used on your next invoice." };
}
