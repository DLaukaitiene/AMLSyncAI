import { describe, expect, it } from "vitest";
import { ART_9_2_ITEMS, buildPolicy, buildProcedures } from "./policy-builder";
import { defaultCountryProfile, parseCountryProfile } from "@/lib/rules/country-profile";

const input = (sectors: string[], onePersonFirm = false) => ({
  firm: { name: "JIP", sectors, memberState: "LT", onePersonFirm },
  officers: { complianceManager: "Anna", complianceOfficer: "Anna" },
  profile: defaultCountryProfile("LT"),
});

describe("Policy Builder (§11.3)", () => {
  it("has a section for every Art. 9(2) item", () => {
    const doc = buildPolicy(input(["ACCOUNTANT"]), 1, "2027-07-01");
    for (const item of ART_9_2_ITEMS) expect(doc.sections.map((s) => s.heading).join("|")).toContain(item.heading);
    expect(doc.sections).toHaveLength(ART_9_2_ITEMS.length);
  });

  it("is tailored to sector and Country Profile", () => {
    const p = parseCountryProfile({ memberState: "LT", cashCapEUR: 5000, fiu: { name: "FNTT", channel: "portal" } });
    if (!p.ok) throw new Error();
    const text = JSON.stringify(buildPolicy({ ...input(["ESTATE_AGENT", "HVG_TRADER"]), profile: p.profile }, 1, "x"));
    expect(text).toMatch(/both the buyer and the seller/);
    expect(text).toMatch(/customer and on our supplier/);
    expect(text).toMatch(/€5,000 or more/);
    expect(text).toMatch(/FNTT/);
    expect(JSON.stringify(buildPolicy(input(["ACCOUNTANT"]), 1, "x"))).toMatch(/Art\. 70\(2\)/);
  });

  it("one-person firms: Art. 13 and 14 don't apply", () => {
    const text = JSON.stringify(buildPolicy(input(["ACCOUNTANT"], true), 1, "x"));
    expect(text).toMatch(/one-person firm/);
    expect(text).not.toMatch(/Art\. 14/);
  });

  it("procedures are generated", () => {
    expect(buildProcedures(input(["ACCOUNTANT"]), 1, "x").sections.length).toBeGreaterThan(3);
  });
});
