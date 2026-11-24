/**
 * CDD data set for parties (spec §4.2, §3 row 14; AMLR Art. 22, 62; CDD RTS).
 */
import { z } from "zod";
import { normalizeCountries, normalizeCountry } from "@/lib/geo/countries";
import { RISK_FLAG_IDS } from "./risk-flags";

/** Any country: ISO code where recognised, otherwise the name as typed ("Other"). */
const country = z.string().transform((v, ctx) => {
  const c = normalizeCountry(v);
  if (!c || c.length < 2) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a country" });
    return z.NEVER;
  }
  return c;
});
/** Up to 5 other names, comma- or line-separated. */
const otherNames = z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v : v.split(/[,;\n]+/)).map((x) => x.trim()).filter(Boolean).slice(0, 5));
const countries = z.union([z.string(), z.array(z.string())]).transform((v) => normalizeCountries(v));
const optDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional().or(z.literal("").transform(() => undefined));
/** Ticked high-risk flags (lib/cdd/risk-flags); unknown ids are dropped. */
const riskFlags = z.union([z.string(), z.array(z.string())]).transform((v) => [...new Set((Array.isArray(v) ? v : [v]).filter((x) => RISK_FLAG_IDS.includes(x)))]);
const notes = z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined));
const optText = z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined));

export const naturalPersonSchema = z.object({
  firstNames: z.string().trim().min(1, "Enter all first names").max(200),
  lastName: z.string().trim().min(1, "Enter the surname").max(200),
  birthDate: optDate,
  placeOfBirth: optText,
  otherNames: otherNames.default([]),
  nationalities: countries.default([]), // all nationalities (verify one)
  residenceCountry: z.literal("").transform(() => undefined).or(country.optional()),
  address: optText,
  occupation: optText,
  email: z.string().trim().email().optional().or(z.literal("").transform(() => undefined)),
  phone: optText,
  isPep: z.boolean().default(false),
  pepFunction: optText,
  pepLeftOfficeOn: optDate,
  isPepFamilyOrAssociate: z.boolean().default(false),
  riskFlags: riskFlags.default([]),
  notes,
});

export const legalEntitySchema = z.object({
  name: z.string().trim().min(1, "Enter the legal name").max(300),
  legalForm: optText,
  otherNames: otherNames.default([]),
  registrationNumber: optText,
  lei: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{20}$/, "An LEI has 20 characters").optional().or(z.literal("").transform(() => undefined)),
  registeredOffice: optText,
  principalPlaceOfBusiness: optText,
  /** Registered office country. Kept under this key: the registered office is in the country of creation. */
  countryOfCreation: z.literal("").transform(() => undefined).or(country.optional()),
  principalPlaceOfBusinessCountry: z.literal("").transform(() => undefined).or(country.optional()),
  natureOfBusiness: optText,
  bearerShares: z.boolean().default(false),
  nomineeArrangements: z.boolean().default(false),
  riskFlags: riskFlags.default([]),
  notes,
});

export type NaturalPerson = z.infer<typeof naturalPersonSchema>;
export type LegalEntity = z.infer<typeof legalEntitySchema>;

export function displayName(kind: "NATURAL" | "LEGAL" | "ARRANGEMENT", d: Record<string, unknown>): string {
  return kind === "NATURAL" ? `${d.firstNames ?? ""} ${d.lastName ?? ""}`.trim() : String(d.name ?? "");
}

/** Countries linked to a party, for risk scoring and screening. */
export function partyCountries(kind: string, d: Record<string, unknown>): string[] {
  const c = kind === "NATURAL"
    ? [...((d.nationalities as string[]) ?? []), d.residenceCountry as string | undefined]
    : [d.countryOfCreation as string | undefined, d.principalPlaceOfBusinessCountry as string | undefined];
  return [...new Set(c.filter((x): x is string => !!x))];
}

/** Product / service risk by sector (from the firm risk assessment; default values). */
export const SECTOR_PRODUCT_RISK: Record<string, "low" | "medium" | "high"> = {
  ACCOUNTANT: "low",
  ESTATE_AGENT: "medium",
  HVG_TRADER: "medium",
  PRECIOUS_METALS: "high",
  TCSP: "high",
  LEGAL: "medium",
  ART_TRADER: "medium",
  GAMBLING: "high",
  CROWDFUNDING: "medium",
  CREDIT_INTERMEDIARY: "low",
  INVESTMENT_MIGRATION: "high",
  FOOTBALL: "medium",
  OTHER: "medium",
};
