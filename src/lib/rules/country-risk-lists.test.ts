import { describe, expect, it } from "vitest";
import { scoreClientRisk, RISK_RULESET_VERSION, type RiskInput } from "./risk-scoring";
import {
  COUNTRY_RISK_LISTS, COUNTRY_RISK_LISTS_VERSION, CPI_SCORES, DEFAULT_CPI_THRESHOLD, MAX_CPI_THRESHOLD, FATF_GREY_LIST,
} from "./country-risk-lists";
import { EU_HIGH_RISK_THIRD_COUNTRIES, COUNTERMEASURE_COUNTRIES } from "./high-risk-countries";
import { defaultCountryProfile, parseCountryProfile } from "./country-profile";
import { isKnownCountry } from "@/lib/geo/countries";
import { RISK_FLAGS } from "@/lib/cdd/risk-flags";

const base: RiskInput = {
  clientType: "natural", countries: ["LT"], highRiskThirdCountries: EU_HIGH_RISK_THIRD_COUNTRIES, countermeasureCountries: COUNTERMEASURE_COUNTRIES,
  isPep: false, deliveryChannel: "face-to-face", usesCash: false, ownershipLayers: 0, nomineeArrangements: false, productRisk: "low",
};
const factor = (countries: string[], id: string, input: Partial<RiskInput> = {}, profile = defaultCountryProfile("LT")) =>
  scoreClientRisk({ ...base, ...input, countries }, profile).factors.find((f) => f.id === `country-list:${id}`);

