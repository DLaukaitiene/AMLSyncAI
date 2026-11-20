/**
 * Help Centre articles (in the style of ClearAML's guides): short, step by step,
 * written for the people using the app. Plain text with simple markup:
 * "## " headings, "1. " numbered steps, "- " bullets, "> " tips.
 */
export interface HelpArticle { slug: string; topic: string; title: string; summary: string; body: string }

export const HELP_TOPICS = ["Getting started", "Clients and due diligence", "Screening and monitoring", "Reporting", "Firm compliance and team", "Billing and account"] as const;

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "first-steps", topic: "Getting started", title: "First steps with AMLSync App",
    summary: "Set up your firm in about ten minutes and add your first client.",
    body: `Your Dashboard shows every duty the anti-money-laundering rules give your firm, one box each, with where you stand and a button that does it. My Obligations explains each duty in full. Start at the top.

## 1. Fill in your Country Profile
Settings → Country Profile. The EU rules are built in; add your national details: supervisor, FIU and how you report to it, cash limit if lower than €10,000. Missing required items only block the steps that depend on them.

## 2. Approve your Business Risk Assessment
Compliance Hub → Business Risk Assessment. Answer the questions about your services, clients, countries and channels. AMLSync App drafts the assessment; review it and approve it.

## 3. Approve your AML Program
Compliance Hub → AML Program. Your policies and procedures are generated from the risk assessment. Review and approve them.

## 4. Invite your team and assign responsibilities
Team → Members to invite colleagues, then Team → Responsibilities to name who does what.

## 5. Add your first client
Clients → Add Client. A name and an email are enough: the client gets a secure link to fill in the rest.

> Add your invoice details under Settings → Billing so your monthly invoice carries your company details.`,
  },
  {
    slug: "dashboard", topic: "Getting started", title: "Understanding your Dashboard",
    summary: "What each part of the Dashboard tells you and where to start each day.",
    body: `## Your obligations
One box per legal duty: green is in order, amber is to do, red means act now. Each box has the button that does it and "What does this mean?" for the full explanation. The guide at the top can be hidden and shown again.

## Alerts
Possible sanctions or PEP matches, flagged transactions and staff screening matches. Each has a Review button. Start here every day.

## Metric cards
- Total Clients: active client files.
- Pending Reviews: files not yet decided.
- Portfolio Health: share of clients with complete, current due diligence.
- High Risk Cases: clients rated high risk.

## Program Status
A score for each part of your AML program: Governance, Risk, People, Monitoring and Reporting. Under each bar you see what is missing. Click a bar to fix it.

## Review Queue and Upcoming Timeline
The Review Queue lists clients whose periodic review is overdue. The Upcoming Timeline shows deadlines in the next 30 days; the full list is in the Compliance Calendar.`,
  },
  {
    slug: "add-client", topic: "Clients and due diligence", title: "Adding a client",
    summary: "Individuals, companies, trusts, partnerships and other organisations.",
    body: `1. Go to Clients → Add Client.
2. Choose what you are adding: Individual or sole trader, Company, Trust, Partnership or Other (association, club…).
3. Enter at least the name. Add an email to send the client their secure link.
4. Leave "Send the client their secure link now" ticked: the client fills in their details, uploads documents and verifies their identity. Reminders go out on day 1, 3 and 7.
5. Click Create client. The client is screened at once and a risk rating is calculated.

## Existing clients
Clients → Import Clients brings in your existing clients from a spreadsheet and shows what each file is missing under the new rules.

## Several clients at once
On the client list, tick the clients and use the actions bar: export to CSV, send secure links, or mark them identification only.

> Client records can't be deleted before the 5-year retention period ends. To stop working with a client, end the relationship on the client's file.`,
  },
  {
    slug: "client-profile", topic: "Clients and due diligence", title: "The client profile",
    summary: "The completion checklist, the tabs and the actions on a client's file.",
    body: `## Completion checklist
The coloured steps at the top show what is done (green) and what is still open (amber): identity, ownership, people checks, screening, purpose, risk and decision. Click a step to go to it.

## Actions
- Run Screening: screen the client and everyone in the structure again.
- Verify identity / Company check: start the identity check or the company register check.
- Send secure link: let the client complete their own details.
- Download PDF: the full file pack for the supervisor.

## Tabs
Overview shows the whole file. The other tabs show one part: Directors / UBOs, Verification, Screening results, Risk reports (with a PDF of each assessment), Documents, Transactions, Matters and Activity.

## Accepting the client
When nothing is left in "What to do next", review the file and accept the client in the Decision section.`,
  },
  {
    slug: "identity-verification", topic: "Clients and due diligence", title: "Verifying identity",
    summary: "Remote identity checks, in-person checks and eID.",
    body: `1. Open the client and click Verify identity (or Verification tab).
2. Click Send identity check. The person scans their ID document (with the chip where possible), takes a selfie and is matched to the document. The result, images and report are saved to the file.
3. For a check done another way (in person, national eID), use "Record a check done another way" and give the details.

People behind a company (owners, directors, trustees) are listed under "Checks per person" with the check each one needs. Send each their own identity check from there.

> All identity checks are on the Identity Verification page, with those still waiting for the client.`,
  },
  {
    slug: "company-check", topic: "Clients and due diligence", title: "Company register checks",
    summary: "Company and status, or full ownership, from the official register.",
    body: `1. Open a company client and go to the Verification tab.
2. Choose what you need: Company and status (registration details, status, legal form, address and officers) or Full ownership (also the shareholders and beneficial owners).
3. Search by name or registration number and pick the right company.
4. Review the result. Blank fields in the file are filled from the register; differences are flagged for you to check.
5. For a full ownership check, add the owners to the structure with Add to ownership.

> You pay only for what the register delivers. If it has no ownership data for the company, a full ownership check is charged as company and status and the difference is refunded.`,
  },
  {
    slug: "screening", topic: "Screening and monitoring", title: "Screening and Monitoring Alerts",
    summary: "Sanctions and PEP screening, and how to resolve possible matches.",
    body: `Every client and everyone in their structure is screened when added and again every day, and whenever a sanctions list is updated.

## Resolving a possible match
1. Open Monitoring Alerts (or the alert on the Dashboard) and click Review.
2. Compare the details: date of birth, nationality, other names.
3. Choose "Not the same person" or "Confirmed match" and write the reason. The decision is kept for the supervisor.

A confirmed sanctions match blocks the client and starts the steps for notifying the authority.

> Your staff are screened too: Team → Personnel Due Diligence.`,
  },
  {
    slug: "transaction-monitoring", topic: "Screening and monitoring", title: "Transaction Monitoring",
    summary: "Recording payments, red flags and reviews.",
    body: `Every payment you record, on a matter or with Log Transaction, is checked against red-flag rules.

## Recording payments
- Log Transaction: choose the client and matter, then the date, amount, method, country the money comes from, and whether someone else paid.
- Import from CSV: upload payments from your accounting software or bank (download the template first).

## Red flags
Cash at or above your cash threshold (€3,000 by default), cash adding up within 24 hours, large payments (€50,000 by default), amounts just under €10,000, crypto, a third-party payer, money from a high-risk country, and large payments from a high-risk or PEP client.

## Reviewing
Click Review on a transaction and choose: mark as cleared, mark as investigated, flag for review, or raise an internal suspicion report. Every decision needs a reason of at least 20 characters.

> Change the thresholds under Threshold settings (Owner or Compliance Officer).`,
  },
  {
    slug: "suspicious-matters", topic: "Reporting", title: "Reporting a suspicion",
    summary: "Internal reports, the Compliance Officer's decision and FIU reports.",
    body: `1. Anyone can report a suspicion: on a matter, use "Report a suspicion to the Compliance Officer", or on a transaction, "Raise internal suspicion report".
2. The Compliance Officer opens FIU Reporting → Suspicious Matters and decides: report to the FIU, don't report (with reasons), or legal privilege applies.
3. A decision to report creates a draft in the Report Queue. Complete it, submit it to your FIU and record the reference.

The time the suspicion was formed and the decision time are recorded and can't be changed.

> Never tell the client about a suspicion or a report (tipping-off is prohibited).`,
  },
  {
    slug: "reports", topic: "Reporting", title: "Reports for your supervisor",
    summary: "Audit-ready registers and the full export.",
    body: `Reports has registers you can download as CSV (opens in Excel): Client Register, Risk Register, Identity Verification Register, Screening Alerts, Transaction Log, Matters Register, Suspicious Matters, Staff Training Register and Audit Trail.

Before an inspection, start with the Client Register, Risk Register, Staff Training Register and Audit Trail.

Each client's full file pack is on the client profile (Download PDF). The full export of everything is at the bottom of Reports.

> Every export is logged and the Owner is told by email.`,
  },
  {
    slug: "compliance-hub", topic: "Firm compliance and team", title: "The Compliance Hub",
    summary: "Your firm-level AML program in one place.",
    body: `- Overview: the status of your program.
- Compliance Calendar: all deadlines, overdue first.
- Business Risk Assessment and AML Program: review and approve at least once a year.
- Governance: the Compliance Officer, management approvals and the annual report.
- Outsourcing, Whistleblowing and Data Protection.
- My Firm Compliance: your own documents in folders: Approvals & Sign-offs, Audit & Reviews, FIU & Supervisor Correspondence, Other.`,
  },
  {
    slug: "team", topic: "Firm compliance and team", title: "Team, responsibilities and training",
    summary: "Members, who does what, staff checks and training records.",
    body: `- Members: invite colleagues and give them roles.
- Responsibilities: tick who is accountable for each AML duty. The Dashboard shows duties with nobody assigned.
- Personnel Due Diligence: integrity declarations on joining and every year, and staff screening against sanctions lists.
- Training: training in the app, assigned and completed with an attestation (also under My Compliance).
- Training Register: workshops, seminars and courses attended outside the app.`,
  },
  {
    slug: "billing", topic: "Billing and account", title: "Plans, checks and invoices",
    summary: "How you are billed.",
    body: `Your plan is billed monthly by invoice; pay by bank transfer. Identity checks, screenings and company checks are charged per check and appear on the same invoice.

- Settings → Billing: your plan, invoice details, past invoices and every charge.
- For your security there are limits on screenings and register searches per day. If you need more, contact us and we'll adjust them within 1 business day.

> Need a bigger plan? Contact contact@amlsync.com.`,
  },
  {
    slug: "security", topic: "Billing and account", title: "Security and your data",
    summary: "Two-factor sign-in, access and how your data is protected.",
    body: `- Everyone signs in with two-factor authentication.
- Each firm's data is separated at database level; AMLSync staff can't see your data unless you approve a time-limited support request (Settings → Security).
- Sensitive fields are encrypted, uploaded files are scanned for malware, and every action is in the Audit Trail.
- Our suppliers and where data is stored are listed on the suppliers page.`,
  },
];

export function searchHelp(q: string): HelpArticle[] {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return HELP_ARTICLES;
  return HELP_ARTICLES.map((a) => {
    const t = `${a.title} ${a.summary}`.toLowerCase(), b = a.body.toLowerCase();
    const score = words.reduce((n, w) => n + (t.includes(w) ? 3 : 0) + (b.includes(w) ? 1 : 0), 0);
    return { a, score };
  }).filter((x) => x.score > 0).sort((x, y) => y.score - x.score).map((x) => x.a);
}
