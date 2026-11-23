/**
 * Transaction monitoring rules R1–R13 (AMLR Art. 26 ongoing monitoring; Art. 19 cash and linked transactions;
 * Art. 80 cash limit; Annex III risk factors). Each rule is a small pure function of the transaction, the firm's
 * settings and the client's other transactions, and explains itself. A flag asks for a human review; it is never
 * a suspicion on its own, and is never closed automatically.
 *
 * R1–R10 follow the specification of 23 Nov 2026. R11–R13 are the app's earlier checks that the specification
 * doesn't cover (crypto-assets, PEP / high-risk clients, payments just below €10,000); they can be switched off too.
 */

export type Severity = "low" | "medium" | "high";
export interface MonitoringFlag { rule: RuleId; severity: Severity; message: string; createdAt: string }

export interface RuleTx {
  id: string;
  date: string; // YYYY-MM-DD
  amountEUR: number;
  method: string; // cash | bank-transfer | card | crypto | other…
  occasional: boolean;
  thirdPartyPayer: boolean;
  fromCountry: string | null;
}

export interface RuleSettings {
  cashThresholdEUR: number; // R1 (default €3,000)
  cashLegalLimitEUR: number; // R2, R3 (default €5,000)
  highValueThresholdEUR: number; // R4 (default €50,000)
  occasionalThresholdEUR: number; // R5 (€10,000)
  rulesOff: string[];
}

export interface RuleContext {
  settings: RuleSettings;
  highRiskCountries: ReadonlySet<string>; // R7: EU list (table) + the firm's own list
  kycComplete: boolean; // R9: the client's due diligence was complete on the transaction date
  clientHighRisk: boolean;
  clientIsPep: boolean;
  history: RuleTx[]; // the same client's other transactions (any date; rules pick their windows)
}

export const RULES = {
  R1: { label: "Cash: identify and verify the customer", severity: "medium" },
  R2: { label: "Cash above the legal limit", severity: "high" },
  R3: { label: "Linked cash payments above the legal limit (30 days)", severity: "high" },
  R4: { label: "High-value transaction", severity: "medium" },
  R5: { label: "Occasional transaction of €10,000 or more (incl. linked, 30 days)", severity: "medium" },
  R6: { label: "Third-party payer", severity: "medium" },
  R7: { label: "Funds from a high-risk country", severity: "high" },
  R8: { label: "Unusual for the client (over 3× their 12-month average)", severity: "low" },
  R9: { label: "Client's due diligence not complete", severity: "high" },
  R10: { label: "Repeated round cash amounts (90 days)", severity: "low" },
  R11: { label: "Paid in crypto-assets", severity: "medium" },
  R12: { label: "€10,000 or more from a PEP or high-risk client", severity: "medium" },
  R13: { label: "Payments just below a threshold within 30 days (€9,000–9,999; €14,000–14,999; cash €4,500–4,999)", severity: "medium" },
} as const satisfies Record<string, { label: string; severity: Severity }>;
export type RuleId = keyof typeof RULES;
export const RULE_IDS = Object.keys(RULES) as RuleId[];

const DAY = 86_400_000;
const eur = (n: number) => `€${n.toLocaleString("en-IE", { maximumFractionDigits: 2 })}`;
const ago = (t: RuleTx, h: RuleTx) => (Date.parse(t.date) - Date.parse(h.date)) / DAY; // days h is before t (negative = after)
const within = (t: RuleTx, days: number) => (h: RuleTx) => h.id !== t.id && ago(t, h) >= 0 && ago(t, h) < days;
const isCash = (x: RuleTx) => x.method === "cash";

type Check = (t: RuleTx, c: RuleContext) => string | null;

