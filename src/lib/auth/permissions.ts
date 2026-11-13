/**
 * Role permissions (spec §8, §8C.7). Enforced on the server for every action;
 * the UI only hides what the server would refuse anyway.
 */
export type AppRole = "OWNER" | "COMPLIANCE_OFFICER" | "STAFF" | "EXTERNAL_REVIEWER" | "READ_ONLY";

export type Action =
  | "team.invite"
  | "team.remove"
  | "countryProfile.view"
  | "countryProfile.edit"
  | "client.view"
  | "client.edit"
  | "client.accept"
  | "gate.override"
  | "risk.override"
  | "case.raise"
  | "case.view"
  | "records.purge"
  | "records.legalHold"
  | "securityLog.view"
  | "approve.management"
  | "approve.compliance";

const MATRIX: Record<Action, AppRole[]> = {
  "team.invite": ["OWNER", "COMPLIANCE_OFFICER"],
  "team.remove": ["OWNER", "COMPLIANCE_OFFICER"],
  "countryProfile.view": ["OWNER", "COMPLIANCE_OFFICER", "STAFF", "EXTERNAL_REVIEWER", "READ_ONLY"],
  "countryProfile.edit": ["COMPLIANCE_OFFICER"],
  "client.view": ["OWNER", "COMPLIANCE_OFFICER", "STAFF", "EXTERNAL_REVIEWER", "READ_ONLY"],
  "client.edit": ["OWNER", "COMPLIANCE_OFFICER", "STAFF"],
  "client.accept": ["OWNER", "COMPLIANCE_OFFICER", "STAFF"],
  "gate.override": ["COMPLIANCE_OFFICER"],
  "risk.override": ["COMPLIANCE_OFFICER"],
  "case.raise": ["OWNER", "COMPLIANCE_OFFICER", "STAFF"],
  "case.view": ["COMPLIANCE_OFFICER"],
  "records.purge": ["COMPLIANCE_OFFICER"],
  "records.legalHold": ["COMPLIANCE_OFFICER"],
  "securityLog.view": ["OWNER", "COMPLIANCE_OFFICER"],
  "approve.management": ["OWNER"],
  "approve.compliance": ["OWNER", "COMPLIANCE_OFFICER"],
};

export function can(roles: readonly AppRole[], action: Action): boolean {
  return roles.some((r) => MATRIX[action].includes(r));
}

export const ROLE_LABELS: Record<AppRole, string> = {
  OWNER: "Owner / Compliance Manager",
  COMPLIANCE_OFFICER: "Compliance Officer",
  STAFF: "Staff",
  EXTERNAL_REVIEWER: "External Reviewer",
  READ_ONLY: "Read-only",
};
