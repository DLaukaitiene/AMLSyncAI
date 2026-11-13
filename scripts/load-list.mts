/**
 * Loads an official screening list shared by all firms (owner connection).
 *   npx tsx scripts/load-list.mts <amlsync|eu-fsf> <file.csv> "<list name>" <version> [SANCTIONS|PEP]
 * e.g.  npx tsx scripts/load-list.mts eu-fsf eu.csv "EU consolidated financial sanctions" 2026-11-13
 * Then call POST /api/cron/rescreen to re-screen every firm within 24 hours.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseAmlSyncList, parseEuFsfCsv } from "../src/lib/screening/csv.ts";

const [format, path, name, version, kind = "SANCTIONS"] = process.argv.slice(2);
if (!format || !path || !name || !version) {
  console.error('Usage: load-list.mts <amlsync|eu-fsf> <file> "<name>" <version> [SANCTIONS|PEP]');
  process.exit(1);
}
const text = readFileSync(path, "utf8");
const entries = format === "eu-fsf" ? parseEuFsfCsv(text) : parseAmlSyncList(text);
const db = new PrismaClient();
await db.$transaction(async (tx) => {
  await tx.screeningList.updateMany({ where: { firmId: null, name, active: true }, data: { active: false } });
  const list = await tx.screeningList.create({ data: { firmId: null, kind: kind as "SANCTIONS" | "PEP", name, version } });
  for (let i = 0; i < entries.length; i += 1000) {
    await tx.screeningEntry.createMany({ data: entries.slice(i, i + 1000).map((e) => ({ listId: list.id, ...e })) });
  }
}, { timeout: 600_000 });
console.log(`Loaded ${entries.length} entries into "${name}" (${version}).`);
await db.$disconnect();
