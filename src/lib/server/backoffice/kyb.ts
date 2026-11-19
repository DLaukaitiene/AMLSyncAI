import "server-only";
import { adminDb } from "../db";
import { adminAudit } from "./audit";
import { screenSubject } from "@/lib/screening/match";

/**
 * AMLSync's own KYB of its customers (§6.2 "Firm KYB"): the firm, its directors
 * and beneficial owners are screened against the official (shared) sanctions
 * lists. A possible match blocks nothing by itself; a confirmed hit suspends
 * the firm. Firm-uploaded lists are never used here.
 */
export async function runFirmKyb(by: string, firmId: string, input: { registryRef: string | null; directors: string[]; beneficialOwners: string[]; russiaBelarus: string }) {
  const firm = await adminDb.firm.findUniqueOrThrow({ where: { id: firmId }, select: { name: true, billingName: true } });
  const lists = await adminDb.screeningList.findMany({ where: { firmId: null, active: true }, include: { entries: true } });
  const subjects = [
    ...new Set([firm.name, firm.billingName].filter((x): x is string => !!x)),
  ].map((name) => ({ name, entity: true, role: "firm" }))
    .concat(input.directors.map((name) => ({ name, entity: false, role: "director" })))
    .concat(input.beneficialOwners.map((name) => ({ name, entity: false, role: "beneficial owner" })));
  const matches: { subject: string; role: string; matchedName: string; list: string; score: number }[] = [];
  for (const s of subjects) {
    for (const l of lists) {
      const hits = screenSubject({ name: s.name, entity: s.entity }, l.entries.map((e) => ({ id: e.id, entityType: e.entityType as "person" | "entity", names: e.names, birthDates: e.birthDates, countries: e.countries })));
      for (const h of hits) matches.push({ subject: s.name, role: s.role, matchedName: h.matchedName, list: `${l.name} (${l.version})`, score: Math.round(h.score * 100) });
    }
  }
  const result = matches.length ? "possible-match" : "clear";
  const k = await adminDb.$transaction(async (tx) => {
    const k = await tx.firmKyb.create({ data: { firmId, registryRef: input.registryRef, directors: input.directors, beneficialOwners: input.beneficialOwners, russiaBelarus: input.russiaBelarus, result, matches, checkedBy: by } });
    await adminAudit({ adminEmail: by, action: "firm.kyb", targetType: "Firm", targetId: firmId, details: { result, matches: matches.length, lists: lists.length, russiaBelarus: input.russiaBelarus } }, tx);
    return k;
  });
  return { kyb: k, lists: lists.length };
}

/** Review of a possible match: cleared (false positive) or confirmed (firm suspended). */
export async function decideFirmKyb(by: string, kybId: string, decision: "cleared" | "blocked", note: string) {
  return adminDb.$transaction(async (tx) => {
    const k = await tx.firmKyb.findUniqueOrThrow({ where: { id: kybId } });
    await tx.firmKyb.update({ where: { id: kybId }, data: { decision, decisionNote: note, result: decision === "blocked" ? "confirmed-hit" : k.result } });
    if (decision === "blocked") {
      await tx.firm.update({ where: { id: k.firmId }, data: { status: "suspended", statusReason: `Sanctions / KYB: ${note}`, statusChangedAt: new Date() } });
    }
    await adminAudit({ adminEmail: by, action: `firm.kyb-${decision}`, targetType: "Firm", targetId: k.firmId, reason: note }, tx);
  });
}
