/**
 * EU sectoral sanctions rule pack relevant to non-financial obliged entities
 * (spec §4.4, §11.8). Maintained as part of the EU Core. [verify] against the
 * consolidated versions of the regulations before each release.
 *
 * - Reg. (EU) 833/2014 Art. 5n: ban on providing accounting, auditing
 *   (incl. statutory audit), bookkeeping, tax consulting, business and
 *   management consulting and public relations services to the Government
 *   of Russia or to legal persons, entities or bodies established in Russia.
 *   Extended to legal advisory, architectural/engineering, IT consultancy and
 *   market research services.
 * - Reg. (EC) 765/2006 (Belarus): equivalent services ban for Belarus-established entities.
 * - Reg. (EU) 833/2014 Art. 3h (Annex XVIII): ban on selling, supplying,
 *   transferring or exporting luxury goods (generally > €300 per item;
 *   lower/other thresholds for some categories) to any natural or legal
 *   person in Russia or for use in Russia. Same for Belarus (765/2006 Art. 1y).
 */

export const SECTORAL_RULESET_VERSION = "2026-11 [verify]";

const SERVICE_SECTORS = new Set(["ACCOUNTANT", "LEGAL", "TCSP"]);
const LUXURY_SECTORS = new Set(["HVG_TRADER", "PRECIOUS_METALS", "ART_TRADER"]);
const COUNTRIES: Record<string, string> = { RU: "Russia", BY: "Belarus" };

export interface SectoralCheckInput {
  firmSectors: string[];
  client: { kind: "NATURAL" | "LEGAL" | "ARRANGEMENT"; countryOfCreation?: string; residenceCountry?: string; isGovernment?: boolean };
  /** For sales of goods: where the goods go / are used, and the value per item. */
  goods?: { destinationCountry?: string; valuePerItemEUR?: number };
}

export interface SectoralBan {
  rule: string;
  regulation: string;
  explanation: string;
}

export function checkSectoralSanctions(i: SectoralCheckInput): SectoralBan[] {
  const out: SectoralBan[] = [];
  const established = i.client.kind !== "NATURAL" ? i.client.countryOfCreation : undefined;
  if (established && COUNTRIES[established] && i.firmSectors.some((s) => SERVICE_SECTORS.has(s))) {
    out.push({
      rule: "services-ban",
      regulation: established === "RU" ? "Reg. (EU) 833/2014 Art. 5n" : "Reg. (EC) 765/2006",
      explanation: `Accounting, audit, bookkeeping, tax, business consulting, legal advisory and similar services to entities established in ${COUNTRIES[established]} are prohibited. Don't provide the service; record the refusal.`,
    });
  }
  const dest = i.goods?.destinationCountry ?? (i.client.kind === "NATURAL" ? i.client.residenceCountry : i.client.countryOfCreation);
  if (dest && COUNTRIES[dest] && i.firmSectors.some((s) => LUXURY_SECTORS.has(s)) && (i.goods?.valuePerItemEUR === undefined || i.goods.valuePerItemEUR > 300)) {
    out.push({
      rule: "luxury-goods-ban",
      regulation: dest === "RU" ? "Reg. (EU) 833/2014 Art. 3h, Annex XVIII" : "Reg. (EC) 765/2006 Art. 1y",
      explanation: `Selling luxury goods (generally over €300 per item) to persons in ${COUNTRIES[dest]} or for use there is prohibited.`,
    });
  }
  return out;
}
