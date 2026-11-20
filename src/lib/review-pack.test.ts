import { describe, expect, it } from "vitest";
import { buildReviewPack } from "./review-pack";
import { countryProfileSchema } from "@/lib/rules/country-profile";

describe("review pack", () => {
  const profile = countryProfileSchema.parse({ memberState: "LT" });
  const doc = buildReviewPack({ firmName: "Test UAB", sectors: ["ESTATE_AGENT"], profile, profileVersion: 1, txCashThresholdEUR: 3000, txHighValueThresholdEUR: 50000 });
  it("covers every rule area and the reviewer's record", () => {
    expect(doc.sections.map((s) => s.id)).toEqual(["how", "thresholds", "national", "checks", "risk", "look-through", "scope", "flags", "obligations", "duties", "automation", "sector", "review"]);
  });
  it("is built from the live rules: thresholds, check table, sector notes", () => {
    const text = JSON.stringify(doc);
    expect(text).toContain("€10,000 or more");
    expect(text).toContain("Identity check (eID, document or in person)");
    expect(text).toContain("buyer and the seller");
    expect(text).not.toContain("Dealers check every buyer");
    expect(text).toContain("FIU and reporting channel");
  });
});
