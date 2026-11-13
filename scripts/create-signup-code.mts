/**
 * Issues a platform sign-up code (SIGNUP_MODE=invite).
 *   npx tsx scripts/create-signup-code.mts [maxUses] [daysValid] [note]
 */
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

const [maxUses = "1", days = "30", ...note] = process.argv.slice(2);
const code = randomBytes(9).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12).replace(/(.{4})(?!$)/g, "$1-");
const db = new PrismaClient();
await db.signupCode.create({
  data: {
    id: createHash("sha256").update(code).digest("hex"),
    maxUses: Number(maxUses),
    expiresAt: new Date(Date.now() + Number(days) * 86_400_000),
    note: note.join(" ") || null,
  },
});
console.log(code);
await db.$disconnect();
