/**
 * A firm's AML obligations under the EU AMLR (Regulation (EU) 2024/1624), written
 * for people who don't know them: what the law asks, when, how to do it in the app,
 * and the article. The dashboard shows one box per obligation with its status and
 * the button that does it; the "My Obligations" page explains them in full; pages
 * show a short "Your duty" note from `duty`.
 *
 * Sector notes cover the non-financial sectors the app serves (Art. 3(3)).
 */
export type ObligationId =
  | "compliance-officer" | "risk-assessment" | "policies" | "national-rules"
  | "client-checks" | "screening" | "high-risk" | "deals" | "reviews"
  | "reporting" | "training" | "staff-integrity" | "whistleblowing" | "records";

export interface Obligation {
  id: ObligationId;
  group: "Set up your firm" | "Every client" | "Every deal" | "Report" | "Your team" | "Records";
  title: string;
  /** One or two sentences: what the law asks, in plain words. */
  what: string;
  /** When it applies or how often. */
  when: string;
  /** Steps in AMLSync App. */
  how: string[];
  article: string;
  /** Short "Your duty" note shown on the related pages. */
  duty: string;
  action: { href: string; label: string };
  secondary?: { href: string; label: string };
  /** Extra sentence per sector (Sector enum values). */
  sectorNotes?: Partial<Record<string, string>>;
  /** Only for firms with staff besides the owner. */
  teamOnly?: boolean;
}

