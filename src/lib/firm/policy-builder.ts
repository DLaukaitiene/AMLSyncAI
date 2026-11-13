/**
 * Policy Builder (spec §4.8, §11.3; AMLR Art. 9(2)).
 * Generates the AML/CTF policy and the procedures in plain language from the
 * firm profile, its risk assessment and its Country Profile. Policies are
 * approved by management; procedures at least by the compliance manager.
 */
import type { DocSection, GeneratedDoc } from "@/lib/docs/model";
import type { CountryProfile } from "@/lib/rules/country-profile";
import { EU_CORE } from "@/lib/rules/eu-core";

/** The Art. 9(2) minimum list — every generated policy must cover each item. */
export const ART_9_2_ITEMS = [
  { id: "risk-assessment", heading: "Risk assessment" },
  { id: "risk-management", heading: "Risk management and internal controls" },
  { id: "cdd", heading: "Customer due diligence, including politically exposed persons" },
  { id: "sanctions", heading: "Targeted financial sanctions" },
  { id: "reporting", heading: "Reporting of suspicions" },
  { id: "outsourcing", heading: "Outsourcing and reliance" },
  { id: "records", heading: "Record retention and data protection" },
  { id: "monitoring", heading: "Compliance monitoring and remediation" },
  { id: "integrity", heading: "Employee integrity" },
  { id: "communication", heading: "Internal communication" },
  { id: "training", heading: "Training" },
] as const;

export interface PolicyInput {
  firm: { name: string; sectors: string[]; memberState: string; onePersonFirm: boolean };
  officers: { complianceManager: string; complianceOfficer: string };
  riskLevel?: string; // overall residual risk from the approved risk assessment
  riskActions?: string[];
  profile: CountryProfile;
}

const SECTOR_TEXT: Record<string, string> = {
  ACCOUNTANT: "accounting, audit and tax services",
  ESTATE_AGENT: "real estate agency services, including lettings with a monthly rent of €10,000 or more",
  HVG_TRADER: "trading in high-value goods",
  PRECIOUS_METALS: "trading in precious metals and stones",
  TCSP: "trust and company services",
  LEGAL: "legal services in the activities listed in AMLR Art. 3(3)(b)",
  ART_TRADER: "trading in works of art and cultural goods",
};

function sectorSpecific(sectors: string[]): string[] {
  const out: string[] = [];
  if (sectors.includes("ESTATE_AGENT")) out.push("In a property sale we carry out CDD on both the buyer and the seller, after the offer is accepted and before any funds or property move (Art. 19(6), 23).");
  if (sectors.some((s) => s === "HVG_TRADER" || s === "PRECIOUS_METALS")) {
    out.push("We carry out CDD on our customer and on our supplier (Art. 19(6)). We identify customers paying €3,000 or more in cash, including linked payments (Art. 19(4)).");
    out.push(`We report sales of motor vehicles of €${EU_CORE.reporting.motorVehicleEUR.toLocaleString("en")} or more and of aircraft or watercraft of €${EU_CORE.reporting.aircraftWatercraftEUR.toLocaleString("en")} or more to the FIU (Art. 74).`);
  }
  if (sectors.includes("TCSP")) out.push("We carry out CDD whenever we form a company or arrange a transfer of ownership of a legal entity, whatever the value (Art. 19(1)(c)).");
  if (sectors.some((s) => s === "ACCOUNTANT" || s === "LEGAL")) out.push("The duty to report does not apply to information received while ascertaining a client's legal position or defending or representing the client in proceedings (Art. 70(2)). The Compliance Officer records every decision that this exemption applies.");
  return out;
}

