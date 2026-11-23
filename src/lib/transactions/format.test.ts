import { describe, expect, it } from "vitest";
import { CSV_TEMPLATE, HEADERS, MAX_ROWS, tableToRows, toEur, validateRow } from "./format";
import { parseCsv } from "@/lib/screening/csv";

const ok = { date: "2026-11-20", client_code: "306139764", amount: "12500.00", currency: "EUR", method: "cash", occasional: "yes" };

describe("transaction file format", () => {
  it("the template parses and its example row is valid", () => {
    const t = tableToRows(parseCsv(CSV_TEMPLATE, ","));
    if ("error" in t) throw new Error(t.error);
    expect(validateRow(t.rows[0].raw).ok).toBe(true);
  });
  it("accepts Lithuanian words and yes/no variants", () => {
    const r = validateRow({ ...ok, method: "Grynieji", occasional: "taip", third_party_payer: "0" });
    expect(r.ok && r.row.method).toBe("cash");
    expect(r.ok && r.row.occasional).toBe(true);
    expect(r.ok && r.row.thirdPartyPayer).toBe(false);
    expect(validateRow({ ...ok, method: "pavedimas" }).ok && validateRow({ ...ok, method: "kortelė" }).ok).toBe(true);
  });
  it("rejects a bad date, a comma amount, an unknown method and a missing occasional, in plain words", () => {
    const r = validateRow({ ...ok, date: "2026-02-30", amount: "1,250", method: "cheque", occasional: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/date "2026-02-30" is not a date/);
    expect(r.error).toMatch(/amount "1,250" must be a number/);
    expect(r.error).toMatch(/method "cheque" must be one of cash, bank-transfer, card, crypto, other/);
    expect(r.error).toMatch(/occasional is required/);
  });
  it("keeps fx_rate for other currencies and converts to EUR", () => {
    const r = validateRow({ ...ok, currency: "usd", fx_rate: "0.92", amount: "1000" });
    expect(r.ok && r.row.currency).toBe("USD");
    expect(r.ok && r.row.fxRate).toBe(0.92);
    expect(toEur(1000, 0.92)).toBe(920);
  });
  it("rejects files over the row limit and files without required columns", () => {
    const big = [HEADERS, ...Array.from({ length: MAX_ROWS + 1 }, () => HEADERS.map(() => "x"))];
    expect(tableToRows(big)).toEqual({ error: expect.stringMatching(/5001 rows\. The limit is 5,000/) });
    expect(tableToRows([["date", "amount"], ["2026-11-20", "1"]])).toEqual({ error: expect.stringMatching(/Missing column\(s\): client_code, currency, method, occasional/) });
  });
});
