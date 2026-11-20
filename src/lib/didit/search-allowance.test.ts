import { describe, expect, it } from "vitest";
import { searchState } from "./search-allowance";

const d = (day: number, h = 12) => new Date(Date.UTC(2026, 10, day, h));
const many = (n: number, day = 10) => Array.from({ length: n }, (_, i) => new Date(d(day).getTime() + i * 60_000));

describe("free register searches", () => {
  it("Solo: 6 free searches, then paused for 5 days", () => {
    expect(searchState("solo", many(5), [], [], d(10, 18))).toMatchObject({ blocked: false, remaining: 1 });
    const s = searchState("solo", many(6), [], [], d(11));
    expect(s.blocked).toBe(true);
    expect(s.blockedUntil!.toISOString().slice(0, 10)).toBe("2026-11-15");
    expect(searchState("solo", many(6), [], [], d(16)).blocked).toBe(false);
  });
  it("Starter: 10", () => {
    expect(searchState("starter", many(9), [], [], d(11)).blocked).toBe(false);
    expect(searchState("starter", many(10), [], [], d(11)).blocked).toBe(true);
  });
  it("ordering a check starts the count again", () => {
    expect(searchState("solo", many(6), [d(10, 20)], [], d(11))).toMatchObject({ blocked: false, remaining: 6 });
  });
  it("a pack adds 5 searches and lifts the pause", () => {
    const s = searchState("solo", many(6), [], [d(10, 20)], d(11));
    expect(s).toMatchObject({ blocked: false, remaining: 5, limit: 11 });
    expect(searchState("solo", many(11), [], [d(10, 9)], d(11)).blocked).toBe(true);
  });
});
