import { describe, expect, it } from "vitest";
import fixture from "./fixtures/kyb-ubo-sandbox.json";
import { kybInactive, mapKybCompany } from "./map";

describe("Didit company register check (sandbox response)", () => {
  const k = mapKybCompany(fixture.kyb_registry as Record<string, unknown>, fixture.registry_tier_delivered);
  it("maps the company", () => {
    expect(k).toMatchObject({ name: "Sandbox Holdings Ltd", registrationNumber: "SANDBOX-0001", country: "GB", legalForm: "Private Limited Company", registryStatus: "active", incorporationDate: "2010-01-01", tierDelivered: "ubo", sandbox: true });
    expect(kybInactive(k)).toBe(false);
  });
  it("merges officers, shareholders and beneficial owners into one list of people", () => {
    expect(k.people.map((p) => [p.name, p.entityType, p.roles.join("+"), p.ownershipPct, p.effectivePct])).toEqual([
      ["Alex Sandbox", "person", "director+officer", null, null],
      ["Sandbox Group Holdings Ltd", "company", "shareholder", 60, 60],
      ["Sam Sandbox", "person", "shareholder+ubo", 40, 40],
      ["Jordan Sandbox", "person", "ubo", null, 60],
    ]);
  });
  it("flags companies that aren't active", () => {
    expect(kybInactive({ ...k, registryStatus: "dissolved" })).toBe(true);
    expect(kybInactive({ ...k, registryStatus: "struck_off" })).toBe(true);
  });
});
