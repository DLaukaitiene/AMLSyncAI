/**
 * Client prices for services delivered with Didit [pricing rule, 20 Nov 2026]:
 *   client price (EUR) = Didit list price (USD) × EUR per USD (ECB reference rate) + margin,
 * margin by the Didit cost of one billable unit: under $0.50 → €1; $0.50–$2.00 → €2; over $2.00 → €3.
 * A package sold as one item gets one margin, chosen from the package total.
 * The result is rounded up to the next €0.05. Free tiers and plan discounts are ignored.
 * List prices from didit.me/pricing, checked 20 Nov 2026; KYB prices are Didit staging rates (subject to change).
 */

export const DIDIT_USD = {
  kycBundle: 0.33, // ID + passive liveness + face match + device/IP
  nfc: 0.15,
  amlScreening: 0.2,
  ongoingMonitoringYear: 0.07,
  smartId: 0.21,
  kybLite: 2.0,
  kybShareholdersEurope: 4.0,
  kybShareholdersRest: 5.0,
  kybUboEurope: 5.0,
  kybUboRest: 9.0,
} as const;

/** eID wallets (per completed verification). */
export const WALLET_USD: Record<string, number> = { "smart-id": 0.21, "mobile-id": 0.21, mitid: 0.25, bankid: 0.2, ftn: 0.25 };
/** Didit cost of a verification done with an eID wallet: the wallet plus AML screening. Unknown wallets: the dearest one. */
export function walletIdvUsd(provider: string | null | undefined): number {
  const k = (provider ?? "").toLowerCase().replace(/[_\s]+/g, " ").trim();
  const key = /smart/.test(k) ? "smart-id" : /mobile/.test(k) ? "mobile-id" : /mitid/.test(k) ? "mitid" : /bankid/.test(k) ? "bankid" : /finnish|ftn|trust network/.test(k) ? "ftn" : "";
  return (WALLET_USD[key] ?? Math.max(...Object.values(WALLET_USD))) + DIDIT_USD.amlScreening;
}

/**
 * Countries on Didit's cheaper "most of Europe" KYB rate (didit.me/pricing, 20 Nov 2026). Exception: Lithuania stays on
 * the higher rate for now, because Didit told us directly it uses that rate [being confirmed with Didit].
 */
export const KYB_EUROPE_RATE = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "LV", "LI", "LU", "MT", "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "CH", "GB"]);

/** What each service sold in AMLSync App is made of (one billable unit each). */
export const SERVICE_USD = {
  /** Identity check workflow: KYC bundle + NFC chip reading + AML screening. */
  idv: DIDIT_USD.kycBundle + DIDIT_USD.nfc + DIDIT_USD.amlScreening,
  screen: DIDIT_USD.amlScreening,
  kybLite: DIDIT_USD.kybLite,
  kybShareholders: (country: string) => (KYB_EUROPE_RATE.has(country.toUpperCase()) ? DIDIT_USD.kybShareholdersEurope : DIDIT_USD.kybShareholdersRest),
  kybFull: (country: string) => (KYB_EUROPE_RATE.has(country.toUpperCase()) ? DIDIT_USD.kybUboEurope : DIDIT_USD.kybUboRest),
};

/** Margin in euro cents for one billable unit costing `usd` at Didit. */
export function marginCents(usd: number): number {
  const u = Math.round(usd * 10000) / 10000;
  return u < 0.5 ? 100 : u <= 2 ? 200 : 300;
}

/** Client price in euro cents, rounded up to the next 5 cents. `usdPerEur` is the ECB reference rate (USD for 1 EUR). */
export function clientPriceCents(usd: number, usdPerEur: number): number {
  if (!(usdPerEur > 0)) throw new Error("No exchange rate.");
  const costCents = (usd / usdPerEur) * 100;
  const exact = costCents + marginCents(usd);
  return Math.ceil(Math.round(exact * 1e6) / 1e6 / 5) * 5;
}

export interface ClientPrices {
  idv: number;
  screen: number;
  kybLite: number;
  kybShareholders: (country: string) => number;
  kybFull: (country: string) => number;
  rate: { usdPerEur: number; date: string };
}

export function pricesAt(usdPerEur: number, date: string): ClientPrices {
  const p = (usd: number) => clientPriceCents(usd, usdPerEur);
  return {
    idv: p(SERVICE_USD.idv),
    screen: p(SERVICE_USD.screen),
    kybLite: p(SERVICE_USD.kybLite),
    kybShareholders: (c) => p(SERVICE_USD.kybShareholders(c)),
    kybFull: (c) => p(SERVICE_USD.kybFull(c)),
    rate: { usdPerEur, date },
  };
}

/** ECB daily XML → { date, usdPerEur } or null. */
export function parseEcbXml(xml: string): { date: string; usdPerEur: number } | null {
  const date = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
  const usd = xml.match(/currency=['"]USD['"]\s+rate=['"]([\d.]+)['"]/)?.[1];
  return date && usd && Number(usd) > 0 ? { date, usdPerEur: Number(usd) } : null;
}
