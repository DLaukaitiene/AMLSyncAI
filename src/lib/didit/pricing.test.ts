import { describe, expect, it } from "vitest";
import { clientPriceCents, marginCents, parseEcbXml, pricesAt, SERVICE_USD, walletIdvUsd } from "./pricing";

// The rule's worked example uses EUR_PER_USD = 0.86, i.e. USD per EUR = 1 / 0.86.
const R = 1 / 0.86;

describe("pricing rule", () => {
  it("margin tiers and boundaries", () => {
    expect(marginCents(0.49)).toBe(100);
    expect(marginCents(0.5)).toBe(200);
    expect(marginCents(2)).toBe(200);
    expect(marginCents(2.01)).toBe(300);
  });
  it("matches the worked example", () => {
    expect(clientPriceCents(0.33, R)).toBe(130); // Full KYC
    expect(clientPriceCents(1.85, R)).toBe(360); // UK lookup
    expect(clientPriceCents(4.3, R)).toBe(670); // Singapore lookup
    expect(clientPriceCents(0.33 + 0.2, R)).toBe(250); // KYC + AML package: one margin
  });
  it("prices AMLSync services", () => {
    const p = pricesAt(R, "2026-11-20");
    expect(SERVICE_USD.idv).toBeCloseTo(0.68);
    expect([p.idv, p.screen, p.kybLite, p.kybShareholders("LT"), p.kybFull("LT"), p.kybFull("DE")]).toEqual([260, 120, 375, 730, 1075, 730]);
  });
  it("eID wallets: wallet + AML, one margin; Lithuania on the higher KYB rate, Latvia on the European one", () => {
    expect(walletIdvUsd("Smart-ID")).toBeCloseTo(0.41);
    expect(walletIdvUsd("mobile_id")).toBeCloseTo(0.41);
    expect(walletIdvUsd("something new")).toBeCloseTo(0.45);
    expect(clientPriceCents(walletIdvUsd("Smart-ID"), 1.0992)).toBe(140);
    const p = pricesAt(R, "2026-11-20");
    expect(p.kybFull("LV")).toBe(730);
    expect(p.kybFull("LT")).toBe(1075);
    expect(p.searchPack).toBe(515); // 5 × $0.50 = $2.50 → €3 tier
    expect(pricesAt(1.0992, "2026-11-19").searchPack).toBe(530);
  });
  it("never runs without a rate", () => expect(() => clientPriceCents(1, 0)).toThrow());
  it("reads the ECB daily file", () => {
    expect(parseEcbXml(`<Cube><Cube time='2026-11-19'><Cube currency='USD' rate='1.0571'/><Cube currency='JPY' rate='163.1'/></Cube></Cube>`)).toEqual({ date: "2026-11-19", usdPerEur: 1.0571 });
    expect(parseEcbXml("<html>error</html>")).toBeNull();
  });
});
