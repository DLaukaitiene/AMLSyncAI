"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/server/session";
import { adminDb } from "@/lib/server/db";

/** Hides or shows the dashboard guide for the signed-in person. */
export async function setGuideAction(hidden: boolean) {
  const s = await requireUser();
  await adminDb.user.update({ where: { id: s.user.id }, data: { guideHiddenAt: hidden ? new Date() : null } });
  revalidatePath("/app");
}
