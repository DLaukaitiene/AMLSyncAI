import { describe, expect, it } from "vitest";
import { parseCompanyPeople } from "./people";

describe("company people from the portal", () => {
  it("reads rows, skips empty ones, adds shareholder when a % is given", () => {
    const r = parseCompanyPeople({
      p0_name: "Jonas Jonaitis", p0_role_director: "on", p0_pct: "60", p0_birthDate: "1980-05-01", p0_nationality: "Lithuania", p0_pep: "no", p0_email: "jonas@example.lt",
      p1_name: "Holding SIA", p1_type: "company", p1_pct: "40", p1_regNo: "4000", p1_role_shareholder: "on",
      p2_name: "",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.people).toHaveLength(2);
    expect(r.people[0]).toMatchObject({ name: "Jonas Jonaitis", roles: ["director", "shareholder"], ownershipPct: 60, nationality: "LT", isPep: false, email: "jonas@example.lt", firstName: "Jonas", lastName: "Jonaitis" });
    expect(r.people[1]).toMatchObject({ entityType: "company", registrationNumber: "4000", ownershipPct: 40 });
  });
  it("asks for a director, dates of birth, PEP answers and sane percentages", () => {
    const r = parseCompanyPeople({ p0_name: "Ona", p0_role_shareholder: "on", p0_pct: "120" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.fieldErrors).sort()).toEqual(["p0_birthDate", "p0_name", "p0_pct", "p0_pep"]);
  });
  it("needs at least one person", () => expect(parseCompanyPeople({}).ok).toBe(false));
});
