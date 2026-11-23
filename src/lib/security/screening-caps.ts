/**
 * Screening limits (spec §8C.4, §11.14): AMLSync App must not become a free
 * lookup service. Every screening a person starts (EU/UN lists or provider
 * screening) counts against per-minute, per-day and per-month limits, set per
 * firm and adjustable by AMLSync App. Automatic re-screening of existing clients
 * (list updates, monitoring, refresh runs) is not limited.
 */
export const DEFAULT_LIMITS = { perMinute: 5, perDay: 30, perMonth: 100 } as const;

export interface Limits { perMinute: number; perDay: number; perMonth: number }

/** Limits that come with each plan [decided 20 Nov 2026]. A firm's own limits, raised by AMLSync App, apply when higher. */
export const PLAN_LIMITS: Record<string, Limits> = {
  solo: { perMinute: 5, perDay: 30, perMonth: 100 },
  starter: { perMinute: 10, perDay: 200, perMonth: 500 },
  custom: { perMinute: 10, perDay: 200, perMonth: 500 },
};
/** Extra screenings a firm can buy itself [decided 23 Nov 2026]: 30 for €10, added to this month (and to today's limit). */
export const SCREEN_PACK = { screenings: 30, cents: 1000 } as const;
export const SCREEN_PACK_REF = "Extra screenings";

/** Limits plus the packs bought: each pack adds to this month, and to today's limit if bought today. */
export function withPacks(l: Limits, packsThisMonth: number, packsToday: number): Limits {
  return { perMinute: l.perMinute, perDay: l.perDay + SCREEN_PACK.screenings * packsToday, perMonth: l.perMonth + SCREEN_PACK.screenings * packsThisMonth };
}

export function effectiveLimits(plan: string, firm: Limits): Limits {
  const p = PLAN_LIMITS[plan] ?? PLAN_LIMITS.starter;
  return { perMinute: Math.max(p.perMinute, firm.perMinute), perDay: Math.max(p.perDay, firm.perDay), perMonth: Math.max(p.perMonth, firm.perMonth) };
}
export interface Used { lastMinute: number; today: number; thisMonth: number }
export type LimitKind = "minute" | "day" | "month";

/** How many of the requested screenings may run now, and which limit stops the rest. */
export function allowedNow(limits: Limits, used: Used, requested: number): { allowed: number; limitedBy: LimitKind | null } {
  const room: [LimitKind, number][] = [
    ["minute", limits.perMinute - used.lastMinute],
    ["day", limits.perDay - used.today],
    ["month", limits.perMonth - used.thisMonth],
  ];
  const [kind, free] = room.reduce((a, b) => (b[1] < a[1] ? b : a));
  const allowed = Math.max(0, Math.min(requested, free));
  return { allowed, limitedBy: allowed < requested ? kind : null };
}

export const LIMIT_MESSAGE =
  "For your security there is a limit on screenings. To continue now, buy 30 more screenings for €10.00 on the Dashboard or under Billing; for a higher limit, press \"Request more screenings\" or write to contact@amlsync.com.";

export function limitMessage(kind: LimitKind, limits: Limits): string {
  const which = kind === "minute" ? `${limits.perMinute} per minute` : kind === "day" ? `${limits.perDay} per day` : `${limits.perMonth} per month`;
  return kind === "minute"
    ? `You've reached the limit of ${which}. Wait a minute and try again. ${LIMIT_MESSAGE}`
    : `You've reached your screening limit (${which}). ${LIMIT_MESSAGE}`;
}

/** Many more screenings today than the firm has active clients → review (e.g. more than 5× and over 50). */
export function unusualVolume(screenedToday: number, activeParties: number): boolean {
  return screenedToday > 50 && screenedToday > 5 * Math.max(activeParties, 1);
}
