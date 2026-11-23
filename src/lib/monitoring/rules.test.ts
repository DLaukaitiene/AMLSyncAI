import { describe, expect, it } from "vitest";
import { normalizeFlags, runRules, statusFor, type RuleContext, type RuleId, type RuleTx } from "./rules";

const tx = (over: Partial<RuleTx> = {}): RuleTx => ({ id: "t", date: "2026-11-20", amountEUR: 100, method: "bank-transfer", occasional: false, thirdPartyPayer: false, fromCountry: null, ...over });
const ctx = (over: Partial<RuleContext> = {}, settings: Partial<RuleContext["settings"]> = {}): RuleContext => ({
  settings: { cashThresholdEUR: 3000, cashLegalLimitEUR: 5000, highValueThresholdEUR: 50000, occasionalThresholdEUR: 10000, rulesOff: [], ...settings },
  highRiskCountries: new Set(["IR"]), kycComplete: true, clientHighRisk: false, clientIsPep: false, history: [], ...over,
});
const fired = (t: RuleTx, c: RuleContext) => runRules(t, c).map((f) => f.rule);
const h = (id: string, date: string, amountEUR: number, method = "cash", occasional = false) => tx({ id, date, amountEUR, method, occasional });

// For each rule: one case that triggers it, one just below, and the same trigger with the rule switched off.
const cases: [RuleId, RuleTx, RuleContext, RuleTx, RuleContext][] = [
  ["R1", tx({ method: "cash", amountEUR: 3000 }), ctx(), tx({ method: "cash", amountEUR: 2999.99 }), ctx()],
  ["R2", tx({ method: "cash", amountEUR: 5000.01 }), ctx(), tx({ method: "cash", amountEUR: 5000 }), ctx()],
  ["R3", tx({ method: "cash", amountEUR: 2000 }), ctx({ history: [h("a", "2026-11-01", 2000), h("b", "2026-11-10", 2000)] }), tx({ method: "cash", amountEUR: 2000 }), ctx({ history: [h("a", "2026-10-20", 2000), h("b", "2026-11-10", 2000)] })],
  ["R4", tx({ amountEUR: 50000 }), ctx(), tx({ amountEUR: 49999 }), ctx()],
  ["R5", tx({ amountEUR: 6000, occasional: true }), ctx({ history: [h("a", "2026-11-05", 4000, "bank-transfer", true)] }), tx({ amountEUR: 6000, occasional: true }), ctx({ history: [h("a", "2026-11-05", 3999, "bank-transfer", true)] })],
  ["R6", tx({ thirdPartyPayer: true }), ctx(), tx({ thirdPartyPayer: false }), ctx()],
  ["R7", tx({ fromCountry: "ir" }), ctx(), tx({ fromCountry: "LT" }), ctx()],
  ["R8", tx({ amountEUR: 3001 }), ctx({ history: [h("a", "2026-03-01", 1000, "card"), h("b", "2026-06-01", 1000, "card"), h("c", "2026-09-01", 1000, "card")] }), tx({ amountEUR: 3000 }), ctx({ history: [h("a", "2026-03-01", 1000, "card"), h("b", "2026-06-01", 1000, "card"), h("c", "2026-09-01", 1000, "card")] })],
  ["R9", tx(), ctx({ kycComplete: false }), tx(), ctx({ kycComplete: true })],
  ["R10", tx({ method: "cash", amountEUR: 2000 }), ctx({ history: [h("a", "2026-09-01", 1000), h("b", "2026-10-01", 3000)] }), tx({ method: "cash", amountEUR: 2000 }), ctx({ history: [h("a", "2026-08-01", 1000), h("b", "2026-10-01", 3000)] })],
  ["R11", tx({ method: "crypto" }), ctx(), tx({ method: "card" }), ctx()],
  ["R12", tx({ amountEUR: 10000 }), ctx({ clientIsPep: true }), tx({ amountEUR: 9999 }), ctx({ clientIsPep: true })],
  ["R13", tx({ amountEUR: 9500 }), ctx({ history: [tx({ id: "a", date: "2026-11-01", amountEUR: 9900 })] }), tx({ amountEUR: 9500 }), ctx({ history: [tx({ id: "a", date: "2026-11-01", amountEUR: 10000 })] })],
];

describe("monitoring rules", () => {
  for (const [rule, hit, hitCtx, miss, missCtx] of cases) {
    it(`${rule}: triggers, not just below, not when switched off`, () => {
      expect(fired(hit, hitCtx)).toContain(rule);
      expect(fired(miss, missCtx)).not.toContain(rule);
      expect(fired(hit, { ...hitCtx, settings: { ...hitCtx.settings, rulesOff: [rule] } })).not.toContain(rule);
    });
  }

  it("R3: three cash payments of €2,000 within 30 days with a €5,000 limit → flagged on the third", () => {
    const p1 = h("1", "2026-11-01", 2000), p2 = h("2", "2026-11-10", 2000), p3 = h("3", "2026-11-20", 2000);
    expect(fired(p2, ctx({ history: [p1] }))).not.toContain("R3");
    const f = runRules(p3, ctx({ history: [p1, p2] })).find((x) => x.rule === "R3")!;
    expect(f.severity).toBe("high");
    expect(f.message).toBe("Linked cash payments total €6,000 in 30 days — possible splitting to avoid the limit.");
  });

  it("status: high → flagged, medium/low → pending, none → clear", () => {
    expect(statusFor(runRules(tx({ method: "cash", amountEUR: 6000 }), ctx()))).toBe("flagged");
    expect(statusFor(runRules(tx({ thirdPartyPayer: true }), ctx()))).toBe("pending");
    expect(statusFor(runRules(tx(), ctx()))).toBe("clear");
  });

  it("thresholds come from the firm's settings", () => {
    expect(fired(tx({ method: "cash", amountEUR: 2500 }), ctx({}, { cashThresholdEUR: 2000 }))).toContain("R1");
  });

  it("old {code, text} flags are shown in the new shape", () => {
    expect(normalizeFlags([{ code: "cash", text: "Cash payment" }])[0]).toMatchObject({ rule: "cash", message: "Cash payment", severity: "medium" });
  });
});
