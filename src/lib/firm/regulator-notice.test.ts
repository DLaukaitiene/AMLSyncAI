import { describe, expect, it } from "vitest";
import { emailOf, regulatorNotice } from "./regulator-notice";

const base = {
  firm: { name: "Acme UAB", country: "Lithuania" },
  person: { name: "Dana Doe", email: "dana@acme.lt" },
  fromDate: "2026-11-27",
  sender: { name: "Owner One", email: "owner@acme.lt" },
};

describe("regulatorNotice", () => {
  it("first appointment of a Compliance Officer", () => {
    const n = regulatorNotice({ ...base, fn: "compliance-officer" });
    expect(n.subject).toBe("Acme UAB: appointment of Compliance Officer (AMLR Article 11)");
    expect(n.body).toContain("Name: Dana Doe");
    expect(n.body).toContain("Effective from: 2026-11-27");
    expect(n.body).not.toContain("replaces");
  });
  it("a change names the predecessor and the reason", () => {
    const n = regulatorNotice({ ...base, fn: "compliance-manager", previous: { name: "Old Boss", fromDate: "2024-01-01", toDate: "2026-11-26", reason: "Retired" }, other: { name: "Dana Doe", email: "dana@acme.lt" } });
    expect(n.subject).toContain("change of responsible member of management");
    expect(n.body).toContain("replaces Old Boss, who held the role from 2024-01-01 to 2026-11-26");
    expect(n.body).toContain("Reason for the change: Retired.");
    expect(n.body).toContain("our Compliance Officer is Dana Doe");
  });
  it("finds an email address in a supervisor channel", () => {
    expect(emailOf("Email: aml@fntt.lt")).toBe("aml@fntt.lt");
    expect(emailOf("https://portal.example")).toBeNull();
  });
});
