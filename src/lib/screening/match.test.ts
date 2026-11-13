import { describe, expect, it } from "vitest";
import { nameSimilarity, normalizeName, screenSubject, type ListEntry } from "./match";

const list: ListEntry[] = [
  { id: "1", entityType: "person", names: ["Ivan Petrovich SIDOROV", "Ivan Sidorov"], birthDates: ["1965-04-12"], countries: ["RU"] },
  { id: "2", entityType: "entity", names: ["Rosneft Trading S.A."], birthDates: [], countries: ["CH"] },
  { id: "3", entityType: "person", names: ["Maria Gonzalez"], birthDates: ["1980"], countries: ["VE"] },
];

describe("screening name matching", () => {
  it("normalises diacritics, case, order and legal forms", () => {
    expect(normalizeName("Jonaitė, Anna")).toBe("anna jonaite");
    expect(normalizeName("UAB „Žalgiris“", true)).toBe("zalgiris");
    expect(normalizeName("Müller GmbH", true)).toBe(normalizeName("MULLER", true));
  });

  it("matches reversed order, missing middle name and transliteration variants", () => {
    expect(screenSubject({ name: "Sidorov Ivan", entity: false }, list).map((m) => m.entryId)).toEqual(["1"]);
    expect(screenSubject({ name: "Ivan Sidorow", entity: false }, list).map((m) => m.entryId)).toEqual(["1"]);
  });

  it("matches entities regardless of legal form", () => {
    expect(screenSubject({ name: "ROSNEFT TRADING SA", entity: true }, list).map((m) => m.entryId)).toEqual(["2"]);
  });

  it("does not match clearly different names, or persons against entities", () => {
    expect(screenSubject({ name: "Anna Jonaitė", entity: false }, list)).toEqual([]);
    expect(screenSubject({ name: "Ivan Sidorov", entity: true }, list)).toEqual([]);
    expect(nameSimilarity("ivan sidorov", "petras jonaitis")).toBeLessThan(0.7);
  });

  it("keeps a strong name match with a different DOB but ranks and explains it", () => {
    const m = screenSubject({ name: "Ivan Sidorov", entity: false, birthDate: "1990-01-01" }, list);
    expect(m[0]).toMatchObject({ entryId: "1", dobMismatch: true });
    expect(m[0].reasons.join(" ")).toMatch(/Different date of birth/);
    const same = screenSubject({ name: "Ivan Sidorov", entity: false, birthDate: "1965-04-12", countries: ["RU"] }, list);
    expect(same[0].reasons).toEqual(expect.arrayContaining(["Same date of birth", "Shared country: RU"]));
  });
});
