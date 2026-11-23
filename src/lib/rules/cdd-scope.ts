/**
 * CDD scope (competitor review, recommendation 4): a client who receives only
 * services outside AMLR scope is recorded as "identification only" with a reason.
 * Sanctions apply to everyone, so identification and screening stay required;
 * verification, beneficial owners, purpose, EDD and register extracts don't.
 * Matters that are AMLR services can't complete for such a client.
 * [verify] the reason list against the final national transposition and Art. 3.
 */
export type CddScope = "full" | "identification-only";

export interface ScopeReason { label: string; article: string; sectors?: string[]; oneOffOnly?: boolean; legacy?: boolean }

/**
 * Reasons [revised 23 Nov 2026 after the legal pre-review]: the reason is always the scope of the service.
 * "Court proceedings" is not a CDD exemption (Art. 70 / 21(2) concern reporting and refusal), so the litigation
 * reason is offered to lawyers only and worded as a scope reason. "Below threshold" is valid only for a one-off
 * occasional transaction, never for a business relationship. Legacy reasons stay readable on old files.
 */
export const SCOPE_REASONS: Record<string, ScopeReason> = {
  "service-not-listed": { label: "The service is not an activity listed for our sector in the AML Regulation", article: "Art. 3" },
  "litigation-only": { label: "Litigation-only mandate: representing the client in court or arbitration proceedings (not a listed activity)", article: "Art. 3(3)(b)", sectors: ["LEGAL"] },
  "occasional-below-threshold": { label: "One-off occasional transaction below €10,000, with no ongoing relationship and no suspicion", article: "Art. 19(1)(b)", oneOffOnly: true },
  other: { label: "Other (describe)", article: "Art. 3" },
  "firm-default": { label: "Firm default: our services to new clients are outside AMLR scope", article: "Art. 3" },
  // No longer offered; kept so older files still show their reason.
  "legal-proceedings": { label: "Representation in court or arbitration proceedings (recorded before 23 Nov 2026)", article: "Art. 3(3)(b)", legacy: true },
  "below-threshold": { label: "Occasional transaction below the AMLR threshold (recorded before 23 Nov 2026)", article: "Art. 19", legacy: true },
};

/** Reasons a firm may choose, by its sectors. */
export function scopeReasonsFor(sectors: string[]): [string, ScopeReason][] {
  return Object.entries(SCOPE_REASONS).filter(([k, r]) => !r.legacy && k !== "firm-default" && (!r.sectors || r.sectors.some((s) => sectors.includes(s))));
}

/** Matter types that are AMLR services in themselves: a client in identification-only scope can't complete them. */
export const AMLR_MATTER_TYPES = ["property-sale", "letting", "goods-sale", "company-formation", "transaction"];

/** Gate items that still apply in identification-only scope. */
const KEEP = new Set(["anonymous", "bearer-shares", "sanctions", "unscreened", "screening", "identification", "out-of-scope-matter"]);
export function keepInIdentificationOnly(itemId: string): boolean {
  return KEEP.has(itemId) || itemId.startsWith("sectoral:");
}
