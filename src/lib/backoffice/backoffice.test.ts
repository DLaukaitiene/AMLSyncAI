import { describe, expect, it } from "vitest";
import { adminCan, envOwners } from "./roles";
import { canDecide, needsFourEyes, SELF_APPROVAL_COOL_OFF_MS } from "./four-eyes";
import { entryHash, GENESIS, verifyChain, type ChainEntry } from "./chain";
import { healthScore } from "./health";
import { median, misuseFlags } from "./misuse";
import { breachClock, dsrDueOn } from "./deadlines";
import { b2cThreshold, isCrossBorderB2C } from "./vat";

describe("admin roles", () => {
  it("keeps roles narrow", () => {
    expect(adminCan(["SUPPORT"], "credits.grant")).toBe(false);
    expect(adminCan(["SUPPORT"], "support.access")).toBe(true);
    expect(adminCan(["FINANCE"], "users.secure")).toBe(false);
    expect(adminCan(["AUDITOR"], "audit.view")).toBe(true);
    expect(adminCan(["AUDITOR"], "firms.manage")).toBe(false);
    expect(adminCan(["CONTENT_EDITOR"], "billing.view")).toBe(false);
    expect(adminCan(["OPERATIONS"], "approvals.decide")).toBe(false);
    expect(adminCan(["OWNER"], "approvals.decide")).toBe(true);
    expect(adminCan([], "dashboard.view")).toBe(false);
  });
  it("parses configured owners", () => {
    expect(envOwners(" A@x.lt, ,b@y.lt")).toEqual(["a@x.lt", "b@y.lt"]);
  });
});

describe("four eyes", () => {
  const base = { requestedBy: "a@x.lt", createdAt: new Date("2026-11-18T10:00:00Z"), expiresAt: new Date("2026-11-25T10:00:00Z"), status: "pending" };
  it("applies thresholds", () => {
    expect(needsFourEyes("credit.grant", 10_000)).toBe(false);
    expect(needsFourEyes("credit.grant", 10_001)).toBe(true);
    expect(needsFourEyes("firms.export", 500)).toBe(false);
    expect(needsFourEyes("firms.export", 501)).toBe(true);
    expect(needsFourEyes("admin.set-roles")).toBe(true);
  });
  it("needs a second person when there are two owners", () => {
    expect(canDecide(base, "b@x.lt", 2, new Date("2026-11-18T10:01:00Z"))).toEqual({ ok: true, selfApproved: false });
    expect(canDecide(base, "A@x.lt", 2, new Date("2026-11-19T10:00:00Z")).ok).toBe(false);
  });
  it("lets a single owner self-approve only after cooling off", () => {
    expect(canDecide(base, "a@x.lt", 1, new Date(base.createdAt.getTime() + 60_000)).ok).toBe(false);
    expect(canDecide(base, "a@x.lt", 1, new Date(base.createdAt.getTime() + SELF_APPROVAL_COOL_OFF_MS))).toEqual({ ok: true, selfApproved: true });
  });
  it("refuses decided or expired requests", () => {
    expect(canDecide({ ...base, status: "executed" }, "b@x.lt", 2).ok).toBe(false);
    expect(canDecide(base, "b@x.lt", 2, new Date("2026-11-26T00:00:00Z")).ok).toBe(false);
  });
});

describe("admin audit hash chain", () => {
  const e = (i: number): ChainEntry => ({ at: new Date(Date.UTC(2026, 10, 18, 10, i)), adminEmail: "a@x.lt", action: "firm.status", targetType: "Firm", targetId: `f${i}`, reason: "test", details: { b: 1, a: [i] }, approverEmail: null });
  const build = () => {
    let prev = GENESIS;
    return [0, 1, 2].map((i) => { const h = entryHash(prev, e(i)); const r = { ...e(i), prevHash: prev, hash: h }; prev = h; return r; });
  };
  it("verifies an intact chain and ignores key order", () => {
    const rows = build();
    expect(verifyChain(rows)).toBe(-1);
    expect(entryHash(GENESIS, { ...e(0), details: { a: [0], b: 1 } })).toBe(rows[0].hash);
  });
  it("detects edits and deletions", () => {
    const edited = build(); edited[1] = { ...edited[1], reason: "changed" };
    expect(verifyChain(edited)).toBe(1);
    const removed = build(); removed.splice(1, 1);
    expect(verifyChain(removed)).toBe(1);
  });
});

