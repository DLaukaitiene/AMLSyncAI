/**
 * Firm health score (§6.4): 0–100, weighted, with the reasons shown.
 * Inputs are counts only — never client data.
 */
export interface HealthInput {
  users: number;
  activeUsers30d: number;
  coreActions30d: number; // clients created + checks + screenings
  coreActionsPrev30d: number;
  milestonesDone: number;
  milestonesTotal: number;
  overdueRefreshes: number;
  openCddFiles: number;
  overdueInvoices: number;
  pendingSupportRequests: number;
  /** Days of paid-check budget left this month at the current pace (null = no paid checks). */
  budgetRunwayDays: number | null;
}

export interface HealthResult {
  score: number;
  band: "green" | "amber" | "red";
  reasons: { signal: string; weight: number; points: number; detail: string }[];
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));

export function healthScore(i: HealthInput): HealthResult {
  const reasons: HealthResult["reasons"] = [];
  const add = (signal: string, weight: number, share: number, detail: string) => reasons.push({ signal, weight, points: Math.round(weight * clamp(share)), detail });

  add("Active users", 20, i.users ? i.activeUsers30d / i.users : 0, `${i.activeUsers30d} of ${i.users} users active in 30 days`);
  let trend: number, trendText: string;
  if (i.coreActionsPrev30d === 0) {
    trend = i.coreActions30d > 0 ? 1 : 0;
    trendText = i.coreActions30d > 0 ? `${i.coreActions30d} core actions (new activity)` : "No core actions in 60 days";
  } else {
    const change = (i.coreActions30d - i.coreActionsPrev30d) / i.coreActionsPrev30d;
    trend = clamp(1 + change); // −100 % → 0, unchanged or growing → full points
    trendText = `${change >= 0 ? "+" : ""}${Math.round(change * 100)}% core actions vs previous 30 days`;
  }
  add("Usage trend", 25, trend, trendText);
  add("Activation", 15, i.milestonesTotal ? i.milestonesDone / i.milestonesTotal : 0, `${i.milestonesDone} of ${i.milestonesTotal} milestones`);
  add("Budget runway", 10, i.budgetRunwayDays === null ? 1 : i.budgetRunwayDays / 14, i.budgetRunwayDays === null ? "No paid checks this month" : `${Math.round(i.budgetRunwayDays)} days of paid-check budget left at current pace`);
  add("Compliance health", 10, i.openCddFiles ? 1 - i.overdueRefreshes / i.openCddFiles : 1, `${i.overdueRefreshes} overdue refresh(es)`);
  add("Support", 10, i.pendingSupportRequests ? 0.5 : 1, `${i.pendingSupportRequests} pending support request(s)`);
  add("Payment health", 10, i.overdueInvoices ? 0 : 1, `${i.overdueInvoices} overdue invoice(s)`);

  const score = reasons.reduce((s, r) => s + r.points, 0);
  return { score, band: score >= 70 ? "green" : score >= 40 ? "amber" : "red", reasons };
}
