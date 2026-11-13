/**
 * Personal-data scan for free text that leaves the firm's tenant, such as
 * feature requests (spec §4.10, §11.13). Text with an ID number, IBAN, email,
 * phone number or date of birth cannot be submitted until the user removes it
 * or confirms it is not client data.
 */

export type PiiKind = "iban" | "email" | "phone" | "date-of-birth" | "id-number";

export interface PiiFinding {
  kind: PiiKind;
  match: string;
  index: number;
}

function ibanValid(raw: string): boolean {
  const s = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const v = ch >= "A" && ch <= "Z" ? (ch.charCodeAt(0) - 55).toString() : ch;
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

const PATTERNS: { kind: PiiKind; re: RegExp; validate?: (m: string) => boolean }[] = [
  { kind: "iban", re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g, validate: ibanValid },
  { kind: "email", re: /\b[^\s@<>()]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi },
  // Dates: 1985-03-14, 14.03.1985, 14/03/1985, 14-03-1985
  { kind: "date-of-birth", re: /\b(?:(?:19|20)\d{2}[-./](?:0?[1-9]|1[0-2])[-./](?:0?[1-9]|[12]\d|3[01])|(?:0?[1-9]|[12]\d|3[01])[-./](?:0?[1-9]|1[0-2])[-./](?:19|20)\d{2})\b/g },
  // International or long national phone numbers: +370 612 34567, 0049 30 1234567
  { kind: "phone", re: /(?:\+|\b00)\d{1,3}[\s-]?(?:\(?\d{1,4}\)?[\s-]?){2,5}\d{2,4}\b/g },
  // Personal / national ID numbers: 9–13 consecutive digits (e.g. LT asmens kodas 11 digits)
  // or an ID-card style code (letters + digits).
  { kind: "id-number", re: /\b\d{9,13}\b|\b[A-Z]{1,3}\d{6,9}\b/g },
];

export function scanForPersonalData(text: string): PiiFinding[] {
  const found: PiiFinding[] = [];
  const taken: [number, number][] = [];
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);

  for (const { kind, re, validate } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      if (validate && !validate(m[0])) continue;
      found.push({ kind, match: m[0], index: start });
      taken.push([start, end]);
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

export function canSubmitFreeText(text: string, userConfirmedNoClientData: boolean): { allowed: boolean; findings: PiiFinding[] } {
  const findings = scanForPersonalData(text);
  return { allowed: findings.length === 0 || userConfirmedNoClientData, findings };
}
