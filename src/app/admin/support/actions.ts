"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { adminAction, isActionError } from "@/lib/server/backoffice/access";
import { requestSupportAccess } from "@/lib/server/support";

export async function requestAccessAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("support.access", "/admin/support"); if (isActionError(a)) return a;
  try {
    await requestSupportAccess(a.email, String(fd.get("domain") ?? ""), String(fd.get("reason") ?? ""), Number(fd.get("hours") ?? 1));
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/admin/support");
  return { message: "Requested. The firm's Owner / Compliance Officer must approve it." };
}
