/**
 * Screening list import.
 *
 * AMLSyncAI list format (firm uploads, spec §3A.3 rule 6), comma- or
 * semicolon-separated with a header row:
 *   type,name,aliases,birth_dates,countries,reference
 *   person,Ivan Sidorov,"Ivan Sidorow|I. Sidorov",1965-04-12,RU,EU-123
 * aliases / birth_dates / countries are separated by "|".
 */
import { normalizeName } from "./match";

export interface ParsedEntry {
  entityType: "person" | "entity";
  names: string[];
  normalized: string[];
  birthDates: string[];
  countries: string[];
  reference: string | null;
}

/** RFC 4180-style CSV parser (quotes, escaped quotes, newlines in quotes). */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const d = delimiter ?? ((firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === d) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

const split = (v: string | undefined) => (v ?? "").split("|").map((x) => x.trim()).filter(Boolean);

export class ListFormatError extends Error {}

export function parseAmlSyncList(text: string, maxRows = 200_000): ParsedEntry[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new ListFormatError("The file has no entries.");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n: string) => header.indexOf(n);
  for (const required of ["type", "name"]) {
    if (col(required) < 0) throw new ListFormatError(`Missing column "${required}". Expected: type,name,aliases,birth_dates,countries,reference`);
  }
  if (rows.length - 1 > maxRows) throw new ListFormatError(`Too many rows (max ${maxRows}).`);
  return rows.slice(1).map((r, i) => {
    const type = (r[col("type")] ?? "").trim().toLowerCase();
    if (type !== "person" && type !== "entity") throw new ListFormatError(`Row ${i + 2}: type must be "person" or "entity".`);
    const name = (r[col("name")] ?? "").trim();
    if (!name) throw new ListFormatError(`Row ${i + 2}: name is empty.`);
    const names = [name, ...split(r[col("aliases")])];
    const birthDates = split(r[col("birth_dates")]);
    for (const b of birthDates) if (!/^\d{4}(-\d{2}-\d{2})?$/.test(b)) throw new ListFormatError(`Row ${i + 2}: birth date "${b}" must be YYYY or YYYY-MM-DD.`);
    const countries = split(r[col("countries")]).map((c) => c.toUpperCase());
    return {
      entityType: type,
      names,
      normalized: names.map((n) => normalizeName(n, type === "entity")),
      birthDates,
      countries,
      reference: (r[col("reference")] ?? "").trim() || null,
    };
  });
}

/**
 * EU Financial Sanctions Files (FSF) consolidated list, CSV v1.1 — one row per
 * name alias / birth date / citizenship, grouped by Entity_LogicalId.
 * [verify] against the live file: the column names below follow the published
 * format but could not be tested from the build environment.
 */
export function parseEuFsfCsv(text: string): ParsedEntry[] {
  const rows = parseCsv(text, ";");
  const header = rows[0].map((h) => h.trim());
  const find = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    throw new ListFormatError(`EU file: missing column ${names.join(" / ")}`);
  };
  const cId = find("Entity_LogicalId");
  const cType = find("Entity_SubjectType_ClassificationCode", "Entity_SubjectType");
  const cName = find("NameAlias_WholeName");
  const cDob = find("BirthDate_BirthDate");
  const cCountry = find("Citizenship_CountryIso2Code");
  const cProg = header.indexOf("Entity_Regulation_Programme");
  const byId = new Map<string, { type: string; names: Set<string>; dobs: Set<string>; countries: Set<string>; ref: string }>();
  for (const r of rows.slice(1)) {
    const id = r[cId]?.trim();
    if (!id) continue;
    const e = byId.get(id) ?? { type: (r[cType] ?? "").trim().toLowerCase(), names: new Set(), dobs: new Set(), countries: new Set(), ref: `EU-${id}${cProg >= 0 && r[cProg] ? ` ${r[cProg].trim()}` : ""}` };
    if (r[cName]?.trim()) e.names.add(r[cName].trim());
    if (r[cDob]?.trim()) e.dobs.add(r[cDob].trim().slice(0, 10));
    if (r[cCountry]?.trim() && r[cCountry].trim() !== "00") e.countries.add(r[cCountry].trim().toUpperCase());
    byId.set(id, e);
  }
  return [...byId.values()]
    .filter((e) => e.names.size > 0)
    .map((e) => {
      const entityType = e.type === "person" || e.type === "p" ? "person" : "entity";
      const names = [...e.names];
      return {
        entityType,
        names,
        normalized: names.map((n) => normalizeName(n, entityType === "entity")),
        birthDates: [...e.dobs],
        countries: [...e.countries],
        reference: e.ref,
      } as ParsedEntry;
    });
}
