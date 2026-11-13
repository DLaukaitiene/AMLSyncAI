/**
 * Client risk scoring (spec §4.3, §4A.4, §11.7; AMLR Art. 20(2), 33, 34, 42–46).
 *
 * Transparent and rule-based: every factor and its contribution is listed and
 * the rule-set version is stored. AI never sets a risk rating.
 */
import { EU_CORE_VERSION } from "./eu-core";
import type { CountryProfile } from "./country-profile";

export const RISK_RULESET_VERSION = `${EU_CORE_VERSION}+risk.1`;

export type RiskLevel = "Low" | "Medium" | "High";
export type DeliveryChannel = "face-to-face" | "remote-eid" | "remote-document" | "intermediary";

export interface RiskInput {
  clientType: "natural" | "legal" | "arrangement";
  /** ISO country codes linked to the client: residence, nationality, incorporation, BO residences, counterparties. */
  countries: string[];
  /** EU list of high-risk third countries (Art. 29). */
  highRiskThirdCountries: ReadonlySet<string>;
  /** Countries subject to EU countermeasures (Art. 35). */
  countermeasureCountries?: ReadonlySet<string>;
  isPep: boolean;
  isFormerPepWithin12Months?: boolean;
  isPepFamilyOrAssociate?: boolean;
  deliveryChannel: DeliveryChannel;
  usesCash: boolean;
  /** Number of ownership layers between the client and its natural-person BOs. */
  ownershipLayers: number;
  nomineeArrangements: boolean;
  /** Sector-level product/service risk from the firm risk assessment. */
  productRisk: "low" | "medium" | "high";
  /** Unusual / complex / no apparent purpose transaction (Art. 34(2)). */
  unusualTransaction?: boolean;
  /** IDs of firm-added "additional EDD cases" (Country Profile) that apply. */
  additionalEddCaseIds?: string[];
  adverseMediaConfirmed?: boolean;
}

export interface RiskFactor {
  id: string;
  label: string;
  points: number;
  /** Forces at least High / EDD regardless of total. */
  forcesHigh?: boolean;
  article?: string;
}

export interface RiskResult {
  level: RiskLevel;
  score: number;
  factors: RiskFactor[];
  eddRequired: boolean;
  sddEligible: boolean;
  rulesetVersion: string;
  countryProfileVersion?: number;
}

const MEDIUM_FROM = 3;
const HIGH_FROM = 7;

export function scoreClientRisk(input: RiskInput, profile?: CountryProfile, countryProfileVersion?: number): RiskResult {
  const f: RiskFactor[] = [];

  if (input.clientType === "legal") f.push({ id: "client-legal", label: "Client is a legal entity", points: 1 });
  if (input.clientType === "arrangement") f.push({ id: "client-arrangement", label: "Client is a trust or legal arrangement", points: 3 });

  const hr = input.countries.filter((c) => input.highRiskThirdCountries.has(c));
  if (hr.length) {
    f.push({ id: "high-risk-country", label: `Link to high-risk third country: ${hr.join(", ")}`, points: 5, forcesHigh: true, article: "Art. 29, 34" });
  }
  const cm = input.countries.filter((c) => input.countermeasureCountries?.has(c));
  if (cm.length) {
    f.push({ id: "countermeasure-country", label: `Link to country under EU countermeasures: ${cm.join(", ")}`, points: 5, forcesHigh: true, article: "Art. 35" });
  }

  if (input.isPep) f.push({ id: "pep", label: "Politically exposed person", points: 5, forcesHigh: true, article: "Art. 42" });
  else if (input.isFormerPepWithin12Months) f.push({ id: "former-pep", label: "Former PEP (left office less than 12 months ago)", points: 5, forcesHigh: true, article: "Art. 46" });
  if (input.isPepFamilyOrAssociate) f.push({ id: "pep-rca", label: "Family member or close associate of a PEP", points: 5, forcesHigh: true, article: "Art. 44" });

  const channelPoints: Record<DeliveryChannel, number> = { "face-to-face": 0, "remote-eid": 0, "remote-document": 1, intermediary: 2 };
  if (channelPoints[input.deliveryChannel]) {
    f.push({ id: "channel", label: `Delivery channel: ${input.deliveryChannel}`, points: channelPoints[input.deliveryChannel] });
  }

  if (input.usesCash) f.push({ id: "cash", label: "Cash use", points: 2 });
  if (input.ownershipLayers >= 3) f.push({ id: "complex-structure", label: `Complex ownership (${input.ownershipLayers} layers)`, points: 3 });
  else if (input.ownershipLayers === 2) f.push({ id: "layered-structure", label: "Two ownership layers", points: 1 });
  if (input.nomineeArrangements) f.push({ id: "nominee", label: "Nominee shareholders or directors", points: 3 });

  const productPoints = { low: 0, medium: 1, high: 3 } as const;
  if (productPoints[input.productRisk]) f.push({ id: "product", label: `Product/service risk: ${input.productRisk}`, points: productPoints[input.productRisk] });

  if (input.unusualTransaction) f.push({ id: "unusual-transaction", label: "Complex, unusually large or no apparent purpose transaction", points: 5, forcesHigh: true, article: "Art. 34(2)" });
  if (input.adverseMediaConfirmed) f.push({ id: "adverse-media", label: "Confirmed adverse media", points: 4 });

  for (const id of input.additionalEddCaseIds ?? []) {
    const c = profile?.additionalEddCases.find((x) => x.id === id);
    if (!c) throw new Error(`Unknown additional EDD case "${id}" — not in the Country Profile`);
    f.push({ id: `national-edd:${id}`, label: `National EDD case: ${c.description}`, points: 5, forcesHigh: true, article: "Art. 34(6)" });
  }

  const score = f.reduce((s, x) => s + x.points, 0);
  const forced = f.some((x) => x.forcesHigh);
  const level: RiskLevel = forced || score >= HIGH_FROM ? "High" : score >= MEDIUM_FROM ? "Medium" : "Low";

  return {
    level,
    score,
    factors: f,
    eddRequired: level === "High",
    sddEligible: level === "Low",
    rulesetVersion: RISK_RULESET_VERSION,
    countryProfileVersion,
  };
}

export interface RiskOverride {
  newLevel: RiskLevel;
  reason: string;
  byRole: string;
}

/** Manual override needs a written reason and the Compliance Officer role; both scores are kept (§11.7). */
export function applyOverride(result: RiskResult, o: RiskOverride) {
  if (o.byRole !== "compliance-officer") throw new Error("Only a Compliance Officer can override a risk level.");
  if (o.reason.trim().length < 10) throw new Error("Give a written reason for the override.");
  if (result.factors.some((f) => f.forcesHigh) && o.newLevel !== "High") {
    throw new Error("This client has a factor that legally requires EDD; the level cannot be lowered below High.");
  }
  return { calculated: result, final: o.newLevel, override: o };
}

/** Art. 34(4) EDD checklist (spec §4.3). */
export const EDD_CHECKLIST = [
  { id: "more-info-client-bo", label: "Additional information on the client and beneficial owners" },
  { id: "purpose", label: "Additional information on the intended nature of the relationship" },
  { id: "source-of-wealth", label: "Source of wealth of the client and beneficial owners" },
  { id: "source-of-funds", label: "Source of funds" },
  { id: "transaction-reasons", label: "Reasons for intended or performed transactions" },
  { id: "senior-approval", label: "Senior management approval to establish or continue the relationship" },
  { id: "enhanced-monitoring", label: "Enhanced monitoring: more frequent controls and selected patterns" },
  { id: "first-payment-own-account", label: "First payment through an account in the client's name with a credit institution" },
] as const;