describe("country risk lists (Annex III point 3)", () => {
  it("hold only known ISO codes and carry a source and date", () => {
    for (const l of COUNTRY_RISK_LISTS) {
      expect(l.source.length).toBeGreaterThan(2);
      expect(l.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const c of l.codes) expect(isKnownCountry(c), `${l.id}: ${c}`).toBe(true);
    }
    for (const [c, s] of Object.entries(CPI_SCORES)) {
      expect(isKnownCountry(c), c).toBe(true);
      expect(s).toBeLessThan(MAX_CPI_THRESHOLD);
    }
  });

  it("are versioned in the stored rule-set version", () => {
    expect(RISK_RULESET_VERSION).toContain(COUNTRY_RISK_LISTS_VERSION);
    expect(COUNTRY_RISK_LISTS_VERSION).toContain(`fatf-${FATF_GREY_LIST.asOf}`);
  });

  it("a client in an EU member state gets no country factor", () => {
    const r = scoreClientRisk(base, defaultCountryProfile("LT"));
    expect(r.factors.filter((f) => f.id.startsWith("country-list:"))).toEqual([]);
    expect(r.level).toBe("Low");
  });

  it("FATF grey list: 3 points, names the list, date and country, and doesn't force High", () => {
    const f = factor(["LT", "BG"], "fatf-grey-list")!;
    expect(f.points).toBe(3);
    expect(f.forcesHigh).toBeFalsy();
    expect(f.countries).toEqual(["BG"]);
    expect(f.list).toMatchObject({ id: "fatf-grey-list", source: "FATF", asOf: FATF_GREY_LIST.asOf });
    expect(f.label).toContain("FATF grey list");
    expect(f.label).toContain("24 Oct 2025");
    expect(f.label).toContain("Bulgaria (BG)");
    expect(scoreClientRisk({ ...base, countries: ["BG"] }).level).toBe("Medium");
  });

  it("grey list is not counted again for a country already on the EU high-risk list", () => {
    expect(EU_HIGH_RISK_THIRD_COUNTRIES.has("KE") && FATF_GREY_LIST.codes.has("KE")).toBe(true);
    expect(factor(["KE"], "fatf-grey-list")).toBeUndefined();
    expect(factor(["KE"], "fatf-grey-list", { highRiskThirdCountries: new Set() })?.countries).toEqual(["KE"]);
  });

  it("sanctions/embargo and terrorism: 4 points each, not forcing High", () => {
    const s = factor(["BY"], "country-sanctions")!;
    expect(s).toMatchObject({ points: 4, countries: ["BY"] });
    expect(s.forcesHigh).toBeFalsy();
    expect(s.label).toContain("Belarus (BY)");
    const t = factor(["CU"], "terrorism-country")!;
    expect(t).toMatchObject({ points: 4, countries: ["CU"] });
    expect(t.forcesHigh).toBeFalsy();
  });

  it("secrecy jurisdiction (EU tax list): 3 points", () => {
    const f = factor(["PA"], "secrecy-jurisdiction")!;
    expect(f).toMatchObject({ points: 3, countries: ["PA"] });
    expect(f.label).toContain("Council of the EU");
  });

  it("corruption: CPI below the threshold, configurable in the Country Profile", () => {
    // Brazil scores 34: not below the default 30, but below a raised threshold of 40.
    expect(CPI_SCORES.BR).toBeGreaterThanOrEqual(DEFAULT_CPI_THRESHOLD);
    expect(factor(["BR"], "corruption-cpi")).toBeUndefined();
    const raised = parseCountryProfile({ memberState: "LT", corruptionCpiThreshold: 40 });
    expect(raised.ok).toBe(true);
    const f = factor(["BR"], "corruption-cpi", {}, raised.ok ? raised.profile : undefined)!;
    expect(f).toMatchObject({ points: 3, countries: ["BR"] });
    expect(f.label).toContain("score below 40");
    expect(f.label).toContain("Brazil (BR, score 34)");
    expect(factor(["SO"], "corruption-cpi")?.countries).toEqual(["SO"]);
  });

  it("the corruption threshold can be raised but not lowered or set above the data held", () => {
    expect(defaultCountryProfile("LT").corruptionCpiThreshold).toBe(DEFAULT_CPI_THRESHOLD);
    const low = parseCountryProfile({ memberState: "LT", corruptionCpiThreshold: 20 });
    expect(low.ok).toBe(false);
    if (!low.ok) expect(low.violations[0].field).toBe("corruptionCpiThreshold");
    expect(parseCountryProfile({ memberState: "LT", corruptionCpiThreshold: MAX_CPI_THRESHOLD + 1 }).ok).toBe(false);
  });

  it("checks beneficial owners' and all other linked countries, each country once per list", () => {
    const r = scoreClientRisk({ ...base, clientType: "legal", countries: ["LT", "BY", "RU", "BY"] });
    expect(r.factors.find((f) => f.id === "country-list:country-sanctions")?.countries).toEqual(["BY", "RU"]);
  });

  it("several lists add up without a forced High; the EU high-risk list still forces High", () => {
    const by = scoreClientRisk({ ...base, countries: ["BY"] });
    expect(by.factors.every((f) => !f.forcesHigh)).toBe(true);
    expect(by.level).toBe("Medium"); // sanctions 4, CPI 33 is above the default threshold
    const sy = scoreClientRisk({ ...base, countries: ["SY"] });
    expect(sy.factors.map((f) => f.id)).toEqual(expect.arrayContaining(["high-risk-country", "country-list:country-sanctions", "country-list:terrorism-country", "country-list:corruption-cpi"]));
    expect(sy.level).toBe("High");
  });

  it("can be switched off for a caller that supplies its own lists", () => {
    const r = scoreClientRisk({ ...base, countries: ["BY"], countryLists: [], cpiScores: {} });
    expect(r.factors.filter((f) => f.id.startsWith("country-list:"))).toEqual([]);
  });

  it("are no longer ticked by hand in the risk questionnaire", () => {
    expect(RISK_FLAGS.map((f) => f.id)).not.toEqual(expect.arrayContaining(["fatf-grey-list"]));
    expect(RISK_FLAGS.some((f) => ["fatf-grey-list", "country-sanctions", "corruption-crime", "terrorism-country", "secrecy-jurisdiction"].includes(f.id))).toBe(false);
  });
});
