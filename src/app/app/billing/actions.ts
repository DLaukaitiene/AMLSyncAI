"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, confirmFirst } from "@/lib/server/session";
import { audit, securityEvent } from "@/lib/server/audit";
import { notify } from "@/lib/server/email";
import { currentProfile } from "@/lib/server/country-profile";
import { addYears } from "@/lib/rules/dates";
import { CONTACT_EMAIL, OPS_ALERT_EMAIL } from "@/lib/billing/plans";
import { withTenant } from "@/lib/server/db";
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
  const notVat = fd.get("vatNotRegistered") === "on";
  if (!clean(fd, "billingName")) fieldErrors.billingName = ["Enter the full legal name for invoices."];
  if (!clean(fd, "billingAddress")) fieldErrors.billingAddress = ["Enter the registered address."];
  if (!clean(fd, "billingCompanyCode")) fieldErrors.billingCompanyCode = ["Enter the company code."];
  if (!email) fieldErrors.billingEmail = ["Enter the email for invoices."];
  if (!vatId && !notVat) fieldErrors.vatId = ["Enter the VAT number, or tick that you aren't VAT-registered."];
  if (vatId && notVat) fieldErrors.vatId = ["Leave the VAT number empty if you aren't VAT-registered."];
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  await withTenant(s.firm.id, async (tx) => {
    const prev = await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id }, select: { vatId: true } });
    await tx.firm.update({
      where: { id: s.firm.id },
      data: { billingName: clean(fd, "billingName"), billingAddress: clean(fd, "billingAddress", 300), billingCountry: country, billingCompanyCode: clean(fd, "billingCompanyCode", 40), vatId, billingEmail: email,
        billingOffice: clean(fd, "billingOffice", 300), vatNotRegistered: notVat, invoiceReference: clean(fd, "invoiceReference", 100), billingConfirmedAt: new Date(),
        ...(vatId !== prev.vatId ? { viesStatus: null, viesName: null, viesCheckedAt: null } : {}) },
    });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "Firm", objectId: s.firm.id, fields: ["billingDetails"] });
  });
  revalidatePath("/app/billing");
  return { message: "Billing details saved. They are used on your next invoice." };
}

/**
 * Ends the subscription (Owner, fresh two-factor check, typed confirmation).
 * Records stay read-only for the retention period, then are deleted.
 */
export async function cancelSubscriptionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.management");
  { const c = confirmFirst(fd, "This cancels your subscription. Your records become a read-only archive until the end of the retention period."); if (c) return c; }
  if (String(fd.get("confirm") ?? "").trim() !== "CANCEL") return { error: "Type CANCEL to confirm.", fieldErrors: { confirm: ["Type CANCEL"] } };
  const today = new Date().toISOString().slice(0, 10);
  const archiveUntil = await withTenant(s.firm.id, async (tx) => {
    const { profile } = await currentProfile(tx, s.firm.id);
    const until = addYears(today, profile.retentionYears);
    await tx.firm.update({ where: { id: s.firm.id }, data: { status: "cancelled", cancelledAt: new Date(), archiveUntil: until } });
    await tx.portalLink.updateMany({ where: { status: { not: "REVOKED" } }, data: { status: "REVOKED" } });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "Firm", objectId: s.firm.id, fields: ["status:cancelled"] });
    return until;
  });
  await securityEvent({ firmId: s.firm.id, userId: s.user.id, kind: "subscription-cancelled", details: { archiveUntil } });
  await notify(OPS_ALERT_EMAIL, `AMLSync App: ${s.firm.name} cancelled`, `${s.firm.name} cancelled on ${today}. Read-only archive until ${archiveUntil}. A final invoice is issued with the next monthly run.`);
  await notify(s.user.email, "AMLSync App: subscription ended", `Your AMLSync App subscription has ended. Your records stay available read-only until ${archiveUntil}, as anti-money-laundering law requires, and are deleted after that. Download your full export in Billing at any time. To restart, write to ${CONTACT_EMAIL}.`);
  redirect("/app/archived");
}
