import "server-only";
import type { Tx } from "./db";
import { adminDb } from "./db";

/**
 * Audit log (spec §4.7, §11.0). General by design: action, object type,
 * object id (a random UUID) and the NAMES of changed fields — never values,
 * names or anything else that identifies a client. It is kept after client
 * data is deleted at the end of the retention period.
 */
export async function audit(
  tx: Tx,
  e: { firmId: string; userId: string | null; action: string; objectType: string; objectId: string; fields?: string[] },
) {
  await tx.auditEvent.create({
    data: { firmId: e.firmId, userId: e.userId, action: e.action, objectType: e.objectType, objectId: e.objectId, fields: e.fields ?? [] },
  });
}

/** Security events (spec §8C.9): logins, failures, MFA changes, exports, rate-limit blocks… */
export async function securityEvent(e: {
  firmId?: string | null;
  userId?: string | null;
  kind: string;
  ip?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
}) {
  await adminDb.securityEvent.create({
    data: {
      firmId: e.firmId ?? null,
      userId: e.userId ?? null,
      kind: e.kind,
      ip: e.ip ?? null,
      userAgent: e.userAgent?.slice(0, 300) ?? null,
      details: (e.details ?? undefined) as object | undefined,
    },
  });
}

/** Lists the keys whose values differ — used to record field names only. */
export function changedFields(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
}
