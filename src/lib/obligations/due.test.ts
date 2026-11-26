import { describe, expect, it } from "vitest";
import { dueText, earliest } from "./due";

const now = new Date("2026-11-26T15:00:00Z");
const d = (s: string) => new Date(s + "T00:00:00Z");

describe("dueText", () => {
  it("counts calendar days and picks a tone", () => {
    expect(dueText("Next review", d("2027-01-07"), now)).toEqual({ text: "Next review in 42 days (2027-01-07)", tone: "later" });
    expect(dueText("Next review", d("2026-12-10"), now)?.tone).toBe("soon");
    expect(dueText("Next review", d("2026-11-27"), now)?.text).toBe("Next review due tomorrow");
    expect(dueText("Next review", d("2026-11-26"), now)).toEqual({ text: "Next review due today", tone: "overdue" });
    expect(dueText("Next review", d("2026-11-23"), now)).toEqual({ text: "Next review overdue by 3 days (was due 2026-11-23)", tone: "overdue" });
    expect(dueText("Next review", d("2026-11-25"), now)?.text).toBe("Next review overdue by 1 day (was due 2026-11-25)");
    expect(dueText("Next review", null, now)).toBeNull();
  });
  it("finds the earliest date", () => {
    expect(earliest([null, d("2027-02-01"), d("2026-12-01")])).toEqual(d("2026-12-01"));
    expect(earliest([null])).toBeNull();
  });
});
