/**
 * Monthly invoicing (postpaid). Pure functions: VAT treatment, invoice lines,
 * numbering. The seller is AMLSync App's operating company.
 */

export const SELLER = {
  name: "Integral Services, MB",
  companyCode: "306139764",
  vatId: "LT100017008718",
  address: "Polocko g. 2-29, LT-01204 Vilnius",
  country: "LT",
  iban: "LT29 3250 0850 3229 4553",
  bic: "REVOLT21",
  bank: "Revolut Bank UAB",
} as const;

/** Lithuanian standard VAT rate, in basis points. */
export const LT_VAT_BP = 2100;
export const PAYMENT_TERMS_DAYS = 14;
/** Paid checks pause when an invoice is this many days past its due date. */
export const OVERDUE_PAUSE_DAYS = 14;

const EU = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]);

export interface Customer {
  name: string;
  address: string | null;
  country: string; // ISO 3166-1 alpha-2
  vatId: string | null;
  companyCode?: string | null;
}

/**
 * VAT for a B2B service sold from Lithuania [verify with the accountant]:
 * - customer in Lithuania: 21 % Lithuanian VAT;
 * - customer in another EU state with a VAT number: no VAT, reverse charge (VAT Directive Art. 44 and 196);
 * - customer in another EU state without a VAT number: 21 % Lithuanian VAT (treated as not proven to be a taxable person).
 */
export function vatTreatment(c: Customer): { rateBp: number; note: string | null } {
  const country = c.country.toUpperCase();
  const vat = (c.vatId ?? "").replace(/\s/g, "").toUpperCase();
  if (country !== SELLER.country && EU.has(country) && /^[A-Z]{2}[0-9A-Z]{2,13}$/.test(vat) && !vat.startsWith("LT")) {
    return { rateBp: 0, note: "Reverse charge: VAT to be accounted for by the customer (Council Directive 2006/112/EC, Art. 44 and 196)." };
  }
  return { rateBp: LT_VAT_BP, note: null };
}

export interface LedgerEntry {
  id: string;
  amountCents: number; // negative = charge (what the customer owes), positive = refund / credit
  kind: string; // charge | refund | trial | topup | carry
  description: string;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitCents: number;
  netCents: number;
}

export interface InvoiceDraft {
  lines: InvoiceLine[];
  netCents: number;
  vatCents: number;
  totalCents: number;
  rateBp: number;
  vatNote: string | null;
  /** Credit not used on this invoice; carried to the next one. Callers skip invoicing when netBeforeCredit <= 0. */
  netBeforeCreditCents: number;
  /** Credit not used on this invoice; carried to the next one. */
  carryCents: number;
}

/**
 * Builds the invoice from the monthly plan fee and the not-yet-invoiced ledger.
 * Charges are grouped by description; refunds reduce the count of the same
 * item; prepaid / welcome credit is applied last and never makes the invoice negative.
 */
export function buildInvoice(monthlyFeeCents: number, planName: string, entries: LedgerEntry[], customer: Customer): InvoiceDraft {
  const lines: InvoiceLine[] = [];
  if (monthlyFeeCents > 0) lines.push({ description: `AMLSync App subscription, ${planName} plan (monthly)`, quantity: 1, unitCents: monthlyFeeCents, netCents: monthlyFeeCents });

  const groups = new Map<string, { qty: number; unit: number }>();
  const key = (d: string) => d.replace(/^Refund: .*$/, "").trim();
  for (const e of entries.filter((x) => x.kind === "charge")) {
    const g = groups.get(e.description) ?? { qty: 0, unit: -e.amountCents };
    g.qty += 1;
    groups.set(e.description, g);
  }
  let refunds = 0;
  for (const e of entries.filter((x) => x.kind === "refund")) refunds += e.amountCents;
  for (const [desc, g] of groups) lines.push({ description: key(desc), quantity: g.qty, unitCents: g.unit, netCents: g.qty * g.unit });
  if (refunds > 0) lines.push({ description: "Refunds for checks that expired or failed", quantity: 1, unitCents: -refunds, netCents: -refunds });

  const before = lines.reduce((s, l) => s + l.netCents, 0);
  const credit = entries.filter((x) => ["trial", "topup", "carry"].includes(x.kind)).reduce((s, e) => s + e.amountCents, 0);
  const applied = Math.max(0, Math.min(credit, before));
  if (applied > 0) lines.push({ description: "Credit applied (welcome / prepaid credit)", quantity: 1, unitCents: -applied, netCents: -applied });
  const netCents = Math.max(0, before - applied);
  const { rateBp, note } = vatTreatment(customer);
  const vatCents = Math.round((netCents * rateBp) / 10000);
  return { lines, netBeforeCreditCents: before, netCents, vatCents, totalCents: netCents + vatCents, rateBp, vatNote: note, carryCents: Math.max(0, credit - applied) };
}

/** Continuous series, e.g. AMS-2026-00042. */
export function invoiceNumber(year: number, seq: number): string {
  return `AMS-${year}-${String(seq).padStart(5, "0")}`;
}

/** The calendar month before `today`: [first day, first day of next month). */
export function previousMonth(today: Date): { from: string; toExclusive: string; label: string } {
  const y = today.getUTCFullYear(), m = today.getUTCMonth(); // m = current month (0-based)
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(start), toExclusive: iso(end), label: start.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) };
}
