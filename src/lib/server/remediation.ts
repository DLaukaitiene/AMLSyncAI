import "server-only";
import type { Prisma } from "@prisma/client";
import { withTenant } from "./db";
import { loadClientFile, loadLists, persistRiskIfChanged, runScreening } from "./cdd";
import { gapsFor, priority, type BackBookRow } from "@/lib/remediation/import";
import { toIsoDate } from "@/lib/rules/dates";

/**
 * Imports existing clients in chunks: creates each party and CDD file,
 * screens it, calculates risk, records the gaps and the priority.
 */
export async function importBackBook(firmId: string, userId: string, rows: BackBookRow[]) {
  const today = toIsoDate(new Date());
  let imported = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    await withTenant(firmId, async (tx) => {
      const lists = await loadLists(tx);
      for (const r of chunk) {
        const details = r.kind === "NATURAL"
          ? { firstNames: r.firstNames, lastName: r.lastName, birthDate: r.birthDate, nationalities: r.nationalities, residenceCountry: r.residenceCountry, address: r.address, email: r.email, isPep: r.isPep }
          : { name: r.name, registrationNumber: r.registrationNumber, countryOfCreation: r.countryOfCreation, email: r.email };
        const party = await tx.party.create({ data: { firmId, kind: r.kind, displayName: r.name, details: details as Prisma.InputJsonValue } });
        const gaps = gapsFor(r, today);
        const file = await tx.cddFile.create({
          data: { firmId, partyId: party.id, role: "CLIENT", purpose: r.purpose ?? null, source: "back-book", remediation: { gaps, importedAt: today, lastCddDate: r.lastCddDate ?? null, claimedDocuments: r.documents } as unknown as Prisma.InputJsonValue },
        });
        await runScreening(tx, firmId, [party.id], lists);
        const cf = await loadClientFile(tx, firmId, file.id);
        await persistRiskIfChanged(tx, firmId, cf);
        await tx.cddFile.update({ where: { id: file.id }, data: { remediation: { gaps, importedAt: today, lastCddDate: r.lastCddDate ?? null, claimedDocuments: r.documents, risk: cf.risk.level, priority: priority(cf.risk.level, gaps.length) } as unknown as Prisma.InputJsonValue } });
        imported++;
      }
      await tx.auditEvent.create({ data: { firmId, userId, action: "create", objectType: "BackBookImport", objectId: chunk[0] ? String(chunk[0].line) : "0", fields: [`${chunk.length} clients`] } });
    }, );
  }
  return imported;
}
