/**
 * Backoffice admin roles and permissions (docs/BACKOFFICE_SPEC.md §4.1).
 * Enforced on the server for every page and action; the navigation only hides
 * what the server would refuse anyway. No role can read STR content (§2.3):
 * there is no permission for it.
 */
export const ADMIN_ROLES = ["OWNER", "OPERATIONS", "SUPPORT", "FINANCE", "SECURITY", "CONTENT_EDITOR", "CONTENT_REVIEWER", "SALES", "AUDITOR"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  OWNER: "Owner",
  OPERATIONS: "Operations admin",
  SUPPORT: "Support agent",
  FINANCE: "Finance",
  SECURITY: "Security engineer",
  CONTENT_EDITOR: "Content editor",
  CONTENT_REVIEWER: "Content reviewer (legal)",
  SALES: "Sales / CS",
  AUDITOR: "Read-only auditor",
};

const ALL: AdminRole[] = [...ADMIN_ROLES];

const MATRIX = {
  "dashboard.view": ALL,
  "firms.view": ["OWNER", "OPERATIONS", "SUPPORT", "FINANCE", "SECURITY", "SALES", "AUDITOR"],
  "firms.manage": ["OWNER", "OPERATIONS"], // status, trial, tags, account manager
  "firms.notes": ["OWNER", "OPERATIONS", "SUPPORT", "SALES"],
  "firms.kyb": ["OWNER", "OPERATIONS"],
  "firms.export": ["OWNER", "OPERATIONS"],
  "users.view": ["OWNER", "OPERATIONS", "SUPPORT", "SECURITY", "AUDITOR"],
  "users.secure": ["OWNER", "OPERATIONS", "SECURITY"], // lock, unlock, revoke sessions
  "billing.view": ["OWNER", "OPERATIONS", "FINANCE", "AUDITOR"],
  "billing.manage": ["OWNER", "FINANCE"], // terms, invoices, payments
  "credits.grant": ["OWNER", "OPERATIONS", "FINANCE"],
  "security.view": ["OWNER", "SECURITY", "AUDITOR"],
  "incidents.manage": ["OWNER", "SECURITY"],
  "abuse.view": ["OWNER", "OPERATIONS", "SECURITY", "AUDITOR"],
  "vendors.view": ["OWNER", "OPERATIONS", "FINANCE", "SECURITY", "AUDITOR"],
  "content.view": ["OWNER", "CONTENT_EDITOR", "CONTENT_REVIEWER", "AUDITOR"],
  "ai.view": ["OWNER", "OPERATIONS", "SECURITY", "AUDITOR"],
  "support.access": ["OWNER", "SUPPORT"],
  "features.triage": ["OWNER", "OPERATIONS", "SUPPORT", "SALES"],
  "privacy.view": ["OWNER", "OPERATIONS", "AUDITOR"],
  "privacy.manage": ["OWNER", "OPERATIONS"],
  "team.manage": ["OWNER"],
  "audit.view": ["OWNER", "SECURITY", "AUDITOR"],
  "approvals.decide": ["OWNER"],
} as const satisfies Record<string, readonly AdminRole[]>;

export type AdminPermission = keyof typeof MATRIX;

export function adminCan(roles: readonly string[], p: AdminPermission): boolean {
  return roles.some((r) => (MATRIX[p] as readonly string[]).includes(r));
}

export function isAdminRole(r: string): r is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(r);
}

/** Emails that are Owners by configuration (cannot be removed from the Backoffice UI). */
export function envOwners(value = process.env.PLATFORM_ADMIN_EMAILS ?? ""): string[] {
  return value.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}
