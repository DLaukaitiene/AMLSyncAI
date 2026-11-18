import { describe, expect, it } from "vitest";

describe("countries typed by hand", () => {
  it("are flagged for manual assessment and stop simplified due diligence", async () => {
    const { scoreClientRisk } = await import("./risk-scoring");
    const r = scoreClientRisk({
      clientType: "natural", countries: ["LT", "Somaliland"], highRiskThirdCountries: new Set(), isPep: false, isPepFamilyOrAssociate: false,
      deliveryChannel: "face-to-face", usesCash: false, ownershipLayers: 0, nomineeArrangements: false, productRisk: "low", unusualTransaction: false, adverseMediaConfirmed: false,
    } as never);
    expect(r.factors.map((x) => x.id)).toContain("unrecognised-country");
    expect(r.sddEligible).toBe(false);
  });
});
