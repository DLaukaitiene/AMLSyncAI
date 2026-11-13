import { describe, expect, it } from "vitest";
import { allowedNow, dailyCap, unusualVolume } from "./screening-caps";

describe("screening caps (§8C.4)", () => {
  it("caps per plan and day", () => {
    expect(dailyCap("starter")).toBe(1000);
    expect(dailyCap("unknown")).toBe(1000);
    expect(allowedNow("starter", 998, 5)).toBe(2);
    expect(allowedNow("starter", 1000, 1)).toBe(0);
    expect(allowedNow("business", 1000, 5)).toBe(5);
  });
  it("flags unusual volumes", () => {
    expect(unusualVolume(60, 10)).toBe(true);
    expect(unusualVolume(40, 1)).toBe(false);
    expect(unusualVolume(400, 100)).toBe(false);
  });
});
