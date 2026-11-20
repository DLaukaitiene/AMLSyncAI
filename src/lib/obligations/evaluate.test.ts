import { describe, expect, it } from "vitest";
import { evaluateObligations, obligationSummary, sectorNote, type ObligationInput } from "./evaluate";
import { OBLIGATIONS, obligation } from "./catalog";

const fresh: ObligationInput = {
  onePerson: true, complianceOfficer: null, responsibleManager: null, unassignedDuties: 14, riskAssessmentInForce: false, riskAssessmentReviewOverdue: false,
  policyInForce: false, policyReviewOverdue: false, countryProfileMissing: 4, clientsTotal: 0, clientsInProgress: 0, clientsStale: 0, openAlerts: 0,
  highRiskOrPepAwaitingApproval: 0, highRiskTotal: 0, openMatters: 0, flaggedTransactions: 0, overdueReviews: 0, reviewsDue30: 0, internalReportsOpen: 0,
  reportDrafts: 0, reportingOverdue: 0, trainingOverdue: 0, staffWithoutTraining: 1, integrityDue: 0, staffScreeningOpen: 0, whistleblowingUnacknowledged: 0,
  whistleblowingLate: 0, retentionDue: 0,
};
const by = (i: ObligationInput) => Object.fromEntries(evaluateObligations(i).map((s) => [s.id, s]));

describe("obligation status", () => {
  it("a new one-person firm: setup to do, team duties not applicable", () => {
    const s = by(fresh);
    expect(s["compliance-officer"].state).toBe("todo");
    expect(s["compliance-officer"].detail).toBe("Nobody is appointed yet.");
    expect(s["risk-assessment"].state).toBe("todo");
    expect(s.policies.detail).toMatch(/risk assessment first/);
    expect(s["client-checks"].detail).toMatch(/No clients yet/);
    expect(s["staff-integrity"].state).toBe("na");
    expect(s.whistleblowing.state).toBe("na");
    expect(obligationSummary(evaluateObligations(fresh))).toEqual({ total: 12, done: 6, overdue: 0, todo: 6 });
  });
  it("shows the appointed names, and asks for unassigned duties", () => {
    const s = by({ ...fresh, complianceOfficer: "Ona Jonaitė", responsibleManager: "Ona Jonaitė", unassignedDuties: 3 });
    expect(s["compliance-officer"]).toMatchObject({ state: "todo", detail: "Compliance Officer: Ona Jonaitė · responsible manager: Ona Jonaitė. 3 AML duties still without a named person." });
    expect(by({ ...fresh, complianceOfficer: "A", responsibleManager: "B", unassignedDuties: 0 })["compliance-officer"].state).toBe("done");
  });
  it("overdue beats to-do", () => {
    const s = by({ ...fresh, clientsInProgress: 3, clientsStale: 1, openAlerts: 2, flaggedTransactions: 1, overdueReviews: 4, reportingOverdue: 1, internalReportsOpen: 1, riskAssessmentInForce: true, riskAssessmentReviewOverdue: true });
    for (const id of ["client-checks", "screening", "deals", "reviews", "reporting", "risk-assessment"]) expect(s[id].state).toBe("overdue");
    expect(s.reporting.detail).toBe("1 reporting deadline passed.");
  });
  it("reporting to-do lists what to decide and send", () => {
    expect(by({ ...fresh, internalReportsOpen: 2, reportDrafts: 1 }).reporting.detail).toBe("2 internal reports to decide · 1 report to send.");
  });
  it("team duties apply to firms with staff", () => {
    const s = by({ ...fresh, onePerson: false, integrityDue: 2, whistleblowingLate: 1 });
    expect(s["staff-integrity"]).toMatchObject({ state: "todo", detail: "2 declarations due." });
    expect(s.whistleblowing.state).toBe("overdue");
  });
  it("catalog: every obligation has text, an article and a button; sector notes", () => {
    for (const o of OBLIGATIONS) {
      expect(o.what.length).toBeGreaterThan(40);
      expect(o.article).toMatch(/Art\.|law/);
      expect(o.action.href).toMatch(/^\/app/);
      expect(o.how.length).toBeGreaterThan(0);
    }
    expect(sectorNote(obligation("client-checks"), ["ESTATE_AGENT"])).toMatch(/buyer and the seller/);
    expect(sectorNote(obligation("client-checks"), ["GAMBLING"])).toBeNull();
  });
});
