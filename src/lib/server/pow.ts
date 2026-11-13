import "server-only";
import { hkdfSync } from "node:crypto";
import { BASE_DIFFICULTY, RAISED_DIFFICULTY, createChallenge, verifySolution, type PowPurpose } from "@/lib/security/pow";
import { adminDb } from "./db";
import { hit } from "./rate-limit";
import { securityEvent } from "./audit";

function secret(): string {
  const master = process.env.MASTER_KEY ? Buffer.from(process.env.MASTER_KEY, "base64") : Buffer.alloc(32, 7);
  return Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), Buffer.from("amlsyncai-pow-v1"), 32)).toString("base64url");
}

/** Recent failures from this IP raise the difficulty. */
async function suspicious(ip: string | null): Promise<boolean> {
  const b = await adminDb.rateLimitBucket.findUnique({ where: { key: `powfail:${ip}` } });
  return !!b && b.count >= 3 && Date.now() - b.windowStart.getTime() < 15 * 60_000;
}

export async function issueChallenge(purpose: PowPurpose, ip: string | null) {
  return createChallenge(secret(), purpose, (await suspicious(ip)) ? RAISED_DIFFICULTY : BASE_DIFFICULTY);
}

/** Verifies the challenge in a form submission; each challenge works once. */
export async function checkPow(fd: FormData, purpose: PowPurpose, ip: string | null, userAgent?: string | null): Promise<boolean> {
  const r = verifySolution(secret(), String(fd.get("pow_token") ?? ""), String(fd.get("pow_solution") ?? ""), purpose);
  const fresh = r.ok && (await hit(`pow:${r.challengeId}`, { limit: 1, windowSec: 15 * 60 }));
  if (fresh) return true;
  await hit(`powfail:${ip}`, { limit: 1_000_000, windowSec: 15 * 60 });
  await securityEvent({ kind: "bot-challenge-failed", ip, userAgent, details: { purpose, reason: r.ok ? "reused" : r.reason } });
  return false;
}

export const POW_FAILED = "Security check failed. Wait a moment and try again.";
