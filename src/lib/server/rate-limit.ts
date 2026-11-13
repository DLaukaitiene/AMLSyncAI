import "server-only";
import { adminDb } from "./db";

/** Fixed-window rate limits (spec §8C.4). Returns false when the limit is exceeded. */
export const LIMITS = {
  loginPerIp: { limit: 30, windowSec: 15 * 60 },
  loginPerAccount: { limit: 10, windowSec: 15 * 60 },
  mfaPerSession: { limit: 6, windowSec: 5 * 60 },
  signupPerIp: { limit: 5, windowSec: 60 * 60 },
  passwordResetPerIp: { limit: 5, windowSec: 60 * 60 },
  invitePerFirm: { limit: 50, windowSec: 24 * 60 * 60 },
} as const;

export async function hit(key: string, rule: { limit: number; windowSec: number }): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / (rule.windowSec * 1000)) * rule.windowSec * 1000);
  const rows = await adminDb.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" (key, "windowStart", count) VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "RateLimitBucket"."windowStart" = EXCLUDED."windowStart" THEN "RateLimitBucket".count + 1 ELSE 1 END,
      "windowStart" = EXCLUDED."windowStart"
    RETURNING count`;
  return rows[0].count <= rule.limit;
}
