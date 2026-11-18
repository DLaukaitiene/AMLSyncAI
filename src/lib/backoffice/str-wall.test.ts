import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * "AMLSync sees the business, not the customers' AML files" (Backoffice §1, §2.3).
 * Static guard over every Backoffice file: tenant tables holding client data
 * may only be counted or grouped, and suspicion-report tables may not be
 * touched at all. The consented support view (src/app/admin/support/[grantId])
 * is excluded: it goes through supportSummary(), which checks the firm's grant.
 */
const ROOT = path.resolve(__dirname, "../../..");
const DIRS = ["src/app/admin", "src/lib/server/backoffice", "src/app/api/admin", "src/lib/backoffice"];
const EXCLUDE = [path.join("src", "app", "admin", "support", "[grantId]"), "str-wall.test.ts"];

const STR_MODELS = ["case", "report", "whistleblowingReport"];
const CLIENT_MODELS = ["party", "cddFile", "screeningResult", "identityVerification", "registryExtract", "document", "transaction", "matter", "matterParty", "clientRiskAssessment", "portalLink", "diditSession", "aiCall", "ownershipLink", "task", "approval", "auditEvent"];
const AGGREGATES = ["count", "groupBy", "aggregate"];
const STR_TASK_KINDS = ["str", "fiu-request", "transaction-hold", "sanctions-notice"];
const STR_TABLES = ["Case", "Report", "WhistleblowingReport", "Party", "ScreeningResult", "Document", "IdentityVerification", "RegistryExtract", "AiCall"];

function files(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  try { statSync(abs); } catch { return []; }
  return readdirSync(abs, { recursive: true, encoding: "utf8" })
    .map((f) => path.join(dir, f))
    .filter((f) => /\.(ts|tsx)$/.test(f) && !EXCLUDE.some((e) => f.includes(e)));
}

const all = DIRS.flatMap(files);
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

describe("STR wall and client-data boundary in the Backoffice", () => {
  it("scans the Backoffice code", () => {
    expect(all.length).toBeGreaterThan(10);
  });

  it("never reads suspicion reports, cases or whistleblowing reports", () => {
    const bad = all.flatMap((f) => [...read(f).matchAll(new RegExp(`\\b(?:adminDb|appDb|tx)\\.(${STR_MODELS.join("|")})\\.`, "g"))].map((m) => `${f}: ${m[0]}`));
    expect(bad).toEqual([]);
  });

  it("only counts or groups tables that hold client data", () => {
    const re = new RegExp(`\\b(?:adminDb|appDb|tx)\\.(${CLIENT_MODELS.join("|")})\\.(\\w+)\\(`, "g");
    const bad = all.flatMap((f) => [...read(f).matchAll(re)].filter((m) => !AGGREGATES.includes(m[2])).map((m) => `${f}: ${m[0]}`));
    expect(bad).toEqual([]);
  });

  it("never joins client records into other queries", () => {
    const bad = all.flatMap((f) => [...read(f).matchAll(/\b(?:include|select):\s*\{[^}]*\b(party|parties|screenings|documents|cddFiles|cases|reports|verifications|extracts)\s*:/g)].map((m) => `${f}: ${m[0]}`));
    expect(bad).toEqual([]);
  });

  it("does not count suspicion-related tasks", () => {
    const bad = all.filter((f) => STR_TASK_KINDS.some((k) => read(f).includes(`"${k}"`)));
    expect(bad).toEqual([]);
  });

  it("does not query client tables through raw SQL", () => {
    const bad = all.flatMap((f) => [...read(f).matchAll(/\$queryRaw[^`]*`([^`]*)`/g)].filter((m) => STR_TABLES.some((t) => m[1].includes(`"${t}"`))).map((m) => `${f}: ${m[1].slice(0, 60)}`));
    expect(bad).toEqual([]);
  });
});
