/**
 * CDD data set for parties (spec §4.2, §3 row 14; AMLR Art. 22, 62; CDD RTS).
 */
import { z } from "zod";

const iso2 = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a 2-letter country code");
const optDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional().or(z.literal("").transform(() => undefined));
const optText = z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined));

export const naturalPersonSchema = z.object({
  firstNames: z.string().trim().min(1, "Enter all first names").max(200),
  lastName: z.string().trim().min(1, "Enter the surname").max(200),
  birthDate: optDate,
  placeOfBirth: optText,
  nationalities: z.array(iso2).default([]), // all nationalities (verify one)
  residenceCountry: iso2.optional().or(z.literal("").transform(() => undefined)),
  address: optText,
  occupation: optText,
  email: z.string().trim().email().optional().or(z.literal("").transform(() => undefined)),
  phone: optText,
  isPep: z.boolean().default(false),
  pepFunction: optText,
  pepLeftOfficeOn: optDate,
  isPepFamilyOrAssociate: z.boolean().default(false),
});

export const legalEntitySchema = z.object({
  name: z.string().trim().min(1, "Enter the legal name").max(300),
  legalForm: optText,
  registrationNumber: optText,
  lei: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{20}$/, "An LEI has 20 characters").optional().or(z.literal("").transform(() => undefined)),
  registeredOffice: optText,
  principalPlaceOfBusiness: optText,
  countryOfCreation: iso2.optional().or(z.literal("").transform(() => undefined)),
  natureOfBusiness: optText,
  bearerShares: z.boolean().default(false),
  nomineeArrangements: z.boolean().default(false),
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
    : [d.countryOfCreation as string | undefined];
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
