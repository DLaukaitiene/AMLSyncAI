"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { adminDb } from "@/lib/server/db";
import { adminAction, isActionError } from "@/lib/server/backoffice/access";
import { adminAudit } from "@/lib/server/backoffice/audit";
import { CHECK_TYPES } from "@/lib/server/backoffice/vendor-costs";

const P = "/adminpage1&/vendors";
const g = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function setPriceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("vendors.manage", P); if (isActionError(a)) return a;
  const checkType = g(fd, "checkType"), cost = Number(g(fd, "cost")), validFrom = g(fd, "validFrom");
  if (!CHECK_TYPES.some((c) => c.id === checkType)) return { error: "Choose a check type." };
  if (!(cost >= 0 && cost <= 1000)) return { error: "Unit cost: €0–1,000." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) return { error: "Valid from: YYYY-MM-DD." };
  await adminDb.vendorPrice.create({ data: { vendor: "didit", checkType, unitCostCents: Math.round(cost * 100), validFrom, createdBy: a.email } });
  await adminAudit({ adminEmail: a.email, action: "vendor.price", targetType: "VendorPrice", details: { checkType, cost, validFrom } });
  revalidatePath(P);
  return { message: "Unit cost saved." };
}

export async function recordInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("vendors.manage", P); if (isActionError(a)) return a;
  const period = g(fd, "period"), amount = Number(g(fd, "amount"));
  if (!/^\d{4}-\d{2}$/.test(period)) return { error: "Month: YYYY-MM." };
  if (!(amount >= 0 && amount <= 1_000_000)) return { error: "Enter the invoice total excl. VAT." };
  await adminDb.vendorInvoice.upsert({ where: { vendor_period: { vendor: "didit", period } }, create: { vendor: "didit", period, amountCents: Math.round(amount * 100), reference: g(fd, "reference") || null, createdBy: a.email }, update: { amountCents: Math.round(amount * 100), reference: g(fd, "reference") || null } });
  await adminAudit({ adminEmail: a.email, action: "vendor.invoice", targetType: "VendorInvoice", details: { period, amount } });
  revalidatePath(P);
  return { message: `Didit invoice for ${period} recorded.` };
}