export function buildPolicy(i: PolicyInput, version: number, date: string): GeneratedDoc {
  const p = i.profile;
  const fiu = p.fiu ? `${p.fiu.name} (${p.fiu.channel})` : "the national FIU (to be entered in the Country Profile)";
  const supervisor = p.supervisors[0]?.name ?? "our supervisor (to be entered in the Country Profile)";
  const cashCap = p.cashCapEUR.toLocaleString("en");
  const services = i.firm.sectors.map((s) => SECTOR_TEXT[s] ?? s.toLowerCase().replace("_", " ")).join("; ");

  const s: Record<(typeof ART_9_2_ITEMS)[number]["id"], string[]> = {
    "risk-assessment": [
      `${i.firm.name} provides ${services}. Our business-wide risk assessment covers money laundering, terrorist financing and sanctions evasion${i.riskLevel ? `; the current residual risk is ${i.riskLevel}` : ""}.`,
      "The Compliance Officer drafts it and management approves it. We update it at least once a year, after any significant change, and before launching a new product, service, delivery channel or market (Art. 10).",
      p.nationalRiskAssessmentReviewed ? "We have taken the national risk assessment into account." : "We will review the national risk assessment and record its findings in our Country Profile.",
    ],
    "risk-management": [
      `Management is responsible for this policy. ${i.officers.complianceManager} is the compliance manager (member of the management body) and ${i.officers.complianceOfficer} is the Compliance Officer (Art. 11).`,
      "We apply measures in proportion to risk. Client risk is calculated from the information we collect and rated Low, Medium or High; the reasons are recorded. Only the Compliance Officer may override a rating, with written reasons.",
      ...(i.riskActions?.length ? [`Open actions from the risk assessment: ${i.riskActions.slice(0, 5).join(" ")}`] : []),
    ],
    cdd: [
      `We carry out CDD when we start a business relationship, for occasional transactions of €${EU_CORE.cdd.occasionalTransactionEUR.toLocaleString("en")} or more (including linked transactions), when we suspect money laundering or terrorist financing, and when we doubt information we hold (Art. 19).`,
      "CDD means identifying and verifying the client and anyone acting for them, identifying the beneficial owners (25% or more, or control by other means), understanding the purpose of the relationship, screening against sanctions, and monitoring the relationship (Art. 20).",
      "We verify identity with a national eID where possible, otherwise in person or with a remote document check including NFC chip reading and liveness. A client cannot be accepted while any mandatory item is open.",
      "Simplified due diligence is used only for Low-risk clients, with reasons recorded; verification may then be completed within 60 days (Art. 33). Enhanced due diligence applies to High-risk clients, to politically exposed persons, their family and close associates, and to links with high-risk third countries (Art. 34, 42–46).",
      "Senior management must approve establishing or continuing a relationship with a politically exposed person. We establish the source of wealth and source of funds and monitor the relationship more closely. Former PEPs stay in scope for at least 12 months.",
      `We review client information at least every year for EDD clients and every ${EU_CORE.monitoring.refreshYearsStandard} years for others, and whenever circumstances change (Art. 26).`,
      "If we cannot complete CDD, we do not start or continue the relationship, we consider a suspicious transaction report and we record the decision (Art. 21).",
      "We do not accept anonymous clients or entities with bearer shares (Art. 79).",
      `We do not accept cash payments of €${cashCap} or more (Art. 80${p.cashCapEUR < EU_CORE.cash.capEUR ? " and national law" : ""}).`,
      ...sectorSpecific(i.firm.sectors),
    ],
    sanctions: [
      "We screen every client, beneficial owner and company in the ownership structure against EU and UN sanctions lists and the national lists in our Country Profile, before we act and whenever the lists change. Screening is never reduced for low-risk clients.",
      "A company owned more than 50% by sanctioned persons, together and through ownership chains, or controlled by one, is treated as sanctioned.",
      `If we find a true match we stop, make no funds or economic resources available, freeze assets where we hold them and notify ${p.sanctionsAuthority?.name ?? "the national sanctions authority"} without delay. We also apply the EU sectoral restrictions relating to Russia and Belarus.`,
    ],
    reporting: [
      "Any employee who suspects money laundering or terrorist financing reports it internally to the Compliance Officer at once. The Compliance Officer assesses every report and records the decision and the reasons, including decisions not to report.",
      `Suspicious transactions, including attempted transactions, are reported to ${fiu} (Art. 69)${p.sroReportingRoute.enabled && p.sroReportingRoute.body ? `, or through ${p.sroReportingRoute.body} where the law allows (Art. 70(1))` : ""}.`,
      "We do not carry out a transaction we suspect until we have reported it. It may go ahead if the FIU gives no instruction within 3 working days (Art. 71).",
      `We answer requests from the FIU within ${p.fiuRequestWorkingDays} working days or any shorter deadline it sets.`,
      "We never tell the client or anyone else that a report has been or may be made (Art. 73).",
    ],
    outsourcing: [
      `We may outsource tasks to a service provider only under a written agreement and after notifying ${supervisor} (Art. 18). We remain fully responsible. Decisions on risk, on accepting clients and on reporting are never outsourced.`,
      "If we rely on CDD performed by another obliged entity, we have a written agreement and can obtain the documents within 5 working days (Art. 48–50).",
    ],
    records: [
      `We keep CDD records, transaction records and our assessments for ${p.retentionYears} years after the relationship ends, the occasional transaction is carried out or the client is refused, then delete them unless an authority orders a longer period (Art. 77).`,
      "We process personal data only to meet our AML obligations, inform clients about it, and never reuse it commercially. Clients can ask for an explanation of automated steps and challenge them, except where this would reveal a report (Art. 76).",
    ],
    monitoring: [
      "The Compliance Officer checks regularly that this policy is applied, tracks every deadline in the Compliance Calendar and reports to management each year in an annual compliance report.",
      "Weaknesses found by these checks or by an independent review are recorded with an owner and a deadline, and fixed.",
    ],
    integrity: i.firm.onePersonFirm
      ? ["As a one-person firm, the employee integrity checks of Art. 13 do not apply."]
      : [
          "Before staff start, and periodically after, we check that they have the integrity and skills for their role, and they declare conflicts of interest (Art. 13). Staff with a conflict do not work on that client.",
        ],
    communication: [
      "Staff can reach the Compliance Officer at any time. Changes to this policy are communicated to all staff, who confirm they have read them.",
      ...(i.firm.onePersonFirm ? [] : ["Staff can report breaches of AML rules through an internal channel that protects their identity (Art. 14)."]),
    ],
    training: [
      "All staff receive AML training when they join and at least once a year, adapted to their role. Completion is recorded (Art. 12).",
    ],
  };

  const sections: DocSection[] = ART_9_2_ITEMS.map((it, n) => ({ id: it.id, heading: `${n + 1}. ${it.heading}`, blocks: s[it.id].map((t) => ({ p: t })) }));

  return {
    title: "AML/CTF policy",
    subtitle: i.firm.name,
    meta: [`Version ${version} · ${date}`, `Regulation (EU) 2024/1624 · EU Core ${EU_CORE.version}`],
    sections,
  };
}

