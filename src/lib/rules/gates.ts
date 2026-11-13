/**
 * Hard gates for CDD files and matters (spec §4.2, §11.4, §11.7–11.8, §11.10).
 * A client cannot be accepted and a matter cannot be completed while a
 * mandatory item is open. Only a Compliance Officer can override, with a
 * written reason, and the override is logged by the caller.
 */
import type { Sector } from "./cdd-triggers";

export type PartyRole =
  | "client"
  | "buyer"
  | "seller"
  | "landlord"
  | "tenant"
  | "supplier"
  | "representative"
  | "beneficiary";

export type MatterType = "engagement" | "property-sale" | "letting" | "goods-sale" | "company-formation" | "transaction";

/** Roles that must each have their own CDD file (Art. 19(6)). */
export function requiredRoles(sector: Sector, type: MatterType): PartyRole[] {
  if (sector === "estate-agent" && type === "property-sale") return ["buyer", "seller"];
  if (sector === "estate-agent" && type === "letting") return ["landlord", "tenant"];
  if ((sector === "hvg-trader" || sector === "precious-metals") && type === "goods-sale") return ["client", "supplier"];
  return ["client"];
}

export interface CddFileState {
  partyId: string;
  role: PartyRole;
  identityVerified: boolean;
  /** Natural persons only: are bearer shares / anonymity flags present (Art. 79)? */
  anonymous?: boolean;
  hasBearerShares?: boolean;
  /** Legal entities: BO identified, or SMO fallback recorded. */
  boResolved?: boolean;
  purposeRecorded: boolean;
  riskAssessed: boolean;
  eddRequired: boolean;
  eddChecklistComplete?: boolean;
  seniorApprovalRecorded?: boolean;
  isPep?: boolean;
  pepApprovalRecorded?: boolean;
  openScreeningMatches: number;
  trueSanctionsMatch: boolean;
  openDiscrepancy?: boolean;
  /** SDD: verification may be delayed (Art. 33). */
  sddDelayedVerification?: boolean;
  /** Parties in the structure not screened yet (no list loaded, or the daily cap was reached). */
  unscreenedParties?: number;
  /** EU sectoral sanctions that prohibit the service or sale (e.g. Reg. 833/2014 Art. 5n). */
  sectoralBans?: { regulation: string; explanation: string }[];
}

export interface GateItem {
  id: string;
  message: string;
  article: string;
  /** Items that no override can clear (sanctions, anonymity). */
  absolute?: boolean;
}

export function openCddItems(f: CddFileState): GateItem[] {
  const items: GateItem[] = [];
  if (f.anonymous) items.push({ id: "anonymous", message: "Anonymous customers cannot be accepted.", article: "Art. 79", absolute: true });
  if (f.hasBearerShares) items.push({ id: "bearer-shares", message: "Entities with bearer shares cannot be accepted.", article: "Art. 79", absolute: true });
  for (const b of f.sectoralBans ?? []) items.push({ id: `sectoral:${b.regulation}`, message: b.explanation, article: b.regulation, absolute: true });
  if (f.trueSanctionsMatch) items.push({ id: "sanctions", message: "True sanctions match: freeze and notify the sanctions authority.", article: "Art. 20(1)(d); Reg. 269/2014", absolute: true });
  if (!f.identityVerified && !f.sddDelayedVerification) items.push({ id: "identity", message: "Verify the identity of this party.", article: "Art. 22–23" });
  if (f.boResolved === false) items.push({ id: "beneficial-owners", message: "Identify the beneficial owners or record the senior managing officials.", article: "Art. 20(1)(b), 22(2)" });
  if (!f.purposeRecorded) items.push({ id: "purpose", message: "Record the purpose and intended nature of the relationship.", article: "Art. 25" });
  if (!f.riskAssessed) items.push({ id: "risk", message: "Complete the client risk assessment.", article: "Art. 20(2)" });
  if (f.unscreenedParties) items.push({ id: "unscreened", message: `${f.unscreenedParties} person(s) or companies in the structure haven't been screened yet. Use "Screen again now" (if no lists are loaded or today's limit was reached, try later or contact AMLSyncAI).`, article: "Art. 20(1)(d)" });
  if (f.openScreeningMatches > 0) items.push({ id: "screening", message: `Resolve ${f.openScreeningMatches} possible screening match(es) as true match or false positive.`, article: "Art. 20(1)(d)" });
  if (f.eddRequired && !f.eddChecklistComplete) items.push({ id: "edd", message: "Complete the EDD checklist.", article: "Art. 34(4)" });
  if (f.eddRequired && !f.seniorApprovalRecorded) items.push({ id: "senior-approval", message: "Senior management approval is required.", article: "Art. 34(4)" });
  if (f.isPep && !f.pepApprovalRecorded) items.push({ id: "pep-approval", message: "Senior management approval is required to establish or continue a PEP relationship.", article: "Art. 42(1)" });
  if (f.openDiscrepancy) items.push({ id: "discrepancy", message: "Resolve the register discrepancy or file the report.", article: "Art. 24" });
  return items;
}

