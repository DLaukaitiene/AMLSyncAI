/**
 * Invisible proof-of-work challenge (spec §8C.4): before sign-up, login,
 * password reset, recovery and invitation acceptance the browser must find a
 * number whose SHA-256 with the challenge has N leading zero bits. Cheap for
 * one person, expensive for mass automated attempts. Challenges are signed,
 * expire after 10 minutes and work once; difficulty rises for suspicious IPs.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const BASE_DIFFICULTY = 14; // ~16k hashes (well under a second in a browser)
export const RAISED_DIFFICULTY = 18; // ~260k hashes (a few seconds) after repeated failures
const TTL_MS = 10 * 60_000;

export type PowPurpose = "signup" | "login" | "reset" | "recover" | "invite";

function sign(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createChallenge(secret: string, purpose: PowPurpose, difficulty: number, now = Date.now()): string {
  const body = `v1.${purpose}.${difficulty}.${now + TTL_MS}.${randomBytes(12).toString("base64url")}`;
  return `${body}.${sign(secret, body)}`;
}

export function leadingZeroBits(buf: Buffer): number {
  let n = 0;
  for (const byte of buf) {
    if (byte === 0) {
      n += 8;
      continue;
    }
    return n + Math.clz32(byte) - 24;
  }
  return n;
}

export type PowCheck = { ok: true; challengeId: string } | { ok: false; reason: string };

export function verifySolution(secret: string, token: string, solution: string, purpose: PowPurpose, now = Date.now()): PowCheck {
  const parts = token.split(".");
  if (parts.length !== 6 || parts[0] !== "v1") return { ok: false, reason: "malformed" };
  const body = parts.slice(0, 5).join(".");
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(parts[5]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "bad-signature" };
  if (parts[1] !== purpose) return { ok: false, reason: "wrong-purpose" };
  if (Number(parts[3]) < now) return { ok: false, reason: "expired" };
  if (!/^\d{1,12}$/.test(solution)) return { ok: false, reason: "no-solution" };
  const hash = createHash("sha256").update(`${token}:${solution}`).digest();
  if (leadingZeroBits(hash) < Number(parts[2])) return { ok: false, reason: "insufficient-work" };
  return { ok: true, challengeId: createHash("sha256").update(token).digest("hex") };
}

/** Reference solver (the browser does the same with Web Crypto). */
export function solve(token: string): string {
  const d = Number(token.split(".")[2]);
  for (let i = 0; ; i++) {
    if (leadingZeroBits(createHash("sha256").update(`${token}:${i}`).digest()) >= d) return String(i);
  }
}
