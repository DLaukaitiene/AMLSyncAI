"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { RULE_IDS } from "@/lib/monitoring/rules";

export async function monitoringSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  const usesCash = fd.get("usesCash") === "on";
  const high = Math.round(Number(fd.get("high")));
  if (!(high >= 1_000)) return { error: "High-value review level: at least €1,000.", fieldErrors: { high: ["At least €1,000"] } };
  const data: Record<string, unknown> = { usesCash, txHighValueThresholdEUR: high, txRulesOff: RULE_IDS.filter((id) => fd.get(`rule_${id}`) !== "on") };
  if (fd.has("cash")) {
    const cash = Math.round(Number(fd.get("cash")));
    const legal = Math.round(Number(fd.get("legal")));
    if (!(cash >= 100 && cash <= 10_000)) return { error: "Cash identification amount: between €100 and €10,000.", fieldErrors: { cash: ["€100–€10,000"] } };
    if (!(legal >= 100 && legal <= 10_000)) return { error: "Legal cash limit: between €100 and €10,000 (the EU cap).", fieldErrors: { legal: ["€100–€10,000"] } };
    Object.assign(data, { txCashThresholdEUR: cash, txCashLegalLimitEUR: legal, ...(fd.get("checkedNow") === "on" ? { txCashLimitCheckedAt: new Date() } : {}) });
  }
  await withTenant(s.firm.id, async (tx) => {
    await tx.firm.update({ where: { id: s.firm.id }, data });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "Firm", objectId: s.firm.id, fields: Object.keys(data) });
  });
  revalidatePath("/app/settings/transaction-monitoring");
  revalidatePath("/app/transactions");
  return { message: "Settings saved. They apply to transactions recorded or imported from now on." };
}
