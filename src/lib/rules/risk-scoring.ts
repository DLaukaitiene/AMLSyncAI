/**
 * Client risk scoring (spec §4.3, §4A.4, §11.7; AMLR Art. 20(2), 33, 34, 42–46).
 *
 * Transparent and rule-based: every factor and its contribution is listed and
 * the rule-set version is stored. AI never sets a risk rating.
 */
import { EU_CORE_VERSION } from "./eu-core";
import type { CountryProfile } from "./country-profile";
import { countryName, isKnownCountry } from "@/lib/geo/countries";
import {
  COUNTRY_RISK_LISTS, COUNTRY_RISK_LISTS_VERSION, CPI_EDITION, CPI_SCORES, DEFAULT_CPI_THRESHOLD, type CountryRiskList,
} from "./country-risk-lists";

/** Includes the country list versions (country-risk-lists), so each stored assessment records which lists it used. */
export const RISK_RULESET_VERSION = `${EU_CORE_VERSION}+risk.2+${COUNTRY_RISK_LISTS_VERSION}`;

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
  /** Annex III(3) country lists matched on country code. Default: the built-in versioned lists. */
  countryLists?: readonly CountryRiskList[];
  /** CPI scores by country. Default: the built-in edition. */
  cpiScores?: Readonly<Record<string, number>>;
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
  /** High-risk flags ticked by the user (lib/cdd/risk-flags), already filtered to those that add points. */
  flags?: { id: string; label: string; points: number; forcesHigh?: boolean; article: string }[];
}

export interface RiskFactor {
  id: string;
  label: string;
  points: number;
  /** Forces at least High / EDD regardless of total. */
  forcesHigh?: boolean;
  article?: string;
  /** Country factors: the countries that matched (ISO codes). */
  countries?: string[];
  /** Country factors: the list that matched, its publisher and the date of the version used. */
  list?: { id: string; name: string; source: string; asOf: string };
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

export const MEDIUM_FROM = 3;
export const HIGH_FROM = 7;

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

  f.push(...countryListFactors(input, new Set([...hr, ...cm]), profile?.corruptionCpiThreshold ?? DEFAULT_CPI_THRESHOLD));

  // A country typed by hand ("Other") can't be checked against the lists: a person must assess it.
  const unknown = input.countries.filter((c) => !isKnownCountry(c));
  if (unknown.length) {
    f.push({ id: "unrecognised-country", label: `Country not on the standard list: ${unknown.join(", ")}. Check it against the EU high-risk and countermeasure lists, the FATF grey list, sanctions, terrorism, corruption and tax-secrecy lists`, points: 3, article: "Art. 29, 35; Annex III(3)" });
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

  for (const x of input.flags ?? []) {
    if (x.id === "unusual-transaction" && input.unusualTransaction) continue; // already counted above
    f.push({ id: `flag:${x.id}`, label: x.label, points: x.points, forcesHigh: x.forcesHigh, article: x.article });
  }

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

const fmtDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const named = (codes: string[]) => codes.map((c) => `${countryName(c)} (${c})`).join(", ");

/**
 * Annex III(3) country factors, one per matched list, applied automatically to every linked country.
 * None forces High on its own: the law requires EDD only for the EU high-risk and countermeasure lists.
 * The FATF grey list is skipped for countries already on the EU high-risk list (same FATF assessment).
 */
function countryListFactors(input: RiskInput, euListed: ReadonlySet<string>, cpiThreshold: number): RiskFactor[] {
  const out: RiskFactor[] = [];
  const countries = [...new Set(input.countries.filter(isKnownCountry))];
  for (const l of input.countryLists ?? COUNTRY_RISK_LISTS) {
    const hit = countries.filter((c) => l.codes.has(c) && !(l.id === "fatf-grey-list" && euListed.has(c)));
    if (!hit.length) continue;
    out.push({
      id: `country-list:${l.id}`, label: `Link to a country on the ${l.name} (${l.source}, ${fmtDate(l.asOf)}): ${named(hit)}`,
      points: l.points, article: l.article, countries: hit, list: { id: l.id, name: l.name, source: l.source, asOf: l.asOf },
    });
  }
  const scores = input.cpiScores ?? CPI_SCORES;
  const corrupt = countries.filter((c) => scores[c] !== undefined && scores[c] < cpiThreshold);
  if (corrupt.length) {
    out.push({
      id: "country-list:corruption-cpi",
      label: `Link to a country with significant corruption, ${CPI_EDITION.name} score below ${cpiThreshold} (${CPI_EDITION.source}, ${fmtDate(CPI_EDITION.asOf)}): ${corrupt.map((c) => `${countryName(c)} (${c}, score ${scores[c]})`).join(", ")}`,
      points: CPI_EDITION.points, article: CPI_EDITION.article, countries: corrupt,
      list: { id: "corruption-cpi", name: `${CPI_EDITION.name}, score below ${cpiThreshold}`, source: CPI_EDITION.source, asOf: CPI_EDITION.asOf },
    });
  }
  return out;
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
