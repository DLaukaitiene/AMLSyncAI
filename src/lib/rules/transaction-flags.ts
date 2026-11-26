import { EU_HIGH_RISK_THIRD_COUNTRIES } from "./high-risk-countries";

/**
 * Transaction monitoring red flags (AMLR Art. 26 ongoing monitoring; Art. 19
 * linked transactions and cash; Annex III risk factors). Rule-based and
 * explainable: each flag says why. Flags only ask for a human review — they
 * are never a suspicion on their own.
 */
export interface TxForFlags {
  id: string;
  date: string; // YYYY-MM-DD
  amountEUR: number;
  method: string; // cash | bank-transfer | card | crypto | other…
  thirdPartyPayer?: boolean;
  fromCountry?: string | null;
}
export interface FlagContext {
  cashThresholdEUR: number; // firm setting, default €3,000 (Art. 19(4) cash identification)
  highValueThresholdEUR: number; // firm setting, default €50,000
  clientHighRisk?: boolean;
  clientIsPep?: boolean;
  history: TxForFlags[]; // the same client's other transactions
}
export interface Flag { code: string; text: string }

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;
const eur = (n: number) => `€${Math.round(n).toLocaleString("en-IE")}`;

export function flagTransaction(t: TxForFlags, c: FlagContext): Flag[] {
  const f: Flag[] = [];
  const cash = t.method === "cash";
  if (cash && t.amountEUR >= c.cashThresholdEUR) f.push({ code: "cash", text: `Cash payment of ${eur(t.amountEUR)} (at or above your ${eur(c.cashThresholdEUR)} cash threshold)` });
  if (cash && t.amountEUR < c.cashThresholdEUR) {
    const day = c.history.filter((h) => h.id !== t.id && h.method === "cash" && days(h.date, t.date) < 1).reduce((s, h) => s + h.amountEUR, 0) + t.amountEUR;
    if (day >= c.cashThresholdEUR) f.push({ code: "cash-24h", text: `Cash totalling ${eur(day)} from this client within 24 hours (possible splitting)` });
  }
  if (t.amountEUR >= c.highValueThresholdEUR) f.push({ code: "high-value", text: `High-value payment: ${eur(t.amountEUR)} (threshold ${eur(c.highValueThresholdEUR)})` });
  const justBelow = (x: TxForFlags) => x.amountEUR >= 9_000 && x.amountEUR < 10_000;
  if (justBelow(t)) {
    const near = c.history.filter((h) => h.id !== t.id && justBelow(h) && days(h.date, t.date) <= 30).length;
    if (near >= 1) f.push({ code: "structuring", text: `${near + 1} payments just below €10,000 within 30 days (possible structuring around the CDD threshold)` });
  }
  if (t.method === "crypto") f.push({ code: "crypto", text: "Paid in crypto-assets: check the source of funds" });
  if (t.thirdPartyPayer) f.push({ code: "third-party", text: "Paid by someone other than the client: check who the payer is and why" });
  const cc = t.fromCountry?.toUpperCase();
  if (cc && EU_HIGH_RISK_THIRD_COUNTRIES.has(cc)) f.push({ code: "high-risk-country", text: `Funds from ${cc}, on the EU list of high-risk third countries (enhanced due diligence)` });
  if ((c.clientHighRisk || c.clientIsPep) && t.amountEUR >= 10_000) f.push({ code: "high-risk-client", text: `${eur(t.amountEUR)} from a ${c.clientIsPep ? "PEP" : "high-risk"} client: check it matches the source of funds on file` });
  return f;
}

export const DEFAULT_CASH_THRESHOLD_EUR = 3_000;
export const DEFAULT_HIGH_VALUE_THRESHOLD_EUR = 50_000;
