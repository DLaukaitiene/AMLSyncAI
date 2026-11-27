/**
 * AML duties and who holds them [restructured 27 Nov 2026]. Every duty belongs to one of the two
 * appointed roles (AMLR Art. 11) and is filled in from the appointment automatically; a firm can hand
 * a duty to a colleague or an outside provider. The legal core (deciding on suspicious activity reports,
 * approving high-risk clients) stays with its role: only a named deputy can be added.
 * Data protection is a GDPR duty, not an AML one: it is assigned on the Data Protection page.
 */
export type DutyRole = "compliance-manager" | "compliance-officer";

export const RESPONSIBILITIES = [
  { key: "cdd-approval", role: "compliance-manager", locked: true, label: "Approves high-risk and PEP clients (Art. 34, 42)", hint: "Senior management approval before taking on or keeping a high-risk or PEP client" },
  { key: "management-approval", role: "compliance-manager", locked: false, label: "Approves the risk assessment and AML Program (Art. 9, 10)", hint: "Management approval of the business-wide risk assessment, policies and procedures" },
  { key: "fiu-contact", role: "compliance-officer", locked: false, label: "FIU and supervisor contact", hint: "Receives and answers FIU and supervisor requests (Art. 69(1)(b))" },
  { key: "suspicious-reports", role: "compliance-officer", locked: true, label: "Decides on suspicious activity reports (Art. 69)", hint: "Reviews internal reports and decides whether to report to the FIU" },
  { key: "screening-review", role: "compliance-officer", locked: false, label: "Reviews screening and monitoring alerts", hint: "Sanctions/PEP matches and flagged transactions" },
  { key: "risk-assessment", role: "compliance-officer", locked: false, label: "Business-wide risk assessment (Art. 10)", hint: "Prepares and updates it at least yearly" },
  { key: "policies", role: "compliance-officer", locked: false, label: "AML Program: policies and procedures (Art. 9)", hint: "Keeps them up to date" },
  { key: "training", role: "compliance-officer", locked: false, label: "Staff training (Art. 12)", hint: "Assigns training and keeps the records" },
  { key: "integrity", role: "compliance-officer", locked: false, label: "Staff integrity checks (Art. 13)", hint: "Declarations and staff screening" },
  { key: "records", role: "compliance-officer", locked: false, label: "Record keeping and retention (Art. 77)", hint: "5-year retention, deletion and legal holds" },
  { key: "whistleblowing", role: "compliance-officer", locked: false, label: "Whistleblowing channel (Art. 14; Directive 2019/1937)", hint: "Receives and follows up reports" },
  { key: "outsourcing", role: "compliance-officer", locked: false, label: "Outsourcing oversight (Art. 18)", hint: "Keeps the register and checks providers" },
] as const satisfies readonly { key: string; role: DutyRole; locked: boolean; label: string; hint: string }[];
export type ResponsibilityKey = (typeof RESPONSIBILITIES)[number]["key"];

/** GDPR, assigned on the Data Protection page; kept in the same firm field. */
export const DATA_PROTECTION_KEY = "data-protection";

/** What the firm changed for a duty. Older data stored a plain list of user ids: read it as "to". */
export interface DutySetting { to?: string[]; deputies?: string[]; outsourced?: boolean }
export function dutySetting(raw: unknown): DutySetting {
  if (Array.isArray(raw)) return { to: raw.map(String) };
  if (raw && typeof raw === "object") return raw as DutySetting;
  return {};
}

export interface Holder { userId: string | null; name: string }
export interface DutyRow {
  key: ResponsibilityKey; label: string; hint: string; role: DutyRole; locked: boolean;
  owners: string[]; // names
  source: "role" | "reassigned" | "outsourced" | "none";
  deputies: string[]; // names
  to: string[]; deputyIds: string[];
}

/** Who holds each duty: the role holder unless the firm handed it to a colleague or a provider. */
export function resolveDuties(raw: Record<string, unknown>, holders: Record<DutyRole, Holder | null>, activeUsers: Map<string, string>): DutyRow[] {
  return RESPONSIBILITIES.map((d) => {
    const set = dutySetting(raw[d.key]);
    const holder = holders[d.role];
    const to = d.locked ? [] : (set.to ?? []).filter((id) => activeUsers.has(id) && id !== holder?.userId);
    const deputyIds = d.locked ? [...(set.deputies ?? []), ...(Array.isArray(raw[d.key]) ? (set.to ?? []) : [])].filter((id, i, a) => activeUsers.has(id) && id !== holder?.userId && a.indexOf(id) === i) : [];
    const outsourced = !d.locked && !!set.outsourced;
    const owners = outsourced ? [] : to.length ? to.map((id) => activeUsers.get(id)!) : holder ? [holder.name] : [];
    return {
      key: d.key, label: d.label, hint: d.hint, role: d.role, locked: d.locked,
      owners, source: outsourced ? "outsourced" : to.length ? "reassigned" : holder ? "role" : "none",
      deputies: deputyIds.map((id) => activeUsers.get(id)!), to, deputyIds,
    };
  });
}


/** External training types (Team → Training Register). */
export const TRAINING_TYPES = [["workshop", "Workshop"], ["seminar", "Seminar"], ["online-course", "Online course"], ["internal-session", "Internal session"], ["conference", "Conference"], ["other", "Other"]] as const;

/** A duty label or hint without its legal reference, e.g. "Staff training (Art. 12)" → "Staff training". For on-screen use; the review pack keeps the references. */
export function withoutArticles(s: string): string {
  return s.replace(/\s*\([^()]*\bArt\.[^()]*(\([^()]*\)[^()]*)*\)/g, "").trim();
}
