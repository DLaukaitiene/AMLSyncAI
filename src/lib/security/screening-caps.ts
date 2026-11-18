/**
 * Screening limits (spec §8C.4, §11.14): AMLSync App must not become a free
 * lookup service. Every screening a person starts (EU/UN lists or provider
 * screening) counts against per-minute, per-day and per-month limits, set per
 * firm and adjustable by AMLSync App. Automatic re-screening of existing clients
 * (list updates, monitoring, refresh runs) is not limited.
 */
export const DEFAULT_LIMITS = { perMinute: 5, perDay: 30, perMonth: 100 } as const;

export interface Limits { perMinute: number; perDay: number; perMonth: number }
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
  "For your security there is a limit on screenings. Please contact us at contact@amlsync.com and we will adjust your limit within 1 business day.";

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
