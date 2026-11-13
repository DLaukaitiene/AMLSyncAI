import "server-only";
import { withTenant, type Tx } from "./db";
import { audit } from "./audit";
import { currentProfile } from "./country-profile";
import { retentionEnds } from "@/lib/rules/deadlines";
import { addYears, toIsoDate, type IsoDate } from "@/lib/rules/dates";
import { EU_CORE } from "@/lib/rules/eu-core";

/**
 * Retention (spec §4.7, §11.11; AMLR Art. 77):
 * client data is deleted 5 years (or the longer national period) after the
 * end of the relationship, occasional transaction or refusal, unless a legal
 * hold applies. The Compliance Officer confirms deletion in a batch. What
 * remains afterwards is only the general audit log (no identifiable data).
 */

/** Starts the retention clock when a relationship ends, a transaction completes or the client is refused. */
export async function startRetentionClock(tx: Tx, firmId: string, cddFileId: string, endedOn: IsoDate) {
  const { profile } = await currentProfile(tx, firmId);
  const due = retentionEnds(endedOn, profile).due;
  await tx.cddFile.update({ where: { id: cddFileId }, data: { endedOn: new Date(endedOn), retentionUntil: new Date(due) } });
}

export interface DueParty {
  partyId: string;
  displayName: string;
  retentionUntil: string;
  cddFiles: number;
}

/** Parties whose every CDD file has ended, passed its retention date and has no active legal hold. */
export async function partiesDueForDeletion(tx: Tx, today: IsoDate = toIsoDate(new Date())): Promise<DueParty[]> {
  const parties = await tx.party.findMany({ include: { cddFiles: true } });
  const t = new Date(today);
  return parties
    .filter(
      (p) =>
        p.cddFiles.length > 0 &&
        p.cddFiles.every((f) => f.retentionUntil && f.retentionUntil <= t && (!f.legalHoldUntil || f.legalHoldUntil < t)),
    )
    .map((p) => ({
      partyId: p.id,
      displayName: p.displayName,
      retentionUntil: toIsoDate(new Date(Math.max(...p.cddFiles.map((f) => f.retentionUntil!.getTime())))),
      cddFiles: p.cddFiles.length,
    }));
}

/** Deletes the parties and everything about them. Irrecoverable from the app. */
export async function purgeParties(firmId: string, userId: string, partyIds: string[], today: IsoDate = toIsoDate(new Date())) {
  return withTenant(firmId, async (tx) => {
    const due = new Set((await partiesDueForDeletion(tx, today)).map((p) => p.partyId));
    const ids = partyIds.filter((id) => due.has(id));
    if (ids.length === 0) return 0;

    // Allow deleting approvals that belong to these records, in this transaction only.
    await tx.$executeRaw`SELECT set_config('app.retention_purge', 'on', true)`;

    const cddFiles = await tx.cddFile.findMany({ where: { partyId: { in: ids } }, select: { id: true } });
    const riskIds = (await tx.clientRiskAssessment.findMany({ where: { cddFileId: { in: cddFiles.map((f) => f.id) } }, select: { id: true } })).map((r) => r.id);
    const matterIds = (await tx.matterParty.findMany({ where: { partyId: { in: ids } }, select: { matterId: true } })).map((m) => m.matterId);
    const objectIds = [...ids, ...cddFiles.map((f) => f.id), ...riskIds];

    await tx.approval.deleteMany({ where: { objectId: { in: objectIds } } });
    await tx.task.deleteMany({ where: { objectId: { in: objectIds } } });

    // Cases and their reports: delete when every party they concern is being deleted.
    const cases = await tx.case.findMany({ where: { partyIds: { hasSome: ids } } });
    for (const c of cases) {
      if (c.partyIds.every((p) => ids.includes(p))) {
        await tx.report.deleteMany({ where: { caseId: c.id } });
        await tx.approval.deleteMany({ where: { objectId: c.id } });
        await tx.case.delete({ where: { id: c.id } });
        await audit(tx, { firmId, userId, action: "purge", objectType: "Case", objectId: c.id });
      } else {
        await tx.case.update({ where: { id: c.id }, data: { partyIds: c.partyIds.filter((p) => !ids.includes(p)) } });
      }
    }

    await tx.document.deleteMany({ where: { partyId: { in: ids } } }); // TODO: delete object-storage blobs once file storage is added
    await tx.party.deleteMany({ where: { id: { in: ids } } }); // cascades: links, matter roles, CDD files, risk, screening, extracts, IDV

    // Matters left with no parties are deleted too.
    for (const mId of new Set(matterIds)) {
      if ((await tx.matterParty.count({ where: { matterId: mId } })) === 0) {
        await tx.task.deleteMany({ where: { objectId: mId } });
        await tx.report.deleteMany({ where: { matterId: mId } });
        await tx.matter.delete({ where: { id: mId } });
        await audit(tx, { firmId, userId, action: "purge", objectType: "Matter", objectId: mId });
      }
    }
    for (const id of ids) await audit(tx, { firmId, userId, action: "purge", objectType: "Party", objectId: id });
    return ids.length;
  });
}

/** Legal hold (Art. 77(3)): blocks deletion; at most 5 extra years after the retention date. */
export async function setLegalHold(firmId: string, userId: string, partyId: string, until: IsoDate) {
  return withTenant(firmId, async (tx) => {
    const files = await tx.cddFile.findMany({ where: { partyId } });
    for (const f of files) {
      const base = f.retentionUntil ? toIsoDate(f.retentionUntil) : toIsoDate(new Date());
      const max = addYears(base, EU_CORE.records.maxLegalHoldExtensionYears);
      if (until > max) throw new Error(`A legal hold can last at most ${EU_CORE.records.maxLegalHoldExtensionYears} years after the retention date (${max}).`);
      await tx.cddFile.update({ where: { id: f.id }, data: { legalHoldUntil: new Date(until) } });
      await audit(tx, { firmId, userId, action: "update", objectType: "CddFile", objectId: f.id, fields: ["legalHoldUntil"] });
    }
  });
}
