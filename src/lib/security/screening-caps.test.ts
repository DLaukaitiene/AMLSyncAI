import { describe, expect, it } from "vitest";
import { allowedNow, DEFAULT_LIMITS, limitMessage, unusualVolume } from "./screening-caps";

const fresh = { lastMinute: 0, today: 0, thisMonth: 0 };

describe("screening limits (§8C.4)", () => {
  it("defaults: 5 per minute, 30 per day, 100 per month", () => expect(DEFAULT_LIMITS).toEqual({ perMinute: 5, perDay: 30, perMonth: 100 }));
  it("allows up to the tightest remaining limit", () => {
    expect(allowedNow(DEFAULT_LIMITS, fresh, 3)).toEqual({ allowed: 3, limitedBy: null });
    expect(allowedNow(DEFAULT_LIMITS, fresh, 8)).toEqual({ allowed: 5, limitedBy: "minute" });
    expect(allowedNow(DEFAULT_LIMITS, { lastMinute: 0, today: 28, thisMonth: 50 }, 4)).toEqual({ allowed: 2, limitedBy: "day" });
    expect(allowedNow(DEFAULT_LIMITS, { lastMinute: 0, today: 1, thisMonth: 100 }, 1)).toEqual({ allowed: 0, limitedBy: "month" });
  });
  it("tells the client how to get the limit raised", () => {
    expect(limitMessage("day", DEFAULT_LIMITS)).toMatch(/30 per day.*contact@amlsync\.com.*1 business day/);
    expect(limitMessage("minute", DEFAULT_LIMITS)).toMatch(/Wait a minute/);
  });
  it("flags unusual volumes", () => {
    expect(unusualVolume(60, 10)).toBe(true);
    expect(unusualVolume(40, 1)).toBe(false);
  });
});
