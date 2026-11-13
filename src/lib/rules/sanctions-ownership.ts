/**
 * Sanctions ownership aggregation (spec §4.4, §11.8; AMLR Art. 20(1)(d), 26(4)).
 *
 * An entity is treated as sanctions-affected when sanctioned persons together
 * own more than 50% of it, or a sanctioned person controls it. The test is
 * applied up the whole ownership tree: an intermediate entity that is itself
 * more than 50% owned by sanctioned persons counts as sanctioned for the
 * entities below it (EU best-practice approach to Reg. 269/2014 Art. 2).
 *
 * Screening is never risk-based and can never be reduced for low-risk clients.
 */
import { EU_CORE } from "./eu-core";
import type { ControlRecord, OwnershipLink, OwnershipParty } from "./beneficial-ownership";

export interface SanctionsOwnershipResult {
  entityId: string;
  /** Sum of direct stakes held by sanctioned or sanctions-affected owners, 0–100. */
  sanctionedOwnershipPct: number;
  controlledBySanctioned: boolean;
  isListed: boolean;
  affected: boolean;
  reasons: string[];
  /** Direct owners that contributed. */
  contributors: { ownerId: string; pct: number; why: "listed" | "affected" }[];
}

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
  const memo = new Map<string, SanctionsOwnershipResult>();

  const assess = (id: string, stack: Set<string>): SanctionsOwnershipResult => {
    const cached = memo.get(id);
    if (cached) return cached;

    const isListed = sanctionedIds.has(id);
    const contributors: SanctionsOwnershipResult["contributors"] = [];
    for (const l of ownersOf.get(id) ?? []) {
      if (stack.has(l.ownerId)) continue; // cross-holding cycle
      if (sanctionedIds.has(l.ownerId)) {
        contributors.push({ ownerId: l.ownerId, pct: l.pct, why: "listed" });
      } else if (kind.get(l.ownerId) !== "natural") {
        stack.add(l.ownerId);
        const sub = assess(l.ownerId, stack);
        stack.delete(l.ownerId);
        if (sub.affected) contributors.push({ ownerId: l.ownerId, pct: l.pct, why: "affected" });
      }
    }
    const pct = Math.round(contributors.reduce((s, c) => s + c.pct, 0) * 10_000) / 10_000;
    const controlledBySanctioned = control.some((c) => c.entityId === id && sanctionedIds.has(c.personId));

    const reasons: string[] = [];
    if (isListed) reasons.push("Entity is itself on a sanctions list");
    if (pct > EU_CORE.sanctions.ownershipAggregationPct) {
      reasons.push(`Sanctioned persons together own ${pct}% (more than ${EU_CORE.sanctions.ownershipAggregationPct}%)`);
    }
    if (controlledBySanctioned) reasons.push("Controlled by a sanctioned person");

    const result: SanctionsOwnershipResult = {
      entityId: id,
      sanctionedOwnershipPct: pct,
      controlledBySanctioned,
      isListed,
      affected: reasons.length > 0,
      reasons,
      contributors,
    };
    memo.set(id, result);
    return result;
  };

  return assess(entityId, new Set([entityId]));
}
