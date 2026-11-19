/** Task names and where each task is done — shared by the Compliance Calendar and the dashboard. */
export const TASK_KIND: Record<string, string> = {
  refresh: "CDD refresh", "sdd-verification": "SDD verification (60 days)", "cdd-required": "CDD required", "threshold-report": "Threshold report",
  "discrepancy-report": "BO register discrepancy (14 days)", "transaction-hold": "Transaction hold (3 working days)", "fiu-request": "FIU request",
  "former-pep": "Former PEP review", "retention-end": "Records deletion", "portal-review": "Review client portal submission", "risk-assessment-review": "Review the business-wide risk assessment", "policy-review": "Review policies and procedures", "annual-report": "Annual compliance report", "refresh-review": "Refresh needs review", "idv-review": "Identity check needs review", "idv-mismatch": "Identity check differs from the file", "provider-purge": "Delete identity-check session at Didit (retry)", "kyb-mismatch": "Company register differs from the file", "kyb-inactive": "Company is not active in the register", "kyb-owners": "Add the owners found in the company register", "matter-review": "New matter doesn't match the client profile", "integrity-declaration": "Integrity declaration", "whistleblowing-ack": "Acknowledge whistleblowing report (7 days)", "portal-stalled": "Client hasn't completed the portal (7+ days)",
};

export function taskHref(t: { objectType: string; objectId: string; kind: string }): string {
  return t.objectType === "CddFile" ? `/app/clients/${t.objectId}` : t.objectType === "Matter" ? `/app/matters/${t.objectId}` : t.objectType === "Case" ? `/app/cases/${t.objectId}`
    : t.objectType === "FirmRiskAssessment" || t.objectType === "Firm" ? "/app/firm/risk-assessment" : t.objectType === "PolicyDocument" ? (t.kind === "annual-report" ? "/app/firm/governance" : "/app/firm/policies")
    : t.objectType === "User" ? "/app/firm/integrity" : t.objectType === "WhistleblowingReport" ? "/app/firm/whistleblowing" : "/app/calendar";
}
