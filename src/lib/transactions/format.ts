/**
 * Transaction file format (CSV / XLSX) and row validation, shared by the import and by "Log transaction",
 * so both accept and reject exactly the same things. Pure: lookups (clients, cases, exchange rates,
 * duplicates) happen on the server.
 */

export const MAX_ROWS = 5000;
export const MAX_BYTES = 5 * 1024 * 1024;

/** The app's payment methods (as stored on Transaction.method). */
export const METHODS = ["cash", "bank-transfer", "card", "crypto", "other"] as const;
export type Method = (typeof METHODS)[number];
const METHOD_ALIASES: Record<string, Method> = {
  cash: "cash", grynieji: "cash", "grynieji pinigai": "cash", grynais: "cash",
  "bank-transfer": "bank-transfer", "bank transfer": "bank-transfer", transfer: "bank-transfer", banktransfer: "bank-transfer", pavedimas: "bank-transfer", "banko pavedimas": "bank-transfer",
  card: "card", kortelė: "card", kortele: "card", "mokėjimo kortelė": "card",
  crypto: "crypto", "crypto-assets": "crypto", kriptovaliuta: "crypto",
  other: "other", kita: "other",
};

export interface Column { name: string; required: "yes" | "no" | "if not EUR"; format: string; example: string; en: string; lt: string }
export const COLUMNS: Column[] = [
  { name: "date", required: "yes", format: "YYYY-MM-DD", example: "2026-11-20", en: "Payment date.", lt: "Mokėjimo data (MMMM-MM-DD)." },
  { name: "client_code", required: "yes", format: "company code, or the client's ID in AMLSync", example: "306139764", en: "The client's company code, or the client ID shown on the client's page in AMLSync (8 characters).", lt: "Kliento įmonės kodas arba kliento ID, matomas kliento puslapyje AMLSync (8 simboliai)." },
  { name: "client_name", required: "no", format: "text", example: "UAB Pavyzdys", en: "Only to help you check the file; not used to find the client.", lt: "Tik jūsų patikrinimui; klientas pagal jį neieškomas." },
  { name: "matter_ref", required: "no", format: "case name in AMLSync", example: "Sale Gedimino 1", en: "The case (deal) the payment belongs to. Empty: recorded under the client's general case.", lt: "Byla (sandoris), kuriai priklauso mokėjimas. Tuščia: įrašoma į bendrą kliento bylą." },
  { name: "amount", required: "yes", format: "number, dot as decimal separator, no thousands separator", example: "12500.00", en: "Amount in the payment's currency.", lt: "Suma mokėjimo valiuta; dešimtainis skirtukas – taškas, be tūkstančių skirtuko." },
  { name: "currency", required: "yes", format: "ISO 4217, 3 letters", example: "EUR", en: "Currency code, e.g. EUR, USD.", lt: "Valiutos kodas, pvz., EUR, USD." },
  { name: "fx_rate", required: "if not EUR", format: "number, EUR per 1 unit", example: "0.92", en: "How many euros one unit of the currency is worth. Empty for USD: the ECB rate for that date is used if the app has it.", lt: "Kiek eurų vertas vienas valiutos vienetas. Jei USD ir tuščia – naudojamas tos dienos ECB kursas, jei jis yra programoje." },
  { name: "method", required: "yes", format: METHODS.join(" | "), example: "cash", en: `One of: ${METHODS.join(", ")}. Lithuanian words work too (grynieji, pavedimas, kortelė).`, lt: `Vienas iš: ${METHODS.join(", ")}. Tinka ir lietuviški žodžiai: grynieji (cash), pavedimas (bank-transfer), kortelė (card).` },
  { name: "direction", required: "no", format: "in | out", example: "in", en: "in = received, out = paid out.", lt: "in – gauta, out – išmokėta." },
  { name: "counterparty_name", required: "no", format: "text", example: "John Smith", en: "Who paid or was paid, if not the client.", lt: "Kas mokėjo ar kam mokėta, jei ne klientas." },
  { name: "from_country", required: "no", format: "ISO 3166-1 alpha-2", example: "LT", en: "Country the money came from (2 letters).", lt: "Šalis, iš kurios gauti pinigai (2 raidės)." },
  { name: "third_party_payer", required: "no", format: "yes | no", example: "no", en: "Paid by someone other than the client.", lt: "Ar mokėjo ne klientas, o kitas asmuo (taip / ne)." },
  { name: "occasional", required: "yes", format: "yes | no", example: "yes", en: "An occasional transaction (no ongoing business relationship).", lt: "Ar tai atsitiktinis sandoris (be nuolatinių dalykinių santykių) (taip / ne)." },
  { name: "description", required: "no", format: "text, max 500 characters", example: "Deposit for apartment", en: "What the payment is for.", lt: "Mokėjimo paskirtis (iki 500 simbolių)." },
  { name: "external_id", required: "no", format: "your own reference", example: "INV-2026-114", en: "Your invoice number or bank reference. Used to skip duplicates.", lt: "Jūsų sąskaitos numeris ar banko nuoroda. Pagal ją praleidžiami pasikartojantys įrašai." },
];
export const HEADERS = COLUMNS.map((c) => c.name);

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const CSV_TEMPLATE = [HEADERS.join(","), COLUMNS.map((c) => csvCell(c.example)).join(",")].join("\n") + "\n";

