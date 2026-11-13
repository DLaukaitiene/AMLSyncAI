/**
 * Sanctions ownership aggregation (spec §4.4, §11.8; AMLR Art. 20(1)(d), 26(4)).
 *
 * Sanctioned ownership is added up through every chain:
 * - a direct stake held by a listed person counts in full;
 * - a stake held through an intermediate entity counts in proportion to how
 *   much of that intermediate is itself sanctioned-owned (multiply down the
 *   chain, add across chains);
 * - an intermediate that is more than 50% sanctioned-owned (or listed, or
 *   controlled by a sanctioned person) counts as fully sanctioned, so its
 *   whole stake is added.
 * The client is affected when the total exceeds 50%, or it is listed, or a
 * sanctioned person controls it.
 *
 * Screening is never risk-based and can never be reduced for low-risk clients.
 */
import { EU_CORE } from "./eu-core";
import type { ControlRecord, OwnershipLink, OwnershipParty } from "./beneficial-ownership";

export interface SanctionsContributor {
  ownerId: string;
  /** Direct stake of this owner in the entity. */
  pct: number;
  /** Part of that stake counted as sanctioned. */
  countedPct: number;
  why: "listed" | "affected" | "partly-sanctioned-owned";
}

export interface SanctionsOwnershipResult {
  entityId: string;
  /** Sanctioned ownership added up through all chains, 0–100. */
  sanctionedOwnershipPct: number;
  controlledBySanctioned: boolean;
  isListed: boolean;
  affected: boolean;
  reasons: string[];
  contributors: SanctionsContributor[];
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function assessSanctionsOwnership(
  entityId: string,
  parties: OwnershipParty[],
  links: OwnershipLink[],
  sanctionedIds: ReadonlySet<string>,
  control: ControlRecord[] = [],
): SanctionsOwnershipResult {
  const ownersOf = new Map<string, OwnershipLink[]>();
  for (const l of links) {
    const arr = ownersOf.get(l.ownedId) ?? [];
    arr.push(l);
    ownersOf.set(l.ownedId, arr);
  }
  const kind = new Map(parties.map((p) => [p.id, p.kind]));

  const assess = (id: string, path: ReadonlySet<string>): SanctionsOwnershipResult => {
    const isListed = sanctionedIds.has(id);
    const contributors: SanctionsContributor[] = [];
    for (const l of ownersOf.get(id) ?? []) {
      if (path.has(l.ownerId)) continue; // cross-holding cycle
      if (sanctionedIds.has(l.ownerId)) {
        contributors.push({ ownerId: l.ownerId, pct: l.pct, countedPct: l.pct, why: "listed" });
      } else if (kind.get(l.ownerId) !== "natural") {
        const sub = assess(l.ownerId, new Set([...path, l.ownerId]));
        if (sub.affected) {
          contributors.push({ ownerId: l.ownerId, pct: l.pct, countedPct: l.pct, why: "affected" });
        } else if (sub.sanctionedOwnershipPct > 0) {
          contributors.push({
            ownerId: l.ownerId,
            pct: l.pct,
            countedPct: round4((l.pct * sub.sanctionedOwnershipPct) / 100),
            why: "partly-sanctioned-owned",
          });
        }
      }
    }
    const pct = round4(contributors.reduce((s, c) => s + c.countedPct, 0));
    const controlledBySanctioned = control.some((c) => c.entityId === id && sanctionedIds.has(c.personId));

    const reasons: string[] = [];
    if (isListed) reasons.push("Entity is itself on a sanctions list");
    if (pct > EU_CORE.sanctions.ownershipAggregationPct) {
      reasons.push(`Sanctioned persons together own ${pct}% directly and through chains (more than ${EU_CORE.sanctions.ownershipAggregationPct}%)`);
    }
    if (controlledBySanctioned) reasons.push("Controlled by a sanctioned person");

    return { entityId: id, sanctionedOwnershipPct: pct, controlledBySanctioned, isListed, affected: reasons.length > 0, reasons, contributors };
  };

  return assess(entityId, new Set([entityId]));
}
