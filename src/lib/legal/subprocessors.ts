/**
 * Sub-processors of AMLSync App (the register shown at /subprocessors and used by
 * privacy notices). Release rule (competitor review, recommendation 5): never
 * claim a data location or safeguard this table does not support. Update it
 * whenever a supplier, region or plan changes.
 */
export interface Subprocessor {
  name: string;
  purpose: string;
  data: string;
  location: string;
  safeguard: string;
  active: boolean;
}

export const SUBPROCESSORS_UPDATED = "2026-11-18";

export const SUBPROCESSORS: Subprocessor[] = [
  {
    name: "Supabase",
    purpose: "Database: all client files, records and uploaded documents (encrypted per firm)",
    data: "All data held in AMLSync App",
    location: "EU — Frankfurt, Germany (AWS eu-central-1)",
    safeguard: "Data processing agreement; data stays in the EU region",
    active: true,
  },
  {
    name: "Vercel",
    purpose: "Runs the application",
    data: "Data passes through while pages are served; not stored",
    location: "EU — Frankfurt, Germany (application servers); global network for static files",
    safeguard: "Data processing agreement; EU Standard Contractual Clauses for any transfer",
    active: true,
  },
  {
    name: "Didit",
    purpose: "Identity checks (eID, document, chip, liveness, face match), PEP / sanctions / adverse-media screening, company register checks",
    data: "Identity document data and images, selfie video, names, dates of birth, company data",
    location: "EU — Ireland",
    safeguard: "Data processing agreement; AMLSync App keeps its own copy and deletes Didit's at the end of retention",
    active: true,
  },
  {
    name: "Google Workspace",
    purpose: "Sends emails from AMLSync App (links, codes, notifications, invoices)",
    data: "Recipient email address and the email text (no client files)",
    location: "Google data centres (EU and other regions)",
    safeguard: "Google Cloud data processing terms; EU Standard Contractual Clauses",
    active: true,
  },
  {
    name: "Have I Been Pwned (Pwned Passwords)",
    purpose: "Checks new passwords against known breaches",
    data: "The first 5 characters of a password hash only — never the password or any personal data",
    location: "Global",
    safeguard: "No personal data is sent (k-anonymity)",
    active: true,
  },
  {
    name: "AI drafting provider",
    purpose: "Optional 'Draft with AI' for report narratives and policy wording",
    data: "The facts the user chooses to draft from",
    location: "To be confirmed — switched off until an EU-hosted provider is configured",
    safeguard: "Not in use",
    active: false,
  },
];
