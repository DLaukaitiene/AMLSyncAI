"use server";

import { revalidatePath } from "next/cache";
import type { Sector } from "@prisma/client";
import type { ActionState } from "@/components/form";
import { requireUser, hasRecentMfa } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { audit, changedFields } from "@/lib/server/audit";
import { upsertTask } from "@/lib/server/cdd";
import { SECTORS } from "@/lib/server/auth/flows";
import { acknowledgePolicy, approvePolicy, approveRiskAssessment, draftRiskAssessment, editPolicySection, generatePolicies, generatePrivacyDoc, saveRiskAnswers } from "@/lib/server/firm-docs";
import { CONTROL_QUESTIONS, RISK_QUESTIONS } from "@/lib/firm/risk-assessment";
import { toIsoDate } from "@/lib/rules/dates";
import { draftText } from "@/lib/server/ai";
import type { GeneratedDoc } from "@/lib/docs/model";
import type { Prisma } from "@prisma/client";

const STEP_UP = (p: string): ActionState => ({ error: "For security, confirm it's you first.", data: { stepUp: p } });

/** Firm profile. Adding a sector or service triggers a risk-assessment review (Art. 10). */
export async function saveFirmProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  const sectors = fd.getAll("sectors").map(String).filter((x) => SECTORS.some(([v]) => v === x)) as Sector[];
  if (!sectors.length) return { error: "Choose at least one sector." };
  const services = String(fd.get("services") ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const clientTypes = fd.getAll("clientTypes").map(String);
  const size = Number(fd.get("size") || 0) || null;
  const crossBorderPct = Number(fd.get("crossBorderPct") || 0);
  return withTenant(s.firm.id, async (tx) => {
    const before = await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id } });
    const data = { sectors, services, clientTypes, size, usesCash: fd.get("usesCash") === "on", crossBorderPct };
    await tx.firm.update({ where: { id: s.firm.id }, data });
    const fields = changedFields(
      { sectors: before.sectors, services: before.services, clientTypes: before.clientTypes, size: before.size, usesCash: before.usesCash, crossBorderPct: before.crossBorderPct },
      data,
    );
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "Firm", objectId: s.firm.id, fields });
    const added = sectors.some((x) => !before.sectors.includes(x)) || services.some((x) => !before.services.includes(x)) || (data.usesCash && !before.usesCash);
    if (added) {
      await upsertTask(tx, { firmId: s.firm.id, kind: "risk-assessment-review", objectType: "Firm", objectId: s.firm.id, dueOn: toIsoDate(new Date()), article: "Art. 10" });
    }
    revalidatePath("/app/firm");
    return { message: added ? "Saved. You added a new sector, service or cash use: review the risk assessment before you start (Art. 10)." : "Saved." };
  });
}

export async function startRiskAssessmentAction(): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  await withTenant(s.firm.id, (tx) => draftRiskAssessment(tx, { firmId: s.firm.id, userId: s.user.id }));
  revalidatePath("/app/firm/risk-assessment");
  return { message: "Draft started." };
}

export async function saveAnswersAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  const answers: Record<string, number> = {};
  for (const q of [...RISK_QUESTIONS, ...CONTROL_QUESTIONS]) {
    const v = fd.get(q.id);
    if (v !== null && v !== "") answers[q.id] = Number(v);
  }
  const r = await withTenant(s.firm.id, (tx) => saveRiskAnswers(tx, { firmId: s.firm.id, userId: s.user.id }, id, answers));
  revalidatePath("/app/firm/risk-assessment");
  return { message: r.unanswered.length ? `Saved. ${r.unanswered.length} question(s) still open.` : `Saved. Residual risk: ${r.overallResidual}. Ready for management approval.` };
}

