import { describe, expect, it } from "vitest";
import { complianceHealth } from "./compliance-health";

const ok = { riskAssessmentInForce: true, policyInForce: true, countryProfileRequiredMissing: 0, overdueRefreshes: 0, overdueTasks: 0, overdueTraining: 0, pendingScreeningMatches: 0, staleOpenFiles: 0 };
describe("firm compliance status", () => {
  it("on track when nothing is open", () => expect(complianceHealth(ok).level).toBe("on-track"));
  it("needs attention for day-to-day items", () => expect(complianceHealth({ ...ok, overdueTasks: 2 }).level).toBe("needs-attention"));
  it("at risk without a risk assessment, policy, profile or with overdue refreshes", () => {
    expect(complianceHealth({ ...ok, policyInForce: false }).level).toBe("at-risk");
    expect(complianceHealth({ ...ok, overdueRefreshes: 1 }).reasons[0].href).toBe("/app/clients?status=overdue");
  });
});

import { programStatus } from "./compliance-health";
describe("programStatus", () => {
  const ok = { riskAssessmentInForce: true, policyInForce: true, countryProfileRequiredMissing: 0, complianceOfficerAppointed: true, overdueRefreshes: 0, clientsWithoutRiskAssessment: 0, overdueTraining: 0, integrityOverdue: 0, staffScreeningOpen: 0, pendingScreeningMatches: 0, staleOpenFiles: 0, overdueCaseTasks: 0, draftReportsOlderThan7Days: 0 };
  it("all pillars 100% when everything is in place", () => {
    expect(programStatus(ok).map((p) => p.score)).toEqual([100, 100, 100, 100, 100]);
  });
  it("scores each pillar by the share of passing checks and lists the issues", () => {
    const ps = programStatus({ ...ok, policyInForce: false, pendingScreeningMatches: 2, overdueTraining: 1, integrityOverdue: 1 });
    const by = Object.fromEntries(ps.map((p) => [p.id, p]));
    expect(by.governance.score).toBe(67);
    expect(by.governance.issues).toEqual(["AML Program not approved"]);
    expect(by.monitoring.score).toBe(67);
    expect(programStatus({ ...ok, flaggedTransactions: 2 }).find((p) => p.id === "monitoring")!.issues).toEqual(["2 flagged transaction(s)"]);
    expect(by.people.score).toBe(33);
    expect(by.reporting.score).toBe(100);
  });
});
