import "server-only";
import { adminDb, type Tx } from "../db";
import { entryHash, GENESIS, verifyChain } from "@/lib/backoffice/chain";

/**
 * Admin audit log (§2.4): append-only (trigger in prisma/rls.sql) and
 * hash-chained. Writes are serialised with an advisory lock so the chain has
 * exactly one head. Pass the caller's transaction to write the log in the
 * same transaction as the change (§25).
 */
export interface AdminAuditInput {
  adminEmail: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  reason?: string | null;
  details?: Record<string, unknown> | null;
  approverEmail?: string | null;
}

async function write(tx: Tx, e: AdminAuditInput) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(515151)`;
  const last = await tx.adminAuditEvent.findFirst({ orderBy: { id: "desc" }, select: { hash: true } });
  const prevHash = last?.hash ?? GENESIS;
  const entry = {
    at: new Date(), adminEmail: e.adminEmail.toLowerCase(), action: e.action, targetType: e.targetType,
    targetId: e.targetId ?? null, reason: e.reason ?? null, details: e.details ?? null, approverEmail: e.approverEmail ?? null,
  };
  await tx.adminAuditEvent.create({ data: { ...entry, details: (entry.details ?? undefined) as object | undefined, prevHash, hash: entryHash(prevHash, entry) } });
}

export async function adminAudit(e: AdminAuditInput, tx?: Tx) {
  if (tx) return write(tx, e);
  await adminDb.$transaction((t) => write(t, e));
}

/** Verifies the whole chain; returns the id of the first broken entry, if any. */
export async function verifyAdminAudit(): Promise<{ count: number; brokenAt: bigint | null }> {
  const rows = await adminDb.adminAuditEvent.findMany({ orderBy: { id: "asc" } });
  const i = verifyChain(rows.map((r) => ({ ...r, details: r.details ?? null })));
  return { count: rows.length, brokenAt: i === -1 ? null : rows[i].id };
}
