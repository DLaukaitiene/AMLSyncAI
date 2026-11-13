/**
 * Country Profile (spec §3A.2–3A.3).
 *
 * Country-specific parameters that each firm enters itself. A profile can
 * fill in, add or tighten — never relax the EU Core. Required parameters
 * without a safe default block only the workflows that depend on them.
 */
import { z } from "zod";
import { EU_CORE } from "./eu-core";
import type { IsoDate, WorkingCalendar } from "./dates";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const contact = z.object({
  name: z.string().min(1),
  channel: z.string().min(1), // portal URL, goAML, email, postal address…
  notes: z.string().optional(),
});

export const countryProfileSchema = z.object({
  /** ISO 3166-1 alpha-2 code of the member state, e.g. "LT". */
  memberState: z.string().regex(/^[A-Z]{2}$/),

  supervisors: z.array(contact.extend({ sector: z.string().min(1) })).default([]),
  fiu: contact.extend({ receiptFormat: z.string().optional() }).nullable().default(null),
  sanctionsAuthority: contact.nullable().default(null),
  boRegister: contact.extend({ extractFormat: z.string().optional() }).nullable().default(null),
  businessRegister: contact.nullable().default(null),
  dataProtectionAuthority: contact.nullable().default(null),
  whistleblowing: z.object({ externalChannel: z.string().min(1) }).nullable().default(null),

  sroReportingRoute: z.object({ enabled: z.boolean(), body: z.string().optional() }).default({ enabled: false }),
  privilegeNarrowing: z.object({ enabled: z.boolean(), transactionTypes: z.array(z.string()).default([]) }).default({
    enabled: false,
    transactionTypes: [],
  }),

  /** Lower national cash cap (Art. 80(2)). Default: EU cap. */
  cashCapEUR: z.number().positive().default(EU_CORE.cash.capEUR),
  nationalCashReport: z
    .object({ enabled: z.boolean(), thresholdEUR: z.number().positive().optional(), deadlineWorkingDays: z.number().int().positive().optional() })
    .default({ enabled: false }),
  /** FIU-set deadlines for Art. 74 threshold reports, in working days. */
  thresholdReportDeadlineWorkingDays: z.number().int().positive().nullable().default(null),
  /** FIU may set a shorter deadline for replies to its requests. */
  fiuRequestWorkingDays: z.number().int().positive().default(EU_CORE.reporting.fiuRequestWorkingDays),

  additionalEddCases: z.array(z.object({ id: z.string().min(1), description: z.string().min(1) })).default([]),
  nationalRiskAssessmentReviewed: z.boolean().default(false),
  riskAssessmentWaiver: z.boolean().default(false),

  higherRiskEntityCategories: z
    .array(z.object({ legalForm: z.string().min(1), boThresholdPct: z.number().positive() }))
    .default([]),
  exemptions: z.array(z.string()).default([]),
  additionalObligedEntities: z.array(z.string()).default([]),

  idDocumentTypes: z.array(z.string()).default([]),
  acceptedEidSchemes: z.array(z.string()).default([]),

  retentionYears: z.number().int().positive().default(EU_CORE.records.retentionYears),

  workingWeekdays: z.array(z.number().int().min(1).max(7)).min(1).default([1, 2, 3, 4, 5]),
  holidays: z.array(isoDate).default([]),
});

export type CountryProfileInput = z.input<typeof countryProfileSchema>;
export type CountryProfile = z.output<typeof countryProfileSchema>;

export interface ProfileViolation {
  field: string;
  message: string;
}

/**
 * Rejects any value that would relax the EU Core (spec §3A.3 rule 1, §11.1).
 */
export function findEuCoreRelaxations(p: CountryProfile): ProfileViolation[] {
  const v: ProfileViolation[] = [];
  if (p.cashCapEUR > EU_CORE.cash.capEUR) {
    v.push({
      field: "cashCapEUR",
      message: `The cash cap cannot exceed the EU cap of €${EU_CORE.cash.capEUR.toLocaleString("en")} (AMLR Art. 80(1)). Member states may only set a lower cap.`,
    });
  }
  if (p.retentionYears < EU_CORE.records.retentionYears) {
    v.push({
      field: "retentionYears",
      message: `Records must be kept for at least ${EU_CORE.records.retentionYears} years (AMLR Art. 77). National law may only require longer retention.`,
    });
  }
  if (p.fiuRequestWorkingDays > EU_CORE.reporting.fiuRequestWorkingDays) {
    v.push({
      field: "fiuRequestWorkingDays",
      message: `FIU requests must be answered within ${EU_CORE.reporting.fiuRequestWorkingDays} working days (AMLR Art. 69). The FIU may only set a shorter deadline.`,
    });
  }
  for (const cat of p.higherRiskEntityCategories) {
    if (cat.boThresholdPct > EU_CORE.beneficialOwnership.thresholdPct) {
      v.push({
        field: "higherRiskEntityCategories",
        message: `A beneficial-ownership threshold for "${cat.legalForm}" cannot be above ${EU_CORE.beneficialOwnership.thresholdPct}% (AMLR Art. 52).`,
      });
    }
  }
  if (p.nationalCashReport.enabled && p.nationalCashReport.thresholdEUR === undefined) {
    v.push({ field: "nationalCashReport.thresholdEUR", message: "Enter the threshold for national cash reports." });
  }
  return v;
}