export async function approveRiskAssessmentAction(id: string): Promise<ActionState> {
  const s = await requireUser("approve.management");
  if (!hasRecentMfa(s)) return STEP_UP("/app/firm/risk-assessment");
  const r = await withTenant(s.firm.id, (tx) => approveRiskAssessment(tx, { firmId: s.firm.id, userId: s.user.id }, id));
  if (!r.ok) return { error: r.error };
  revalidatePath("/app/firm/risk-assessment");
  return { message: "Approved. A review is scheduled in 12 months." };
}

export async function generatePoliciesAction(): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  await withTenant(s.firm.id, (tx) => generatePolicies(tx, { firmId: s.firm.id, userId: s.user.id }));
  revalidatePath("/app/firm/policies");
  return { message: "New drafts generated from your firm profile, risk assessment and Country Profile." };
}

export async function editSectionAction(id: string, sectionId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  await withTenant(s.firm.id, (tx) => editPolicySection(tx, { firmId: s.firm.id, userId: s.user.id }, id, sectionId, String(fd.get("text") ?? "")));
  revalidatePath("/app/firm/policies");
  return { message: "Section saved." };
}

export async function approvePolicyAction(id: string): Promise<ActionState> {
  const s = await requireUser("approve.management");
  if (!hasRecentMfa(s)) return STEP_UP("/app/firm/policies");
  await withTenant(s.firm.id, (tx) => approvePolicy(tx, { firmId: s.firm.id, userId: s.user.id }, id));
  revalidatePath("/app/firm/policies");
  return { message: "Approved and in force. Staff are asked to read and acknowledge it." };
}

export async function acknowledgeAction(id: string): Promise<ActionState> {
  const s = await requireUser();
  await withTenant(s.firm.id, (tx) => acknowledgePolicy(tx, { firmId: s.firm.id, userId: s.user.id }, id));
  revalidatePath("/app/firm/policies");
  return { message: "Thank you — acknowledgement recorded." };
}

/** AI rewrite of one draft section; marked AI-drafted, the original kept for the record (spec §11.12). */
export async function aiSectionAction(id: string, sectionId: string, back: string): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  return withTenant(s.firm.id, async (tx) => {
    const d = await tx.policyDocument.findUniqueOrThrow({ where: { id } });
    if (d.status !== "DRAFT") return { error: "Only a draft can be changed." };
    const doc = d.content as unknown as GeneratedDoc;
    const sec = doc.sections.find((x) => x.id === sectionId);
    if (!sec) return { error: "Section not found." };
    const firm = await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id } });
    const current = sec.blocks.map((b) => ("p" in b ? b.p : "list" in b ? b.list.join("\n") : "")).join("\n\n");
    const r = await draftText(tx, { firmId: s.firm.id, userId: s.user.id }, "policy-section", id, { document: doc.title, section: sec.heading, sectors: firm.sectors, memberState: firm.homeState, currentText: current });
    if (!r.ok) return { error: r.error };
    const history = ((doc as unknown as { aiHistory?: unknown[] }).aiHistory ?? []).concat([{ sectionId, before: current, ai: r.text, at: new Date().toISOString(), by: s.user.id }]);
    const sections = doc.sections.map((x) => (x.id === sectionId ? { ...x, aiDrafted: true, blocks: r.text.split(/\n{2,}/).map((p) => ({ p: p.trim() })).filter((b) => b.p) } : x));
    await tx.policyDocument.update({ where: { id }, data: { content: { ...doc, sections, aiHistory: history } as unknown as Prisma.InputJsonValue } });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "PolicyDocument", objectId: id, fields: [sectionId, "aiDrafted"] });
    revalidatePath(back);
    return { message: "Section redrafted with AI and marked for review." };
  });
}

export async function generatePrivacyAction(kind: "privacy-notice" | "dpia"): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  await withTenant(s.firm.id, (tx) => generatePrivacyDoc(tx, { firmId: s.firm.id, userId: s.user.id }, kind));
  revalidatePath("/app/firm/privacy");
  return { message: "Draft generated." };
}
