"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { adminAction, isActionError } from "@/lib/server/backoffice/access";
import { approveAndRun, rejectApproval } from "@/lib/server/backoffice/approvals";

export async function approveAction(id: string): Promise<ActionState> {
  const a = await adminAction("approvals.decide", "/adminpage1&/approvals"); if (isActionError(a)) return a;
  try {
    const r = await approveAndRun(id, a.email);
    revalidatePath("/adminpage1&/approvals");
    return { message: `Approved: ${r}` };
  } catch (e) {
    revalidatePath("/adminpage1&/approvals");
    return { error: (e as Error).message };
  }
}

export async function rejectAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("approvals.decide", "/adminpage1&/approvals"); if (isActionError(a)) return a;
  const reason = String(fd.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "Give a reason." };
  try { await rejectApproval(id, a.email, reason); } catch (e) { return { error: (e as Error).message }; }
  revalidatePath("/adminpage1&/approvals");
  return { message: "Rejected." };
}
