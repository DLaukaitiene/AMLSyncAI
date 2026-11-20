import { normalizeCountry } from "@/lib/geo/countries";

/**
 * People a company's representative lists in the client portal: directors,
 * shareholders, beneficial owners and the person signing. Flat form fields
 * p{i}_{field} (no client-side script), rows left empty are ignored.
 * Nothing here is written to the structure: the firm reviews each person.
 */
export const PEOPLE_ROWS = 8;
export const PERSON_ROLES = [
  ["director", "Director / board member"],
  ["shareholder", "Shareholder"],
  ["ubo", "Beneficial owner (25% or more, or control)"],
  ["signatory", "Representative / signatory"],
] as const;
export type PersonRole = (typeof PERSON_ROLES)[number][0];

export interface DeclaredPerson {
  name: string;
  firstName?: string;
  lastName?: string;
  entityType: "person" | "company";
  roles: string[];
  ownershipPct: number | null;
  effectivePct: null;
  birthDate?: string;
  nationality?: string;
  registrationNumber?: string;
  email?: string;
  isPep?: boolean;
  pepFunction?: string;
  controlDescription?: string;
  active: true;
  addedPartyId: null;
}

export type PeopleResult = { ok: true; people: DeclaredPerson[] } | { ok: false; fieldErrors: Record<string, string[]> };

export function parseCompanyPeople(o: Record<string, string>): PeopleResult {
  const people: DeclaredPerson[] = [];
  const fieldErrors: Record<string, string[]> = {};
  const err = (k: string, m: string) => (fieldErrors[k] ??= []).push(m);
  for (let i = 0; i < PEOPLE_ROWS; i++) {
    const f = (k: string) => String(o[`p${i}_${k}`] ?? "").trim();
    const name = f("name").slice(0, 200);
    const roles = PERSON_ROLES.map(([r]) => r).filter((r) => o[`p${i}_role_${r}`] === "on");
    const pctText = f("pct").replace(",", ".").replace("%", "");
    if (!name && !roles.length && !pctText && !f("birthDate") && !f("email")) continue;
    if (!name) { err(`p${i}_name`, "Enter the name."); continue; }
    if (!roles.length) err(`p${i}_name`, `Choose at least one role for ${name}.`);
    const company = f("type") === "company";
    const pct = pctText ? Number(pctText) : null;
    if (pct !== null && !(pct > 0 && pct <= 100)) err(`p${i}_pct`, "Enter a percentage between 0 and 100.");
    const birthDate = f("birthDate");
    if (!company && birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) err(`p${i}_birthDate`, "Use the date picker.");
    if (!company && !birthDate) err(`p${i}_birthDate`, `Enter ${name}'s date of birth.`);
    const email = f("email");
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) err(`p${i}_email`, "Enter a valid email address.");
    const pep = f("pep");
    if (!company && pep !== "yes" && pep !== "no") err(`p${i}_pep`, `Answer the public-function question for ${name}.`);
    const finalRoles: string[] = [...roles];
    if (pct !== null && !finalRoles.includes("shareholder")) finalRoles.push("shareholder");
    const [first, ...rest] = name.split(/\s+/);
    people.push({
      name, entityType: company ? "company" : "person", roles: finalRoles, ownershipPct: pct, effectivePct: null,
      ...(company ? {} : { firstName: rest.length ? first : name, lastName: rest.join(" ") || "-" }),
      ...(birthDate && !company ? { birthDate } : {}),
      ...(f("nationality") ? { nationality: normalizeCountry(f("nationality")) ?? f("nationality").slice(0, 60) } : {}),
      ...(company && f("regNo") ? { registrationNumber: f("regNo").slice(0, 60) } : {}),
      ...(email ? { email: email.slice(0, 200) } : {}),
      ...(!company ? { isPep: pep === "yes" } : {}),
      ...(pep === "yes" && f("pepFunction") ? { pepFunction: f("pepFunction").slice(0, 300) } : {}),
      ...(f("control") ? { controlDescription: f("control").slice(0, 300) } : {}),
      active: true, addedPartyId: null,
    });
  }
  if (!people.length) err("p0_name", "List the company's directors and owners.");
  if (people.length && !people.some((p) => p.roles.includes("director"))) err("p0_name", "List at least one director (board member or manager).");
  const total = people.reduce((a, p) => a + (p.ownershipPct ?? 0), 0);
  if (total > 100.0001) err("p0_pct", `Shareholdings add up to ${total}%. Check the percentages.`);
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true, people };
}
