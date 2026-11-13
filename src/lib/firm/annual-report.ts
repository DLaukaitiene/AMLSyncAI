/**
 * Annual compliance report to management (spec §4.1, §11.1; AMLR Art. 11).
 * Generated from system data; approved by the compliance manager.
 */
import type { GeneratedDoc } from "@/lib/docs/model";

export interface AnnualStats {
  period: { from: string; to: string };
  firm: { name: string; sectors: string[] };
  officers: { manager: string; officer: string };
  clients: { active: number; byRisk: Record<string, number>; accepted: number; refused: number; terminated: number; pep: number };
  overdueRefreshes: number;
  screening: { checks: number; hits: number; trueMatches: number };
  cases: { internalReports: number; strFiled: number; noReport: number; fiuRequests: number; discrepancies: number; sanctionsHits: number };
  thresholdReports: number;
  training: { assigned: number; completed: number };
  riskAssessment: { version: number | null; residual: string | null; approvedOn: string | null };
  policy: { version: number | null; approvedOn: string | null; unacknowledged: number };
  outsourcing: number;
  whistleblowing: number;
  openActions: string[];
}

export function annualReportDoc(s: AnnualStats, version: number, date: string): GeneratedDoc {
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const findings: string[] = [];
  if (s.overdueRefreshes) findings.push(`${s.overdueRefreshes} client file(s) are overdue for CDD refresh.`);
  if (s.training.assigned && s.training.completed < s.training.assigned) findings.push(`Training completion is ${pct(s.training.completed, s.training.assigned)}.`);
  if (!s.riskAssessment.version) findings.push("There is no approved business-wide risk assessment.");
  if (!s.policy.version) findings.push("There is no approved AML/CTF policy.");
  if (s.policy.unacknowledged) findings.push(`${s.policy.unacknowledged} staff member(s) haven't acknowledged the policy in force.`);
  return {
    title: "Annual compliance report",
    subtitle: `${s.firm.name} · ${s.period.from} to ${s.period.to}`,
    meta: [`Version ${version} · ${date}`, "To the management body (AMLR Art. 11)", `Compliance manager: ${s.officers.manager} · Compliance officer: ${s.officers.officer}`],
    sections: [
      { id: "summary", heading: "1. Summary", blocks: [findings.length ? { list: findings } : { p: "No significant weaknesses were identified in the period." }] },
      {
        id: "clients",
        heading: "2. Clients and due diligence",
        blocks: [
          { kv: [["Active clients", String(s.clients.active)], ["Accepted in period", String(s.clients.accepted)], ["Refused", String(s.clients.refused)], ["Relationships ended", String(s.clients.terminated)], ["PEP relationships", String(s.clients.pep)], ["Overdue refreshes", String(s.overdueRefreshes)]] },
          { table: { head: ["Risk level", "Clients"], rows: Object.entries(s.clients.byRisk).map(([k, v]) => [k, String(v)]) } },
        ],
      },
      { id: "screening", heading: "3. Screening", blocks: [{ kv: [["Screening checks", String(s.screening.checks)], ["Possible matches", String(s.screening.hits)], ["True matches", String(s.screening.trueMatches)]] }] },
      {
        id: "reporting",
        heading: "4. Reporting",
        blocks: [{ kv: [
          ["Internal suspicion reports", String(s.cases.internalReports)], ["STRs filed", String(s.cases.strFiled)], ["Assessed, not reported", String(s.cases.noReport)],
          ["FIU requests", String(s.cases.fiuRequests)], ["BO register discrepancies", String(s.cases.discrepancies)], ["Sanctions hits", String(s.cases.sanctionsHits)], ["Threshold reports", String(s.thresholdReports)],
        ] }],
      },
      {
        id: "framework",
        heading: "5. Framework",
        blocks: [{ kv: [
          ["Risk assessment", s.riskAssessment.version ? `v${s.riskAssessment.version}, residual risk ${s.riskAssessment.residual}, approved ${s.riskAssessment.approvedOn}` : "not approved"],
          ["Policy", s.policy.version ? `v${s.policy.version}, approved ${s.policy.approvedOn}` : "not approved"],
          ["Training completed", `${s.training.completed} of ${s.training.assigned}`],
          ["Outsourcing arrangements", String(s.outsourcing)],
          ["Whistleblowing reports", String(s.whistleblowing)],
        ] }],
      },
      { id: "actions", heading: "6. Actions for the coming year", blocks: [s.openActions.length || findings.length ? { list: [...findings.map((f) => `Resolve: ${f}`), ...s.openActions] } : { p: "Maintain the current framework." }] },
    ],
  };
}