export interface Override {
  byRole: string;
  reason: string;
}

export interface GateDecision {
  allowed: boolean;
  openItems: GateItem[];
  overridden: boolean;
  error?: string;
}

export function decideGate(items: GateItem[], override?: Override): GateDecision {
  if (items.length === 0) return { allowed: true, openItems: [], overridden: false };
  if (!override) return { allowed: false, openItems: items, overridden: false };
  if (override.byRole !== "compliance-officer") {
    return { allowed: false, openItems: items, overridden: false, error: "Only a Compliance Officer can override a gate." };
  }
  if (override.reason.trim().length < 10) {
    return { allowed: false, openItems: items, overridden: false, error: "Give a written reason for the override." };
  }
  const absolute = items.filter((i) => i.absolute);
  if (absolute.length) {
    return { allowed: false, openItems: items, overridden: false, error: `Cannot be overridden: ${absolute.map((i) => i.message).join(" ")}` };
  }
  return { allowed: true, openItems: items, overridden: true };
}

export function canAcceptClient(f: CddFileState, override?: Override): GateDecision {
  return decideGate(openCddItems(f), override);
}

export interface MatterState {
  sector: Sector;
  type: MatterType;
  files: CddFileState[];
  /** An STR is pending and the Art. 71 hold has not lifted. */
  transactionHold: boolean;
  sanctionsBlocked?: boolean;
}

export function openMatterItems(m: MatterState): GateItem[] {
  const items: GateItem[] = [];
  for (const role of requiredRoles(m.sector, m.type)) {
    if (!m.files.some((f) => f.role === role)) {
      items.push({ id: `missing-${role}`, message: `Add the ${role} and complete their CDD.`, article: "Art. 19(6)" });
    }
  }
  for (const f of m.files) {
    for (const i of openCddItems(f)) items.push({ ...i, id: `${f.partyId}:${i.id}`, message: `${f.role}: ${i.message}` });
  }
  if (m.transactionHold) items.push({ id: "hold", message: "Transaction on hold pending FIU (3 working days).", article: "Art. 71", absolute: true });
  if (m.sanctionsBlocked) items.push({ id: "sanctions-block", message: "Matter blocked by a sanctions hit.", article: "Reg. 269/2014", absolute: true });
  return items;
}

/**
 * Estate agents: the funds/property-transfer step needs both parties verified
 * (Art. 23 — after offer accepted, before funds or property move).
 */
export function canTransferFundsOrProperty(m: MatterState, override?: Override): GateDecision {
  return decideGate(openMatterItems(m), override);
}

export function canCompleteMatter(m: MatterState, override?: Override): GateDecision {
  return decideGate(openMatterItems(m), override);
}
