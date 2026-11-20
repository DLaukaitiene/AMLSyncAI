"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser } from "@/lib/server/session";
import { adminDb } from "@/lib/server/db";
import { summaryText } from "@/lib/server/summary-email";
import { sendEmail } from "@/lib/server/email";
import { can } from "@/lib/auth/permissions";

export async function saveEmailSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser();
  const summary = String(fd.get("summary") ?? "auto");
  if (!["auto", "weekly", "monthly", "off"].includes(summary)) return { error: "Choose how often." };
  const news = fd.get("news") === "on";
  const u = await adminDb.user.findUniqueOrThrow({ where: { id: s.user.id }, select: { newsConsent: true } });
  await adminDb.user.update({ where: { id: s.user.id }, data: { emailSummary: summary, ...(u.newsConsent !== news ? { newsConsent: news, newsConsentAt: new Date() } : {}) } });
  revalidatePath("/app/settings/email");
  return { message: "Email settings saved." };
}

/** Answer to "may we send you AML rule updates and product news?" (dashboard banner). */
export async function newsConsentAction(yes: boolean) {
  const s = await requireUser();
  await adminDb.user.update({ where: { id: s.user.id }, data: { newsConsent: yes, newsConsentAt: new Date() } });
  revalidatePath("/app");
}

export async function sendSummaryNowAction(): Promise<ActionState> {
  const s = await requireUser();
  const m = await summaryText(s.firm.id, can(s.user.roles, "case.view"));
  if (!m) return { error: "Nothing to send." };
  await sendEmail(s.user.email, m.subject, m.text);
  return { message: `Summary sent to ${s.user.email}.` };
}
