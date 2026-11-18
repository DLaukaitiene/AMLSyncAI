"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { adminAction, isActionError } from "@/lib/server/backoffice/access";
import { adminAudit } from "@/lib/server/backoffice/audit";
import { teamReply } from "@/lib/server/tickets";

const P = "/adminpage1&/tickets";

export async function teamReplyAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("tickets.manage", `${P}/${id}`); if (isActionError(a)) return a;
  const text = String(fd.get("text") ?? "").trim(), status = String(fd.get("status") ?? "");
  if (!["open", "waiting-customer", "resolved", "closed"].includes(status)) return { error: "Choose a status." };
  if (!text && status === "waiting-customer") return { error: "Write the question for the customer." };
  const t = await teamReply(a.email, id, text, status);
  await adminAudit({ adminEmail: a.email, action: "ticket.reply", targetType: "Ticket", targetId: id, details: { number: t.number, status, replied: !!text } });
  revalidatePath(`${P}/${id}`);
  return { message: text ? "Reply sent; the user was emailed." : "Status updated." };
}
