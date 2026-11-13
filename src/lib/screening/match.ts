/**
 * Name matching for sanctions / PEP screening (spec §4.4, §11.8).
 *
 * Deterministic and explainable: names are normalised (diacritics, case,
 * punctuation, legal-form suffixes, word order) and compared with
 * Jaro–Winkler per token. Date of birth and country are used to rank and to
 * explain, never to silently drop a candidate whose name matches strongly —
 * the user decides true match / false positive with a comment.
 */

const LEGAL_SUFFIXES = new Set([
  "uab", "ab", "as", "sa", "ag", "gmbh", "mbh", "kg", "ltd", "limited", "llc", "plc", "inc", "corp", "co", "srl", "spa", "sas", "sarl",
  "bv", "nv", "oy", "oyj", "aps", "sp", "zoo", "sro", "kft", "doo", "ooo", "ao", "pao", "zao", "jsc", "ojsc", "cjsc", "llp", "lp",
  "sl", "slu", "ou", "sia", "mb", "vsi", "ii", "iii", "the",
]);

/** Lowercase, strip diacritics and punctuation, transliterate common letters. */
export function normalizeName(name: string, entity = false): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/æ/gi, "ae")
    .replace(/ø/gi, "o")
    .replace(/đ/gi, "d")
    .replace(/ł/gi, "l")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const tokens = entity ? base.filter((t) => !LEGAL_SUFFIXES.has(t)) : base;
  return tokens.sort().join(" ");
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false);
  const bm = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (!bm[j] && a[i] === b[j]) {
        am[i] = bm[j] = true;
        matches++;
        break;
      }
    }
  }
  if (!matches) return 0;
  let t = 0;
  for (let i = 0, k = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Token-level similarity: each token of the shorter name is paired with its best
 * match in the other; the score is the average, penalised for unmatched tokens.
 */
export function nameSimilarity(aNorm: string, bNorm: string): number {
  if (!aNorm || !bNorm) return 0;
  if (aNorm === bNorm) return 1;
  const a = aNorm.split(" ");
  const b = bNorm.split(" ");
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const used = new Set<number>();
  let total = 0;
  for (const t of short) {
    let best = 0;
    let bestIdx = -1;
    long.forEach((u, i) => {
      if (used.has(i)) return;
      const s = jaroWinkler(t, u);
      if (s > best) {
        best = s;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) used.add(bestIdx);
    total += best;
  }
  const coverage = short.length / long.length;
  // A missing middle name costs a little; a missing surname-sized chunk costs more.
  return (total / short.length) * (0.85 + 0.15 * coverage);
}

export interface ScreeningSubject {
  name: string;
  entity: boolean;
  birthDate?: string; // YYYY-MM-DD or YYYY
  countries?: string[];
}

export interface ListEntry {
  id: string;
  entityType: "person" | "entity";
  names: string[];
  birthDates: string[];
  countries: string[];
}

export interface MatchCandidate {
  entryId: string;
  matchedName: string;
  score: number;
  reasons: string[];
  dobMismatch: boolean;
}

export const MATCH_THRESHOLD = 0.88;

export function screenSubject(subject: ScreeningSubject, entries: ListEntry[], threshold = MATCH_THRESHOLD): MatchCandidate[] {
  const sn = normalizeName(subject.name, subject.entity);
  const out: MatchCandidate[] = [];
  for (const e of entries) {
    if ((e.entityType === "entity") !== subject.entity) continue;
    let best = 0;
    let bestName = "";
    for (const n of e.names) {
      const s = nameSimilarity(sn, normalizeName(n, subject.entity));
      if (s > best) {
        best = s;
        bestName = n;
      }
    }
    if (best < threshold) continue;
    const reasons = [`Name similarity ${(best * 100).toFixed(0)}% with "${bestName}"`];
    let dobMismatch = false;
    if (subject.birthDate && e.birthDates.length) {
      const year = subject.birthDate.slice(0, 4);
      const exact = e.birthDates.some((d) => d === subject.birthDate);
      const sameYear = e.birthDates.some((d) => d.slice(0, 4) === year);
      if (exact) reasons.push("Same date of birth");
      else if (sameYear) reasons.push("Same year of birth");
      else {
        dobMismatch = true;
        reasons.push(`Different date of birth (list: ${e.birthDates.join(", ")})`);
      }
    }
    const shared = (subject.countries ?? []).filter((c) => e.countries.includes(c));
    if (shared.length) reasons.push(`Shared country: ${shared.join(", ")}`);
    out.push({ entryId: e.id, matchedName: bestName, score: Math.round(best * 1000) / 1000, reasons, dobMismatch });
  }
  return out.sort((x, y) => Number(x.dobMismatch) - Number(y.dobMismatch) || y.score - x.score);
}
