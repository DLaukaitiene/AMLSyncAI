import { describe, expect, it } from "vitest";
import { countryName, countryOptions, isKnownCountry, normalizeCountries, normalizeCountry } from "./countries";

describe("countries", () => {
  it("covers the whole world, EU first when asked", () => {
    const all = countryOptions();
    expect(all.length).toBeGreaterThan(240);
    expect(all.find((c) => c.code === "UA")?.name).toBe("Ukraine");
    const eu = countryOptions(true);
    expect(eu.slice(0, 27).every((c) => c.eu)).toBe(true);
  });
  it("normalises codes, names and 'Name (XX)'", () => {
    expect(normalizeCountry("lt")).toBe("LT");
    expect(normalizeCountry("United Kingdom")).toBe("GB");
    expect(normalizeCountry("Ukraine (UA)")).toBe("UA");
    expect(normalizeCountry("Kosovo")).toBe("XK");
    expect(normalizeCountry("")).toBeNull();
  });
  it("keeps 'Other' values as typed and flags them as unknown", () => {
    expect(normalizeCountry("Somaliland")).toBe("Somaliland");
    expect(isKnownCountry("Somaliland")).toBe(false);
    expect(countryName("Somaliland")).toBe("Somaliland");
  });
  it("splits several countries, old 'LT PL' style too", () => {
    expect(normalizeCountries("LT, Poland; United States")).toEqual(["LT", "PL", "US"]);
    expect(normalizeCountries("LT PL")).toEqual(["LT", "PL"]);
    expect(normalizeCountries("Bosnia and Herzegovina, LT")).toEqual(["BA", "LT"]);
  });
});
