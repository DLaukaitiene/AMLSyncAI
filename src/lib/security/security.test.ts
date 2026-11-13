import { describe, expect, it } from "vitest";
import { checkInviteEmail, checkSignupEmail, type DomainLookups } from "./email-domain";
import { canSubmitFreeText, scanForPersonalData } from "./pii-scan";

const NOW = new Date("2026-11-13T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function lookups(over: Partial<{ mx: boolean; age: number | null; inUse: boolean }> = {}): DomainLookups {
  const { mx = true, age = 3650, inUse = false } = over;
  return {
    hasMx: async () => mx,
    registeredAt: async () => (age === null ? null : daysAgo(age)),
    domainInUse: async () => inUse,
  };
}

describe("sign-up email verification (§11.14)", () => {
  it.each(["anna@gmail.com", "anna@outlook.com", "anna@GMX.de"])("refuses free email %s", async (email) => {
    const r = await checkSignupEmail(email, lookups(), NOW);
    expect(r).toMatchObject({ accepted: false, refusal: "free-email" });
    expect(r.message).toMatch(/company email/);
  });

  it("refuses disposable domains, including subdomains", async () => {
    expect((await checkSignupEmail("x@mailinator.com", lookups(), NOW)).refusal).toBe("disposable-email");
    expect((await checkSignupEmail("x@eu.mailinator.com", lookups(), NOW)).refusal).toBe("disposable-email");
  });

  it("accepts a company domain that differs from the company name (jip.lt)", async () => {
    const r = await checkSignupEmail("anna@jip.lt", lookups(), NOW);
    expect(r).toMatchObject({ accepted: true, domain: "jip.lt" });
  });

  it("refuses no MX, < 30 days old, unknown age, and a domain already in use", async () => {
    expect((await checkSignupEmail("a@firm.eu", lookups({ mx: false }), NOW)).refusal).toBe("no-mx");
    expect((await checkSignupEmail("a@firm.eu", lookups({ age: 29 }), NOW)).refusal).toBe("domain-too-new");
    expect((await checkSignupEmail("a@firm.eu", lookups({ age: 30 }), NOW)).accepted).toBe(true);
    expect((await checkSignupEmail("a@firm.eu", lookups({ age: null }), NOW)).refusal).toBe("domain-age-unknown");
    const used = await checkSignupEmail("a@firm.eu", lookups({ inUse: true }), NOW);
    expect(used.refusal).toBe("domain-in-use");
    expect(used.message).toMatch(/Owner to invite/);
  });

  it("invites: same domain ok; external only when the Owner allows it, and labelled", () => {
    expect(checkInviteEmail("bob@jip.lt", "jip.lt", false)).toEqual({ allowed: true, external: false });
    expect(checkInviteEmail("rev@amlsync.com", "jip.lt", false).allowed).toBe(false);
    expect(checkInviteEmail("rev@amlsync.com", "jip.lt", true)).toEqual({ allowed: true, external: true });
  });
});

describe("feature-request personal-data scan (§11.13)", () => {
  it.each([
    ["IBAN", "Refund to LT12 1000 0111 0100 1000 please", "iban"],
    ["email", "Client jonas@example.lt complained", "email"],
    ["phone", "Call him on +370 612 34567", "phone"],
    ["date of birth", "born 14.03.1985", "date-of-birth"],
    ["national ID", "asmens kodas 38503141234", "id-number"],
  ])("detects %s", (_l, text, kind) => {
    expect(scanForPersonalData(text).map((f) => f.kind)).toContain(kind);
  });

  it("ignores ordinary feature text and invalid IBAN-like strings", () => {
    expect(scanForPersonalData("Please add a CSV export of the Compliance Calendar for 2027.")).toEqual([]);
    expect(scanForPersonalData("Ref LT00 0000 0000 0000 0000")).not.toContainEqual(expect.objectContaining({ kind: "iban" }));
  });

  it("blocks submission until removed or confirmed", () => {
    expect(canSubmitFreeText("email a@b.com", false).allowed).toBe(false);
    expect(canSubmitFreeText("email a@b.com", true).allowed).toBe(true);
  });
});
