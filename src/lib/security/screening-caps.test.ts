import { describe, expect, it } from "vitest";
import { allowedNow, DEFAULT_LIMITS, limitMessage, unusualVolume } from "./screening-caps";
import { withPacks } from "./screening-caps";

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
    expect(limitMessage("day", DEFAULT_LIMITS)).toMatch(/30 per day.*buy 30 more screenings for €10.00.*contact@amlsync\.com/);
    expect(limitMessage("minute", DEFAULT_LIMITS)).toMatch(/Wait a minute/);
  });
  it("flags unusual volumes", () => {
    expect(unusualVolume(60, 10)).toBe(true);
    expect(unusualVolume(40, 1)).toBe(false);
  });
});

describe("screening packs", () => {
  it("each pack adds 30 to the month, and to today if bought today", () => {
    expect(withPacks({ perMinute: 5, perDay: 30, perMonth: 100 }, 2, 1)).toEqual({ perMinute: 5, perDay: 60, perMonth: 160 });
  });
});
