import { describe, expect, it } from "vitest";
import { complianceHealth } from "./compliance-health";

const ok = { riskAssessmentInForce: true, policyInForce: true, countryProfileRequiredMissing: 0, overdueRefreshes: 0, overdueTasks: 0, overdueTraining: 0, pendingScreeningMatches: 0, staleOpenFiles: 0 };
describe("firm compliance status", () => {
  it("on track when nothing is open", () => expect(complianceHealth(ok).level).toBe("on-track"));
  it("needs attention for day-to-day items", () => expect(complianceHealth({ ...ok, overdueTasks: 2 }).level).toBe("needs-attention"));
  it("at risk without a risk assessment, policy, profile or with overdue refreshes", () => {
    expect(complianceHealth({ ...ok, policyInForce: false }).level).toBe("at-risk");
    expect(complianceHealth({ ...ok, overdueRefreshes: 1 }).reasons[0].href).toBe("/app/clients?tab=refresh");
  });
});
