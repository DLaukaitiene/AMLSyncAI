/**
 * Misuse of the AML product (§11.3): checks used to look people up for
 * non-AML reasons breach purpose limitation (AMLR Art. 76, GDPR Art. 5(1)(b)).
 * Rules work on daily counts per firm — never on who was checked.
 */
export interface UsageSeries {
  /** Screenings + paid checks per UTC day, oldest first; the last element is today. */
  daily: number[];
  firmAgeDays: number;
  /** Clients and matters created in the same window (purpose signal). */
  clientsCreated: number;
  checksTotal: number;
}

export interface MisuseFlag {
  rule: "spike" | "new-firm-burst" | "checks-without-onboarding";
  detail: string;
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const SPIKE_FACTOR = 5; // §22 "Check misuse": > 5× the 30-day median
export const SPIKE_MIN = 20;

export function misuseFlags(u: UsageSeries): MisuseFlag[] {
  const flags: MisuseFlag[] = [];
  const today = u.daily.at(-1) ?? 0;
  const base = median(u.daily.slice(0, -1).filter((_, i, a) => i >= a.length - 30));
  if (today >= SPIKE_MIN && today > SPIKE_FACTOR * Math.max(base, 1)) flags.push({ rule: "spike", detail: `${today} checks today vs a 30-day median of ${base}` });
  if (u.firmAgeDays <= 3 && u.checksTotal >= SPIKE_MIN) flags.push({ rule: "new-firm-burst", detail: `${u.checksTotal} checks within ${u.firmAgeDays} day(s) of sign-up` });
  if (u.checksTotal >= SPIKE_MIN && u.clientsCreated * 3 < u.checksTotal) flags.push({ rule: "checks-without-onboarding", detail: `${u.checksTotal} checks but only ${u.clientsCreated} client file(s) created` });
  return flags;
}
