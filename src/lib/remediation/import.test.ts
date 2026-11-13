import { describe, expect, it } from "vitest";
import { gapsFor, parseBackBook, priority } from "./import";

const CSV = `type,first_names,last_name,name,birth_date,nationalities,residence_country,address,registration_number,country,email,purpose,last_cdd_date,pep,documents
person,Jonas,Jonaitis,,1980-05-01,LT,LT,Vilnius,,,jonas@x.lt,Tax returns,2024-01-10,no,id
company,,,Baltic Trade UAB,,,,,304000000,LT,,Bookkeeping,2019-03-01,,extract
person,,,Ona Onaitė,,,,,,,,,,yes,
animal,,,Rex,,,,,,,,,,,
person,,,X,14.03.1985,,,,,,,,,,`;

describe("back-book import (§11.4)", () => {
  it("parses people and companies and reports bad rows with line numbers", () => {
    const { rows, errors } = parseBackBook(CSV);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: "NATURAL", name: "Jonas Jonaitis", nationalities: ["LT"], documents: ["id"] });
    expect(rows[2]).toMatchObject({ firstNames: "Ona", lastName: "Onaitė", isPep: true });
    expect(errors).toEqual([{ line: 5, message: 'type must be "person" or "company".' }, { line: 6, message: "birth_date must be YYYY-MM-DD." }]);
  });

  it("finds gaps against the new CDD data set", () => {
    const { rows } = parseBackBook(CSV);
    expect(gapsFor(rows[0], "2027-07-10")).toEqual([]);
    expect(gapsFor(rows[1], "2027-07-10").map((g) => g.id)).toEqual(["beneficial-owners", "stale-cdd"]);
    expect(gapsFor(rows[2], "2027-07-10").map((g) => g.id)).toEqual(["birth-date", "nationalities", "residence", "id-verification", "purpose", "last-cdd"]);
  });

  it("puts high-risk files first", () => {
    expect(priority("High", 1)).toBeGreaterThan(priority("Medium", 9));
    expect(priority("Low", 5)).toBeGreaterThan(priority("Low", 2));
  });

  it("handles 1,000 rows quickly", () => {
    const body = Array.from({ length: 1000 }, (_, i) => `person,First${i},Last${i},,1980-01-01,LT,LT,Addr,,,,,2025-01-01,,id`).join("\n");
    const t = Date.now();
    const { rows } = parseBackBook("type,first_names,last_name,name,birth_date,nationalities,residence_country,address,registration_number,country,email,purpose,last_cdd_date,pep,documents\n" + body);
    expect(rows).toHaveLength(1000);
    expect(Date.now() - t).toBeLessThan(1000);
  });
});
