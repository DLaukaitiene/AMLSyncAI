import { describe, expect, it } from "vitest";
import { createChallenge, leadingZeroBits, solve, verifySolution } from "./pow";

const S = "test-secret";

describe("proof-of-work challenge (§8C.4)", () => {
  it("counts leading zero bits", () => {
    expect(leadingZeroBits(Buffer.from([0, 0, 0x0f, 0xff]))).toBe(20);
    expect(leadingZeroBits(Buffer.from([0x80]))).toBe(0);
  });
  it("accepts a correct solution once per challenge id", () => {
    const t = createChallenge(S, "login", 10);
    const r = verifySolution(S, t, solve(t), "login");
    expect(r.ok).toBe(true);
  });
  it("rejects forged, expired, wrong-purpose and unsolved challenges", () => {
    const t = createChallenge(S, "login", 10);
    const sol = solve(t);
    expect(verifySolution("other", t, sol, "login")).toMatchObject({ ok: false, reason: "bad-signature" });
    expect(verifySolution(S, t, sol, "signup")).toMatchObject({ ok: false, reason: "wrong-purpose" });
    expect(verifySolution(S, t, sol, "login", Date.now() + 11 * 60_000)).toMatchObject({ ok: false, reason: "expired" });
    expect(verifySolution(S, t.replace(".10.", ".2."), sol, "login")).toMatchObject({ ok: false, reason: "bad-signature" });
    const hard = createChallenge(S, "login", 30);
    expect(verifySolution(S, hard, "1", "login")).toMatchObject({ ok: false, reason: "insufficient-work" });
    expect(verifySolution(S, t, "", "login")).toMatchObject({ ok: false, reason: "no-solution" });
  });
});
