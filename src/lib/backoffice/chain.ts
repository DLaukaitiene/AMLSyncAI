import { createHash } from "node:crypto";

/**
 * Hash chain for the admin audit log (§2.4): each entry's hash covers its own
 * content and the previous entry's hash, so a changed or removed row breaks
 * every hash after it.
 */
export const GENESIS = "0".repeat(64);

export interface ChainEntry {
  at: Date;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  details: unknown;
  approverEmail: string | null;
}

/** JSON with sorted keys, so the hash does not depend on key order (Postgres jsonb reorders keys). */
export function canonical(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export function entryHash(prevHash: string, e: ChainEntry): string {
  const body = canonical({
    at: e.at.toISOString(), adminEmail: e.adminEmail, action: e.action, targetType: e.targetType,
    targetId: e.targetId, reason: e.reason, details: e.details ?? null, approverEmail: e.approverEmail,
  });
  return createHash("sha256").update(prevHash).update("\n").update(body).digest("hex");
}

/** Returns the index of the first broken entry, or -1 when the chain is intact. */
export function verifyChain(rows: (ChainEntry & { prevHash: string; hash: string })[], startPrev = GENESIS): number {
  let prev = startPrev;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.prevHash !== prev || entryHash(prev, r) !== r.hash) return i;
    prev = r.hash;
  }
  return -1;
}
