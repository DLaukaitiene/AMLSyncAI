/**
 * Business-wide risk assessment (spec §4.1, §11.2; AMLR Art. 10, Annex I–III).
 *
 * Covers money laundering, terrorist financing and sanctions evasion. Each
 * answer maps to an inherent-risk score; controls reduce or raise it to the
 * residual risk. The result lists every factor so the assessment can be
 * explained to a supervisor. Drafted by the compliance officer, approved by
 * management.
 */
import type { GeneratedDoc } from "@/lib/docs/model";

export type Threat = "ML" | "TF" | "SE"; // money laundering, terrorist financing, sanctions evasion
export type FactorGroup = "Customers" | "Products, services and transactions" | "Delivery channels" | "Geography";

export interface RiskQuestion {
  id: string;
  group: FactorGroup;
  threats: Threat[];
  text: string;
  hint?: string;
  options: string[]; // index = inherent score 0 (low) … 3 (very high)
  annex: string;
}

export interface ControlQuestion {
  id: string;
  text: string;
  article: string;
  action: string; // what to do if not fully in place
}

export const RISK_QUESTIONS: RiskQuestion[] = [
  { id: "c-structures", group: "Customers", threats: ["ML", "SE"], annex: "Annex I(1), III(1)", text: "How many of your clients are companies with complex or multi-layered ownership?", options: ["None", "Fewer than 10%", "10–30%", "More than 30%"] },
  { id: "c-pep", group: "Customers", threats: ["ML"], annex: "Annex III(1)", text: "Do you have clients who are politically exposed persons, their family or close associates?", options: ["None", "One or two", "Several", "Many"] },
  { id: "c-nonresident", group: "Customers", threats: ["ML", "SE"], annex: "Annex III(1)", text: "Share of clients not resident in the EU", options: ["None", "Fewer than 10%", "10–30%", "More than 30%"] },
  { id: "c-cashbusiness", group: "Customers", threats: ["ML"], annex: "Annex III(1)", text: "Clients whose business is cash-intensive (e.g. restaurants, car washes, retail)", options: ["None", "A few", "Some", "Many"] },
  { id: "c-npo", group: "Customers", threats: ["TF"], annex: "Annex III(1)", text: "Non-profit organisations or charities that send money abroad", options: ["None", "A few", "Some", "Many"] },
  { id: "p-clientmoney", group: "Products, services and transactions", threats: ["ML"], annex: "Annex III(2)", text: "Do you hold or move client money or assets?", options: ["Never", "Occasionally", "Regularly", "It's our core business"] },
  { id: "p-size", group: "Products, services and transactions", threats: ["ML"], annex: "Annex II(2), III(2)", text: "Typical transaction value", options: ["Under €10,000", "€10,000–100,000", "€100,000–1 million", "Over €1 million"] },
  { id: "p-cash", group: "Products, services and transactions", threats: ["ML", "TF"], annex: "Annex III(2)", text: "Do you accept cash?", options: ["No", "Small amounts only (under €3,000)", "Up to the cash cap", "Often, large amounts"] },
  { id: "p-corporate", group: "Products, services and transactions", threats: ["ML", "SE"], annex: "Annex III(2)", text: "Do you form companies, act as nominee, or provide trust services?", options: ["No", "Rarely", "Sometimes", "Regularly"] },
  { id: "p-crypto", group: "Products, services and transactions", threats: ["ML", "TF", "SE"], annex: "Annex III(2)", text: "Do you accept payment in crypto-assets?", options: ["No", "In exceptional cases", "Sometimes", "Regularly"] },
  { id: "p-goods", group: "Products, services and transactions", threats: ["SE"], annex: "EU Reg. 833/2014", text: "Do you sell goods that could be re-exported to sanctioned countries (luxury goods, vehicles, dual-use items)?", options: ["No", "Rarely", "Sometimes", "Regularly"] },
  { id: "d-remote", group: "Delivery channels", threats: ["ML"], annex: "Annex III(4)", text: "Share of clients you never meet in person", options: ["None", "Under 25%", "25–75%", "Over 75%"] },
  { id: "d-intermediaries", group: "Delivery channels", threats: ["ML"], annex: "Annex III(4)", text: "Do clients come through introducers or intermediaries you don't control?", options: ["No", "A few", "Some", "Most"] },
  { id: "g-crossborder", group: "Geography", threats: ["ML", "SE"], annex: "Annex III(3)", text: "Share of business with other countries", options: ["Under 10%", "10–30%", "30–60%", "Over 60%"] },
  { id: "g-highrisk", group: "Geography", threats: ["ML", "TF"], annex: "Annex III(3)", text: "Business with high-risk third countries or conflict zones", options: ["None", "Occasional, indirect", "Occasional, direct", "Regular"] },
  { id: "g-ru-by", group: "Geography", threats: ["SE"], annex: "EU Reg. 269/2014, 833/2014, 765/2006", text: "Clients, owners, suppliers or counterparties linked to Russia or Belarus", options: ["None", "A few, indirect", "Some", "Many"] },
];

