import type { PrismaClient } from "@prisma/client";
import { backupKey, sealBackup } from "./crypto";

/** Short-lived data that is not worth restoring (sign-in sessions, one-time tokens, counters, dev mail). */
export const BACKUP_SKIP = new Set(["_prisma_migrations", "Session", "EmailToken", "RateLimitBucket", "DevEmail"]);

/**
 * Full database backup: every table as JSON (Postgres' own JSON, so every type
 * round-trips), compressed and encrypted with BACKUP_KEY. Field-level encrypted
 * columns stay encrypted with the firm keys, so a restore also needs the app's keys.
 */
export async function dumpDatabase(db: PrismaClient, rawKey = process.env.BACKUP_KEY): Promise<{ file: Buffer; name: string; rows: Record<string, number> }> {
  const key = backupKey(rawKey);
  const tables = (await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)
    .map((t) => t.tablename).filter((t) => !BACKUP_SKIP.has(t));
  const data: Record<string, unknown[]> = {};
  const rows: Record<string, number> = {};
  for (const t of tables) {
    // Table names come from the catalogue, never from input; quoted as identifiers.
    const r = await db.$queryRawUnsafe<{ j: unknown[] | null }[]>(`SELECT json_agg(x) AS j FROM "${t.replace(/"/g, '""')}" x`);
    data[t] = r[0]?.j ?? [];
    rows[t] = data[t].length;
  }
  const created = new Date().toISOString();
  const migrations = await db.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`;
  const json = JSON.stringify({ format: "amlsync-backup", version: 1, created, migrations: migrations.map((m) => m.migration_name), tables: data });
  return { file: sealBackup(json, key), name: `amlsync-backup-${created.slice(0, 10)}.amlsbk`, rows };
}
