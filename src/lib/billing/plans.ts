/**
 * Plans and limits, in one place (recommendation 19: pages and checks read from
 * this config). Prices follow ClearAML's published plans, in euro.
 */

export const CONTACT_EMAIL = "contact@amlsync.com";
/** AMLSync operations: limit alerts and other notices that need a person. */
export const OPS_ALERT_EMAIL = "deimena@amlsync.com";

export type PlanId = "solo" | "starter" | "custom";

export interface Plan {
  id: PlanId;
  name: string;
  monthlyCents: number | null; // null = quoted by sales
  users: number | null; // null = agreed with sales
  blurb: string;
}

export const PLANS: Record<PlanId, Plan> = {
  solo: { id: "solo", name: "Solo", monthlyCents: 4900, users: 2, blurb: "Sole practitioners and very small firms." },
  starter: { id: "starter", name: "Starter", monthlyCents: 14900, users: 10, blurb: "Small firms with a team." },
  custom: { id: "custom", name: "Professional / Enterprise", monthlyCents: null, users: null, blurb: `More users, offices or an API: contact ${CONTACT_EMAIL}.` },
};

export const SELF_SERVE_PLANS: PlanId[] = ["solo", "starter"];
export const TRIAL_DAYS = 14;

export function planOf(id: string): Plan {
  return PLANS[id as PlanId] ?? PLANS.starter;
}

/**
 * Subscription fee for one calendar month, after the free trial: full fee for
 * months that start after the trial, a share by days for the month the trial
 * ends in, nothing before. `customFeeCents` (set by AMLSync App) overrides the list price.
 */
export function monthlyFeeFor(plan: string, customFeeCents: number | null, trialEndsOn: string | null, periodFrom: string, periodToExclusive: string): number {
  const fee = customFeeCents ?? planOf(plan).monthlyCents ?? 0;
  if (fee <= 0) return 0;
  const start = Date.parse(periodFrom + "T00:00:00Z"), end = Date.parse(periodToExclusive + "T00:00:00Z");
  const paidFrom = trialEndsOn ? Math.max(start, Date.parse(trialEndsOn + "T00:00:00Z")) : start;
  if (paidFrom >= end) return 0;
  const days = Math.round((end - start) / 86_400_000);
  const paid = Math.round((end - paidFrom) / 86_400_000);
  return Math.round((fee * paid) / days);
}
