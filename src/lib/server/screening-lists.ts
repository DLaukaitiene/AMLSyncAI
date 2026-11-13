import "server-only";
import type { ScreeningListKind } from "@prisma/client";
import { withTenant, type Tx } from "./db";
import { runScreening } from "./cdd";
import type { ParsedEntry } from "@/lib/screening/csv";

/** Replaces a list (same owner + name) with a new version. */
export async function importList(
  tx: Tx,
  l: { firmId: string | null; kind: ScreeningListKind; name: string; version: string; entries: ParsedEntry[] },
) {
  await tx.screeningList.updateMany({ where: { firmId: l.firmId, name: l.name, active: true }, data: { active: false } });
  const list = await tx.screeningList.create({ data: { firmId: l.firmId, kind: l.kind, name: l.name, version: l.version } });
  for (let i = 0; i < l.entries.length; i += 1000) {
    await tx.screeningEntry.createMany({
      data: l.entries.slice(i, i + 1000).map((e) => ({
        listId: list.id, entityType: e.entityType, names: e.names, normalized: e.normalized, birthDates: e.birthDates, countries: e.countries, reference: e.reference,
      })),
    });
  }
  return list;
}

/**
 * Re-screens every active party of a firm and everyone in their ownership
 * trees (spec §4.4: daily delta re-screening; only new hits create alerts).
 */
export async function rescreenFirm(firmId: string) {
  return withTenant(firmId, async (tx) => {
    const files = await tx.cddFile.findMany({ where: { status: { notIn: ["REFUSED", "TERMINATED"] } }, select: { partyId: true } });
    const ids = new Set(files.map((f) => f.partyId));
    let frontier = [...ids];
    while (frontier.length) {
      const ls = await tx.ownershipLink.findMany({ where: { ownedId: { in: frontier } }, select: { ownerId: true } });
      frontier = ls.map((l) => l.ownerId).filter((id) => !ids.has(id));
      frontier.forEach((id) => ids.add(id));
    }
    return runScreening(tx, firmId, [...ids], undefined, { system: true });
  });
}
