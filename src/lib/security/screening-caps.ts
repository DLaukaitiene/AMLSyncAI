/**
 * Screening abuse protection (spec §8C.4, §11.14): AMLSyncAI must not become a
 * free lookup service. Screening runs only for parties in the firm's records,
 * with a hard daily cap per plan and an alert on unusual volumes.
 * System re-screening (list updates, refresh runs) is not capped.
 */
export const DAILY_SCREENING_CAP: Record<string, number> = {
  starter: 1_000,
  professional: 5_000,
  business: 50_000,
};

export function dailyCap(plan: string): number {
  return DAILY_SCREENING_CAP[plan] ?? DAILY_SCREENING_CAP.starter;
}

/** How many of the requested parties may be screened now. */
export function allowedNow(plan: string, screenedToday: number, requested: number): number {
  return Math.max(0, Math.min(requested, dailyCap(plan) - screenedToday));
}

/** Many more screenings today than the firm has active clients → review (e.g. more than 5× and over 50). */
export function unusualVolume(screenedToday: number, activeParties: number): boolean {
  return screenedToday > 50 && screenedToday > 5 * Math.max(activeParties, 1);
}
