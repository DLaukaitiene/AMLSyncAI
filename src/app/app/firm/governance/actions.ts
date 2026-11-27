"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import type { ActionState } from "@/components/form";
import { requireUser } from "@/lib/server/session";
import { withTenant, type Tx } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { appoint } from "@/lib/server/governance";
import { DATA_PROTECTION_KEY, dutySetting, RESPONSIBILITIES, type DutySetting } from "@/lib/firm/responsibilities";

const revalidate = () => { revalidatePath("/app/firm/governance"); revalidatePath("/app"); revalidatePath("/app/firm/privacy"); };

/**
 * Saves the two appointments in one go. "Same person" appoints one person to both roles (allowed for small firms).
 * Only roles whose holder actually changes are re-appointed, so only those ask to inform the regulator.
 */
export async function saveAppointmentsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.management");
  const same = fd.get("same") === "on";
  const manager = String(fd.get("manager") ?? "");
  const officer = same ? manager : String(fd.get("officer") ?? "");
  const reason = String(fd.get("reason") ?? "").trim() || "Change of appointment";
  if (!manager || !officer) return { error: same ? "Choose a person." : "Choose a person for both roles." };
  try {
    const changed = await withTenant(s.firm.id, async (tx) => {
      const current = await tx.appointment.findMany({ where: { toDate: null } });
      const holder = (fn: string) => current.find((a) => a.function === fn)?.userId ?? null;
      let n = 0;
      for (const [fn, id] of [["compliance-manager", manager], ["compliance-officer", officer]] as const) {
        if (holder(fn) === id) continue;
        await appoint(tx, { firmId: s.firm.id, userId: s.user.id }, fn, id, reason);
        n++;
      }
      return n;
    });
    if (!changed) return { error: "Nothing changed: these people already hold the roles." };
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidate();
  return { message: "Saved. Now inform the regulator: use the Inform the Regulator button." };
}

async function updateDuty(tx: Tx, firmId: string, userId: string, key: string, change: (d: DutySetting) => DutySetting) {
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId }, select: { responsibilities: true } });
  const all = { ...((firm.responsibilities ?? {}) as Record<string, unknown>) };
  all[key] = change(dutySetting(all[key]));
  await tx.firm.update({ where: { id: firmId }, data: { responsibilities: all as Prisma.InputJsonValue } });
  await audit(tx, { firmId, userId, action: "update", objectType: "Firm", objectId: firmId, fields: [`responsibilities.${key}`] });
}

async function activeUser(tx: Tx, id: string) {
  return !!(await tx.user.findFirst({ where: { id, deactivatedAt: null, external: false }, select: { id: true } }));
}

/** Hand a duty to a colleague, to an outside provider, or back to its role. Not for the legal core. */
export async function reassignDutyAction(key: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  const duty = RESPONSIBILITIES.find((d) => d.key === key);
  if (!duty) return { error: "Unknown duty." };
  if (duty.locked) return { error: "This duty stays with its role. You can add a deputy instead." };
  const to = String(fd.get("to") ?? "");
  const err = await withTenant(s.firm.id, async (tx) => {
    if (to && to !== "outsourced" && to !== "role" && !(await activeUser(tx, to))) return "Choose a colleague from the list.";
    await updateDuty(tx, s.firm.id, s.user.id, key, (d) => ({ ...d, outsourced: to === "outsourced", to: to && to !== "outsourced" && to !== "role" ? [to] : [] }));
    return null;
  });
  if (err) return { error: err };
  revalidate();
  return { message: to === "outsourced" ? "Handed to an outside provider. Record the provider on the Outsourcing page." : to && to !== "role" ? "Reassigned." : "Back with the role." };
}

/** Name a deputy for a legal-core duty (or remove the deputy). */
export async function setDeputyAction(key: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.management");
  const duty = RESPONSIBILITIES.find((d) => d.key === key);
  if (!duty?.locked) return { error: "Deputies are only for deciding on suspicious activity reports and approving high-risk clients." };
  const id = String(fd.get("deputy") ?? "");
  const err = await withTenant(s.firm.id, async (tx) => {
    if (id && !(await activeUser(tx, id))) return "Choose a colleague from the list.";
    await updateDuty(tx, s.firm.id, s.user.id, key, () => ({ deputies: id ? [id] : [] }));
    return null;
  });
  if (err) return { error: err };
  revalidate();
  return { message: id ? "Deputy named." : "Deputy removed." };
}

/** Data protection lead (GDPR), set on the Data Protection page. */
export async function setDataProtectionLeadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  const id = String(fd.get("lead") ?? "");
  const err = await withTenant(s.firm.id, async (tx) => {
    if (id && !(await activeUser(tx, id))) return "Choose a colleague from the list.";
    await updateDuty(tx, s.firm.id, s.user.id, DATA_PROTECTION_KEY, () => ({ to: id ? [id] : [] }));
    return null;
  });
  if (err) return { error: err };
  revalidate();
  return { message: id ? "Data protection lead saved." : "Data protection lead removed." };
}