describe("health score", () => {
  const healthy = { users: 4, activeUsers30d: 4, coreActions30d: 40, coreActionsPrev30d: 30, milestonesDone: 6, milestonesTotal: 6, overdueRefreshes: 0, openCddFiles: 20, overdueInvoices: 0, pendingSupportRequests: 0, budgetRunwayDays: null };
  it("scores a healthy firm green", () => {
    const r = healthScore(healthy);
    expect(r.score).toBe(100);
    expect(r.band).toBe("green");
    expect(r.reasons.reduce((s, x) => s + x.weight, 0)).toBe(100);
  });
  it("scores an inactive, overdue firm red with reasons", () => {
    const r = healthScore({ ...healthy, activeUsers30d: 0, coreActions30d: 0, coreActionsPrev30d: 30, milestonesDone: 1, overdueInvoices: 1, overdueRefreshes: 10 });
    expect(r.band).toBe("red");
    expect(r.reasons.find((x) => x.signal === "Usage trend")?.detail).toMatch(/-100%/);
  });
});

describe("misuse rules", () => {
  it("computes medians", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });
  it("flags a spike over 5× the 30-day median", () => {
    const daily = [...Array(30).fill(4), 30];
    expect(misuseFlags({ daily, firmAgeDays: 200, clientsCreated: 40, checksTotal: 100 }).map((f) => f.rule)).toEqual(["spike"]);
    expect(misuseFlags({ daily: [...Array(30).fill(4), 19], firmAgeDays: 200, clientsCreated: 40, checksTotal: 99 })).toEqual([]);
  });
  it("flags a burst right after sign-up and checks without onboarding", () => {
    const f = misuseFlags({ daily: [0, 25], firmAgeDays: 1, clientsCreated: 2, checksTotal: 25 }).map((x) => x.rule);
    expect(f).toEqual(["spike", "new-firm-burst", "checks-without-onboarding"]);
  });
});

describe("deadlines", () => {
  it("runs the breach clocks only for personal data", () => {
    const at = new Date("2026-11-18T10:00:00Z");
    const base = { personalData: true, controllerData: true, detectedAt: at, firmsNotifiedAt: null, dpaNotifiedAt: null, dpaNotRequiredReason: null, firmIds: ["f"] };
    expect(breachClock({ ...base, personalData: false })).toEqual([]);
    const c = breachClock(base, new Date("2026-11-19T11:00:00Z"));
    expect(c.map((x) => x.overdue)).toEqual([true, false]);
    expect(c[1].label).toMatch(/2026-11-21 10:00/);
  });
  it("gives a data subject request one month, three when extended", () => {
    expect(dsrDueOn("2026-11-18")).toBe("2026-12-18");
    expect(dsrDueOn("2027-01-31")).toBe("2027-02-28");
    expect(dsrDueOn("2026-11-18", true)).toBe("2027-02-18");
  });
});

describe("B2C VAT threshold", () => {
  it("counts only EU cross-border buyers without a VAT number", () => {
    expect(isCrossBorderB2C({ country: "LV", vatId: null })).toBe(true);
    expect(isCrossBorderB2C({ country: "LV", vatId: "LV40003000000" })).toBe(false);
    expect(isCrossBorderB2C({ country: "LT", vatId: null })).toBe(false);
    expect(isCrossBorderB2C({ country: "US", vatId: null })).toBe(false);
    const r = b2cThreshold([
      { issuedOn: "2026-03-01", netCents: 500_000, status: "paid", buyer: { country: "LV" } },
      { issuedOn: "2026-04-01", netCents: 400_000, status: "issued", buyer: { country: "EE", vatId: "" } },
      { issuedOn: "2026-05-01", netCents: 900_000, status: "void", buyer: { country: "EE" } },
      { issuedOn: "2025-05-01", netCents: 900_000, status: "paid", buyer: { country: "EE" } },
    ], 2026);
    expect(r).toMatchObject({ totalCents: 900_000, alert: true, exceeded: false });
  });
});
