import { describe, expect, it } from "vitest";
import { parseTransactionCsv, TRANSACTION_TEMPLATE } from "./import";

describe("transaction CSV import", () => {
  it("reads the template", () => {
    const r = parseTransactionCsv(TRANSACTION_TEMPLATE);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ date: "2026-11-03", amountEUR: 4500, method: "cash", client: "Jonas Jonaitis", matter: "Sale of Vilniaus g. 1", fromCountry: "LT", thirdParty: false });
  });
  it("semicolons, European numbers and dates, Lithuanian headers", () => {
    const r = parseTransactionCsv("Data;Suma;Būdas;Klientas;Byla\n03.11.2026;1.234,56;grynieji;Ona;Byla 7\n");
    expect(r.rows[0]).toMatchObject({ date: "2026-11-03", amountEUR: 1234.56, method: "cash", client: "Ona", matter: "Byla 7" });
  });
  it("row errors don't stop the other rows", () => {
    const r = parseTransactionCsv("date,amount,client,matter\nxx,10,A,M\n2026-01-01,-5,A,M\n2026-01-02,10,,M\n2026-01-03,10,A,M\n");
    expect(r.rows.map((x) => x.line)).toEqual([5]);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4]);
  });
  it("missing required columns", () => {
    expect(parseTransactionCsv("date,amount\n2026-01-01,5\n").errors[0].error).toMatch(/client, matter/);
  });
  it("unknown method kept as other", () => {
    expect(parseTransactionCsv("date,amount,method,client,matter\n2026-01-01,5,cheque,A,M\n").rows[0].method).toBe("other: cheque");
  });
});
