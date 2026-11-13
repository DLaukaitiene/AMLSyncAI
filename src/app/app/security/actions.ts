"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser, hasRecentMfa } from "@/lib/server/session";
import { decideSupportAccess } from "@/lib/server/support";

export async function supportDecisionAction(grantId: string, decision: "approved" | "denied" | "revoked"): Promise<ActionState> {
  const s = await requireUser("securityLog.view");
  if (!s.user.roles.includes("OWNER") && !s.user.roles.includes("COMPLIANCE_OFFICER")) return { error: "Only an Owner or Compliance Officer can decide." };
  if (decision === "approved" && !hasRecentMfa(s)) return { error: "For security, confirm it's you first.", data: { stepUp: "/app/security" } };
  try {
    await decideSupportAccess(s.firm.id, s.user.id, grantId, decision);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/app/security");
  return { message: decision === "approved" ? "Access granted." : decision === "denied" ? "Request denied." : "Access revoked." };
}
