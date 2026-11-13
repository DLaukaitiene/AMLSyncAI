import "server-only";
import type { Tx } from "./db";
import { countryProfileSchema, type CountryProfile } from "@/lib/rules/country-profile";

/** Latest home-state Country Profile version for the firm (spec §3A). */
export async function currentProfile(tx: Tx, firmId: string, officeId: string | null = null): Promise<{ version: number; profile: CountryProfile; createdAt: Date; source: string | null }> {
  const v = await tx.countryProfileVersion.findFirst({
    where: { firmId, officeId },
    orderBy: { version: "desc" },
  });
  if (!v) throw new Error("Firm has no Country Profile");
  return { version: v.version, profile: countryProfileSchema.parse(v.data), createdAt: v.createdAt, source: v.source };
}
