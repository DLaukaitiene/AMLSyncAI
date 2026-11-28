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
  hint?: string;
  article: string;
  action: string; // what to do if not fully in place
}

export const RISK_QUESTIONS: RiskQuestion[] = [
  { id: "c-structures", group: "Customers", threats: ["ML", "SE"], annex: "Annex I(1), III(1)", text: "How many of your clients are companies owned through other companies, trusts or foundations?", hint: "Sometimes a company is owned by another company, which is owned by yet another, or by a trust or foundation, often in another country. That makes it harder to see who really owns and controls the client. If most of your clients are people or simple local companies, answer None or Fewer than 10%.", options: ["None", "Fewer than 10%", "10–30%", "More than 30%"] },
  { id: "c-pep", group: "Customers", threats: ["ML"], annex: "Annex III(1)", text: "To your best knowledge, do you have clients who are politically exposed persons, their family or close associates?", hint: "A politically exposed person (PEP) holds, or held in the last 12 months, an important public job: for example a minister, member of parliament, judge of a high court, ambassador, senior military officer or head of a state-owned company. Their spouse or partner, children, parents and close business associates count too. The app checks every client against PEP lists, so a best guess is fine here.", options: ["None", "One or two", "Several", "Many"] },
  { id: "c-nonresident", group: "Customers", threats: ["ML", "SE"], annex: "Annex III(1)", text: "How many of your clients live or are registered outside the EU?", hint: "Count people who live outside the EU and companies registered outside the EU. A rough estimate is enough.", options: ["None", "Fewer than 10%", "10–30%", "More than 30%"] },
  { id: "c-cashbusiness", group: "Customers", threats: ["ML"], annex: "Annex III(1)", text: "Do you have clients whose business takes a lot of cash?", hint: "For example restaurants, bars, car washes, shops, beauty salons or market traders. Cash is harder to trace, so these businesses are used more often to hide money.", options: ["None", "A few", "Some", "Many"] },
  { id: "c-npo", group: "Customers", threats: ["TF"], annex: "Annex III(1)", text: "Do you have clients that are charities or non-profit organisations sending money abroad?", hint: "For example associations, foundations or religious organisations that send donations or aid to other countries. Money sent this way can be misused to fund terrorism.", options: ["None", "A few", "Some", "Many"] },
  { id: "p-clientmoney", group: "Products, services and transactions", threats: ["ML"], annex: "Annex III(2)", text: "Does money or property of your clients pass through your hands?", hint: "For example you receive client money into your account, hold a deposit, pay bills or transfer funds on a client's behalf, or keep valuables for them.", options: ["Never", "Occasionally", "Regularly", "It's our core business"] },
  { id: "p-size", group: "Products, services and transactions", threats: ["ML"], annex: "Annex II(2), III(2)", text: "How large is a typical deal or payment you handle for a client?", hint: "Think of the value of the transaction you help with (for example the price of a property or a company), not your own fee.", options: ["Under €10,000", "€10,000–100,000", "€100,000–1 million", "Over €1 million"] },
  { id: "p-cash", group: "Products, services and transactions", threats: ["ML", "TF"], annex: "Annex III(2)", text: "Do you accept cash from clients?", hint: "Cash payments for your fees or for the deal itself. Most countries cap cash payments by law; large cash amounts are a common warning sign.", options: ["No", "Small amounts only (under €3,000)", "Larger amounts, but within the legal limit", "Often, large amounts"] },
  { id: "p-corporate", group: "Products, services and transactions", threats: ["ML", "SE"], annex: "Annex III(2)", text: "Do you set up companies for clients, or act for them as a director, shareholder or trustee?", hint: "For example registering new companies, providing a registered address, or holding shares or a board seat on a client's behalf (a 'nominee'). These services can be used to hide who really owns a business.", options: ["No", "Rarely", "Sometimes", "Regularly"] },
  { id: "p-crypto", group: "Products, services and transactions", threats: ["ML", "TF", "SE"], annex: "Annex III(2)", text: "Do clients pay you, or ask you to handle payments, in crypto?", hint: "For example Bitcoin, Ether or stablecoins such as USDT. Crypto can move across borders quickly and anonymously.", options: ["No", "In exceptional cases", "Sometimes", "Regularly"] },
  { id: "p-goods", group: "Products, services and transactions", threats: ["SE"], annex: "EU Reg. 833/2014", text: "Do you sell goods that could end up in Russia, Belarus or other sanctioned countries?", hint: "For example luxury goods, cars and spare parts, electronics, machinery or 'dual-use' items, meaning goods that could also be used by the military. Answer No if you only sell services.", options: ["No", "Rarely", "Sometimes", "Regularly"] },
  { id: "d-remote", group: "Delivery channels", threats: ["ML"], annex: "Annex III(4)", text: "How many of your clients do you never meet in person?", hint: "Clients you only deal with by email, phone, video call or an online form. Meeting someone face to face, with their ID, makes it harder for them to pretend to be someone else.", options: ["None", "Under 25%", "25–75%", "Over 75%"] },
  { id: "d-intermediaries", group: "Delivery channels", threats: ["ML"], annex: "Annex III(4)", text: "Do clients come to you through someone else who deals with them for you?", hint: "For example agents, brokers, introducers or partner firms that bring you clients and pass on their documents, so you rely on someone else's checks.", options: ["No", "A few", "Some", "Most"] },
  { id: "g-crossborder", group: "Geography", threats: ["ML", "SE"], annex: "Annex III(3)", text: "How much of your work involves other countries?", hint: "Clients, payments, property or companies in another country. A rough estimate of the share of your work is enough.", options: ["Under 10%", "10–30%", "30–60%", "Over 60%"] },
  { id: "g-highrisk", group: "Geography", threats: ["ML", "TF"], annex: "Annex III(3)", text: "Do you deal with countries known for weak anti-money-laundering rules or with war zones?", hint: "The EU keeps a list of high-risk countries, for example Iran, North Korea, Myanmar and several others, and some areas are affected by war or conflict. 'Indirect' means through a client's business partners or payments rather than the client itself.", options: ["None", "Occasional, indirect", "Occasional, direct", "Regular"] },
  { id: "g-ru-by", group: "Geography", threats: ["SE"], annex: "EU Reg. 269/2014, 833/2014, 765/2006", text: "Are any of your clients, their owners, suppliers or business partners linked to Russia or Belarus?", hint: "For example a Russian or Belarusian owner, a supplier or buyer there, or goods or payments going to or coming from those countries. Strict EU sanctions apply to both.", options: ["None", "A few, indirect", "Some", "Many"] },
];

