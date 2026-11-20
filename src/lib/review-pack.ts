import type { DocSection, GeneratedDoc } from "@/lib/docs/model";
import type { CountryProfile } from "@/lib/rules/country-profile";
import { EU_CORE, EU_CORE_VERSION } from "@/lib/rules/eu-core";
import { requiredCheck, type StructureRole } from "@/lib/rules/check-matrix";
import { EDD_CHECKLIST, HIGH_FROM, MEDIUM_FROM, RISK_RULESET_VERSION } from "@/lib/rules/risk-scoring";
import { LOOK_THROUGH_REASONS } from "@/lib/rules/ownership-branches";
import { SCOPE_REASONS } from "@/lib/rules/cdd-scope";
import { HIGH_RISK_LIST_VERSION } from "@/lib/rules/high-risk-countries";
import { OBLIGATIONS } from "@/lib/obligations/catalog";
import { RESPONSIBILITIES } from "@/lib/firm/responsibilities";

/**
 * Review pack: every rule, threshold and assumption AMLSync App applies, in plain
 * words, generated from the same constants the app uses — so it always matches.
 * For a lawyer or accountant to check, and for a client firm to understand (or give
 * to its own adviser). Items marked [check] depend on national law or final EU
 * standards and should be confirmed.
 */
export interface ReviewPackInput {
  firmName: string;
  sectors: string[];
  profile: CountryProfile;
  profileVersion: number;
  txCashThresholdEUR: number;
  txHighValueThresholdEUR: number;
}

const eur = (n: number) => `€${n.toLocaleString("en-IE")}`;
const CHECK = " [check]";

const ROLES: [StructureRole, string][] = [
  ["client", "The client"], ["beneficial-owner", "Beneficial owner (25% or more, or control)"], ["intermediate-owner", "Company in the ownership chain"],
  ["minority-owner", "Owner below 25%"], ["senior-managing-official", "Senior managing official (no owner found)"], ["trustee", "Trustee"],
  ["trust-settlor", "Settlor / protector of a trust"], ["trust-beneficiary", "Beneficiary of a trust"], ["nominee", "Nominee shareholder or director"], ["director", "Director / senior management"],
];

