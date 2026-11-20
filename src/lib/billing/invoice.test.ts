import { describe, expect, it } from "vitest";
import { buildInvoice, invoiceNumber, missingInvoiceDetails, previousMonth, vatTreatment } from "./invoice";

const lt = { name: "Namai UAB", address: "Vilnius", country: "LT", vatId: "LT123456789" };
const ch = (id: string, d = "Identity check") => ({ id, amountCents: -300, kind: "charge", description: d });

describe("VAT treatment", () => {
  it("charges 21 % to Lithuanian customers, even with a VAT number", () => expect(vatTreatment(lt).rateBp).toBe(2100));
  it("reverse-charges other EU businesses whose VAT number passes VIES, with their number on the invoice", () => {
    const v = vatTreatment({ ...lt, country: "LV", vatId: "LV40003012345", viesValid: true });
    expect(v.rateBp).toBe(0);
    expect(v.note).toBe("Atvirkštinis apmokestinimas / Reverse charge. Customer VAT number: LV40003012345");
  });
  it("charges 21 % when the EU VAT number fails VIES or is missing", () => {
    expect(vatTreatment({ ...lt, country: "LV", vatId: "LV40003012345", viesValid: false }).rateBp).toBe(2100);
    expect(vatTreatment({ ...lt, country: "EE", vatId: null }).rateBp).toBe(2100);
  });
  it("doesn't charge Lithuanian VAT outside the EU", () => {
    expect(vatTreatment({ ...lt, country: "NO", vatId: null })).toEqual({ rateBp: 0, note: "Not subject to Lithuanian VAT" });
  });
});

describe("buildInvoice", () => {
  it("groups checks, subtracts refunds, applies credit, adds VAT", () => {
    const inv = buildInvoice(4900, "starter", [ch("1"), ch("2"), ch("3", "Screening"), { id: "4", amountCents: 300, kind: "refund", description: "Refund: expired" }, { id: "5", amountCents: 1500, kind: "trial", description: "Welcome" }], lt);
    expect(inv.lines.map((l) => [l.description, l.quantity, l.netCents])).toEqual([
      ["AMLSync App subscription, starter plan (monthly)", 1, 4900],
      ["Identity check", 2, 600],
      ["Screening", 1, 300],
      ["Refunds for checks that expired or failed", 1, -300],
      ["Credit applied (welcome / prepaid credit)", 1, -1500],
    ]);
    expect(inv.netCents).toBe(4000);
    expect(inv.vatCents).toBe(840);
    expect(inv.totalCents).toBe(4840);
    expect(inv.carryCents).toBe(0);
  });
  it("never goes negative; unused credit carries forward", () => {
    const inv = buildInvoice(0, "starter", [ch("1"), { id: "t", amountCents: 1500, kind: "trial", description: "Welcome" }], lt);
    expect(inv.netCents).toBe(0);
    expect(inv.carryCents).toBe(1200);
  });
});

describe("numbering and periods", () => {
  it("formats a continuous series", () => expect(invoiceNumber(2026, 42)).toBe("AMS-2026-00042"));
  it("previous month across a year boundary", () => expect(previousMonth(new Date("2027-01-01T03:00:00Z"))).toEqual({ from: "2026-12-01", toExclusive: "2027-01-01", label: "December 2026" }));
});

import { monthlyFeeFor, planOf } from "./plans";
describe("plans and trial", () => {
  it("Solo €49 and Starter €149; unknown plans fall back to Starter", () => {
    expect(planOf("solo").monthlyCents).toBe(4900);
    expect(planOf("starter").monthlyCents).toBe(14900);
    expect(planOf("custom").monthlyCents).toBeNull();
  });
  it("no fee during the 14-day trial, a share by days in the month it ends", () => {
    expect(monthlyFeeFor("solo", null, "2026-12-01", "2026-11-01", "2026-12-01")).toBe(0);
    expect(monthlyFeeFor("solo", null, "2026-11-16", "2026-11-01", "2026-12-01")).toBe(Math.round((4900 * 15) / 30));
    expect(monthlyFeeFor("solo", null, "2026-10-01", "2026-11-01", "2026-12-01")).toBe(4900);
    expect(monthlyFeeFor("custom", 39900, null, "2026-11-01", "2026-12-01")).toBe(39900);
    expect(monthlyFeeFor("custom", null, null, "2026-11-01", "2026-12-01")).toBe(0);
  });
});

describe("cancellation", () => {
  it("charges the cancellation month up to the cancellation day, nothing after", () => {
    expect(monthlyFeeFor("solo", null, null, "2026-11-01", "2026-12-01", "2026-11-16")).toBe(Math.round((4900 * 15) / 30));
    expect(monthlyFeeFor("solo", null, null, "2026-12-01", "2027-01-01", "2026-11-16")).toBe(0);
  });
});

describe("invoice details", () => {
  it("lists what is missing before the first invoice", () => {
    const f = { billingName: "Namai UAB", billingAddress: null, billingCompanyCode: "123", billingCountry: "LT", vatId: null, vatNotRegistered: false, billingEmail: "a@b.lt" };
    expect(missingInvoiceDetails(f)).toEqual(["registered address", "VAT number (or confirm you aren't VAT-registered)"]);
    expect(missingInvoiceDetails({ ...f, billingAddress: "Vilnius", vatNotRegistered: true })).toEqual([]);
  });
});
