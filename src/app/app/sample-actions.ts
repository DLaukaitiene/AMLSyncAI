"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { loadSampleData, removeSampleData } from "@/lib/server/sample-data";

export async function loadSampleAction(): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  try {
    await withTenant(s.firm.id, (tx) => loadSampleData(tx, { firmId: s.firm.id, userId: s.user.id }), { timeoutMs: 60_000 });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/app");
  return { message: "Sample data loaded: 3 clients, a company with two owners, a case with 4 payments. Look around, then remove it in one click." };
}

export async function removeSampleAction(): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  const n = await withTenant(s.firm.id, (tx) => removeSampleData(tx, { firmId: s.firm.id, userId: s.user.id }), { timeoutMs: 60_000 });
  revalidatePath("/app");
  return { message: `Sample data removed (${n} people and companies).` };
}