export function buildReviewPack(i: ReviewPackInput): GeneratedDoc {
  const c = EU_CORE;
  const p = i.profile;
  const sections: DocSection[] = [
    {
      id: "how", heading: "1. How to use this pack",
      blocks: [
        { p: `This pack lists every rule AMLSync App applies for ${i.firmName}: thresholds, deadlines, which checks are required, how risk is scored, and when payments are flagged. It is generated from the app's own rule set (EU Core ${EU_CORE_VERSION}, risk rules ${RISK_RULESET_VERSION}), so it always matches what the app does.` },
        { p: "Ask your lawyer or accountant to read it and confirm it fits your firm and your country. Items marked [check] depend on national law or on EU standards that are not final yet. Record their comments in section 13; change national values in Settings → Country Profile." },
        { p: "The legal basis is the EU Anti-Money Laundering Regulation (EU) 2024/1624 (AMLR) unless stated otherwise. This pack explains how the software works; it is not legal advice." },
      ],
    },
    {
      id: "thresholds", heading: "2. Thresholds and deadlines (EU rules, built in)",
      blocks: [{ table: { head: ["Rule", "Value", "Legal basis"], rows: [
        ["Client checks for an occasional transaction (including linked ones)", `${eur(c.cdd.occasionalTransactionEUR)} or more`, "Art. 19(1)(b)"],
        ["Window in which smaller transactions count as linked", `${c.cdd.linkedTransactionWindowDays} days${CHECK}`, "Art. 19(9), AMLA standards"],
        ["Dealers: identify buyers paying cash", `${eur(c.cdd.cashIdentificationEUR)} or more`, "Art. 19(4)"],
        ["Letting agents in scope when monthly rent is", `${eur(c.cdd.lettingMonthlyRentEUR)} or more`, "Art. 3(3)(d)"],
        ["Cash payments not allowed", `${eur(p.cashCapEUR)} or more${p.cashCapEUR < c.cash.capEUR ? " (your national limit)" : ""}`, "Art. 80"],
        ["Beneficial owner", `${c.beneficialOwnership.thresholdPct}% or more, or control by other means`, "Art. 51–53"],
        ["Sanctions: company treated as controlled when sanctioned owners hold", `more than ${c.sanctions.ownershipAggregationPct}%`, "EU sanctions guidance"],
        ["Former PEPs stay PEPs for at least", `${c.pep.formerPepMonths} months after leaving office`, "Art. 46"],
        ["Simplified checks: verification may be delayed by up to", `${c.sdd.maxVerificationDelayDays} days`, "Art. 33"],
        ["Client review: high-risk / others", `at least every ${c.monitoring.refreshYearsEDD} year / ${c.monitoring.refreshYearsStandard} years`, "Art. 26(2)"],
        ["Answer FIU requests within", `${p.fiuRequestWorkingDays} working days`, "Art. 69(1)(b)"],
        ["Reported transaction held for", `${c.reporting.transactionHoldWorkingDays} working days`, "Art. 71"],
        ["Report beneficial-owner register discrepancies within", `${c.reporting.discrepancyCalendarDays} days${CHECK}`, "Art. 24"],
        ["Threshold reports: cars / aircraft and boats", `${eur(c.reporting.motorVehicleEUR)} / ${eur(c.reporting.aircraftWatercraftEUR)} or more`, "Art. 74"],
        ["Keep records for", `${c.records.retentionYears} years after the relationship ends${CHECK}`, "Art. 77; national law until 10 July 2027"],
      ] } }],
    },
    {
      id: "national", heading: "3. Your national details (Country Profile)",
      blocks: [
        { kv: [
          ["Country", p.memberState], ["Profile version", String(i.profileVersion)],
          ["Supervisor(s)", p.supervisors.length ? p.supervisors.map((s) => `${s.name} (${s.sector})`).join("; ") : "not recorded yet"],
          ["FIU and reporting channel", p.fiu ? `${p.fiu.name}: ${p.fiu.channel}` : "not recorded yet"],
          ["National cash limit", eur(p.cashCapEUR)],
          ["National cash report", p.nationalCashReport.enabled ? `on, from ${eur(p.nationalCashReport.thresholdEUR ?? 0)}${CHECK}` : "off"],
        ] },
        { p: "These values are entered by your firm. Your adviser should confirm them against national law." },
      ],
    },
    {
      id: "checks", heading: "4. Who needs which check",
      blocks: [
        { p: "Everyone in a client's structure is screened against sanctions and PEP lists. On top of that, the app asks for these checks by role. High-risk clients (enhanced due diligence) need stricter checks for some roles." },
        { table: { head: ["Role", "Person: standard", "Person: high risk", "Company: standard", "Legal basis"], rows: ROLES.map(([role, label]) => {
          const n = requiredCheck("natural", [role], { edd: false }), h = requiredCheck("natural", [role], { edd: true }), l = requiredCheck("legal", [role], { edd: false });
          return [label, n.label, h.label, l.label, n.article];
        }) } },
      ],
    },
    {
      id: "risk", heading: "5. How client risk is scored",
      blocks: [
        { p: `Each risk factor adds points. ${MEDIUM_FROM}–${HIGH_FROM - 1} points is medium risk, ${HIGH_FROM} or more is high risk. Some factors make a client high risk on their own. A person can change the rating, with a reason that is kept.` },
        { table: { head: ["Factor", "Points"], rows: [
          ["Link to an EU high-risk third country (list version " + HIGH_RISK_LIST_VERSION + ")", "5, always high risk"],
          ["Link to a country under EU countermeasures", "5, always high risk"],
          ["Politically exposed person, former PEP (12 months), or family member / close associate", "5, always high risk"],
          ["Complex, unusually large or no apparent purpose transaction", "5, always high risk"],
          ["National extra EDD case (Country Profile)", "5, always high risk"],
          ["Confirmed adverse media", "4"],
          ["Trust or legal arrangement", "3"],
          ["Complex ownership (3 or more layers) / nominee arrangements", "3 each"],
          ["High-risk product or service", "3 (medium: 1)"],
          ["Country typed by hand (not on the standard list)", "3"],
          ["Cash use", "2"],
          ["Through an intermediary / remote with documents", "2 / 1"],
          ["Legal entity / two ownership layers", "1 each"],
        ] } },
        { p: "Enhanced due diligence for high-risk clients covers: " + EDD_CHECKLIST.map((e) => e.label.toLowerCase()).join("; ") + "." },
      ],
    },
    {
      id: "look-through", heading: "6. When ownership doesn't need to be traced further" + CHECK,
      blocks: [{ list: Object.values(LOOK_THROUGH_REASONS) }, { p: "The person who records the reason, and the date, are kept." }],
    },
    {
      id: "scope", heading: "7. When a client can be \"identification only\"" + CHECK,
      blocks: [{ list: Object.entries(SCOPE_REASONS).map(([, v]) => `${v.label} (${v.article})`) }, { p: "Identification and sanctions screening still apply. The client is switched to full checks as soon as an AMLR service starts." }],
    },
    {
      id: "flags", heading: "8. Payments flagged for review",
      blocks: [{ list: [
        `Cash at or above ${eur(i.txCashThresholdEUR)} (your setting; default ${eur(c.cdd.cashIdentificationEUR)})`,
        `Cash from one client adding up to that amount within 24 hours`,
        `Any payment at or above ${eur(i.txHighValueThresholdEUR)} (your setting)`,
        "Two or more payments of €9,000–€9,999 within 30 days" + CHECK,
        "Payment in crypto-assets; payment by someone other than the client; money from an EU high-risk third country",
        `${eur(10_000)} or more from a high-risk or PEP client`,
      ] }, { p: "A flag asks for a review with a written reason; it is not a suspicion on its own." }],
    },
    {
      id: "obligations", heading: "9. The firm's obligations, as the app presents them",
      blocks: [{ table: { head: ["Obligation", "When", "Legal basis"], rows: OBLIGATIONS.map((o) => [o.title, o.when, o.article]) } }],
    },
    {
      id: "duties", heading: "10. Duties to assign to named people",
      blocks: [{ list: RESPONSIBILITIES.map((r) => r.label) }],
    },
    {
      id: "automation", heading: "11. What the app does automatically",
      blocks: [{ list: [
        "Screens every person and company in a client's structure when added, every day, and when a list changes.",
        "Calculates and stores the risk rating whenever client data changes.",
        "Blocks accepting a client, and completing a case, while a required step is missing.",
        "Counts deadlines (reviews, FIU requests, transaction holds, discrepancy reports) into the Compliance Calendar.",
        "Records every action in an audit trail that nobody can edit, and keeps records for the retention period.",
      ] }],
    },
    {
      id: "sector", heading: "12. Sector notes",
      blocks: [{ list: OBLIGATIONS.flatMap((o) => Object.entries(o.sectorNotes ?? {}).filter(([s]) => i.sectors.length === 0 || i.sectors.includes(s)).map(([, t]) => t ?? "")).filter(Boolean) }],
    },
    {
      id: "review", heading: "13. Reviewer's record",
      blocks: [
        { kv: [["Reviewed by (name, firm)", "______________________________"], ["Date", "______________"], ["Signature", "______________________________"]] },
        { p: "Comments and items to change:" },
        { p: "______________________________________________________________________________" },
        { p: "______________________________________________________________________________" },
      ],
    },
  ];
  return { title: "Review pack: how AMLSync App applies the AML rules", subtitle: i.firmName, meta: [`EU Core ${EU_CORE_VERSION}`, `Risk rules ${RISK_RULESET_VERSION}`, `Country Profile v${i.profileVersion}`, `Generated ${new Date().toISOString().slice(0, 10)}`], sections };
}
