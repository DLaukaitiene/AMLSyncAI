/**
 * Firm compliance status on the dashboard (competitor review, recommendation 14):
 * one word plus the reasons, so the firm knows what to fix first.
 */
export interface HealthInput {
  riskAssessmentInForce: boolean;
  policyInForce: boolean;
  countryProfileRequiredMissing: number;
  overdueRefreshes: number;
  overdueTasks: number;
  overdueTraining: number;
  pendingScreeningMatches: number;
  staleOpenFiles: number; // client files open for more than 30 days
}

export type HealthLevel = "on-track" | "needs-attention" | "at-risk";

export function complianceHealth(i: HealthInput): { level: HealthLevel; reasons: { text: string; href: string; serious: boolean }[] } {
  const r: { text: string; href: string; serious: boolean }[] = [];
  if (!i.riskAssessmentInForce) r.push({ text: "No approved business-wide risk assessment", href: "/app/firm/risk-assessment", serious: true });
  if (!i.policyInForce) r.push({ text: "No approved AML policy", href: "/app/firm/policies", serious: true });
  if (i.countryProfileRequiredMissing) r.push({ text: `${i.countryProfileRequiredMissing} required Country Profile item(s) missing`, href: "/app/settings/country-profile", serious: true });
  if (i.overdueRefreshes) r.push({ text: `${i.overdueRefreshes} client refresh(es) overdue`, href: "/app/clients?status=overdue", serious: true });
  if (i.overdueTasks) r.push({ text: `${i.overdueTasks} overdue task(s) in the calendar`, href: "/app/calendar", serious: false });
  if (i.overdueTraining) r.push({ text: `${i.overdueTraining} training assignment(s) overdue`, href: "/app/firm/training", serious: false });
  if (i.pendingScreeningMatches) r.push({ text: `${i.pendingScreeningMatches} possible screening match(es) to decide`, href: "/app/clients?status=open", serious: false });
  if (i.staleOpenFiles) r.push({ text: `${i.staleOpenFiles} client file(s) open for more than 30 days`, href: "/app/clients?status=open", serious: false });
  const level: HealthLevel = r.some((x) => x.serious) ? "at-risk" : r.length ? "needs-attention" : "on-track";
  return { level, reasons: r };
}

/**
 * Program Status by pillar (as ClearAML shows it): Governance, Risk, People,
 * Monitoring, Reporting. Each pillar is the share of its checks that pass.
 */
export interface PillarInput {
  riskAssessmentInForce: boolean;
  policyInForce: boolean;
  countryProfileRequiredMissing: number;
  complianceOfficerAppointed: boolean;
  unassignedDuties?: number; // Team → Responsibilities
  overdueRefreshes: number;
  clientsWithoutRiskAssessment: number;
  overdueTraining: number;
  integrityOverdue: number; // staff without a declaration in the last 12 months (multi-person firms)
  staffScreeningOpen: number; // unreviewed staff possible matches or staff never screened
  pendingScreeningMatches: number;
  flaggedTransactions?: number;
  staleOpenFiles: number;
  overdueCaseTasks: number; // holds, FIU requests, discrepancy reports past due
  draftReportsOlderThan7Days: number;
}
export type PillarId = "governance" | "risk" | "people" | "monitoring" | "reporting";
export interface Pillar { id: PillarId; label: string; score: number; href: string; issues: string[] }

export function programStatus(i: PillarInput): Pillar[] {
  const pillar = (id: PillarId, label: string, href: string, checks: [boolean, string][]): Pillar => {
    const failed = checks.filter(([ok]) => !ok).map(([, why]) => why);
    return { id, label, href, score: Math.round(((checks.length - failed.length) / checks.length) * 100), issues: failed };
  };
  return [
    pillar("governance", "Governance", "/app/team/responsibilities", [
      [i.policyInForce, "AML Program not approved"],
      [i.complianceOfficerAppointed, "No Compliance Officer appointed"],
      [i.countryProfileRequiredMissing === 0, `${i.countryProfileRequiredMissing} required Country Profile item(s) missing`],
      [!i.unassignedDuties, `${i.unassignedDuties} AML dut(ies) with nobody assigned`],
    ]),
    pillar("risk", "Risk", "/app/risk-assessments", [
      [i.riskAssessmentInForce, "Business Risk Assessment not approved"],
      [i.overdueRefreshes === 0, `${i.overdueRefreshes} client review(s) overdue`],
      [i.clientsWithoutRiskAssessment === 0, `${i.clientsWithoutRiskAssessment} client(s) without a risk assessment`],
    ]),
    pillar("people", "People", "/app/team", [
      [i.overdueTraining === 0, `${i.overdueTraining} training assignment(s) overdue`],
      [i.integrityOverdue === 0, `${i.integrityOverdue} staff declaration(s) due`],
      [i.staffScreeningOpen === 0, "Staff screening to run or review"],
    ]),
    pillar("monitoring", "Monitoring", "/app/monitoring-alerts", [
      [i.pendingScreeningMatches === 0, `${i.pendingScreeningMatches} open alert(s)`],
      [!i.flaggedTransactions, `${i.flaggedTransactions} flagged transaction(s)`],
      [i.staleOpenFiles === 0, `${i.staleOpenFiles} client file(s) open over 30 days`],
    ]),
    pillar("reporting", "Reporting", "/app/cases", [
      [i.overdueCaseTasks === 0, `${i.overdueCaseTasks} reporting deadline(s) overdue`],
      [i.draftReportsOlderThan7Days === 0, `${i.draftReportsOlderThan7Days} FIU report draft(s) older than 7 days`],
    ]),
  ];
}