export const CONTROL_QUESTIONS: ControlQuestion[] = [
  { id: "k-policies", text: "Do you have a written AML Program (your policy and procedures), approved by management and up to date?", hint: "The rules you follow to prevent money laundering. The app writes it for you from your answers, on the AML Program page.", article: "Art. 9", action: "Generate and approve your AML Program." },
  { id: "k-training", text: "Has everyone who works with clients had anti-money-laundering training in the last 12 months?", hint: "Short training on spotting suspicious clients and payments. The app has built-in courses under My Training.", article: "Art. 12", action: "Assign AML training to every staff member and record completion." },
  { id: "k-cdd", text: "Do you check every client, and who really owns and controls them, before you start working for them?", hint: "'Checking' means confirming their identity with an ID or register extract and finding the real owners (beneficial owners). The app won't let you accept a client until the checks are done.", article: "Art. 20–23", action: "Use the hard gates: don't accept clients while CDD items are open." },
  { id: "k-screening", text: "Do you check clients and their owners against sanctions lists?", hint: "Sanctions lists name people and companies you must not do business with. The app checks every client and owner automatically, and again every day.", article: "Art. 20(1)(d), 26(4)", action: "Screen every client and owner; load your national sanctions list." },
  { id: "k-monitoring", text: "Do you keep an eye on clients over time and update their checks when due?", hint: "For example noticing unusual payments and refreshing a client's information every few years, or every year for high-risk clients. The app reminds you.", article: "Art. 26", action: "Clear overdue refreshes in the Compliance Calendar." },
  { id: "k-reporting", text: "Do your staff know how to report something suspicious inside the firm, and are those reports looked at?", hint: "If someone has doubts about a client or a payment, they tell the Compliance Officer, who decides whether to report it to the authorities. The app has a button for this on every client and payment.", article: "Art. 69", action: "Brief staff on internal reporting; record every assessment." },
  { id: "k-records", text: "Do you keep client records for 5 years and delete them afterwards?", hint: "The law requires you to keep records of your checks for 5 years after the work ends, then delete them. The app does this automatically.", article: "Art. 77", action: "Use Records to keep and delete files on time." },
  { id: "k-review", text: "Has someone independent reviewed your anti-money-laundering set-up in the last 2 years?", hint: "An outside expert, or a colleague not involved in compliance, checks that your rules work in practice. Small firms often skip this; answer honestly.", article: "Art. 9", action: "Arrange an independent review (e.g. AMLSync Expert)." },
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
