/**
 * EU Core rule set (spec §3A.1).
 *
 * The general EU rules, identical in all 27 member states. Maintained by
 * AMLSyncAI, versioned, and referenced by every decision the system stores.
 * A firm's Country Profile may only add, tighten or fill in parameters on top
 * of these values — never relax them (spec §3A.3 rule 1).
 *
 * Article references are to Regulation (EU) 2024/1624 (AMLR) unless stated.
 */

export const EU_CORE_VERSION = "2026.11.0";

export const EU_CORE = {
  version: EU_CORE_VERSION,

  /** AMLR applies from this date (Art. 90). */
  applicationDate: "2027-07-10",

  cdd: {
    /** Occasional transaction threshold, incl. linked transactions (Art. 19(1)(b)). */
    occasionalTransactionEUR: 10_000,
    /** Cash identification threshold for HVG / precious-metal traders (Art. 19(4)). */
    cashIdentificationEUR: 3_000,
    /** Gambling stakes / winnings (Art. 19(5)). */
    gamblingEUR: 2_000,
    /** Art traders, incl. linked transactions (Art. 3(3)(i)–(j)). */
    artEUR: 10_000,
    /** Letting agents: monthly rent at or above this is in scope (Art. 3(3)(d)). */
    lettingMonthlyRentEUR: 10_000,
    /**
     * Window in which occasional transactions by the same customer are treated
     * as linked. [verify] against the final AMLA RTS under Art. 19(9).
     */
    linkedTransactionWindowDays: 365,
  },

  beneficialOwnership: {
    /** 25% or more of shares / voting rights / ownership interest (Art. 52(1)). */
    thresholdPct: 25,
  },

  sanctions: {
    /** Entity owned more than 50% by sanctioned persons is treated as sanctioned-controlled. */
    ownershipAggregationPct: 50,
  },

  sdd: {
    /** Maximum verification delay under SDD (Art. 33). */
    maxVerificationDelayDays: 60,
  },

  pep: {
    /** Former PEPs remain in scope at least this long after leaving office (Art. 46). */
    formerPepMonths: 12,
  },

  monitoring: {
    /** Maximum interval between CDD updates (Art. 26(2)). */
    refreshYearsEDD: 1,
    refreshYearsStandard: 5,
  },

  reporting: {
    /** Reply to FIU requests (Art. 69(1)(b)) — working days. */
    fiuRequestWorkingDays: 5,
    /** Refrain from the transaction; may proceed after this many working days without FIU instruction (Art. 71). */
    transactionHoldWorkingDays: 3,
    /** Report BO-register discrepancies within (Art. 24) — calendar days. */
    discrepancyCalendarDays: 14,
    /** Art. 74 threshold reports. */
    motorVehicleEUR: 250_000,
    aircraftWatercraftEUR: 7_500_000,
  },

  cash: {
    /** EU-wide cash payment cap (Art. 80(1)). */
    capEUR: 10_000,
  },

  records: {
    /** Retention from end of relationship / occasional transaction / refusal (Art. 77). */
    retentionYears: 5,
    /** Maximum authority-ordered extension (Art. 77(3)). */
    maxLegalHoldExtensionYears: 5,
  },

  annexIV: {
    jewelleryWatchesEUR: 10_000,
    motorVehiclesEUR: 250_000,
    aircraftWatercraftEUR: 7_500_000,
  },
} as const;

export type EuCore = typeof EU_CORE;
