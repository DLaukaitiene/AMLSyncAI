/**
 * EU cross-border B2C threshold monitor (§9.3): while cross-border sales to
 * EU customers without a VAT number stay under €10,000 a calendar year,
 * Lithuanian VAT applies; above it, the customer's country rate via OSS.
 * [verify with the accountant]
 */
export const B2C_THRESHOLD_CENTS = 1_000_000;
export const B2C_ALERT_SHARE = 0.8;

const EU = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]);

export function isCrossBorderB2C(buyer: { country?: string | null; vatId?: string | null }, sellerCountry = "LT"): boolean {
  const c = (buyer.country ?? "").toUpperCase();
  return EU.has(c) && c !== sellerCountry && !(buyer.vatId ?? "").replace(/\s/g, "");
}

export function b2cThreshold(invoices: { issuedOn: string; netCents: number; status: string; buyer: unknown }[], year: number) {
  const total = invoices
    .filter((i) => i.status !== "void" && i.issuedOn.startsWith(String(year)) && isCrossBorderB2C((i.buyer ?? {}) as { country?: string; vatId?: string }))
    .reduce((s, i) => s + i.netCents, 0);
  return { totalCents: total, share: total / B2C_THRESHOLD_CENTS, alert: total >= B2C_ALERT_SHARE * B2C_THRESHOLD_CENTS, exceeded: total > B2C_THRESHOLD_CENTS };
}
