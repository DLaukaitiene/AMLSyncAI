/**
 * Branch-by-branch ownership tracing (competitor review, recommendation 3).
 * Each gap in the structure (an owning entity with no owners recorded, or
 * shares not accounted for) is a branch to trace. A branch closes when:
 *  - the owners are added (it disappears from the gaps), or
 *  - the firm records why no further look-through is needed (declaration), or
 *  - all remaining open branches together can't reach the threshold, so no
 *    beneficial owner can exist through ownership in them (closed automatically).
 * [verify] the declaration reasons against AMLR Art. 51–55 and national practice.
 */
export const LOOK_THROUGH_REASONS: Record<string, string> = {
  listed: "Listed on an EU regulated market, or a market with equivalent disclosure rules",
  "public-body": "Public authority or state-owned body",
  "regulated-entity": "Credit or financial institution or investment fund supervised in the EU",
  dispersed: "Ownership is dispersed: no one holds 25% or more in this branch (per client or register)",
  "steps-exhausted": "Owners couldn't be identified despite the steps taken (record them below)",
};

export interface Branch { entityId: string; gap: "no-owners" | "unaccounted"; unaccountedPct?: number; effectivePct: number }
export interface BranchStatus extends Branch { status: "open" | "declared" | "below-threshold"; reason?: string }

export function traceBranches(branches: Branch[], declared: Map<string, string>, thresholdPct: number): { branches: BranchStatus[]; openCount: number; openPct: number } {
  const withDecl: BranchStatus[] = branches.map((b) => (declared.has(b.entityId) ? { ...b, status: "declared", reason: declared.get(b.entityId) } : { ...b, status: "open" }));
  const openPct = withDecl.filter((b) => b.status === "open").reduce((sum, b) => sum + b.effectivePct, 0);
  // Conservative: only when ALL remaining open branches together stay below the threshold.
  const out = openPct < thresholdPct - 1e-9 ? withDecl.map((b) => (b.status === "open" ? { ...b, status: "below-threshold" as const } : b)) : withDecl;
  return { branches: out, openCount: out.filter((b) => b.status === "open").length, openPct: Math.round(openPct * 10000) / 10000 };
}
