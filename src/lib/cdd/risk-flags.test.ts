import { describe, expect, it } from "vitest";
import { RISK_FLAGS, RISK_FLAG_IDS, tickedFlags } from "./risk-flags";
import { legalEntitySchema, naturalPersonSchema } from "./party";
import { scoreClientRisk } from "@/lib/rules/risk-scoring";
import { openCddItems } from "@/lib/rules/gates";

const base = {
  clientType: "legal" as const, countries: ["LT"], highRiskThirdCountries: new Set<string>(), isPep: false,
  deliveryChannel: "face-to-face" as const, usesCash: false, ownershipLayers: 0, nomineeArrangements: false, productRisk: "low" as const,
};
const flagInput = (ids: string[]) => tickedFlags({ riskFlags: ids }).filter((f) => f.points).map((f) => ({ id: f.id, label: f.label, points: f.points!, forcesHigh: f.forcesHigh, article: f.article }));

describe("high-risk flags", () => {
  it("have unique ids, an explanation and an effect", () => {
    expect(new Set(RISK_FLAGS.map((f) => f.id)).size).toBe(RISK_FLAGS.length);
    for (const f of RISK_FLAGS) {
      expect(f.help.length).toBeGreaterThan(20);
      expect(!!f.points || !!f.block).toBe(true);
    }
  });

  it("are kept by the schemas, unknown ids dropped", () => {
    const e = legalEntitySchema.parse({ name: "X UAB", riskFlags: ["personal-asset-vehicle", "made-up"] });
    expect(e.riskFlags).toEqual(["personal-asset-vehicle"]);
    const p = naturalPersonSchema.parse({ firstNames: "A", lastName: "B", riskFlags: "residence-by-investment" });
    expect(p.riskFlags).toEqual(["residence-by-investment"]);
    expect(RISK_FLAG_IDS).not.toContain("bearer-shares"); // stored under its older boolean key
  });

  it("add points to the risk score and can force EDD", () => {
    const r = scoreClientRisk({ ...base, flags: flagInput(["no-economic-activity", "owned-by-shell"]) });
    expect(r.factors.map((f) => f.id)).toEqual(expect.arrayContaining(["flag:no-economic-activity", "flag:owned-by-shell"]));
    expect(r.level).toBe("High");
    const w = scoreClientRisk({ ...base, flags: flagInput(["very-wealthy"]) });
    expect(w.eddRequired).toBe(true);
  });

  it("legacy bearer-share and nominee booleans count as ticked", () => {
    expect(tickedFlags({ bearerShares: true, nomineeArrangements: true }).map((f) => f.id)).toEqual(["bearer-shares", "nominee"]);
  });

  it("hard blocks can't be accepted", () => {
    const items = openCddItems({
      partyId: "p", role: "client", identityVerified: true, purposeRecorded: true, riskAssessed: true, eddRequired: false,
      openScreeningMatches: 0, trueSanctionsMatch: false,
      blockingFlags: tickedFlags({ riskFlags: ["bearer-warrants", "cash-over-limit"] }).filter((f) => f.block).map((f) => ({ id: f.id, message: f.block!, article: f.article })),
    } as never);
    expect(items.filter((i) => i.absolute).map((i) => i.id)).toEqual(["flag:bearer-warrants", "flag:cash-over-limit"]);
  });
});
