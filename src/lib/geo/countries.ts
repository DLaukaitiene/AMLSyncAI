/**
 * Every country and territory (ISO 3166-1 alpha-2, plus XK Kosovo), for all
 * country fields. EU member states are listed first where the field is about
 * the firm's own establishment. A value that isn't a known country ("Other")
 * is kept as typed and flagged for manual assessment in the risk rules.
 */
export const COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
  "UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW"
).split(" ");

export const EU_CODES = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];

const names = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

export function countryName(code: string): string {
  if (code === "XK") return "Kosovo";
  if (!/^[A-Z]{2}$/.test(code)) return code; // "Other" free text
  return names?.of(code) ?? code;
}

export interface CountryOption { code: string; name: string; eu: boolean }

/** All countries sorted by name; EU first when `euFirst`. */
export function countryOptions(euFirst = false): CountryOption[] {
  const all = COUNTRY_CODES.map((code) => ({ code, name: countryName(code), eu: EU_CODES.includes(code) })).sort((a, b) => a.name.localeCompare(b.name));
  return euFirst ? [...all.filter((c) => c.eu), ...all.filter((c) => !c.eu)] : all;
}

const byName = new Map<string, string>();
for (const c of COUNTRY_CODES) {
  const n = countryName(c).toLowerCase();
  byName.set(n, c);
  byName.set(n.replace(/ & /g, " and "), c);
}
// Common alternative names
for (const [alias, code] of Object.entries({ "united kingdom": "GB", uk: "GB", "great britain": "GB", england: "GB", scotland: "GB", "united states": "US", usa: "US", america: "US", russia: "RU", "south korea": "KR", "north korea": "KP", "czech republic": "CZ", czechia: "CZ", holland: "NL", "the netherlands": "NL", turkey: "TR", "türkiye": "TR", "ivory coast": "CI", moldova: "MD", syria: "SY", iran: "IR", vietnam: "VN", laos: "LA", "uae": "AE", "emirates": "AE", "bosnia": "BA", macedonia: "MK", "north macedonia": "MK", vatican: "VA", palestine: "PS", taiwan: "TW", "hong kong": "HK", macau: "MO", kosovo: "XK" })) byName.set(alias, code);

/**
 * Normalises what a person typed or picked: an ISO code ("lt"), a name
 * ("Lithuania") or "Name (LT)" become "LT"; anything else is kept as written
 * (an "Other" country), trimmed to 60 characters. Empty → null.
 */
export function normalizeCountry(input: string | null | undefined): string | null {
  const v = String(input ?? "").trim();
  if (!v) return null;
  const paren = v.match(/\(([A-Za-z]{2})\)\s*$/);
  if (paren && COUNTRY_CODES.includes(paren[1].toUpperCase())) return paren[1].toUpperCase();
  if (/^[A-Za-z]{2}$/.test(v) && COUNTRY_CODES.includes(v.toUpperCase())) return v.toUpperCase();
  const named = byName.get(v.toLowerCase().replace(/ & /g, " and "));
  if (named) return named;
  return v.replace(/\s+/g, " ").slice(0, 60);
}

/** Several countries separated by commas, semicolons, "|" or new lines. Spaces alone don't split (names contain spaces). */
export function normalizeCountries(input: string | string[] | null | undefined): string[] {
  const parts = Array.isArray(input) ? input : String(input ?? "").split(/[,;|\n]+/);
  // Back-compatible: "LT PL" (codes separated by spaces) still splits.
  const expanded = parts.flatMap((p) => (/^\s*([A-Za-z]{2}\s+)+[A-Za-z]{2}\s*$/.test(p) ? p.trim().split(/\s+/) : [p]));
  const out: string[] = [];
  for (const p of expanded) {
    const c = normalizeCountry(p);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/** True for a recognised ISO code; false for an "Other" value typed by hand. */
export const isKnownCountry = (v: string) => COUNTRY_CODES.includes(v);
