import { describe, expect, it } from "vitest";
import { parseAmlSyncList, parseCsv, parseEuFsfCsv, ListFormatError } from "./csv";

describe("CSV parsing", () => {
  it("handles quotes, escaped quotes, newlines and semicolons", () => {
    expect(parseCsv('a,b\n"x, ""y""",z\n')).toEqual([["a", "b"], ['x, "y"', "z"]]);
    expect(parseCsv("a;b\r\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("parses the AMLSyncAI list format", () => {
    const e = parseAmlSyncList('type,name,aliases,birth_dates,countries,reference\nperson,Ivan Sidorov,"Ivan Sidorow|I. Sidorov",1965-04-12,ru,X-1\nentity,Example Trading UAB,,,LT,\n');
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({ entityType: "person", names: ["Ivan Sidorov", "Ivan Sidorow", "I. Sidorov"], countries: ["RU"], reference: "X-1" });
    expect(e[1].normalized).toEqual(["example trading"]);
  });

  it("rejects bad files with a clear message", () => {
    expect(() => parseAmlSyncList("name\nX")).toThrow(ListFormatError);
    expect(() => parseAmlSyncList("type,name\nanimal,X")).toThrow(/person.*entity/);
    expect(() => parseAmlSyncList("type,name,birth_dates\nperson,X,14.03.1985")).toThrow(/YYYY/);
  });

  it("groups EU FSF rows by entity", () => {
    const csv = [
      "Entity_LogicalId;Entity_SubjectType_ClassificationCode;NameAlias_WholeName;BirthDate_BirthDate;Citizenship_CountryIso2Code;Entity_Regulation_Programme",
      "13;person;Saddam Hussein Al-Tikriti;1937-04-28;IQ;IRQ",
      "13;person;Abu Ali;;;IRQ",
      "20;enterprise;Example Bank;;;RUS",
    ].join("\n");
    const e = parseEuFsfCsv(csv);
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({ entityType: "person", names: ["Saddam Hussein Al-Tikriti", "Abu Ali"], birthDates: ["1937-04-28"], countries: ["IQ"] });
    expect(e[1].entityType).toBe("entity");
  });
});
