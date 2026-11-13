import { describe, expect, it } from "vitest";
import { annualReportDoc, type AnnualStats } from "./annual-report";

const base: AnnualStats = {
  period: { from: "2026-07-10", to: "2027-07-09" }, firm: { name: "JIP", sectors: ["ACCOUNTANT"] }, officers: { manager: "A", officer: "B" },
  clients: { active: 10, byRisk: { LOW: 6, MEDIUM: 3, HIGH: 1 }, accepted: 4, refused: 1, terminated: 0, pep: 1 }, overdueRefreshes: 0,
  screening: { checks: 40, hits: 2, trueMatches: 0 }, cases: { internalReports: 1, strFiled: 1, noReport: 0, fiuRequests: 0, discrepancies: 0, sanctionsHits: 0 },
  thresholdReports: 0, training: { assigned: 3, completed: 3 }, riskAssessment: { version: 1, residual: "Medium", approvedOn: "2026-08-01" },
  policy: { version: 1, approvedOn: "2026-08-02", unacknowledged: 0 }, outsourcing: 0, whistleblowing: 0, openActions: [],
};

describe("annual compliance report", () => {
  it("reports no weaknesses when everything is in place", () => {
    const d = annualReportDoc(base, 1, "2027-07-10");
    expect(JSON.stringify(d.sections[0])).toMatch(/No significant weaknesses/);
    expect(d.sections.map((s) => s.id)).toEqual(["summary", "clients", "screening", "reporting", "framework", "actions"]);
  });
  it("lists weaknesses found in the data", () => {
    const d = annualReportDoc({ ...base, overdueRefreshes: 2, training: { assigned: 4, completed: 1 }, riskAssessment: { version: null, residual: null, approvedOn: null } }, 1, "x");
    const t = JSON.stringify(d.sections[0]);
    expect(t).toMatch(/2 client file\(s\) are overdue/);
    expect(t).toMatch(/Training completion is 25%/);
    expect(t).toMatch(/no approved business-wide risk assessment/);
  });
});
