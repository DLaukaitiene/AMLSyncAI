/**
 * CDD scope (competitor review, recommendation 4): a client who receives only
 * services outside AMLR scope is recorded as "identification only" with a reason.
 * Sanctions apply to everyone, so identification and screening stay required;
 * verification, beneficial owners, purpose, EDD and register extracts don't.
 * Matters that are AMLR services can't complete for such a client.
 * [verify] the reason list against the final national transposition and Art. 3.
 */
export type CddScope = "full" | "identification-only";

export const SCOPE_REASONS: Record<string, { label: string; article: string }> = {
  "legal-proceedings": { label: "Representation in court or arbitration proceedings, or advice on the client's legal position", article: "Art. 3(3)(b); Art. 21" },
  "service-not-listed": { label: "The service is not an activity listed for our sector", article: "Art. 3" },
  "below-threshold": { label: "Occasional transaction below the AMLR threshold (e.g. rent under €10,000 a month)", article: "Art. 3, 19" },
  other: { label: "Other (describe)", article: "Art. 3" },
  "firm-default": { label: "Firm default: our services to new clients are outside AMLR scope", article: "Art. 3" },
};

/** Matter types that are AMLR services in themselves: a client in identification-only scope can't complete them. */
export const AMLR_MATTER_TYPES = ["property-sale", "letting", "goods-sale", "company-formation", "transaction"];

/** Gate items that still apply in identification-only scope. */
const KEEP = new Set(["anonymous", "bearer-shares", "sanctions", "unscreened", "screening", "identification", "out-of-scope-matter"]);
export function keepInIdentificationOnly(itemId: string): boolean {
  return KEEP.has(itemId) || itemId.startsWith("sectoral:");
}
