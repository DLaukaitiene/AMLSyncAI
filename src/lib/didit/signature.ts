/**
 * Didit webhook signature (X-Signature-V2): HMAC-SHA256 over the JSON body
 * re-serialised with recursively sorted keys, compact separators and
 * unescaped Unicode; whole-valued floats are written as integers. The
 * timestamp must be within 5 minutes. During secret rotation the
 * X-Signature-V2-Previous header carries a signature made with the old secret.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === "object") {
    return Object.keys(v as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return v;
}

export function canonicalJson(body: unknown): string {
  return JSON.stringify(sortKeys(body));
}

export function signV2(body: unknown, secret: string): string {
  return createHmac("sha256", secret).update(canonicalJson(body), "utf8").digest("hex");
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function verifyDiditWebhook(
  body: unknown,
  headers: { signatureV2?: string | null; signatureV2Previous?: string | null; timestamp?: string | null },
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): { ok: boolean; reason?: string } {
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) return { ok: false, reason: "stale-or-missing-timestamp" };
  if (!headers.signatureV2) return { ok: false, reason: "missing-signature" };
  const expected = signV2(body, secret);
  if (same(expected, headers.signatureV2) || (headers.signatureV2Previous && same(expected, headers.signatureV2Previous))) return { ok: true };
  return { ok: false, reason: "bad-signature" };
}
