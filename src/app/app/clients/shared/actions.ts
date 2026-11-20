"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser } from "@/lib/server/session";
import { acceptShare, closeShare, createShare } from "@/lib/server/sharing";

export async function shareClientAction(fileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  const code = String(fd.get("code") ?? "");
  const legalBasis = String(fd.get("legalBasis") ?? "");
  if (!code.trim()) return { error: "Enter the other firm's code.", fieldErrors: { code: ["Required."] } };
  if (fd.get("confirm") !== "on") return { error: "Confirm that you may share this file.", fieldErrors: { confirm: ["Required."] } };
  try {
    const r = await createShare({ firmId: s.firm.id, userId: s.user.id }, fileId, { code, legalBasis, note: String(fd.get("note") ?? "").trim() });
    revalidatePath("/app/clients/shared");
    return { message: `Sent to ${r.toFirm} with ${r.documents} document(s). They have 30 days to import it.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function acceptShareAction(shareId: string): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  let fileId: string;
  try {
    fileId = await acceptShare({ firmId: s.firm.id, userId: s.user.id }, shareId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect(`/app/clients/${fileId}`);
}

export async function declineShareAction(shareId: string): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  try {
    await closeShare({ firmId: s.firm.id, userId: s.user.id }, shareId, "declined");
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/app/clients/shared");
  return { message: "Declined. The copies were deleted." };
}

export async function withdrawShareAction(shareId: string): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  try {
    await closeShare({ firmId: s.firm.id, userId: s.user.id }, shareId, "withdrawn");
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/app/clients/shared");
  return { message: "Withdrawn. The copies were deleted." };
}
