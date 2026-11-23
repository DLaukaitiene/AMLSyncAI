/**
 * EU list of high-risk third countries (AMLR Art. 29; Commission Delegated
 * Regulation (EU) 2016/1675 as amended) and countries subject to
 * countermeasures (Art. 35 / FATF "call for action").
 *
 * Part of the EU Core: maintained by AMLSync App and versioned. [verify] against
 * the latest Commission delegated act before each release — the list changes
 * several times a year and AMLA takes over the identification under AMLR.
 */
export const HIGH_RISK_LIST_VERSION = "2026-01-29 (Delegated Regulations (EU) 2026/46 and 2026/83) [check EUR-Lex for later amendments]";

export const EU_HIGH_RISK_THIRD_COUNTRIES: ReadonlySet<string> = new Set([
  "AF", // Afghanistan
  "DZ", // Algeria
  "AO", // Angola
  "BO", // Bolivia
  "CM", // Cameroon
  "CD", // Democratic Republic of the Congo
  "CI", // Côte d'Ivoire
  "HT", // Haiti
  "IR", // Iran
  "KE", // Kenya
  "KP", // North Korea
  "LA", // Laos
  "LB", // Lebanon
  "MC", // Monaco
  "MM", // Myanmar
  "NA", // Namibia
  "NP", // Nepal
  "SS", // South Sudan
  "SY", // Syria
  "TT", // Trinidad and Tobago
  "RU", // Russia (FATF membership suspended; added 29 Jan 2026)
  "VE", // Venezuela
  "VG", // British Virgin Islands (added 29 Jan 2026)
  "VN", // Vietnam
  "VU", // Vanuatu
  "YE", // Yemen
]);

/** Jurisdictions under a FATF call for action / EU countermeasures. */
export const COUNTERMEASURE_COUNTRIES: ReadonlySet<string> = new Set(["KP", "IR", "MM"]);
