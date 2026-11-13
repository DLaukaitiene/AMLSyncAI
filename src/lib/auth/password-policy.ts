/**
 * Password rules (spec §8C.3): at least 12 characters, not a known breached
 * password, no forced periodic change.
 */
import { createHash } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256;

/** Small local list so the check works offline; the HIBP range API covers the rest. */
const COMMON = new Set([
  "123456789012", "password1234", "password12345", "qwertyuiop12", "qwerty123456", "iloveyou1234", "111111111111",
  "000000000000", "123123123123", "abcdefghijkl", "passwordpassword", "letmein12345", "welcome12345", "admin1234567",
  "changeme1234", "1234567890ab", "qwertyuiopas", "1q2w3e4r5t6y", "aaaaaaaaaaaa", "password123!", "Password1234",
  "Password123!", "Welcome12345", "Summer2026!!", "Winter2026!!",
]);

export function passwordProblems(pw: string): string[] {
  const p: string[] = [];
  if (pw.length < MIN_PASSWORD_LENGTH) p.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (pw.length > MAX_PASSWORD_LENGTH) p.push(`Use at most ${MAX_PASSWORD_LENGTH} characters.`);
  if (COMMON.has(pw) || COMMON.has(pw.toLowerCase())) p.push("This password is too common. Choose another.");
  if (/^(.)\1+$/.test(pw)) p.push("Don't repeat one character.");
  return p;
}

export type BreachLookup = (sha1Prefix: string) => Promise<string>;

/** Have I Been Pwned range API (k-anonymity: only the first 5 hex chars of the SHA-1 leave the server). */
export const hibpLookup: BreachLookup = async (prefix) => {
  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { "Add-Padding": "true", "User-Agent": "AMLSyncAI-password-check" },
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`HIBP ${res.status}`);
  return res.text();
};

/** True if breached; null if the breach service could not be reached. */
export async function isBreachedPassword(pw: string, lookup: BreachLookup = hibpLookup): Promise<boolean | null> {
  const sha1 = createHash("sha1").update(pw).digest("hex").toUpperCase();
  try {
    const body = await lookup(sha1.slice(0, 5));
    const suffix = sha1.slice(5);
    return body.split("\n").some((line) => {
      const [s, count] = line.trim().split(":");
      return s === suffix && Number(count) > 0;
    });
  } catch {
    return null;
  }
}
