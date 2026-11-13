import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { isBreachedPassword, passwordProblems } from "@/lib/auth/password-policy";

// Argon2id (the library default), OWASP-recommended parameters.
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (pw: string) => hash(pw, OPTS);
export const verifyPassword = (h: string, pw: string) => verify(h, pw).catch(() => false);

// Verified against when the account doesn't exist, so timing doesn't reveal it.
let dummy: Promise<string> | null = null;
export function dummyHash() {
  dummy ??= hashPassword("not-a-real-password-" + Math.random());
  return dummy;
}

/** All problems with a new password, including the breached-password check. */
export async function checkNewPassword(pw: string): Promise<string[]> {
  const problems = passwordProblems(pw);
  if (problems.length) return problems;
  if (process.env.SKIP_BREACH_CHECK !== "1" && (await isBreachedPassword(pw)) === true) {
    return ["This password has appeared in a data breach. Choose another."];
  }
  return [];
}
