import { describe, expect, it } from "vitest";
import { flagTransaction, type FlagContext } from "./transaction-flags";

const ctx: FlagContext = { cashThresholdEUR: 3000, highValueThresholdEUR: 50000, history: [] };
const tx = (o: Partial<Parameters<typeof flagTransaction>[0]>) => ({ id: "n", date: "2026-11-19", amountEUR: 100, method: "bank-transfer", ...o });
const codes = (t: Parameters<typeof flagTransaction>[0], c = ctx) => flagTransaction(t, c).map((f) => f.code);

describe("transaction red flags", () => {
  it("ordinary bank transfer: no flags", () => expect(codes(tx({ amountEUR: 2500 }))).toEqual([]));
  it("cash at the threshold", () => expect(codes(tx({ method: "cash", amountEUR: 3000 }))).toEqual(["cash"]));
  it("cash split within 24 hours", () => {
    const history = [tx({ id: "a", method: "cash", amountEUR: 2000, date: "2026-11-19" })];
    expect(codes(tx({ method: "cash", amountEUR: 1500 }), { ...ctx, history })).toEqual(["cash-24h"]);
    const older = [tx({ id: "a", method: "cash", amountEUR: 2000, date: "2026-11-15" })];
    expect(codes(tx({ method: "cash", amountEUR: 1500 }), { ...ctx, history: older })).toEqual([]);
  });
  it("high value", () => expect(codes(tx({ amountEUR: 50000 }))).toEqual(["high-value"]));
  it("payments just below €10,000 within 30 days", () => {
    const history = [tx({ id: "a", amountEUR: 9800, date: "2026-11-01" })];
    expect(codes(tx({ amountEUR: 9500 }), { ...ctx, history })).toEqual(["structuring"]);
    expect(codes(tx({ amountEUR: 9500 }))).toEqual([]);
  });
  it("crypto, third-party payer, high-risk country", () => {
    expect(codes(tx({ method: "crypto", thirdPartyPayer: true, fromCountry: "kp" }))).toEqual(["crypto", "third-party", "high-risk-country"]);
    expect(codes(tx({ fromCountry: "DE" }))).toEqual([]);
  });
  it("large payment from a high-risk or PEP client", () => {
    expect(codes(tx({ amountEUR: 12000 }), { ...ctx, clientIsPep: true })).toEqual(["high-risk-client"]);
    expect(flagTransaction(tx({ amountEUR: 12000 }), { ...ctx, clientIsPep: true })[0].text).toContain("PEP");
    expect(codes(tx({ amountEUR: 5000 }), { ...ctx, clientHighRisk: true })).toEqual([]);
  });
});
