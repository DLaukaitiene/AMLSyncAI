/**
 * Beneficial ownership calculation (spec §4.2, §4A.2, §11.6; AMLR Art. 51–60).
 *
 * Indirect ownership: multiply percentages down each chain, then add the
 * results across all chains that lead to the same natural person.
 * A natural person is a beneficial owner at 25% or more, or when control by
 * other means is recorded. If nobody qualifies, the senior managing
 * officials must be identified and the steps taken recorded (Art. 22(2)).
 */
import { EU_CORE } from "./eu-core";

export type PartyKind = "natural" | "legal" | "arrangement";

export interface OwnershipParty {
  id: string;
  kind: PartyKind;
  name: string;
}

export interface OwnershipLink {
  /** The owner (shareholder). */
  ownerId: string;
  /** The entity owned. */
  ownedId: string;
  /** 0–100. */
  pct: number;
}

export type ControlType =
  | "voting-rights"
  | "board-appointment"
  | "veto"
  | "agreement"
  | "family"
  | "nominee"
  | "other";

export interface ControlRecord {
  personId: string;
  /** The entity controlled (usually the client). */
  entityId: string;
  type: ControlType;
  description: string;
}

export interface BoCandidate {
  personId: string;
  name: string;
  /** Effective ownership in the client, 0–100, rounded to 4 decimals. */
  effectivePct: number;
  /** Each chain from the person to the client with its product. */
  chains: { path: string[]; pct: number }[];
  control: ControlRecord[];
  isBeneficialOwner: boolean;
  reasons: string[];
}

export interface BoResult {
  clientId: string;
  thresholdPct: number;
  candidates: BoCandidate[];
  beneficialOwners: BoCandidate[];
  /** True when no natural person qualifies: SMO fallback is required. */
  requiresSmoFallback: boolean;
  /** Chains that end in a legal entity / arrangement with no known owners (gaps to resolve). */
  unresolvedOwners: string[];
  /** Total direct ownership recorded for any entity above 100% (data error). */
  overAllocated: { entityId: string; totalPct: number }[];
}

const EPS = 1e-9;

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function calculateBeneficialOwnership(
  clientId: string,
  parties: OwnershipParty[],
  links: OwnershipLink[],
  control: ControlRecord[] = [],
  thresholdPct: number = EU_CORE.beneficialOwnership.thresholdPct,
): BoResult {
  const byId = new Map(parties.map((p) => [p.id, p]));
  if (!byId.has(clientId)) throw new Error(`Unknown client ${clientId}`);

  for (const l of links) {
    if (!byId.has(l.ownerId) || !byId.has(l.ownedId)) throw new Error(`Link references unknown party`);
    if (!(l.pct >= 0 && l.pct <= 100)) throw new Error(`Invalid percentage ${l.pct}`);
  }

  const ownersOf = new Map<string, OwnershipLink[]>();
  for (const l of links) {
    const arr = ownersOf.get(l.ownedId) ?? [];
    arr.push(l);
    ownersOf.set(l.ownedId, arr);
  }

  const overAllocated: BoResult["overAllocated"] = [];
  for (const [entityId, ls] of ownersOf) {
    const total = ls.reduce((s, l) => s + l.pct, 0);
    if (total > 100 + EPS) overAllocated.push({ entityId, totalPct: round4(total) });
  }

  // Walk upwards from the client through every chain. Cycles (cross-holdings)
  // are cut: a party already on the current path is not revisited.
  const chainsByPerson = new Map<string, { path: string[]; pct: number }[]>();
  const unresolved = new Set<string>();

  const walk = (entityId: string, fraction: number, path: string[]) => {
    const owners = ownersOf.get(entityId) ?? [];
    if (owners.length === 0 && entityId !== clientId && byId.get(entityId)!.kind !== "natural") {
      unresolved.add(entityId);
    }
    for (const link of owners) {
      if (path.includes(link.ownerId)) continue; // cycle
      const f = fraction * (link.pct / 100);
      const owner = byId.get(link.ownerId)!;
      const nextPath = [...path, link.ownerId];
      if (owner.kind === "natural") {
        const arr = chainsByPerson.get(owner.id) ?? [];
        arr.push({ path: [...nextPath].reverse(), pct: round4(f * 100) });
        chainsByPerson.set(owner.id, arr);
      } else {
        walk(owner.id, f, nextPath);
      }
    }
  };
  walk(clientId, 1, [clientId]);

  const controlByPerson = new Map<string, ControlRecord[]>();
  for (const c of control) {
    if (!byId.has(c.personId)) throw new Error(`Control record references unknown party ${c.personId}`);
    if (byId.get(c.personId)!.kind !== "natural") throw new Error(`Control by other means must be held by a natural person`);
    const arr = controlByPerson.get(c.personId) ?? [];
    arr.push(c);
    controlByPerson.set(c.personId, arr);
  }

  const personIds = new Set([...chainsByPerson.keys(), ...controlByPerson.keys()]);
  const candidates: BoCandidate[] = [...personIds].map((pid) => {
    const chains = chainsByPerson.get(pid) ?? [];
    const raw = chains.reduce((s, c) => s + c.pct, 0);
    const effectivePct = round4(raw);
    const ctrl = controlByPerson.get(pid) ?? [];
    const reasons: string[] = [];
    if (effectivePct + EPS >= thresholdPct) {
      reasons.push(`Owns ${effectivePct}% (threshold ${thresholdPct}%), AMLR Art. 52`);
    }
    for (const c of ctrl) reasons.push(`Control by other means (${c.type}): ${c.description}, AMLR Art. 53`);
    return {
      personId: pid,
      name: byId.get(pid)!.name,
      effectivePct,
      chains,
      control: ctrl,
      isBeneficialOwner: reasons.length > 0,
      reasons,
    };
  });
  candidates.sort((a, b) => b.effectivePct - a.effectivePct || a.name.localeCompare(b.name));

  const beneficialOwners = candidates.filter((c) => c.isBeneficialOwner);
  return {
    clientId,
    thresholdPct,
    candidates,
    beneficialOwners,
    requiresSmoFallback: beneficialOwners.length === 0,
    unresolvedOwners: [...unresolved],
    overAllocated,
  };
}

export interface SmoFallbackRecord {
  seniorManagingOfficials: { personId: string; name: string; position: string }[];
  stepsTaken: string;
}

/** Validates the "no BO — SMO recorded" outcome (spec §11.6). */
export function validateSmoFallback(r: SmoFallbackRecord): string[] {
  const errors: string[] = [];
  if (r.seniorManagingOfficials.length === 0) errors.push("Identify all senior managing officials (AMLR Art. 22(2)).");
  if (r.stepsTaken.trim().length < 20) errors.push("Describe the steps taken to identify a beneficial owner.");
  return errors;
}