export const CONTROL_QUESTIONS: ControlQuestion[] = [
  { id: "k-policies", text: "Written AML/CTF policies and procedures, approved and up to date", article: "Art. 9", action: "Generate and approve policies and procedures in the Policy Builder." },
  { id: "k-training", text: "All staff trained in the last 12 months", article: "Art. 12", action: "Assign AML training to every staff member and record completion." },
  { id: "k-cdd", text: "CDD including beneficial owners completed before every relationship", article: "Art. 20–23", action: "Use the hard gates: don't accept clients while CDD items are open." },
  { id: "k-screening", text: "Sanctions screening of clients and their whole ownership structure", article: "Art. 20(1)(d), 26(4)", action: "Screen every client and owner; load your national sanctions list." },
  { id: "k-monitoring", text: "Ongoing monitoring and timely CDD refresh", article: "Art. 26", action: "Clear overdue refreshes in the Compliance Calendar." },
  { id: "k-reporting", text: "Staff know how to report suspicions internally, and reports are assessed", article: "Art. 69", action: "Brief staff on internal reporting; record every assessment." },
  { id: "k-records", text: "Records kept 5 years and deleted afterwards", article: "Art. 77", action: "Use Records to keep and delete files on time." },
  { id: "k-review", text: "Independent review of the AML framework in the last 2 years", article: "Art. 9", action: "Arrange an independent review (e.g. AMLSync Expert)." },
];

export const CONTROL_OPTIONS = ["Not in place", "Partly in place", "Fully in place"] as const;
export const LEVELS = ["Low", "Medium", "High", "Very high"] as const;
export type Level = (typeof LEVELS)[number];

export type Answers = Record<string, number>; // question id → option index

export interface AssessmentResult {
  groups: { group: FactorGroup; inherent: Level; drivers: string[] }[];
  threats: { threat: Threat; inherent: Level; residual: Level }[];
  overallInherent: Level;
  controls: "Weak" | "Adequate" | "Strong";
  controlGaps: ControlQuestion[];
  overallResidual: Level;
  actions: string[];
  unanswered: string[];
}

function level(scores: number[]): number {
  if (!scores.length) return 0;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const max = Math.max(...scores);
  // The single worst factor counts heavily: one very high factor can't be averaged away.
  return Math.min(3, Math.round(avg * 0.5 + max * 0.5));
}