/** Step-by-step procedures (what staff do). */
export function buildProcedures(i: PolicyInput, version: number, date: string): GeneratedDoc {
  const steps = (xs: string[]) => [{ list: xs }];
  return {
    title: "AML/CTF procedures",
    subtitle: i.firm.name,
    meta: [`Version ${version} · ${date}`],
    sections: [
      { id: "new-client", heading: "1. New client or new matter", blocks: steps([
        "Create the client (or the matter and each party) in AMLSyncAI with at least the name and email.",
        "Send the client the secure portal link, or enter the information yourself.",
        "Verify identity: national eID first; otherwise in person or remote document + NFC + liveness, with the reason recorded.",
        "For companies: record the register extract and the ownership structure until you reach the people who own or control it.",
        "Resolve every screening match as true match or false positive, with a comment.",
        "Check the risk result. If EDD applies, complete the checklist and get senior management approval.",
        "Accept the client only when 'What to do next' is empty.",
      ]) },
      { id: "transactions", heading: "2. Payments and transactions", blocks: steps([
        "Record each payment on the matter. AMLSyncAI flags when CDD is needed, including for linked transactions.",
        `Refuse cash of €${i.profile.cashCapEUR.toLocaleString("en")} or more.`,
        "If a payment doesn't fit what you know about the client, report it internally before going ahead.",
      ]) },
      { id: "suspicion", heading: "3. If something feels wrong", blocks: steps([
        "Use 'Report a suspicion to the Compliance Officer' on the client or matter. Don't investigate further on your own.",
        "Don't tell the client or anyone else.",
        "Don't complete the transaction until the Compliance Officer tells you it may go ahead.",
      ]) },
      { id: "monitoring", heading: "4. Ongoing monitoring", blocks: steps([
        "Check the Compliance Calendar every week and clear overdue items first.",
        "When a client's details change (new owner, new country, unusual payment), update the file and review the risk.",
      ]) },
      { id: "officer", heading: "5. Compliance Officer", blocks: steps([
        "Assess every internal report and record the decision and reasons; file STRs through the FIU channel and record the receipt.",
        "Answer FIU requests within the deadline in the Calendar.",
        "Report BO register discrepancies within 14 days unless the client corrects them.",
        "Keep the Country Profile up to date and review it every year.",
        "Prepare the annual compliance report for management.",
      ]) },
    ],
  };
}
