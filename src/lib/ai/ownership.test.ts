import { describe, expect, it } from "vitest";
import { costCents, draftToPeople, OWNERSHIP_AI_CAP_CENTS } from "./ownership";

describe("AI ownership draft", () => {
  it("maps roles and drops impossible percentages", () => {
    const p = draftToPeople({ documentType: "register", warnings: [], people: [
      { name: " Jonas ", entityType: "person", roles: ["shareholder", "beneficial-owner"], ownershipPct: 60, registrationNumber: null, birthDate: "1975-04-02", nationality: "LT" },
      { name: "X", entityType: "company", roles: ["trustee"], ownershipPct: 140, registrationNumber: "123", birthDate: "April 1975", nationality: null },
      { name: "  ", entityType: "person", roles: [], ownershipPct: null, registrationNumber: null, birthDate: null, nationality: null },
    ] });
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ name: "Jonas", roles: ["shareholder", "ubo"], ownershipPct: 60, birthDate: "1975-04-02" });
    expect(p[1].ownershipPct).toBeNull();
    expect(p[1].birthDate).toBeUndefined();
    expect(p[1].roles).toEqual(["trustee"]);
  });
  it("prices tokens at Opus rates and the cap allows real use", () => {
    expect(costCents(1_000_000, 0)).toBe(400);
    expect(costCents(20_000, 2_000)).toBeCloseTo(12);
    expect(OWNERSHIP_AI_CAP_CENTS / costCents(20_000, 2_000)).toBeGreaterThan(20);
  });
});