export const OBLIGATIONS: Obligation[] = [
  {
    id: "compliance-officer", group: "Set up your firm",
    title: "Appoint a Compliance Officer",
    what: "Name one person who runs AML compliance day to day (the Compliance Officer) and one member of management who is responsible for it. In a one-person firm you can hold both roles.",
    when: "Before you take on clients. Tell your supervisor when the Compliance Officer changes.",
    how: ["Team → Members: invite colleagues if needed.", "Compliance Hub → Governance: appoint the Compliance Officer and the responsible manager.", "Team → Responsibilities: tick who does each AML duty."],
    article: "AMLR Art. 11",
    duty: "Your firm must have a named Compliance Officer and a responsible manager, and every AML duty must have someone accountable for it.",
    action: { href: "/app/team/responsibilities", label: "Roles and duties" },
    secondary: { href: "/app/firm/governance", label: "Appointments" },
  },
  {
    id: "risk-assessment", group: "Set up your firm",
    title: "Assess your firm's risks",
    what: "Write down how your firm could be used for money laundering or terrorist financing: your services, clients, countries and how you deal with clients. Management approves it.",
    when: "Once at the start, then review at least every year and whenever your business changes.",
    how: ["Compliance Hub → Business Risk Assessment: answer the questions.", "Review the draft AMLSync App writes for you and approve it."],
    article: "AMLR Art. 10",
    duty: "Your firm's risk assessment decides how strict your client checks must be. Keep it approved and review it every year.",
    action: { href: "/app/firm/risk-assessment", label: "Business Risk Assessment" },
  },
  {
    id: "policies", group: "Set up your firm",
    title: "Approve your AML Program",
    what: "Written policies and procedures for client checks, reporting, record keeping and training, approved by management and followed by everyone.",
    when: "After your risk assessment; review every year. Staff confirm they have read it.",
    how: ["Compliance Hub → AML Program: generate it from your risk assessment.", "Edit where needed, approve, and ask staff to acknowledge it.", "Compliance Hub → Review Pack: give your lawyer or accountant the list of rules the app applies, to confirm they fit your firm."],
    article: "AMLR Art. 9",
    duty: "Everyone in the firm must follow the approved AML Program.",
    action: { href: "/app/firm/policies", label: "AML Program" },
  },
  {
    id: "national-rules", group: "Set up your firm",
    title: "Know your supervisor and FIU",
    what: "The EU rules are built in. Add your country's details: who supervises your firm, your Financial Intelligence Unit (FIU) and how to send it reports, and any stricter national limits.",
    when: "At the start, and when your national rules change.",
    how: ["Settings → Country Profile: fill in the required items."],
    article: "AMLR Art. 3, 69, 80; national law",
    duty: "You need your supervisor's and FIU's details before you can report.",
    action: { href: "/app/settings/country-profile", label: "Country Profile" },
  },
  {
    id: "client-checks", group: "Every client",
    title: "Check every client before you start",
    what: "Identify the client and verify their identity, find and verify who owns or controls a company (beneficial owners), and record the purpose of the relationship. If you can't complete the checks, don't take the client on.",
    when: "Before a business relationship starts, before an occasional transaction of €10,000 or more (including several linked smaller ones), and whenever you doubt earlier information or suspect money laundering.",
    how: ["Clients → Add Client: a name and an email are enough.", "Send the secure link: the client fills in details and verifies their identity.", "Work through the client's completion checklist, then accept the client."],
    article: "AMLR Art. 19–22, 51–63",
    duty: "No client is taken on until identity, owners and purpose are checked.",
    action: { href: "/app/clients", label: "Clients" },
    secondary: { href: "/app/clients/new", label: "Add Client" },
    sectorNotes: {
      ESTATE_AGENT: "Estate agents check both the buyer and the seller, and tenants and landlords when the monthly rent is €10,000 or more.",
      HVG_TRADER: "Dealers check every buyer paying €3,000 or more in cash, and their suppliers.",
      PRECIOUS_METALS: "Dealers check every buyer paying €3,000 or more in cash, and their suppliers.",
      LEGAL: "Lawyers check clients when they help with buying or selling property or companies, handling client money, setting up companies or trusts, and similar transactions.",
      ACCOUNTANT: "Accountants, auditors and tax advisers check every client they provide services to.",
    },
  },
  {
    id: "screening", group: "Every client",
    title: "Screen against sanctions and PEP lists",
    what: "Check each client and everyone behind them against EU and UN sanctions lists and for politically exposed persons (PEPs). A sanctioned person's money must be frozen and the authority told at once.",
    when: "At onboarding and continuously: AMLSync App re-screens everyone every day and when lists change. Decide each possible match.",
    how: ["Monitoring Alerts: open each possible match.", "Compare the details and record 'not the same person' or 'confirmed match' with a reason."],
    article: "AMLR Art. 20, 42–46; EU sanctions regulations",
    duty: "Every possible sanctions or PEP match needs your decision. A confirmed sanctions match means: stop, freeze, notify.",
    action: { href: "/app/monitoring-alerts", label: "Monitoring Alerts" },
  },
  {
    id: "high-risk", group: "Every client",
    title: "Enhanced checks for high-risk clients and PEPs",
    what: "For high-risk clients and politically exposed persons, do more: find out where their money and wealth come from, get approval from senior management, and watch the relationship more closely.",
    when: "Whenever a client is rated high risk or is a PEP, before you accept them, and at each review.",
    how: ["Risk Assessments: filter on High.", "On each client: complete the enhanced due diligence checklist and record senior management approval."],
    article: "AMLR Art. 34, 42",
    duty: "High-risk and PEP clients need enhanced checks and senior management approval before you accept them.",
    action: { href: "/app/risk-assessments?risk=HIGH", label: "High-risk clients" },
  },
  {
    id: "deals", group: "Every deal",
    title: "Record deals and payments; watch for red flags",
    what: "Record each case (deal, sale, engagement) and its payments. Deals of €10,000 or more need full client checks. Cash payments of €10,000 or more are not allowed (lower in some countries). Look into anything unusual.",
    when: "For every deal and payment, as it happens.",
    how: ["Cases → New Case: record the deal and its parties.", "Record each payment on the case or in Transaction Monitoring.", "Review each flagged payment and write down your reason."],
    article: "AMLR Art. 19, 26, 80",
    duty: "Record each deal and payment. €10,000 or more needs full client checks; cash of €10,000 or more is not allowed.",
    action: { href: "/app/matters", label: "Cases" },
    secondary: { href: "/app/transactions", label: "Transaction Monitoring" },
    sectorNotes: {
      HVG_TRADER: "Sales of cars of €250,000 or more, and of aircraft or boats of €7.5 million or more, must also be reported to the FIU.",
    },
  },
  {
    id: "reviews", group: "Every client",
    title: "Keep client files up to date",
    what: "Review each client's information regularly and whenever something changes, so your checks stay current.",
    when: "High-risk clients at least every year; all others at least every 5 years; and when anything relevant changes.",
    how: ["Clients → filter 'Overdue': open each client and run the refresh.", "AMLSync App sends the client a link to confirm or update their details."],
    article: "AMLR Art. 26",
    duty: "Client information must be kept up to date: high-risk yearly, others at least every 5 years.",
    action: { href: "/app/clients?status=overdue", label: "Overdue reviews" },
  },
  {
    id: "reporting", group: "Report",
    title: "Report suspicions to the FIU",
    what: "If anyone in the firm suspects money laundering or terrorist financing, they tell the Compliance Officer at once. The Compliance Officer decides and, if there are grounds, reports to the FIU promptly. Never tell the client.",
    when: "As soon as a suspicion arises, before carrying out the transaction where possible. Answer FIU requests within the deadline (5 working days unless the FIU sets a shorter one). A reported transaction is held for 3 working days.",
    how: [
      "Anyone: on a case or payment, choose 'Report a suspicion to the Compliance Officer'.",
      "Compliance Officer: FIU Reporting → Investigations: decide to report, not report (with reasons) or apply legal privilege.",
      "Complete the report in the Report Queue, send it through your FIU's channel and record the reference.",
    ],
    article: "AMLR Art. 69–73",
    duty: "Suspicious? Tell the Compliance Officer now, through the app. The Compliance Officer reports to the FIU promptly. Never tell the client (tipping-off is an offence).",
    action: { href: "/app/cases", label: "FIU Reporting" },
    secondary: { href: "/app/reports", label: "Report Queue" },
    sectorNotes: {
      LEGAL: "Lawyers don't report information received while defending a client or advising on their legal position (legal privilege), unless the client seeks advice for money laundering.",
      ACCOUNTANT: "Tax advisers and auditors have the same privilege only where national law grants it.",
    },
  },
  {
    id: "training", group: "Your team",
    title: "Train your staff every year",
    what: "Everyone who deals with clients must know the AML rules and how to spot and report suspicions. Keep a record of the training.",
    when: "When someone joins, and at least every year.",
    how: ["My Compliance: assign and complete the in-app training.", "Team → Training Register: record workshops and courses attended elsewhere."],
    article: "AMLR Art. 12",
    duty: "Everyone completes AML training on joining and every year.",
    action: { href: "/app/firm/training", label: "Training" },
  },
  {
    id: "staff-integrity", group: "Your team",
    title: "Check your staff's integrity",
    what: "Staff who work on AML tasks must be suitable: they declare convictions and conflicts of interest, and are screened against sanctions lists.",
    when: "When they join and every year.",
    how: ["Team → Personnel Due Diligence: each person makes the declaration.", "Screen all staff and review any match."],
    article: "AMLR Art. 13",
    duty: "Staff declare their integrity and conflicts on joining and every year, and are screened.",
    action: { href: "/app/firm/integrity", label: "Personnel Due Diligence" },
    teamOnly: true,
  },
  {
    id: "whistleblowing", group: "Your team",
    title: "Let staff report breaches confidentially",
    what: "Staff must be able to report AML breaches in the firm confidentially, without fear of retaliation.",
    when: "Always available. Acknowledge each report within 7 days.",
    how: ["Compliance Hub → Whistleblowing: the channel is ready; staff use it from the menu.", "Acknowledge and follow up each report."],
    article: "AMLR Art. 14; Directive (EU) 2019/1937",
    duty: "Staff can report breaches confidentially; acknowledge each report within 7 days.",
    action: { href: "/app/firm/whistleblowing", label: "Whistleblowing" },
    teamOnly: true,
  },
  {
    id: "records", group: "Records",
    title: "Keep records for 5 years",
    what: "Keep client checks, documents, transactions, reports and decisions for 5 years after the relationship ends, then delete them. Be able to give them to the supervisor or FIU quickly.",
    when: "Always. AMLSync App keeps everything, counts the 5 years and tells you when files are due for deletion.",
    how: ["Nothing to do day to day: every action is recorded.", "Reports: download the registers for an inspection.", "Settings → Records & Retention: delete files when their period ends."],
    article: "AMLR Art. 77",
    duty: "Records are kept 5 years after the relationship ends, then deleted.",
    action: { href: "/app/registers", label: "Reports" },
    secondary: { href: "/app/records", label: "Records & Retention" },
  },
];

export const obligation = (id: ObligationId) => OBLIGATIONS.find((o) => o.id === id)!;
