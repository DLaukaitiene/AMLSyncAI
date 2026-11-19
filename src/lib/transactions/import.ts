import { parseCsv } from "@/lib/screening/csv";

/**
 * Transaction import from a spreadsheet (CSV from accounting software or a bank
 * export). Header names are matched loosely; each row is validated on its own so
 * one bad row doesn't stop the rest.
 */
export interface ImportRow { line: number; date: string; amountEUR: number; method: string; client: string; matter: string; description: string; fromCountry: string; thirdParty: boolean }
export interface ImportError { line: number; error: string }

const COLS: Record<keyof Omit<ImportRow, "line">, string[]> = {
  date: ["date", "data", "payment date", "value date"],
  amountEUR: ["amount", "amount eur", "amount (eur)", "suma", "eur"],
  method: ["method", "payment method", "type", "būdas"],
  client: ["client", "customer", "payer", "klientas", "mokėtojas"],
  matter: ["matter", "file", "engagement", "reference", "byla"],
  description: ["description", "details", "aprašymas", "paskirtis"],
  fromCountry: ["from country", "country", "šalis"],
  thirdParty: ["third party", "third-party payer", "paid by third party"],
};
const METHODS: Record<string, string> = { cash: "cash", grynieji: "cash", "bank transfer": "bank-transfer", "bank-transfer": "bank-transfer", transfer: "bank-transfer", pavedimas: "bank-transfer", card: "card", kortelė: "card", crypto: "crypto", "crypto-assets": "crypto" };

function toIsoDate(v: string): string | null {
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/); // DD.MM.YYYY or DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}
function toAmount(v: string): number | null {
  let t = v.replace(/[€\s]/g, "").replace(/eur/i, "");
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", "."); // 1.234,56
  else t = t.replace(/,/g, ""); // 1,234.56
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function parseTransactionCsv(text: string, maxRows = 500): { rows: ImportRow[]; errors: ImportError[] } {
  const delimiter = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const table = parseCsv(text.replace(/^﻿/, ""), delimiter).filter((r) => r.some((c) => c.trim()));
  if (table.length < 2) return { rows: [], errors: [{ line: 1, error: "The file has no rows below the header." }] };
  const head = table[0].map((h) => h.trim().toLowerCase());
  const idx = Object.fromEntries(Object.entries(COLS).map(([k, names]) => [k, head.findIndex((h) => names.includes(h))])) as Record<keyof typeof COLS, number>;
  const missing = (["date", "amountEUR", "client", "matter"] as const).filter((k) => idx[k] < 0);
  if (missing.length) return { rows: [], errors: [{ line: 1, error: `Missing column(s): ${missing.map((k) => COLS[k][0]).join(", ")}. Download the template.` }] };
  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];
  const get = (r: string[], k: keyof typeof COLS) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "");
  for (const [i, r] of table.slice(1, maxRows + 1).entries()) {
    const line = i + 2;
    const date = toIsoDate(get(r, "date"));
    const amount = toAmount(get(r, "amountEUR"));
    const methodRaw = get(r, "method").toLowerCase();
    const method = methodRaw ? METHODS[methodRaw] ?? `other: ${methodRaw.slice(0, 60)}` : "bank-transfer";
    if (!date) { errors.push({ line, error: "Date not recognised (use YYYY-MM-DD or DD.MM.YYYY)." }); continue; }
    if (amount === null) { errors.push({ line, error: "Amount must be a number above 0." }); continue; }
    if (!get(r, "client") || !get(r, "matter")) { errors.push({ line, error: "Client and matter are required." }); continue; }
    rows.push({ line, date, amountEUR: amount, method, client: get(r, "client"), matter: get(r, "matter"), description: get(r, "description"), fromCountry: get(r, "fromCountry"), thirdParty: /^(yes|y|true|1|taip)$/i.test(get(r, "thirdParty")) });
  }
  if (table.length - 1 > maxRows) errors.push({ line: maxRows + 2, error: `Only the first ${maxRows} rows are imported at a time.` });
  return { rows, errors };
}

export const TRANSACTION_TEMPLATE = "date,amount,method,client,matter,description,from country,third party\n2026-11-03,4500,cash,Jonas Jonaitis,Sale of Vilniaus g. 1,Reservation fee,LT,no\n";
