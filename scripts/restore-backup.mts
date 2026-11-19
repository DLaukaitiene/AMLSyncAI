/**
 * Restores an AMLSync backup into an EMPTY database that has the same migrations applied.
 *
 *   TARGET_DATABASE_URL=postgresql://… BACKUP_KEY=… npx tsx scripts/restore-backup.mts amlsync-backup-2026-11-23.amlsbk
 *
 * Steps for a real restore: create a new database (e.g. a new Supabase project), run
 * `DATABASE_URL=$TARGET_DATABASE_URL npx prisma migrate deploy`, apply prisma/rls.sql and
 * prisma/supabase-grants.sql, run this script, then point the app's DATABASE_URL at it.
 * The app's own keys (field encryption) must be the same as when the backup was made.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { backupKey, openBackup } from "../src/lib/backup/crypto.ts";

const [file] = process.argv.slice(2);
const url = process.env.TARGET_DATABASE_URL;
if (!file || !url) { console.error("Usage: TARGET_DATABASE_URL=… BACKUP_KEY=… npx tsx scripts/restore-backup.mts <file>"); process.exit(2); }
const dump = JSON.parse(openBackup(readFileSync(file), backupKey())) as { format: string; created: string; migrations: string[]; tables: Record<string, unknown[]> };
if (dump.format !== "amlsync-backup") throw new Error("Not an AMLSync backup.");
const db = new PrismaClient({ datasources: { db: { url } } });
const q = (t: string) => `"${t.replace(/"/g, '""')}"`;

const applied = (await db.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`).map((m) => m.migration_name);
const missing = dump.migrations.filter((m) => !applied.includes(m));
if (missing.length) throw new Error(`Run prisma migrate deploy on the target first. Missing: ${missing.join(", ")}`);
for (const t of Object.keys(dump.tables)) {
  const n = Number((await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${q(t)}`))[0].n);
  if (n > 0) throw new Error(`Target table ${t} is not empty: restore only into an empty database.`);
}

// Parents before children (foreign keys).
const fks = await db.$queryRaw<{ child: string; parent: string }[]>`
  SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent FROM pg_constraint c
  JOIN pg_namespace n ON n.oid = c.connamespace WHERE c.contype = 'f' AND n.nspname = 'public'`;
const strip = (s: string) => s.replace(/^"|"$/g, "");
const deps = new Map<string, Set<string>>(Object.keys(dump.tables).map((t) => [t, new Set<string>()]));
for (const f of fks) if (strip(f.child) !== strip(f.parent)) deps.get(strip(f.child))?.add(strip(f.parent));
const order: string[] = [];
const seen = new Set<string>();
const visit = (t: string) => { if (seen.has(t)) return; seen.add(t); for (const p of deps.get(t) ?? []) if (deps.has(p)) visit(p); order.push(t); };
for (const t of deps.keys()) visit(t);

let total = 0;
for (const t of order) {
  const rows = dump.tables[t];
  for (let i = 0; i < rows.length; i += 500) {
    await db.$executeRawUnsafe(`INSERT INTO ${q(t)} SELECT * FROM json_populate_recordset(NULL::${q(t)}, $1::json)`, JSON.stringify(rows.slice(i, i + 500)));
  }
  // Auto-increment ids continue after the restored rows.
  const seq = (await db.$queryRawUnsafe<{ s: string | null }[]>(`SELECT pg_get_serial_sequence('${q(t)}', 'id') AS s`).catch(() => [{ s: null }]))[0]?.s;
  if (seq && rows.length) await db.$executeRawUnsafe(`SELECT setval('${seq}', (SELECT max(id) FROM ${q(t)}))`);
  total += rows.length;
  if (rows.length) console.log(`${t}: ${rows.length}`);
}
console.log(`Restored ${total} rows from the backup of ${dump.created}.`);
await db.$disconnect();