export interface ParsedRow {
  date: string;
  clientCode: string;
  clientName: string;
  matterRef: string;
  originalAmount: number;
  currency: string;
  fxRate: number | null; // EUR per unit; null when EUR or to be taken from the ECB
  method: Method;
  direction: "in" | "out" | null;
  counterpartyName: string | null;
  fromCountry: string | null;
  thirdPartyPayer: boolean;
  occasional: boolean;
  description: string | null;
  externalId: string | null;
}

const YES = /^(yes|y|true|1|taip|t)$/i, NO = /^(no|n|false|0|ne)$/i;
function yesNo(v: string, field: string, required: boolean): boolean | string {
  if (!v.trim()) return required ? `${field} is required (yes or no).` : false;
  if (YES.test(v.trim())) return true;
  if (NO.test(v.trim())) return false;
  return `${field} must be yes or no (also accepted: true/false, 1/0, taip/ne).`;
}
function isRealDate(s: string): boolean {
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Validates one row of the file (or of the manual form) against the format above. */
export function validateRow(raw: Record<string, string>): { ok: true; row: ParsedRow } | { ok: false; error: string } {
  const g = (k: string) => String(raw[k] ?? "").trim();
  const errors: string[] = [];
  const date = g("date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isRealDate(date)) errors.push(`date "${date || "(empty)"}" is not a date in the format YYYY-MM-DD`);
  const clientCode = g("client_code");
  if (!clientCode) errors.push("client_code is required");
  const amountText = g("amount");
  const amount = /^\d+(\.\d{1,2})?$/.test(amountText) ? Number(amountText) : NaN;
  if (!(amount > 0)) errors.push(`amount "${amountText || "(empty)"}" must be a number above 0, with a dot for decimals and no thousands separator`);
  const currency = g("currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) errors.push(`currency "${g("currency") || "(empty)"}" must be a 3-letter code like EUR`);
  const fxText = g("fx_rate").replace(",", ".");
  const fx = fxText ? Number(fxText) : null;
  if (fx !== null && !(fx > 0)) errors.push(`fx_rate "${fxText}" must be a number above 0 (euros per 1 ${currency || "unit"})`);
  const method = METHOD_ALIASES[g("method").toLowerCase()];
  if (!method) errors.push(`method "${g("method") || "(empty)"}" must be one of ${METHODS.join(", ")}`);
  const dir = g("direction").toLowerCase();
  if (dir && dir !== "in" && dir !== "out") errors.push(`direction "${g("direction")}" must be in or out`);
  const fromCountry = g("from_country").toUpperCase();
  if (fromCountry && !/^[A-Z]{2}$/.test(fromCountry)) errors.push(`from_country "${g("from_country")}" must be a 2-letter country code like LT`);
  const third = yesNo(g("third_party_payer"), "third_party_payer", false);
  if (typeof third === "string") errors.push(third);
  const occasional = yesNo(g("occasional"), "occasional", true);
  if (typeof occasional === "string") errors.push(occasional);
  const description = g("description");
  if (description.length > 500) errors.push("description is longer than 500 characters");
  if (errors.length) return { ok: false, error: errors.join("; ") };
  return {
    ok: true,
    row: {
      date, clientCode, clientName: g("client_name").slice(0, 200), matterRef: g("matter_ref").slice(0, 300),
      originalAmount: amount, currency, fxRate: currency === "EUR" ? null : fx, method: method!,
      direction: (dir || null) as "in" | "out" | null, counterpartyName: g("counterparty_name").slice(0, 200) || null,
      fromCountry: fromCountry || null, thirdPartyPayer: third as boolean, occasional: occasional as boolean,
      description: description || null, externalId: g("external_id").slice(0, 100) || null,
    },
  };
}

/** Turns a table (first row = headers) into keyed rows. Header names are matched case-insensitively. */
export function tableToRows(table: string[][]): { rows: { line: number; raw: Record<string, string> }[] } | { error: string } {
  const body = table.filter((r) => r.some((c) => String(c ?? "").trim()));
  if (body.length < 2) return { error: "The file has no rows below the header row." };
  const head = body[0].map((h) => String(h ?? "").trim().toLowerCase().replace(/^﻿/, ""));
  const missing = COLUMNS.filter((c) => c.required === "yes" && !head.includes(c.name)).map((c) => c.name);
  if (missing.length) return { error: `Missing column(s): ${missing.join(", ")}. Download the template and keep its header row.` };
  if (body.length - 1 > MAX_ROWS) return { error: `The file has ${body.length - 1} rows. The limit is ${MAX_ROWS.toLocaleString("en")} rows per file: split it into smaller files.` };
  return {
    rows: body.slice(1).map((r, i) => ({
      line: i + 2,
      raw: Object.fromEntries(head.map((h, k) => [h, String(r[k] ?? "").trim()]).filter(([h]) => HEADERS.includes(h))),
    })),
  };
}

/** EUR amount: the amount itself for EUR, else amount × fx_rate (EUR per unit). */
export function toEur(amount: number, fxEurPerUnit: number): number {
  return Math.round(amount * fxEurPerUnit * 100) / 100;
}
