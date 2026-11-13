/**
 * Compliance Calendar clocks (spec §4.5, §11.9–11.11).
 * Every deadline uses the firm's working calendar from its Country Profile.
 */
import { EU_CORE } from "./eu-core";
import { addCalendarDays, addMonths, addWorkingDays, addYears, type IsoDate } from "./dates";
import { workingCalendar, type CountryProfile } from "./country-profile";

export type DeadlineKind =
  | "refresh"
  | "discrepancy-report"
  | "transaction-hold"
  | "fiu-request"
  | "sdd-verification"
  | "former-pep"
  | "threshold-report"
  | "retention-end";

export interface Deadline {
  kind: DeadlineKind;
  due: IsoDate;
  article: string;
  explanation: string;
}

export function refreshDue(acceptedOrLastRefreshed: IsoDate, edd: boolean): Deadline {
  const years = edd ? EU_CORE.monitoring.refreshYearsEDD : EU_CORE.monitoring.refreshYearsStandard;
  return {
    kind: "refresh",
    due: addYears(acceptedOrLastRefreshed, years),
    article: "Art. 26(2)",
    explanation: `Client information must be updated at least every ${years === 1 ? "year" : `${years} years`}${edd ? " for EDD clients" : ""}.`,
  };
}

export function discrepancyDue(found: IsoDate): Deadline {
  return {
    kind: "discrepancy-report",
    due: addCalendarDays(found, EU_CORE.reporting.discrepancyCalendarDays),
    article: "Art. 24",
    explanation: "Report the discrepancy to the central register within 14 calendar days unless the client corrects it first.",
  };
}

export function transactionHoldEnds(reported: IsoDate, profile: CountryProfile): Deadline {
  return {
    kind: "transaction-hold",
    due: addWorkingDays(reported, EU_CORE.reporting.transactionHoldWorkingDays, workingCalendar(profile)),
    article: "Art. 71",
    explanation: "The transaction may go ahead only if the FIU gives no instruction within 3 working days of the report.",
  };
}

export function fiuRequestDue(received: IsoDate, profile: CountryProfile, fiuDeadlineWorkingDays?: number): Deadline {
  const days = Math.min(fiuDeadlineWorkingDays ?? profile.fiuRequestWorkingDays, EU_CORE.reporting.fiuRequestWorkingDays);
  return {
    kind: "fiu-request",
    due: addWorkingDays(received, days, workingCalendar(profile)),
    article: "Art. 69(1)(b)",
    explanation: `Answer the FIU within ${days} working days.`,
  };
}

export function sddVerificationDue(relationshipStart: IsoDate): Deadline {
  return {
    kind: "sdd-verification",
    due: addCalendarDays(relationshipStart, EU_CORE.sdd.maxVerificationDelayDays),
    article: "Art. 33",
    explanation: "Under SDD, verification may be delayed by at most 60 days.",
  };
}

export function formerPepUntil(leftOffice: IsoDate): Deadline {
  return {
    kind: "former-pep",
    due: addMonths(leftOffice, EU_CORE.pep.formerPepMonths),
    article: "Art. 46",
    explanation: "Former PEPs stay in scope for at least 12 months after leaving office.",
  };
}

export function thresholdReportDue(saleDate: IsoDate, profile: CountryProfile): Deadline | null {
  if (profile.thresholdReportDeadlineWorkingDays === null) return null;
  return {
    kind: "threshold-report",
    due: addWorkingDays(saleDate, profile.thresholdReportDeadlineWorkingDays, workingCalendar(profile)),
    article: "Art. 74",
    explanation: "Deadline set by your FIU for threshold reports.",
  };
}

/** Records are deleted 5 years (or the longer national period) after the end event (Art. 77). */
export function retentionEnds(endEvent: IsoDate, profile: CountryProfile, legalHoldYears = 0): Deadline {
  if (legalHoldYears > EU_CORE.records.maxLegalHoldExtensionYears) {
    throw new Error(`A legal hold can extend retention by at most ${EU_CORE.records.maxLegalHoldExtensionYears} years.`);
  }
  const years = Math.max(profile.retentionYears, EU_CORE.records.retentionYears) + legalHoldYears;
  return {
    kind: "retention-end",
    due: addYears(endEvent, years),
    article: "Art. 77",
    explanation: `Records are kept ${years} years from the end of the relationship, occasional transaction or refusal, then deleted.`,
  };
}

export type CalendarBucket = "overdue" | "due-30-days" | "later" | "done";

export function bucket(d: { due: IsoDate; done?: boolean }, today: IsoDate): CalendarBucket {
  if (d.done) return "done";
  if (d.due < today) return "overdue";
  if (d.due <= addCalendarDays(today, 30)) return "due-30-days";
  return "later";
}
