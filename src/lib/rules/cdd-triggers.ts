/**
 * CDD triggers, linked-transaction aggregation, cash cap and Art. 74
 * threshold reports (spec §3 rows 11, 31–32; §4.2; §11.4, §11.9, §11.10).
 */
import { EU_CORE } from "./eu-core";
import { addCalendarDays, type IsoDate } from "./dates";
import { cashIdentificationThresholdEUR, type CountryProfile } from "./country-profile";

export type Sector =
  | "accountant"
  | "estate-agent"
  | "hvg-trader"
  | "precious-metals"
  | "tcsp"
  | "legal"
  | "art-trader"
  | "gambling"
  | "crowdfunding"
  | "credit-intermediary"
  | "investment-migration"
  | "other";

export type PaymentMethod = "cash" | "bank-transfer" | "card" | "crypto" | "other";

export interface TransactionRecord {
  id: string;
  customerId: string;
  date: IsoDate;
  amountEUR: number;
  method: PaymentMethod;
  /** Occasional = outside a business relationship. */
  occasional: boolean;
}

export type CddTriggerReason =
  | "business-relationship"
  | "occasional-transaction"
  | "linked-transactions"
  | "cash-identification"
  | "company-formation-or-transfer"
  | "suspicion"
  | "doubts-about-data"
  | "gambling-stakes";

export interface CddTrigger {
  reason: CddTriggerReason;
  article: string;
  explanation: string;
  /** Transactions that together reached the threshold (if relevant). */
  transactionIds?: string[];
}

export interface CddTriggerContext {
  sector: Sector;
  profile: CountryProfile;
  /** All earlier transactions by the same customer (any order). */
  history: TransactionRecord[];
  newTransaction?: TransactionRecord;
  establishingRelationship?: boolean;
  companyFormationOrTransfer?: boolean;
  suspicion?: boolean;
  doubtsAboutData?: boolean;
}

function inWindow(t: TransactionRecord, ref: IsoDate, windowDays: number): boolean {
  return t.date <= ref && t.date > addCalendarDays(ref, -windowDays);
}

