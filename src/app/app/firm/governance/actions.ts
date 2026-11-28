"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import type { ActionState } from "@/components/form";
import { requireUser } from "@/lib/server/session";
import { adminDb, withTenant, type Tx } from "@/lib/server/db";
import { createInvitation, inviteSchema } from "@/lib/server/auth/flows";
import { EmailDeliveryError } from "@/lib/server/email";
import { audit } from "@/lib/server/audit";
import { appoint } from "@/lib/server/governance";
import { DATA_PROTECTION_KEY, dutySetting, RESPONSIBILITIES, type DutySetting } from "@/lib/firm/responsibilities";

const revalidate = () => { revalidatePath("/app/firm/governance"); revalidatePath("/app"); revalidatePath("/app/firm/privacy"); };

type Target = string | { invited: { name: string; email: string } };

/**
 * Saves the two appointments in one go. "Same person" appoints one person to both roles (allowed for small firms).
 * Either role can be someone not on the app yet: they're invited and appointed at once (linked when they accept).
 * Only roles whose holder actually changes are re-appointed, so only those ask to inform the regulator.
 */
export async function saveAppointmentsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.management");
  const same = fd.get("same") === "on";
  const reason = String(fd.get("reason") ?? "").trim() || "Change of appointment";
  const pick = (slot: "manager" | "officer"): Target | { error: string } => {
    if (fd.get(`${slot}Mode`) === "invite") {
      const parsed = inviteSchema.safeParse({ name: fd.get(`${slot}Name`), email: fd.get(`${slot}Email`), role: slot === "manager" ? "OWNER" : "COMPLIANCE_OFFICER", allowExternal: true });
      return parsed.success ? { invited: { name: parsed.data.name, email: parsed.data.email } } : { error: parsed.error.issues[0]?.message ?? "Check the name and email." };
    }
    const id = String(fd.get(slot) ?? "");
    return id || { error: same ? "Choose a person." : "Choose a person for both roles." };
  };
  const manager = pick("manager");
  const officer = same ? manager : pick("officer");
  for (const t of [manager, officer]) if (typeof t === "object" && "error" in t) return { error: t.error };
  const targets = { "compliance-manager": manager as Target, "compliance-officer": officer as Target };

  // Invite anyone new first (one invitation if the same person holds both roles).
  const invited = new Map<string, Target>();
  for (const [fn, t] of Object.entries(targets)) {
    if (typeof t === "string" || invited.has(t.invited.email)) continue;
    const existing = await adminDb.user.findUnique({ where: { email: t.invited.email }, select: { firmId: true, deactivatedAt: true } });
    if (existing) return { error: existing.firmId === s.firm.id && !existing.deactivatedAt ? `${t.invited.email} is already on the app: choose them from the list.` : `${t.invited.email} already has an AMLSync App account.` };
    try {
      const r = await createInvitation(s.firm.id, s.user.id, { name: t.invited.name, email: t.invited.email, role: fn === "compliance-manager" ? "OWNER" : "COMPLIANCE_OFFICER", allowExternal: true });
      if (!r.ok) return { error: r.error };
    } catch (e) {
      if (e instanceof EmailDeliveryError) return { error: "The invitation email could not be sent. Try again in a few minutes." };
      throw e;
    }
    invited.set(t.invited.email, t);
  }
  try {
    const changed = await withTenant(s.firm.id, async (tx) => {
      const current = await tx.appointment.findMany({ where: { toDate: null } });
      let n = 0;
      for (const [fn, t] of Object.entries(targets) as ["compliance-manager" | "compliance-officer", Target][]) {
        const now = current.find((a) => a.function === fn);
        if (now && (typeof t === "string" ? now.userId === t : !now.userId && now.email === t.invited.email)) continue;
        await appoint(tx, { firmId: s.firm.id, userId: s.user.id }, fn, t, reason);
        n++;
      }
      return n;
    });
    if (!changed) return { error: "Nothing changed: these people already hold the roles." };
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidate();
  return { message: `Saved${invited.size ? ` and invitation sent to ${[...invited.keys()].join(", ")}` : ""}. Now inform the regulator: use the Inform the Regulator button.` };
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
