import { describe, expect, it } from "vitest";
import { checkSectoralSanctions } from "./sectoral-sanctions";

describe("Russia/Belarus rule pack (§11.8)", () => {
  it("blocks accounting/tax/consulting services to a Russian-established entity", () => {
    const r = checkSectoralSanctions({ firmSectors: ["ACCOUNTANT"], client: { kind: "LEGAL", countryOfCreation: "RU" } });
    expect(r.map((x) => x.rule)).toEqual(["services-ban"]);
    expect(r[0].explanation).toMatch(/prohibited/);
  });
  it("covers Belarus too, but not a Russian national as a private person", () => {
    expect(checkSectoralSanctions({ firmSectors: ["LEGAL"], client: { kind: "LEGAL", countryOfCreation: "BY" } })).toHaveLength(1);
    expect(checkSectoralSanctions({ firmSectors: ["ACCOUNTANT"], client: { kind: "NATURAL", residenceCountry: "RU" } })).toEqual([]);
  });
  it("blocks luxury goods to persons in Russia above €300 per item", () => {
    expect(checkSectoralSanctions({ firmSectors: ["HVG_TRADER"], client: { kind: "NATURAL", residenceCountry: "RU" } }).map((x) => x.rule)).toEqual(["luxury-goods-ban"]);
    expect(checkSectoralSanctions({ firmSectors: ["HVG_TRADER"], client: { kind: "NATURAL", residenceCountry: "LT" }, goods: { destinationCountry: "RU", valuePerItemEUR: 250 } })).toEqual([]);
    expect(checkSectoralSanctions({ firmSectors: ["HVG_TRADER"], client: { kind: "NATURAL", residenceCountry: "LT" } })).toEqual([]);
  });
});
