import { OBLIGATIONS, type Obligation, type ObligationId } from "./catalog";

/** What the dashboard knows about the firm, gathered on the server. */
export interface ObligationInput {
  onePerson: boolean;
  complianceOfficer: string | null; // name
  responsibleManager: string | null; // name
  unassignedDuties: number;
  riskAssessmentInForce: boolean;
  riskAssessmentReviewOverdue: boolean;
  policyInForce: boolean;
  policyReviewOverdue: boolean;
  countryProfileMissing: number; // required items
  clientsTotal: number;
  clientsInProgress: number;
  clientsStale: number; // in progress for more than 30 days
  openAlerts: number; // client + staff possible matches
  highRiskOrPepAwaitingApproval: number;
  highRiskTotal: number;
  openMatters: number;
  flaggedTransactions: number;
  overdueReviews: number;
  reviewsDue30: number;
  internalReportsOpen: number; // undecided (Compliance Officer)
  reportDrafts: number; // FIU / threshold / cash / sanctions / discrepancy drafts not yet submitted
  reportingOverdue: number; // holds, FIU requests, discrepancy deadlines past due
  trainingOverdue: number;
  staffWithoutTraining: number; // active users with no training completed in the last 12 months
  integrityDue: number;
  staffScreeningOpen: number;
  whistleblowingUnacknowledged: number;
  whistleblowingLate: number; // older than 7 days and not acknowledged
  retentionDue: number; // files past their retention date
}

export type ObligationState = "done" | "todo" | "overdue" | "na";
export interface ObligationStatus { id: ObligationId; state: ObligationState; detail: string }

const n = (k: number, one: string, many = one + "s") => `${k} ${k === 1 ? one : many}`;

