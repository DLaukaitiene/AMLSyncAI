import "server-only";
import type { Tx } from "./db";
import { currentProfile } from "./country-profile";
import { buildReviewPack } from "@/lib/review-pack";

export async function firmReviewPack(tx: Tx, firmId: string) {
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId }, select: { name: true, sectors: true, txCashThresholdEUR: true, txHighValueThresholdEUR: true } });
  const { profile, version } = await currentProfile(tx, firmId);
  return buildReviewPack({ firmName: firm.name, sectors: firm.sectors, profile, profileVersion: version, txCashThresholdEUR: firm.txCashThresholdEUR, txHighValueThresholdEUR: firm.txHighValueThresholdEUR });
}
