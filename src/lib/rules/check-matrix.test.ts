import { describe, expect, it } from "vitest";
import { checkSatisfied, requiredCheck } from "./check-matrix";

const ev = { identityVerified: false, registerExtract: false, documentOnFile: false, fromRegister: false, clientRegisterChecked: false, identified: true, screened: true };

describe("who needs which check", () => {
  it("clients: persons are verified, entities from the register", () => {
    expect(requiredCheck("natural", ["client"], { edd: false }).level).toBe("full");
    expect(requiredCheck("legal", ["client"], { edd: false }).level).toBe("register");
  });
  it("beneficial owners: reasonable measures, full check when high risk", () => {
    expect(requiredCheck("natural", ["beneficial-owner"], { edd: false }).level).toBe("reasonable");
    expect(requiredCheck("natural", ["beneficial-owner"], { edd: true }).level).toBe("full");
  });
  it("minority owners are screened only; trustees and nominees are verified", () => {
    expect(requiredCheck("natural", ["minority-owner"], { edd: false }).level).toBe("screen-only");
    expect(requiredCheck("natural", ["trustee"], { edd: false }).level).toBe("full");
    expect(requiredCheck("natural", ["nominee"], { edd: false }).level).toBe("full");
    expect(requiredCheck("legal", ["nominee"], { edd: false }).level).toBe("register");
  });
  it("several roles → the strictest; unknown role or type → strictest", () => {
    expect(requiredCheck("natural", ["minority-owner", "trustee"], { edd: false }).level).toBe("full");
    expect(requiredCheck("natural", [], { edd: false }).level).toBe("full");
    expect(requiredCheck("unknown", ["unknown"], { edd: false }).level).toBe("full");
    expect(requiredCheck("legal", ["unknown"], { edd: false }).level).toBe("register");
  });
  it("evidence", () => {
    expect(checkSatisfied("reasonable", ev)).toBe(false);
    expect(checkSatisfied("reasonable", { ...ev, clientRegisterChecked: true })).toBe(true);
    expect(checkSatisfied("full", { ...ev, documentOnFile: true })).toBe(false);
    expect(checkSatisfied("full", { ...ev, identityVerified: true })).toBe(true);
    expect(checkSatisfied("screen-only", ev)).toBe(true);
  });
});

describe("identification-only scope", () => {
  it("keeps identification, sanctions and screening; drops verification, BO, purpose and EDD", async () => {
    const { openCddItems, openMatterItems } = await import("./gates");
    const base = { partyId: "c", role: "client" as const, identityVerified: false, boResolved: false, purposeRecorded: false, riskAssessed: true, eddRequired: true, openScreeningMatches: 1, trueSanctionsMatch: false, missingChecks: [{ name: "X", label: "Identity check" }] };
    const full = openCddItems(base).map((i) => i.id);
    expect(full).toEqual(expect.arrayContaining(["identity", "beneficial-owners", "purpose", "edd", "screening", "people-checks"]));
    const idOnly = openCddItems({ ...base, scope: "identification-only", clientIdentified: false }).map((i) => i.id);
    expect(idOnly.sort()).toEqual(["identification", "screening"]);
    const m = openMatterItems({ sector: "estate-agent", type: "property-sale", files: [{ ...base, scope: "identification-only", clientIdentified: true, openScreeningMatches: 0, role: "buyer" }], transactionHold: false });
    expect(m.some((i) => i.id.endsWith("out-of-scope-matter"))).toBe(true);
  });
});