export function assess(a: Answers, nationalRiskAssessmentReviewed: boolean, nationalEddCases: string[] = []): AssessmentResult {
  const unanswered = [...RISK_QUESTIONS.map((q) => q.id), ...CONTROL_QUESTIONS.map((q) => q.id)].filter((id) => a[id] === undefined);
  const groups = (["Customers", "Products, services and transactions", "Delivery channels", "Geography"] as FactorGroup[]).map((g) => {
    const qs = RISK_QUESTIONS.filter((q) => q.group === g && a[q.id] !== undefined);
    return {
      group: g,
      inherent: LEVELS[level(qs.map((q) => a[q.id]))],
      drivers: qs.filter((q) => a[q.id] >= 2).map((q) => `${q.text} — ${q.options[a[q.id]]}`),
    };
  });

  const controlScores = CONTROL_QUESTIONS.map((q) => a[q.id] ?? 0);
  const controlAvg = controlScores.reduce((x, y) => x + y, 0) / controlScores.length;
  const controls = controlAvg >= 1.75 && controlScores.every((s) => s >= 1) ? "Strong" : controlAvg >= 1.1 ? "Adequate" : "Weak";
  const adjust = controls === "Strong" ? -1 : controls === "Weak" ? 1 : 0;

  const threatLevel = (t: Threat) => level(RISK_QUESTIONS.filter((q) => q.threats.includes(t) && a[q.id] !== undefined).map((q) => a[q.id]));
  const threats = (["ML", "TF", "SE"] as Threat[]).map((t) => {
    const inh = threatLevel(t);
    return { threat: t, inherent: LEVELS[inh], residual: LEVELS[Math.max(0, Math.min(3, inh + adjust))] };
  });
  const overall = Math.max(...threats.map((t) => LEVELS.indexOf(t.inherent)));
  const controlGaps = CONTROL_QUESTIONS.filter((q) => (a[q.id] ?? 0) < 2);

  const actions = [
    ...controlGaps.map((q) => `${q.action} (${q.article})`),
    ...RISK_QUESTIONS.filter((q) => (a[q.id] ?? 0) >= 3).map((q) => `High-risk factor: "${q.text}" — apply EDD where it occurs and monitor more often.`),
    ...(!nationalRiskAssessmentReviewed ? ["Review the national risk assessment and record any additional EDD cases in your Country Profile (Art. 10(3), 34(6))."] : []),
    ...nationalEddCases.map((c) => `National EDD case applies: ${c}.`),
  ];

  return {
    groups,
    threats,
    overallInherent: LEVELS[overall],
    controls,
    controlGaps,
    overallResidual: LEVELS[Math.max(0, Math.min(3, overall + adjust))],
    actions,
    unanswered,
  };
}

const THREAT_NAMES: Record<Threat, string> = { ML: "Money laundering", TF: "Terrorist financing", SE: "Sanctions evasion" };

export function riskAssessmentDoc(
  firm: { name: string; sectors: string[]; memberState: string },
  a: Answers,
  r: AssessmentResult,
  meta: { version: number; date: string; euCoreVersion: string; countryProfileVersion: number; status: string; approvedBy?: string },
): GeneratedDoc {
  return {
    title: "Business-wide risk assessment",
    subtitle: `${firm.name} · ${firm.sectors.join(", ")} · ${firm.memberState}`,
    meta: [
      `Version ${meta.version} · ${meta.date} · ${meta.status}${meta.approvedBy ? ` · approved by ${meta.approvedBy}` : ""}`,
      `AMLR (EU) 2024/1624 Art. 10 · EU Core ${meta.euCoreVersion} · Country Profile v${meta.countryProfileVersion}`,
    ],
    sections: [
      {
        id: "summary",
        heading: "1. Summary",
        blocks: [
          { kv: [["Overall inherent risk", r.overallInherent], ["Controls", r.controls], ["Overall residual risk", r.overallResidual]] },
          { table: { head: ["Threat", "Inherent risk", "Residual risk"], rows: r.threats.map((t) => [THREAT_NAMES[t.threat], t.inherent, t.residual]) } },
        ],
      },
      {
        id: "inherent",
        heading: "2. Inherent risk by factor group (Annex I–III)",
        blocks: r.groups.flatMap((g) => [
          { p: `${g.group}: ${g.inherent}` },
          ...(g.drivers.length ? [{ list: g.drivers }] : []),
        ]),
      },
      {
        id: "answers",
        heading: "3. Answers",
        blocks: [{ table: { head: ["Question", "Answer", "Source"], rows: RISK_QUESTIONS.map((q) => [q.text, a[q.id] !== undefined ? q.options[a[q.id]] : "Not answered", q.annex]) } }],
      },
      {
        id: "controls",
        heading: "4. Controls",
        blocks: [{ table: { head: ["Control", "Status", "Article"], rows: CONTROL_QUESTIONS.map((q) => [q.text, a[q.id] !== undefined ? CONTROL_OPTIONS[a[q.id]] : "Not answered", q.article]) } }],
      },
      { id: "actions", heading: "5. Action plan", blocks: [r.actions.length ? { list: r.actions } : { p: "No actions identified." }] },
      {
        id: "method",
        heading: "6. Method",
        blocks: [
          { p: "Each factor is scored from Low to Very high. A group's level combines the average and the worst factor, so one very high factor cannot be averaged away. Strong controls lower the residual risk by one level; weak controls raise it by one." },
          { p: "This assessment must be updated at least yearly, after significant changes, and before launching a new product, service, delivery channel or market (Art. 10)." },
        ],
      },
    ],
  };
}