/** Returns every CDD trigger that fires. Empty array = no CDD required. */
export function evaluateCddTriggers(ctx: CddTriggerContext): CddTrigger[] {
  const out: CddTrigger[] = [];

  if (ctx.establishingRelationship) {
    out.push({ reason: "business-relationship", article: "Art. 19(1)(a)", explanation: "A business relationship is being established." });
  }
  if (ctx.suspicion) {
    out.push({ reason: "suspicion", article: "Art. 19(1)(d)", explanation: "There is a suspicion of money laundering or terrorist financing, regardless of amount." });
  }
  if (ctx.doubtsAboutData) {
    out.push({ reason: "doubts-about-data", article: "Art. 19(1)(e)", explanation: "There are doubts about the identification data already held." });
  }
  if (ctx.companyFormationOrTransfer && (ctx.sector === "tcsp" || ctx.sector === "legal")) {
    out.push({
      reason: "company-formation-or-transfer",
      article: "Art. 19(1)(c)",
      explanation: "Company formation or transfer of ownership of a legal entity requires CDD regardless of value.",
    });
  }

  const t = ctx.newTransaction;
  if (t) {
    const threshold = ctx.sector === "art-trader" ? EU_CORE.cdd.artEUR : EU_CORE.cdd.occasionalTransactionEUR;
    if (t.occasional && t.amountEUR >= threshold) {
      out.push({
        reason: "occasional-transaction",
        article: "Art. 19(1)(b)",
        explanation: `Occasional transaction of €${fmt(t.amountEUR)} reaches the €${fmt(threshold)} threshold.`,
        transactionIds: [t.id],
      });
    } else if (t.occasional) {
      const linked = ctx.history.filter(
        (h) => h.customerId === t.customerId && h.occasional && h.id !== t.id && inWindow(h, t.date, EU_CORE.cdd.linkedTransactionWindowDays),
      );
      const total = linked.reduce((s, h) => s + h.amountEUR, 0) + t.amountEUR;
      if (total >= threshold) {
        out.push({
          reason: "linked-transactions",
          article: "Art. 19(1)(b), RTS under Art. 19(9)",
          explanation: `${linked.length + 1} linked occasional transactions total €${fmt(total)}, reaching the €${fmt(threshold)} threshold.`,
          transactionIds: [...linked.map((h) => h.id), t.id],
        });
      }
    }

    const cashThreshold = cashIdentificationThresholdEUR(ctx.profile);
    if (
      cashThreshold !== null &&
      (ctx.sector === "hvg-trader" || ctx.sector === "precious-metals") &&
      t.method === "cash"
    ) {
      const linkedCash = ctx.history.filter(
        (h) => h.customerId === t.customerId && h.method === "cash" && h.id !== t.id && inWindow(h, t.date, EU_CORE.cdd.linkedTransactionWindowDays),
      );
      const total = linkedCash.reduce((s, h) => s + h.amountEUR, 0) + t.amountEUR;
      if (total >= cashThreshold) {
        out.push({
          reason: "cash-identification",
          article: "Art. 19(4)",
          explanation: `Cash payments of €${fmt(total)} reach the €${fmt(cashThreshold)} identification threshold.`,
          transactionIds: [...linkedCash.map((h) => h.id), t.id],
        });
      }
    }

    if (ctx.sector === "gambling" && t.amountEUR >= EU_CORE.cdd.gamblingEUR) {
      out.push({ reason: "gambling-stakes", article: "Art. 19(5)", explanation: `Stake or winnings of €${fmt(t.amountEUR)} reach €${fmt(EU_CORE.cdd.gamblingEUR)}.`, transactionIds: [t.id] });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Cash cap (Art. 80)
// ---------------------------------------------------------------------------

export interface CashCheck {
  blocked: boolean;
  capEUR: number;
  message?: string;
  nationalReportRequired: boolean;
}

/** Checks a cash payment against the firm's cap and national cash-report rules. */
export function checkCashPayment(amountEUR: number, profile: CountryProfile): CashCheck {
  const cap = Math.min(profile.cashCapEUR, EU_CORE.cash.capEUR);
  const blocked = amountEUR >= cap;
  const nationalReportRequired =
    profile.nationalCashReport.enabled &&
    profile.nationalCashReport.thresholdEUR !== undefined &&
    amountEUR >= profile.nationalCashReport.thresholdEUR;
  return {
    blocked,
    capEUR: cap,
    message: blocked
      ? `Cash payments of €${fmt(cap)} or more are not allowed (AMLR Art. 80${cap < EU_CORE.cash.capEUR ? " and your Country Profile" : ""}). Ask for a bank transfer.`
      : undefined,
    nationalReportRequired,
  };
}

// ---------------------------------------------------------------------------
// Art. 74 threshold reports
// ---------------------------------------------------------------------------

export type GoodsCategory = "motor-vehicle" | "aircraft" | "watercraft" | "jewellery-watches" | "precious-metals-stones" | "art" | "other";

export function thresholdReportRequired(category: GoodsCategory, priceEUR: number): { required: boolean; explanation?: string } {
  if (category === "motor-vehicle" && priceEUR >= EU_CORE.reporting.motorVehicleEUR) {
    return { required: true, explanation: `Motor vehicle sale of €${fmt(priceEUR)} ≥ €${fmt(EU_CORE.reporting.motorVehicleEUR)}: report to the FIU (AMLR Art. 74).` };
  }
  if ((category === "aircraft" || category === "watercraft") && priceEUR >= EU_CORE.reporting.aircraftWatercraftEUR) {
    return { required: true, explanation: `${category === "aircraft" ? "Aircraft" : "Watercraft"} sale of €${fmt(priceEUR)} ≥ €${fmt(EU_CORE.reporting.aircraftWatercraftEUR)}: report to the FIU (AMLR Art. 74).` };
  }
  return { required: false };
}

function fmt(n: number): string {
  return n.toLocaleString("en", { maximumFractionDigits: 2 });
}