export type ParseResult =
  | { ok: true; profile: CountryProfile }
  | { ok: false; violations: ProfileViolation[] };

/** Validates input shape and EU-Core floor in one step. */
export function parseCountryProfile(input: CountryProfileInput): ParseResult {
  const parsed = countryProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      violations: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    };
  }
  const relax = findEuCoreRelaxations(parsed.data);
  return relax.length ? { ok: false, violations: relax } : { ok: true, profile: parsed.data };
}

export function defaultCountryProfile(memberState: string): CountryProfile {
  return countryProfileSchema.parse({ memberState });
}

// ---------------------------------------------------------------------------
// Completeness gate (spec §3A.3 rule 5)
// ---------------------------------------------------------------------------

export type ParameterStatus = "filled" | "default" | "required-missing" | "not-yet-reviewed";

export interface ChecklistItem {
  parameter: keyof CountryProfile;
  label: string;
  status: ParameterStatus;
  blocks?: string;
}

export function setupChecklist(p: CountryProfile): ChecklistItem[] {
  const required = (
    parameter: keyof CountryProfile,
    label: string,
    present: boolean,
    blocks: string,
  ): ChecklistItem => ({ parameter, label, status: present ? "filled" : "required-missing", blocks: present ? undefined : blocks });

  const optional = (parameter: keyof CountryProfile, label: string, isDefault: boolean): ChecklistItem => ({
    parameter,
    label,
    status: isDefault ? "default" : "filled",
  });

  return [
    required("supervisors", "Supervisor per sector", p.supervisors.length > 0, "Marking supervisor notifications as sent"),
    required("fiu", "FIU name and reporting channel", p.fiu !== null, "Marking an STR or threshold report as submitted"),
    required("sanctionsAuthority", "National sanctions authority", p.sanctionsAuthority !== null, "Marking a sanctions notice as submitted"),
    required("boRegister", "Central BO register channel", p.boRegister !== null, "Marking a discrepancy report as submitted"),
    optional("cashCapEUR", "Cash cap", p.cashCapEUR === EU_CORE.cash.capEUR),
    optional("nationalCashReport", "National cash reports", !p.nationalCashReport.enabled),
    optional("sroReportingRoute", "SRO reporting route", !p.sroReportingRoute.enabled),
    optional("privilegeNarrowing", "Privilege exemption narrowing", !p.privilegeNarrowing.enabled),
    {
      parameter: "additionalEddCases",
      label: "Additional EDD cases and national risk assessment",
      status: p.nationalRiskAssessmentReviewed ? "filled" : "not-yet-reviewed",
    },
    optional("holidays", "Working days and public holidays", p.holidays.length === 0),
    optional("retentionYears", "Record retention", p.retentionYears === EU_CORE.records.retentionYears),
    optional("idDocumentTypes", "ID document types and number formats", p.idDocumentTypes.length === 0),
  ];
}

/** Which "mark as submitted" actions are blocked by missing required parameters. */
export function canMarkSubmitted(
  p: CountryProfile,
  kind: "str" | "threshold-report" | "cash-report" | "sanctions-notice" | "discrepancy-report" | "supervisor-notice",
): { allowed: boolean; reason?: string } {
  const missing = (what: string) => ({
    allowed: false,
    reason: `Complete your Country Profile: ${what} is empty. You can still draft and export the report.`,
  });
  switch (kind) {
    case "str":
    case "threshold-report":
    case "cash-report":
      return p.fiu ? { allowed: true } : missing("the FIU reporting channel");
    case "sanctions-notice":
      return p.sanctionsAuthority ? { allowed: true } : missing("the national sanctions authority");
    case "discrepancy-report":
      return p.boRegister ? { allowed: true } : missing("the BO register channel");
    case "supervisor-notice":
      return p.supervisors.length ? { allowed: true } : missing("the supervisor");
  }
}

export function workingCalendar(p: CountryProfile): WorkingCalendar {
  return { workingWeekdays: p.workingWeekdays, holidays: p.holidays as IsoDate[] };
}

/**
 * The €3,000 cash identification rule switches off where the national cash
 * cap is at or below €3,000 (Art. 19(4)).
 */
export function cashIdentificationThresholdEUR(p: CountryProfile): number | null {
  return p.cashCapEUR <= EU_CORE.cdd.cashIdentificationEUR ? null : EU_CORE.cdd.cashIdentificationEUR;
}

// ---------------------------------------------------------------------------
// Versioning (spec §3A.3 rule 3)
// ---------------------------------------------------------------------------

export interface ProfileChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export function diffProfiles(a: CountryProfile, b: CountryProfile): ProfileChange[] {
  const changes: ProfileChange[] = [];
  for (const key of Object.keys(b) as (keyof CountryProfile)[]) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      changes.push({ field: key, oldValue: a[key], newValue: b[key] });
    }
  }
  return changes;
}
