import { describe, expect, it } from "vitest";
import {
  addWorkingDays,
  addMonths,
  canMarkSubmitted,
  canAcceptClient,
  canCompleteMatter,
  canTransferFundsOrProperty,
  checkCashPayment,
  defaultCountryProfile,
  diffProfiles,
  evaluateCddTriggers,
  fiuRequestDue,
  formerPepUntil,
  parseCountryProfile,
  refreshDue,
  retentionEnds,
  scoreClientRisk,
  applyOverride,
  setupChecklist,
  thresholdReportRequired,
  transactionHoldEnds,
  type CddFileState,
  type RiskInput,
  type TransactionRecord,
} from "./index";

const LT = defaultCountryProfile("LT");

describe("working days and deadlines (§11.0, §11.10)", () => {
  it("skips weekends", () => {
    // Friday 2027-07-16 + 3 working days = Wednesday 2027-07-21
    expect(addWorkingDays("2027-07-16", 3)).toBe("2027-07-21");
  });

  it("transaction hold uses the firm's holidays; changing holidays changes the deadline", () => {
    expect(transactionHoldEnds("2027-07-16", LT).due).toBe("2027-07-21");
    const withHoliday = parseCountryProfile({ memberState: "LT", holidays: ["2027-07-19"] });
    if (!withHoliday.ok) throw new Error("profile invalid");
    expect(transactionHoldEnds("2027-07-16", withHoliday.profile).due).toBe("2027-07-22");
  });

  it("FIU request: 5 working days, or the FIU's shorter deadline — never longer", () => {
    expect(fiuRequestDue("2027-09-06", LT).due).toBe("2027-09-13");
    expect(fiuRequestDue("2027-09-06", LT, 2).due).toBe("2027-09-08");
    expect(fiuRequestDue("2027-09-06", LT, 10).due).toBe("2027-09-13");
  });

  it("refresh: 1 year for EDD, 5 years otherwise", () => {
    expect(refreshDue("2027-07-10", true).due).toBe("2028-07-10");
    expect(refreshDue("2027-07-10", false).due).toBe("2032-07-10");
  });

  it("former PEP stays flagged ≥ 12 months, with month-end clamping", () => {
    expect(formerPepUntil("2027-03-15").due).toBe("2028-03-15");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("retention: 5 years from end event; legal hold adds at most 5", () => {
    expect(retentionEnds("2027-12-01", LT).due).toBe("2032-12-01");
    expect(retentionEnds("2027-12-01", LT, 2).due).toBe("2034-12-01");
    expect(() => retentionEnds("2027-12-01", LT, 6)).toThrow();
  });
});

describe("Country Profile (§3A, §11.1)", () => {
  it("rejects values that would relax the EU Core", () => {
    const r = parseCountryProfile({ memberState: "LT", cashCapEUR: 15_000, retentionYears: 3, fiuRequestWorkingDays: 7 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.map((v) => v.field).sort()).toEqual(["cashCapEUR", "fiuRequestWorkingDays", "retentionYears"]);
  });

  it("accepts tightening (lower cash cap, longer retention)", () => {
    const r = parseCountryProfile({ memberState: "LT", cashCapEUR: 5_000, retentionYears: 8 });
    expect(r.ok).toBe(true);
  });

  it("required-but-empty FIU blocks marking an STR submitted, but not drafting", () => {
    expect(canMarkSubmitted(LT, "str").allowed).toBe(false);
    expect(setupChecklist(LT).find((i) => i.parameter === "fiu")!.status).toBe("required-missing");
    const filled = parseCountryProfile({ memberState: "LT", fiu: { name: "FNTT", channel: "portal" } });
    if (!filled.ok) throw new Error();
    expect(canMarkSubmitted(filled.profile, "str").allowed).toBe(true);
  });

  it("national risk assessment shows 'not yet reviewed' at default", () => {
    expect(setupChecklist(LT).find((i) => i.parameter === "additionalEddCases")!.status).toBe("not-yet-reviewed");
  });

  it("diffs versions for the audit log", () => {
    const next = parseCountryProfile({ memberState: "LT", cashCapEUR: 5_000 });
    if (!next.ok) throw new Error();
    expect(diffProfiles(LT, next.profile)).toEqual([{ field: "cashCapEUR", oldValue: 10_000, newValue: 5_000 }]);
  });
});

describe("CDD triggers (§11.4)", () => {
  const tx = (id: string, date: string, amountEUR: number, method: TransactionRecord["method"] = "bank-transfer"): TransactionRecord => ({
    id,
    customerId: "cust",
    date,
    amountEUR,
    method,
    occasional: true,
  });

  it("linked-transaction test: three €4,000 occasional transactions trigger CDD on the third", () => {
    const t1 = tx("t1", "2027-08-01", 4_000);
    const t2 = tx("t2", "2027-08-10", 4_000);
    const t3 = tx("t3", "2027-08-20", 4_000);
    expect(evaluateCddTriggers({ sector: "accountant", profile: LT, history: [], newTransaction: t1 })).toEqual([]);
    expect(evaluateCddTriggers({ sector: "accountant", profile: LT, history: [t1], newTransaction: t2 })).toEqual([]);
    const third = evaluateCddTriggers({ sector: "accountant", profile: LT, history: [t1, t2], newTransaction: t3 });
    expect(third.map((t) => t.reason)).toEqual(["linked-transactions"]);
    expect(third[0].transactionIds).toEqual(["t1", "t2", "t3"]);
  });

  it("a single occasional transaction ≥ €10,000 triggers CDD", () => {
    const r = evaluateCddTriggers({ sector: "accountant", profile: LT, history: [], newTransaction: tx("t", "2027-08-01", 10_000) });
    expect(r.map((t) => t.reason)).toEqual(["occasional-transaction"]);
  });

  it("HVG cash ≥ €3,000 triggers identification; switches off when national cap ≤ €3,000", () => {
    const cash = tx("c", "2027-08-01", 3_000, "cash");
    expect(evaluateCddTriggers({ sector: "hvg-trader", profile: LT, history: [], newTransaction: cash }).map((t) => t.reason)).toEqual([
      "cash-identification",
    ]);
    const low = parseCountryProfile({ memberState: "XX", cashCapEUR: 3_000 });
    if (!low.ok) throw new Error();
    expect(evaluateCddTriggers({ sector: "hvg-trader", profile: low.profile, history: [], newTransaction: cash })).toEqual([]);
  });

  it("company formation (TCSP) and suspicion trigger CDD regardless of value", () => {
    const r = evaluateCddTriggers({ sector: "tcsp", profile: LT, history: [], companyFormationOrTransfer: true, suspicion: true });
    expect(r.map((t) => t.reason).sort()).toEqual(["company-formation-or-transfer", "suspicion"]);
  });
});

describe("cash cap and threshold reports (§11.9, §11.10)", () => {
  it("blocks cash at or above the firm's cap", () => {
    const lt = parseCountryProfile({ memberState: "LT", cashCapEUR: 5_000, nationalCashReport: { enabled: true, thresholdEUR: 15_000 } });
    if (!lt.ok) throw new Error();
    expect(checkCashPayment(4_999, lt.profile).blocked).toBe(false);
    expect(checkCashPayment(5_000, lt.profile).blocked).toBe(true);
    expect(checkCashPayment(9_000, LT).blocked).toBe(false);
  });

  it("Art. 74 reports for cars ≥ €250,000 and aircraft/watercraft ≥ €7.5m", () => {
    expect(thresholdReportRequired("motor-vehicle", 250_000).required).toBe(true);
    expect(thresholdReportRequired("motor-vehicle", 249_999).required).toBe(false);
    expect(thresholdReportRequired("watercraft", 7_500_000).required).toBe(true);
    expect(thresholdReportRequired("jewellery-watches", 9_000_000).required).toBe(false);
  });
});

describe("risk scoring (§11.7)", () => {
  const base: RiskInput = {
    clientType: "natural",
    countries: ["LT"],
    highRiskThirdCountries: new Set(["KP", "IR", "MM"]),
    isPep: false,
    deliveryChannel: "remote-eid",
    usesCash: false,
    ownershipLayers: 0,
    nomineeArrangements: false,
    productRisk: "low",
  };

  it("a plain individual is Low and SDD-eligible; factors are listed", () => {
    const r = scoreClientRisk(base);
    expect(r).toMatchObject({ level: "Low", eddRequired: false, sddEligible: true, score: 0 });
    expect(r.rulesetVersion).toMatch(/risk/);
  });

  it.each([
    ["PEP", { isPep: true }],
    ["high-risk third country", { countries: ["LT", "IR"] }],
    ["countermeasure country", { countermeasureCountries: new Set(["LT"]) }],
  ])("%s forces High / EDD", (_label, patch) => {
    expect(scoreClientRisk({ ...base, ...patch } as RiskInput).level).toBe("High");
  });

  it("a firm-added additional EDD case forces High", () => {
    const p = parseCountryProfile({ memberState: "LT", additionalEddCases: [{ id: "crypto", description: "Client pays in crypto-assets" }] });
    if (!p.ok) throw new Error();
    const r = scoreClientRisk({ ...base, additionalEddCaseIds: ["crypto"] }, p.profile, 3);
    expect(r.level).toBe("High");
    expect(r.countryProfileVersion).toBe(3);
  });

  it("override needs a CO and a reason, and can't lower a forced-High client", () => {
    const low = scoreClientRisk(base);
    expect(() => applyOverride(low, { newLevel: "Medium", reason: "Long-standing relationship but new sector", byRole: "staff" })).toThrow();
    expect(() => applyOverride(low, { newLevel: "Medium", reason: "", byRole: "compliance-officer" })).toThrow();
    const o = applyOverride(low, { newLevel: "Medium", reason: "Client recently changed business model", byRole: "compliance-officer" });
    expect(o.calculated.level).toBe("Low");
    expect(o.final).toBe("Medium");
    const pep = scoreClientRisk({ ...base, isPep: true });
    expect(() => applyOverride(pep, { newLevel: "Medium", reason: "Minor local office holder", byRole: "compliance-officer" })).toThrow();
  });
});

describe("hard gates (§11.4, §11.8)", () => {
  const complete: CddFileState = {
    partyId: "p",
    role: "client",
    identityVerified: true,
    purposeRecorded: true,
    riskAssessed: true,
    eddRequired: false,
    openScreeningMatches: 0,
    trueSanctionsMatch: false,
  };

  it("accepts a complete file and blocks an incomplete one", () => {
    expect(canAcceptClient(complete).allowed).toBe(true);
    const r = canAcceptClient({ ...complete, identityVerified: false, openScreeningMatches: 2 });
    expect(r.allowed).toBe(false);
    expect(r.openItems.map((i) => i.id)).toEqual(["identity", "screening"]);
  });

  it("override: only a CO with a written reason; never for anonymity or sanctions", () => {
    const open = { ...complete, purposeRecorded: false };
    expect(canAcceptClient(open, { byRole: "staff", reason: "Client is known to the partner" }).allowed).toBe(false);
    expect(canAcceptClient(open, { byRole: "compliance-officer", reason: "Client is known to the partner" })).toMatchObject({ allowed: true, overridden: true });
    expect(canAcceptClient({ ...complete, hasBearerShares: true }, { byRole: "compliance-officer", reason: "Long-standing client" }).allowed).toBe(false);
    expect(canAcceptClient({ ...complete, trueSanctionsMatch: true }, { byRole: "compliance-officer", reason: "Long-standing client" }).allowed).toBe(false);
  });

  it("EDD and PEP files need senior approval", () => {
    const r = canAcceptClient({ ...complete, eddRequired: true, eddChecklistComplete: true, isPep: true });
    expect(r.openItems.map((i) => i.id)).toEqual(["senior-approval", "pep-approval"]);
  });

  it("estate-agent sale requires buyer and seller; funds can't move until both are verified", () => {
    const m = { sector: "estate-agent" as const, type: "property-sale" as const, transactionHold: false, files: [{ ...complete, role: "buyer" as const }] };
    expect(canTransferFundsOrProperty(m).openItems.map((i) => i.id)).toEqual(["missing-seller"]);
    const both = { ...m, files: [...m.files, { ...complete, partyId: "s", role: "seller" as const, identityVerified: false }] };
    expect(canTransferFundsOrProperty(both).allowed).toBe(false);
    both.files[1].identityVerified = true;
    expect(canTransferFundsOrProperty(both).allowed).toBe(true);
  });

  it("HVG sale requires customer and supplier; an STR hold blocks completion even with override", () => {
    const m = {
      sector: "hvg-trader" as const,
      type: "goods-sale" as const,
      transactionHold: true,
      files: [complete, { ...complete, partyId: "sup", role: "supplier" as const }],
    };
    expect(canCompleteMatter(m, { byRole: "compliance-officer", reason: "Customer is waiting at the counter" }).allowed).toBe(false);
    expect(canCompleteMatter({ ...m, transactionHold: false }).allowed).toBe(true);
  });
});
