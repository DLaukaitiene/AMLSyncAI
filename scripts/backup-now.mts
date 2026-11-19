/** Writes an encrypted backup of DATABASE_URL to the given file:  BACKUP_KEY=… npx tsx scripts/backup-now.mts out.amlsbk */
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { dumpDatabase } from "../src/lib/backup/dump.ts";

const out = process.argv[2];
if (!out) { console.error("Usage: BACKUP_KEY=… npx tsx scripts/backup-now.mts <file>"); process.exit(2); }
const db = new PrismaClient();
const b = await dumpDatabase(db);
writeFileSync(out, b.file);
console.log(`${out}: ${b.file.length} bytes, ${Object.values(b.rows).reduce((a, n) => a + n, 0)} rows in ${Object.keys(b.rows).length} tables`);
await db.$disconnect();
