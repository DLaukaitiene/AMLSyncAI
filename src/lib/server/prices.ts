import "server-only";
import { adminDb } from "./db";
import { parseEcbXml, pricesAt, type ClientPrices } from "@/lib/didit/pricing";

/**
 * Client prices for Didit services, from the latest ECB euro reference rate.
 * The rate is fetched from the ECB at most once a day and stored. If the ECB
 * can't be reached, the last stored rate is used (in production only if it is
 * at most 7 days old). Without a rate, paid checks are not offered: the rate is
 * never guessed.
 */
const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const MAX_AGE_DAYS = 7;

export class PriceUnavailable extends Error {
  constructor() { super("Prices are being updated (no current exchange rate). Try again in a few minutes."); }
}

export async function refreshFxRate(): Promise<{ date: string; usdPerEur: number } | null> {
  try {
    const res = await fetch(ECB_URL, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
    if (!res.ok) return null;
    const r = parseEcbXml(await res.text());
    if (!r) return null;
    await adminDb.fxRate.upsert({ where: { date: r.date }, create: { date: r.date, usdPerEur: r.usdPerEur }, update: { usdPerEur: r.usdPerEur, fetchedAt: new Date() } });
    return r;
  } catch {
    return null;
  }
}

let memo: { at: number; prices: ClientPrices } | null = null;

export async function currentPrices(): Promise<ClientPrices> {
  if (memo && Date.now() - memo.at < 10 * 60_000) return memo.prices;
  let latest = await adminDb.fxRate.findFirst({ orderBy: { date: "desc" } });
  const checkedToday = latest && Date.now() - latest.fetchedAt.getTime() < 20 * 3600_000;
  if (!checkedToday) {
    const r = await refreshFxRate();
    if (r) latest = await adminDb.fxRate.findFirst({ orderBy: { date: "desc" } });
  }
  if (!latest) throw new PriceUnavailable();
  const ageDays = (Date.now() - Date.parse(latest.date + "T00:00:00Z")) / 86_400_000;
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_EMAIL !== "1" && ageDays > MAX_AGE_DAYS) throw new PriceUnavailable();
  const prices = pricesAt(Number(latest.usdPerEur), latest.date);
  memo = { at: Date.now(), prices };
  return prices;
}

/** For pages: prices, or null while no rate is available. */
export async function currentPricesOrNull(): Promise<ClientPrices | null> {
  try { return await currentPrices(); } catch { return null; }
}
