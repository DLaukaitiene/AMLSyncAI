/**
 * AML/CFT duties a firm must assign to named people (AMLR Art. 7–11, 13, 69;
 * Directive (EU) 2019/1937 for whistleblowing). Shown on Team → Responsibilities
 * so the supervisor can see who is accountable for what.
 */
export const RESPONSIBILITIES = [
  { key: "management-body", label: "Management body member responsible for AML (Art. 11(1))", hint: "Senior person accountable for compliance with the AML rules" },
  { key: "compliance-officer", label: "Compliance Officer (Art. 11(2))", hint: "Day-to-day AML compliance; usually also the FIU contact" },
  { key: "fiu-contact", label: "FIU and supervisor contact", hint: "Receives and answers FIU requests (Art. 69(1)(b))" },
  { key: "suspicious-reports", label: "Decides on suspicious activity reports (Art. 69)", hint: "Reviews internal reports and decides whether to report to the FIU" },
  { key: "cdd-approval", label: "Approves high-risk clients and EDD (Art. 34, 42)", hint: "Senior management approval for high-risk and PEP relationships" },
  { key: "screening-review", label: "Reviews screening and monitoring alerts", hint: "Sanctions/PEP matches and flagged transactions" },
  { key: "risk-assessment", label: "Business-wide risk assessment (Art. 10)", hint: "Prepares and updates it at least yearly" },
  { key: "policies", label: "AML Program: policies and procedures (Art. 9)", hint: "Keeps them current and gets them approved" },
  { key: "training", label: "Staff training (Art. 12)", hint: "Assigns training and keeps the records" },
  { key: "integrity", label: "Staff integrity checks (Art. 13)", hint: "Declarations and staff screening" },
  { key: "records", label: "Record keeping and retention (Art. 77)", hint: "5-year retention, deletion and legal holds" },
  { key: "whistleblowing", label: "Whistleblowing channel (Art. 14; Directive 2019/1937)", hint: "Receives and follows up reports" },
  { key: "outsourcing", label: "Outsourcing oversight (Art. 18)", hint: "Keeps the register and checks providers" },
  { key: "data-protection", label: "Data protection (GDPR)", hint: "Privacy notices, data subject requests, breaches" },
] as const;
export type ResponsibilityKey = (typeof RESPONSIBILITIES)[number]["key"];

/** External training types (Team → Training Register). */
export const TRAINING_TYPES = [["workshop", "Workshop"], ["seminar", "Seminar"], ["online-course", "Online course"], ["internal-session", "Internal session"], ["conference", "Conference"], ["other", "Other"]] as const;
