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
  if (i.overdueRefreshes) r.push({ text: `${i.overdueRefreshes} client refresh(es) overdue`, href: "/app/clients?tab=refresh", serious: true });
  if (i.overdueTasks) r.push({ text: `${i.overdueTasks} overdue task(s) in the calendar`, href: "/app/calendar", serious: false });
  if (i.overdueTraining) r.push({ text: `${i.overdueTraining} training assignment(s) overdue`, href: "/app/firm/training", serious: false });
  if (i.pendingScreeningMatches) r.push({ text: `${i.pendingScreeningMatches} possible screening match(es) to decide`, href: "/app/clients?tab=open", serious: false });
  if (i.staleOpenFiles) r.push({ text: `${i.staleOpenFiles} client file(s) open for more than 30 days`, href: "/app/clients?tab=open", serious: false });
  const level: HealthLevel = r.some((x) => x.serious) ? "at-risk" : r.length ? "needs-attention" : "on-track";
  return { level, reasons: r };
}
