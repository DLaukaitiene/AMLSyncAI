import "server-only";
import type { Tx } from "./db";

/** For each party, the client file it belongs to: its own, or that of the client it owns/controls (up to 8 levels). */
export async function clientFileForParties(tx: Tx, partyIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!partyIds.length) return out;
  // Prefer the client file; a matter party (buyer, seller, supplier…) has its own file with another role.
  const files = await tx.cddFile.findMany({ select: { id: true, partyId: true, role: true }, orderBy: { createdAt: "asc" } });
  const fileOf = new Map<string, string>();
  for (const f of files) if (f.role === "CLIENT" || !fileOf.has(f.partyId)) fileOf.set(f.partyId, f.id);
  const links = await tx.ownershipLink.findMany({ select: { ownerId: true, ownedId: true } });
  const up = new Map<string, string[]>();
  for (const l of links) up.set(l.ownerId, [...(up.get(l.ownerId) ?? []), l.ownedId]);
  for (const pid of new Set(partyIds)) {
    let frontier = [pid];
    const seen = new Set<string>();
    for (let depth = 0; depth < 8 && frontier.length; depth++) {
      const hit = frontier.find((p) => fileOf.has(p));
      if (hit) { out.set(pid, fileOf.get(hit)!); break; }
      frontier.forEach((p) => seen.add(p));
      frontier = frontier.flatMap((p) => up.get(p) ?? []).filter((p) => !seen.has(p));
    }
  }
  return out;
}
