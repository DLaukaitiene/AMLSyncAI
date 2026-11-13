"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser, hasRecentMfa } from "@/lib/server/session";
import { isPlatformAdmin } from "@/lib/server/feedback";
import { requestSupportAccess } from "@/lib/server/support";

export async function requestAccessAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser();
  if (!isPlatformAdmin(s.user.email)) redirect("/app");
  if (!hasRecentMfa(s)) return { error: "For security, confirm it's you first.", data: { stepUp: "/admin/support" } };
  try {
    await requestSupportAccess(s.user.email, String(fd.get("domain") ?? ""), String(fd.get("reason") ?? ""), Number(fd.get("hours") ?? 1));
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/admin/support");
  return { message: "Requested. The firm's Owner / Compliance Officer must approve it." };
}
