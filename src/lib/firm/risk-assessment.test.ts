import { describe, expect, it } from "vitest";
import { assess, CONTROL_QUESTIONS, RISK_QUESTIONS, riskAssessmentDoc, type Answers } from "./risk-assessment";

const all = (risk: number, control: number): Answers =>
  Object.fromEntries([...RISK_QUESTIONS.map((q) => [q.id, risk]), ...CONTROL_QUESTIONS.map((q) => [q.id, control])]);

describe("firm risk assessment (§11.2)", () => {
  it("covers ML, TF and sanctions evasion and all Annex factor groups", () => {
    const r = assess(all(0, 2), true);
    expect(r.threats.map((t) => t.threat)).toEqual(["ML", "TF", "SE"]);
    expect(r.groups.map((g) => g.group)).toEqual(["Customers", "Products, services and transactions", "Delivery channels", "Geography"]);
    expect(RISK_QUESTIONS.some((q) => q.threats.includes("SE"))).toBe(true);
    expect(RISK_QUESTIONS.some((q) => q.threats.includes("TF"))).toBe(true);
  });

  it("low risk with strong controls stays Low; no actions", () => {
    const r = assess(all(0, 2), true);
    expect(r).toMatchObject({ overallInherent: "Low", controls: "Strong", overallResidual: "Low", actions: [], unanswered: [] });
  });

  it("one very high factor can't be averaged away", () => {
    const a = all(0, 2);
    a["g-ru-by"] = 3;
    const r = assess(a, true);
    expect(r.threats.find((t) => t.threat === "SE")!.inherent).not.toBe("Low");
    expect(r.actions.join(" ")).toMatch(/Russia or Belarus/);
  });

  it("weak controls raise residual risk and every gap becomes an action", () => {
    const r = assess(all(1, 0), true);
    expect(r.controls).toBe("Weak");
    expect(r.overallResidual).toBe("High");
    expect(r.controlGaps).toHaveLength(CONTROL_QUESTIONS.length);
    expect(r.actions.length).toBeGreaterThanOrEqual(CONTROL_QUESTIONS.length);
  });

  it("flags an unreviewed national risk assessment and national EDD cases", () => {
    const r = assess(all(0, 2), false, ["Client pays in crypto-assets"]);
    expect(r.actions.join(" ")).toMatch(/national risk assessment/);
    expect(r.actions.join(" ")).toMatch(/crypto-assets/);
  });

  it("produces a document with inherent risk, controls, residual risk, action list, version and date", () => {
    const a = all(1, 1);
    const doc = riskAssessmentDoc({ name: "JIP", sectors: ["ACCOUNTANT"], memberState: "LT" }, a, assess(a, true), { version: 3, date: "2027-07-01", euCoreVersion: "x", countryProfileVersion: 2, status: "Draft" });
    expect(doc.sections.map((s) => s.heading)).toEqual(expect.arrayContaining(["1. Summary", "4. Controls", "5. Action plan"]));
    expect(doc.meta[0]).toMatch(/Version 3 · 2027-07-01/);
  });
});
