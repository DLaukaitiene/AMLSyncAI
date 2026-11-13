"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser, hasRecentMfa } from "@/lib/server/session";
import { purgeParties } from "@/lib/server/retention";
import { securityEvent } from "@/lib/server/audit";

export async function purgeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("records.purge");
  if (!hasRecentMfa(s)) return { error: "For security, confirm it's you first.", data: { stepUp: "/app/records" } };
  const ids = fd.getAll("partyId").map(String);
  if (ids.length === 0) return { error: "Select at least one record." };
  if (fd.get("confirm") !== "on") return { error: "Tick the box to confirm that the data will be permanently deleted." };
  const n = await purgeParties(s.firm.id, s.user.id, ids);
  await securityEvent({ firmId: s.firm.id, userId: s.user.id, kind: "retention-purge", details: { count: n } });
  revalidatePath("/app/records");
  return { message: `${n} client record(s) permanently deleted. The audit log keeps only that a deletion happened.` };
}
