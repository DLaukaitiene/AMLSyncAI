/**
 * Back-book remediation (spec §3 row 26, §4.2, §11.4): import existing
 * clients, score each file against the new CDD data set, prioritise.
 *
 * CSV columns (header row; comma or semicolon):
 *   type, name, first_names, last_name, birth_date, nationalities, residence_country,
 *   address, registration_number, country, email, purpose, last_cdd_date, pep, documents
 * type = person | company. nationalities and documents are "|"-separated;
 * documents may contain: id, address, extract, bo, sof.
 */
import { parseCsv } from "@/lib/screening/csv";

export interface BackBookRow {
  line: number;
  kind: "NATURAL" | "LEGAL";
  name: string;
  firstNames?: string;
  lastName?: string;
  birthDate?: string;
  nationalities: string[];
  residenceCountry?: string;
  address?: string;
  registrationNumber?: string;
  countryOfCreation?: string;
  email?: string;
  purpose?: string;
  lastCddDate?: string;
  isPep: boolean;
  documents: string[];
}

export interface RowError {
  line: number;
  message: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO2 = /^[A-Z]{2}$/;
const KNOWN_DOCS = ["id", "address", "extract", "bo", "sof"];

export function parseBackBook(text: string, maxRows = 50_000): { rows: BackBookRow[]; errors: RowError[] } {
  const all = parseCsv(text);
  if (all.length < 2) return { rows: [], errors: [{ line: 1, message: "The file has no client rows." }] };
  const head = all[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (r: string[], n: string) => {
    const i = head.indexOf(n);
    return i >= 0 ? (r[i] ?? "").trim() : "";
  };
  if (head.indexOf("type") < 0) return { rows: [], errors: [{ line: 1, message: 'Missing column "type".' }] };
  if (all.length - 1 > maxRows) return { rows: [], errors: [{ line: 1, message: `Too many rows (max ${maxRows}).` }] };

  const rows: BackBookRow[] = [];
  const errors: RowError[] = [];
  all.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const type = col(r, "type").toLowerCase();
    const kind = type === "person" ? "NATURAL" : type === "company" ? "LEGAL" : null;
    if (!kind) return errors.push({ line, message: 'type must be "person" or "company".' });
    const firstNames = col(r, "first_names");
    const lastName = col(r, "last_name");
    const name = col(r, "name") || [firstNames, lastName].filter(Boolean).join(" ");
    if (!name) return errors.push({ line, message: "Name is empty." });
    const birthDate = col(r, "birth_date");
    const lastCdd = col(r, "last_cdd_date");
    for (const [label, v] of [["birth_date", birthDate], ["last_cdd_date", lastCdd]] as const) {
      if (v && !DATE.test(v)) return errors.push({ line, message: `${label} must be YYYY-MM-DD.` });
    }
    const nationalities = col(r, "nationalities").split(/[|,\s]+/).map((x) => x.toUpperCase()).filter(Boolean);
    const residence = col(r, "residence_country").toUpperCase();
    const country = col(r, "country").toUpperCase();
    for (const c of [...nationalities, residence, country].filter(Boolean)) {
      if (!ISO2.test(c)) return errors.push({ line, message: `"${c}" is not a 2-letter country code.` });
    }
    const email = col(r, "email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errors.push({ line, message: "Invalid email." });
    rows.push({
      line, kind, name,
      firstNames: kind === "NATURAL" ? firstNames || name.split(" ").slice(0, -1).join(" ") || name : undefined,
      lastName: kind === "NATURAL" ? lastName || name.split(" ").slice(-1)[0] : undefined,
      birthDate: birthDate || undefined, nationalities, residenceCountry: residence || undefined, address: col(r, "address") || undefined,
      registrationNumber: col(r, "registration_number") || undefined, countryOfCreation: country || undefined, email: email || undefined,
      purpose: col(r, "purpose") || undefined, lastCddDate: lastCdd || undefined,
      isPep: ["yes", "true", "1", "y"].includes(col(r, "pep").toLowerCase()),
      documents: col(r, "documents").toLowerCase().split(/[|,\s]+/).filter((d) => KNOWN_DOCS.includes(d)),
    });
  });
  return { rows, errors };
}

export interface Gap {
  id: string;
  label: string;
}

/** Items missing against the AMLR / CDD RTS data set (Art. 22, 62). */
export function gapsFor(r: Pick<BackBookRow, "kind" | "birthDate" | "nationalities" | "residenceCountry" | "address" | "registrationNumber" | "countryOfCreation" | "purpose" | "documents" | "lastCddDate">, today: string): Gap[] {
  const g: Gap[] = [];
  if (r.kind === "NATURAL") {
    if (!r.birthDate) g.push({ id: "birth-date", label: "Full date of birth" });
    if (!r.nationalities.length) g.push({ id: "nationalities", label: "All nationalities" });
    if (!r.residenceCountry || !r.address) g.push({ id: "residence", label: "Residential address and country" });
    if (!r.documents.includes("id")) g.push({ id: "id-verification", label: "Identity verification (eID or ID document)" });
  } else {
    if (!r.registrationNumber) g.push({ id: "registration", label: "Registration number" });
    if (!r.countryOfCreation) g.push({ id: "country", label: "Country of creation" });
    if (!r.documents.includes("extract")) g.push({ id: "register-extract", label: "Company / BO register extract" });
    if (!r.documents.includes("bo")) g.push({ id: "beneficial-owners", label: "Beneficial owners identified and verified" });
  }
  if (!r.purpose) g.push({ id: "purpose", label: "Purpose and intended nature (Art. 25)" });
  if (!r.lastCddDate) g.push({ id: "last-cdd", label: "Date of last CDD unknown" });
  else if (r.lastCddDate < `${Number(today.slice(0, 4)) - 5}${today.slice(4)}`) g.push({ id: "stale-cdd", label: "Last CDD more than 5 years ago" });
  return g;
}

/** Priority: High risk first, then by number of gaps (spec §4.2 "prioritise high-risk files"). */
export function priority(riskLevel: string, gaps: number): number {
  const r = riskLevel === "High" || riskLevel === "HIGH" ? 2 : riskLevel === "Medium" || riskLevel === "MEDIUM" ? 1 : 0;
  return r * 100 + Math.min(gaps, 99);
}
