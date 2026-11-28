"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser, confirmFirst } from "@/lib/server/session";
import { decideSupportAccess } from "@/lib/server/support";

export async function supportDecisionAction(grantId: string, decision: "approved" | "denied" | "revoked", fd?: FormData): Promise<ActionState> {
  const s = await requireUser("securityLog.view");
  if (!s.user.roles.includes("OWNER") && !s.user.roles.includes("COMPLIANCE_OFFICER")) return { error: "Only an Owner or Compliance Officer can decide." };
  { const c = decision === "approved" && confirmFirst(fd, "This lets AMLSync support see your firm's data, read-only, for the hours requested. You can revoke it at any time."); if (c) return c; }
  try {
    await decideSupportAccess(s.firm.id, s.user.id, grantId, decision);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/app/security");
  return { message: decision === "approved" ? "Access granted." : decision === "denied" ? "Request denied." : "Access revoked." };
}
