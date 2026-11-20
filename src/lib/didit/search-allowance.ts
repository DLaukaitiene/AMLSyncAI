/**
 * Free company-register searches [decided 20 Nov 2026]. Each successful Didit
 * search costs AMLSync $0.50, so a firm gets a run of free searches between
 * orders: Solo 6, other plans 10. Reaching it pauses searching for 5 days; buying
 * a pack (5 more, priced by the pricing rule) or ordering a company check starts the count again.
 */
export const SEARCHES_BEFORE_ORDER: Record<string, number> = { solo: 6, starter: 10, custom: 10 };
export const SEARCH_PACK = { searches: 5 }; // price: pricing rule (5 × $0.50 + margin), src/lib/didit/pricing.ts
export const SEARCH_PAUSE_DAYS = 5;

export interface SearchState { blocked: boolean; remaining: number; blockedUntil: Date | null; limit: number }

export function searchState(plan: string, searches: Date[], orders: Date[], packs: Date[], now = new Date()): SearchState {
  const base = SEARCHES_BEFORE_ORDER[plan] ?? 10;
  const lastOrder = orders.reduce<Date | null>((a, d) => (!a || d > a ? d : a), null);
  let resetAt = lastOrder ?? new Date(0);
  for (;;) {
    const after = searches.filter((s) => s > resetAt).sort((a, b) => +a - +b);
    const allowance = base + SEARCH_PACK.searches * packs.filter((p) => p > resetAt).length;
    if (after.length < allowance) return { blocked: false, remaining: allowance - after.length, blockedUntil: null, limit: allowance };
    const until = new Date(after[allowance - 1].getTime() + SEARCH_PAUSE_DAYS * 86_400_000);
    if (now < until) return { blocked: true, remaining: 0, blockedUntil: until, limit: allowance };
    resetAt = until;
  }
}
