import "server-only";
import { PrismaClient, type Prisma } from "@prisma/client";

/**
 * Two connections (spec §8C.7):
 * - adminDb: owner role (DATABASE_URL). Used only for authentication, sign-up
 *   and system jobs that must work before a tenant is known.
 * - appDb: non-superuser role (DATABASE_APP_URL) — row-level security applies.
 *   All tenant data goes through withTenant().
 */
const g = globalThis as unknown as { adminDb?: PrismaClient; appDb?: PrismaClient };

export const adminDb = g.adminDb ?? new PrismaClient();
export const appDb =
  g.appDb ?? new PrismaClient({ datasourceUrl: process.env.DATABASE_APP_URL ?? process.env.DATABASE_URL });

if (process.env.NODE_ENV !== "production") {
  g.adminDb = adminDb;
  g.appDb = appDb;
}

export type Tx = Prisma.TransactionClient;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Runs fn in a transaction where row-level security limits every query to one firm. */
export async function withTenant<T>(firmId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(firmId)) throw new Error("Invalid firm id");
  return appDb.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.firm_id', ${firmId}, true)`;
    return fn(tx);
  });
}