const CHECKS: Record<RuleId, Check> = {
  R1: (t, c) => (isCash(t) && t.amountEUR >= c.settings.cashThresholdEUR ? `Cash of ${eur(t.amountEUR)}: identify and verify the customer.` : null),
  R2: (t, c) => (isCash(t) && t.amountEUR > c.settings.cashLegalLimitEUR ? `Cash payment above the legal limit of ${eur(c.settings.cashLegalLimitEUR)}.` : null),
  R3: (t, c) => {
    const lim = c.settings.cashLegalLimitEUR;
    if (!isCash(t) || t.amountEUR > lim) return null; // a single payment above the limit is R2
    const linked = c.history.filter(within(t, 30)).filter((h) => isCash(h) && h.amountEUR <= lim);
    const total = linked.reduce((s, h) => s + h.amountEUR, t.amountEUR);
    return linked.length && total > lim ? `Linked cash payments total ${eur(total)} in 30 days — possible splitting to avoid the limit.` : null;
  },
  R4: (t, c) => (t.amountEUR >= c.settings.highValueThresholdEUR ? "High-value transaction: check source of funds." : null),
  R5: (t, c) => {
    if (!t.occasional) return null;
    const total = c.history.filter(within(t, 30)).filter((h) => h.occasional).reduce((s, h) => s + h.amountEUR, t.amountEUR);
    return total >= c.settings.occasionalThresholdEUR ? `Occasional transaction of ${eur(c.settings.occasionalThresholdEUR)} or more${total > t.amountEUR ? ` (${eur(total)} with linked payments in 30 days)` : ""}: full CDD required.` : null;
  },
  R6: (t) => (t.thirdPartyPayer ? "Paid by someone other than the client: identify the payer and the reason." : null),
  R7: (t, c) => {
    const cc = t.fromCountry?.toUpperCase();
    return cc && c.highRiskCountries.has(cc) ? `Funds from a high-risk country (${cc}): apply enhanced due diligence.` : null;
  },
  R8: (t, c) => {
    const year = c.history.filter(within(t, 366));
    if (year.length < 3) return null;
    const avg = year.reduce((s, h) => s + h.amountEUR, 0) / year.length;
    return t.amountEUR > 3 * avg ? `Much larger than this client's usual transactions (average ${eur(Math.round(avg))} over 12 months).` : null;
  },
  R9: (_t, c) => (c.kycComplete ? null : "Transaction for a client whose KYC isn't complete."),
  R10: (t, c) => {
    const round = (x: RuleTx) => isCash(x) && x.amountEUR >= 1000 && x.amountEUR % 1000 === 0;
    if (!round(t)) return null;
    return c.history.filter(within(t, 90)).filter(round).length + 1 >= 3 ? "Repeated round cash amounts." : null;
  },
  R11: (t) => (t.method === "crypto" ? "Paid in crypto-assets: check the source of funds." : null),
  R12: (t, c) => ((c.clientHighRisk || c.clientIsPep) && t.amountEUR >= 10_000 ? `${eur(t.amountEUR)} from a ${c.clientIsPep ? "PEP" : "high-risk"} client: check it matches the source of funds on file.` : null),
  R13: (t, c) => {
    // Bands just below the AMLR €10,000 CDD line, the Lithuanian €15,000 CDD/report line, and (cash) the €5,000 cash limit.
    const bands: { from: number; to: number; cash: boolean; label: string }[] = [
      { from: 9_000, to: 10_000, cash: false, label: "just below €10,000 (the CDD threshold)" },
      { from: 14_000, to: 15_000, cash: false, label: "just below €15,000 (the national CDD and cash report threshold)" },
      { from: 4_500, to: 5_000, cash: true, label: "in cash just below €5,000 (the legal cash limit)" },
    ];
    for (const b of bands) {
      const inBand = (x: RuleTx) => x.amountEUR >= b.from && x.amountEUR < b.to && (!b.cash || isCash(x));
      if (!inBand(t)) continue;
      const n = c.history.filter((h) => h.id !== t.id && inBand(h) && Math.abs(ago(t, h)) <= 30).length;
      if (n) return `${n + 1} payments ${b.label} within 30 days (possible structuring).`;
    }
    return null;
  },
};

export function runRules(t: RuleTx, c: RuleContext, now = new Date()): MonitoringFlag[] {
  const off = new Set(c.settings.rulesOff);
  const out: MonitoringFlag[] = [];
  for (const id of RULE_IDS) {
    if (off.has(id)) continue;
    const message = CHECKS[id](t, c);
    if (message) out.push({ rule: id, severity: RULES[id].severity, message, createdAt: now.toISOString() });
  }
  return out;
}

/** high → flagged; medium/low → pending (with flags, needs review); none → clear. Reviewed statuses are never set here. */
export function statusFor(flags: MonitoringFlag[]): "flagged" | "pending" | "clear" {
  return flags.some((f) => f.severity === "high") ? "flagged" : flags.length ? "pending" : "clear";
}

/** Flags stored before the rules existed ({code, text}) shown the same way. */
export function normalizeFlags(raw: unknown): MonitoringFlag[] {
  return ((Array.isArray(raw) ? raw : []) as Record<string, string>[]).map((f) =>
    f.rule ? (f as unknown as MonitoringFlag) : { rule: (f.code ?? "R?") as RuleId, severity: "medium" as Severity, message: f.text ?? "", createdAt: "" },
  );
}

/** Transactions that still need a person's review: high flags, and medium/low flags not yet reviewed. */
export const NEEDS_REVIEW_WHERE = { OR: [{ monitorStatus: "flagged" }, { monitorStatus: "pending", NOT: { flags: { equals: [] } } }] };