export function evaluateObligations(i: ObligationInput): ObligationStatus[] {
  const s = (id: ObligationId, state: ObligationState, detail: string): ObligationStatus => ({ id, state, detail });
  const out: Record<ObligationId, ObligationStatus> = {
    "compliance-officer": !i.complianceOfficer || !i.responsibleManager
      ? s("compliance-officer", "todo", !i.complianceOfficer && !i.responsibleManager ? "Nobody is appointed yet." : !i.complianceOfficer ? `Responsible manager: ${i.responsibleManager}. Appoint the Compliance Officer.` : `Compliance Officer: ${i.complianceOfficer}. Appoint the responsible manager.`)
      : i.unassignedDuties
        ? s("compliance-officer", "todo", `Compliance Officer: ${i.complianceOfficer} · responsible manager: ${i.responsibleManager}. ${n(i.unassignedDuties, "AML duty", "AML duties")} still without a named person.`)
        : s("compliance-officer", "done", `Compliance Officer: ${i.complianceOfficer} · responsible manager: ${i.responsibleManager}.`),
    "risk-assessment": !i.riskAssessmentInForce ? s("risk-assessment", "todo", "Not approved yet. It takes about 15 minutes.")
      : i.riskAssessmentReviewOverdue ? s("risk-assessment", "overdue", "The yearly review is overdue.")
      : s("risk-assessment", "done", "Approved and in force."),
    policies: !i.policyInForce ? s("policies", "todo", i.riskAssessmentInForce ? "Generate it from your risk assessment and approve it." : "Do the risk assessment first; the AML Program is written from it.")
      : i.policyReviewOverdue ? s("policies", "overdue", "The yearly review is overdue.")
      : s("policies", "done", "Approved and in force."),
    "national-rules": i.countryProfileMissing ? s("national-rules", "todo", `${n(i.countryProfileMissing, "required item")} missing, e.g. your FIU's reporting channel.`) : s("national-rules", "done", "Your supervisor and FIU are recorded."),
    "client-checks": i.clientsStale ? s("client-checks", "overdue", `${n(i.clientsStale, "client")} in progress for more than 30 days.`)
      : i.clientsInProgress ? s("client-checks", "todo", `${n(i.clientsInProgress, "client")} not yet fully checked. Don't start work until they are.`)
      : i.clientsTotal ? s("client-checks", "done", `All ${n(i.clientsTotal, "client")} checked.`)
      : s("client-checks", "todo", "No clients yet. Add your first client before you start work for them."),
    screening: i.openAlerts ? s("screening", "overdue", `${n(i.openAlerts, "possible match", "possible matches")} waiting for your decision.`) : s("screening", "done", "No open matches. Everyone is re-screened daily."),
    "high-risk": i.highRiskOrPepAwaitingApproval ? s("high-risk", "todo", `${n(i.highRiskOrPepAwaitingApproval, "high-risk or PEP client")} without senior management approval.`)
      : s("high-risk", "done", i.highRiskTotal ? `${n(i.highRiskTotal, "high-risk client")}, all approved.` : "No high-risk clients."),
    deals: i.flaggedTransactions ? s("deals", "overdue", `${n(i.flaggedTransactions, "flagged payment")} to review.`)
      : s("deals", "done", i.openMatters ? `${n(i.openMatters, "open matter")}; no flagged payments.` : "Record your next deal as a matter."),
    reviews: i.overdueReviews ? s("reviews", "overdue", `${n(i.overdueReviews, "client review")} overdue.`)
      : i.reviewsDue30 ? s("reviews", "todo", `${n(i.reviewsDue30, "review")} due in the next 30 days.`)
      : s("reviews", "done", "No reviews due."),
    reporting: i.reportingOverdue ? s("reporting", "overdue", `${n(i.reportingOverdue, "reporting deadline")} passed.`)
      : i.internalReportsOpen || i.reportDrafts ? s("reporting", "todo", [i.internalReportsOpen ? `${n(i.internalReportsOpen, "internal report")} to decide` : "", i.reportDrafts ? `${n(i.reportDrafts, "report")} to send` : ""].filter(Boolean).join(" · ") + ".")
      : s("reporting", "done", "Nothing to report. If anything seems suspicious, report it to the Compliance Officer."),
    training: i.trainingOverdue ? s("training", "overdue", `${n(i.trainingOverdue, "training")} overdue.`)
      : i.staffWithoutTraining ? s("training", "todo", `${n(i.staffWithoutTraining, "person", "people")} without AML training in the last 12 months.`)
      : s("training", "done", "Everyone trained in the last 12 months."),
    "staff-integrity": i.onePerson ? s("staff-integrity", "na", "Not needed for a one-person firm.")
      : i.integrityDue || i.staffScreeningOpen ? s("staff-integrity", "todo", [i.integrityDue ? `${n(i.integrityDue, "declaration")} due` : "", i.staffScreeningOpen ? "staff screening to run or review" : ""].filter(Boolean).join(" · ") + ".")
      : s("staff-integrity", "done", "Declarations current and staff screened."),
    whistleblowing: i.onePerson ? s("whistleblowing", "na", "Not needed for a one-person firm.")
      : i.whistleblowingLate ? s("whistleblowing", "overdue", `${n(i.whistleblowingLate, "report")} not acknowledged within 7 days.`)
      : i.whistleblowingUnacknowledged ? s("whistleblowing", "todo", `${n(i.whistleblowingUnacknowledged, "report")} to acknowledge.`)
      : s("whistleblowing", "done", "The confidential channel is open to staff."),
    records: i.retentionDue ? s("records", "todo", `${n(i.retentionDue, "file")} past the 5-year period: review for deletion.`) : s("records", "done", "Everything is recorded automatically."),
  };
  return OBLIGATIONS.map((o) => out[o.id]);
}

/** Totals for the dashboard headline. */
export function obligationSummary(st: ObligationStatus[]) {
  const live = st.filter((x) => x.state !== "na");
  return { total: live.length, done: live.filter((x) => x.state === "done").length, overdue: live.filter((x) => x.state === "overdue").length, todo: live.filter((x) => x.state === "todo").length };
}

/** Sector note for a firm (first sector that has one). */
export function sectorNote(o: Obligation, sectors: string[]): string | null {
  for (const s of sectors) if (o.sectorNotes?.[s]) return o.sectorNotes[s]!;
  return null;
}
