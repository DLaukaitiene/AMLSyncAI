/**
 * Country risk lists for AMLR Annex III point 3 (higher-risk geographical factors),
 * applied automatically to every country linked to a client (spec §4A.4: risk inputs
 * come from data already collected, never from a manual tick).
 *
 * Part of the EU Core: maintained by AMLSync App and versioned like the EU high-risk
 * list (high-risk-countries.ts). Each list names its source and the date it reflects;
 * both appear in the risk factor label and in COUNTRY_RISK_LISTS_VERSION, which is part
 * of RISK_RULESET_VERSION and so stored with every client risk assessment.
 *
 * [verify] every list against its source before each release: they change during the
 * year (FATF plenaries in February, June and October; EU tax list in February and
 * October; CPI each February).
 */

export type CountryListId = "fatf-grey-list" | "country-sanctions" | "terrorism-country" | "corruption-cpi" | "secrecy-jurisdiction";

export interface CountryRiskList {
  id: CountryListId;
  /** Short name used in the factor label. */
  name: string;
  /** Who publishes the list. */
  source: string;
  /** Date of the source version the codes reflect (YYYY-MM-DD). */
  asOf: string;
  points: number;
  article: string;
  codes: ReadonlySet<string>;
}

/** FATF "jurisdictions under increased monitoring" (grey list), public statement of the October 2025 plenary. */
export const FATF_GREY_LIST: CountryRiskList = {
  id: "fatf-grey-list",
  name: "FATF grey list (jurisdictions under increased monitoring)",
  source: "FATF",
  asOf: "2025-10-24",
  points: 3,
  article: "Annex III(3)(a)",
  codes: new Set([
    "DZ", "AO", "BO", "BG", "CM", "CI", "CD", "HT", "KE", "LA", "LB", "MC", "NA", "NP", "SS", "SY", "VE", "VN", "YE",
    "VG", // British Virgin Islands
  ]),
};

/**
 * Countries under an EU restrictive-measures regime with an arms embargo or economic/sectoral
 * measures (EU Sanctions Map), or a UN Security Council sanctions regime. Country-level only:
 * name matches on sanctions lists are handled by screening.
 */
export const SANCTIONED_COUNTRIES: CountryRiskList = {
  id: "country-sanctions",
  name: "EU/UN sanctions or embargo",
  source: "EU Sanctions Map and UN Security Council sanctions regimes",
  asOf: "2026-06-30",
  points: 4,
  article: "Annex III(3)(b)",
  codes: new Set([
    "AF", "BY", "CF", "CD", "HT", "IR", "IQ", "KP", "LB", "LY", "MM", "NI", "RU", "SO", "SS", "SD", "SY", "VE", "YE", "ZW",
  ]),
};

/**
 * Countries designated as state sponsors of terrorism (US State Department) and countries
 * where groups on the UN ISIL (Da'esh)/Al-Qaida and Taliban sanctions lists operate, as
 * reported by the UN Analytical Support and Sanctions Monitoring Team.
 */
export const TERRORISM_COUNTRIES: CountryRiskList = {
  id: "terrorism-country",
  name: "supports terrorism or hosts designated terrorist organisations",
  source: "US State Sponsors of Terrorism; UN 1267 Monitoring Team reports",
  asOf: "2026-01-31",
  points: 4,
  article: "Annex III(3)(c)",
  codes: new Set([
    "CU", "IR", "KP", "SY", // state sponsors of terrorism
    "AF", "IQ", "SO", "YE", "LY", "ML", "BF", "NE", "NG", "MZ", "CD", // operating area of UN-listed groups
  ]),
};

/** EU list of non-cooperative jurisdictions for tax purposes (Annex I, Council conclusions). */
export const SECRECY_JURISDICTIONS: CountryRiskList = {
  id: "secrecy-jurisdiction",
  name: "EU list of non-cooperative jurisdictions for tax purposes",
  source: "Council of the EU",
  asOf: "2025-02-18",
  points: 3,
  article: "Annex III(3)",
  codes: new Set(["AS", "AI", "FJ", "GU", "PW", "PA", "RU", "WS", "TT", "VI", "VU"]),
};

/** Transparency International Corruption Perceptions Index: edition and the scores it publishes. */
export const CPI_EDITION = { name: "Transparency International CPI 2024", source: "Transparency International", asOf: "2025-02-11", points: 3, article: "Annex III(3)" } as const;

/** Default threshold: a score below this counts as significant corruption. A firm can raise it in its Country Profile. */
export const DEFAULT_CPI_THRESHOLD = 30;
/** Scores are held for every country below this value, so the threshold can't be set above it. */
export const MAX_CPI_THRESHOLD = 45;

/** CPI scores (0 = highly corrupt, 100 = very clean) for countries scoring below MAX_CPI_THRESHOLD. */
export const CPI_SCORES: Readonly<Record<string, number>> = {
  SS: 8, SO: 9, VE: 10, SY: 12, YE: 13, LY: 13, ER: 13, GQ: 13, NI: 14, SD: 15, KP: 15, MM: 16, HT: 16,
  AF: 17, BI: 17, TM: 17, TJ: 19, CD: 20, CU: 20, CF: 20, KH: 21, ZW: 21, TD: 21, KM: 21, GW: 21, HN: 22,
  LB: 22, RU: 22, AZ: 22, IR: 23, CG: 23, BD: 23, PY: 24, LR: 25, UG: 25, GT: 25, MZ: 25, KG: 25, IQ: 26,
  NG: 26, CM: 26, MG: 26, MX: 26, GN: 28, PK: 27, GA: 27, ML: 27, SZ: 27, BO: 28, PG: 28, EG: 30, MR: 30,
  SV: 30, DJ: 31, PE: 31, AO: 32, KE: 32, EC: 32, TG: 32, UZ: 32, LK: 32, LA: 33, PH: 33, SL: 33, BY: 33,
  BA: 33, MN: 33, NP: 34, DZ: 34, NE: 34, MW: 34, TH: 34, TR: 34, BR: 34, UA: 35, RS: 35, DO: 36, ET: 37,
  AR: 37, ID: 37, MA: 37, LS: 37, GM: 38, IN: 38, ZM: 39, CO: 39, TN: 39, VN: 40, KZ: 40, MK: 40, BF: 41,
  TZ: 41, ZA: 41, AL: 42, GH: 42, CN: 43, MD: 43, XK: 44,
};

/** Lists that match on country code alone, in the order they are checked. */
export const COUNTRY_RISK_LISTS: readonly CountryRiskList[] = [FATF_GREY_LIST, SANCTIONED_COUNTRIES, TERRORISM_COUNTRIES, SECRECY_JURISDICTIONS];

/** Stored as part of the risk rule-set version, so each assessment records which list versions it used. */
export const COUNTRY_RISK_LISTS_VERSION =
  `fatf-${FATF_GREY_LIST.asOf}.sanctions-${SANCTIONED_COUNTRIES.asOf}.terrorism-${TERRORISM_COUNTRIES.asOf}` +
  `.cpi-${CPI_EDITION.asOf}.eu-tax-${SECRECY_JURISDICTIONS.asOf}`;
