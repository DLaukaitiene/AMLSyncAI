"use client";

import { useState } from "react";
import { CountryField, Field } from "./form";

/** CDD data set fields for a natural person or legal entity (spec §4.2). */
/** "What are you adding?" options on Add Client (ClearAML's wording). */
const CLIENT_TYPES = [
  { id: "individual", label: "Individual or sole trader", hint: "A person, including someone trading under their own name", kind: "NATURAL" },
  { id: "company", label: "Company or other organisation", hint: "Company, partnership, trust, association, foundation or other legal entity", kind: "LEGAL" },
] as const;

export function PartyFields({ prefix = "", allowLegal = true, compact = false, chooser = false }: { prefix?: string; allowLegal?: boolean; compact?: boolean; chooser?: boolean }) {
  const [kind, setKind] = useState<"NATURAL" | "LEGAL">("NATURAL");
  const [clientType, setClientType] = useState<(typeof CLIENT_TYPES)[number]["id"]>("individual");
  const n = (k: string) => prefix + k;
  return (
    <div className="space-y-4">
      {chooser && (
        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold">What are you adding?</legend>
          <input type="hidden" name={n("kind")} value={kind} />
          <div className="grid gap-2 sm:grid-cols-2">
            {CLIENT_TYPES.map((t) => (
              <label key={t.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm transition ${clientType === t.id ? "border-accent bg-accent/10" : "border-border hover:border-accent"}`}>
                <input type="radio" name="clientType" aria-label={t.label} value={t.id} checked={clientType === t.id} onChange={() => { setClientType(t.id); setKind(t.kind); }} className="mt-1" />
                <span><span className="block font-semibold">{t.label}</span><span className="block text-xs text-muted">{t.hint}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {allowLegal && !chooser && (
        <div role="radiogroup" aria-label="Type" className="flex gap-4 text-sm">
          {(["NATURAL", "LEGAL"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2">
              <input type="radio" name={n("kind")} value={k} checked={kind === k} onChange={() => setKind(k)} />
              {k === "NATURAL" ? "Person" : "Company / legal entity"}
            </label>
          ))}
        </div>
      )}
      {!allowLegal && !chooser && <input type="hidden" name={n("kind")} value="NATURAL" />}
      {kind === "NATURAL" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First names (all)" name={n("firstNames")} required />
          <Field label="Surname" name={n("lastName")} required />
          <Field label="Date of birth" name={n("birthDate")} type="date" />
          <Field label="Other names" name={n("otherNames")} hint="Maiden or previous names, other spellings — up to 5, separated by commas. All are screened." />
          {!compact && <Field label="Place of birth" name={n("placeOfBirth")} />}
          <CountryField label="Nationalities" name={n("nationalities")} multiple hint="Add all of them. Not listed? Type the name and press Add country." />
          <CountryField label="Country of residence" name={n("residenceCountry")} />
          {!compact && (
            <>
              <Field label="Residential address" name={n("address")} />
              <Field label="Occupation" name={n("occupation")} />
              <Field label="Email" name={n("email")} type="email" />
              <Field label="Phone" name={n("phone")} />
            </>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name={n("isPep")} /> Politically exposed person (now or in the last 12 months)
          </label>
          {!compact && (
            <>
              <Field label="Prominent public function" name={n("pepFunction")} />
              <Field label="Left office on" name={n("pepLeftOfficeOn")} type="date" hint="Former PEPs stay in scope at least 12 months (Art. 46)." />
            </>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name={n("isPepFamilyOrAssociate")} /> Family member or close associate of a PEP
          </label>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Legal name" name={n("name")} required />
          <Field label="Legal form" name={n("legalForm")} hint="E.g. private limited company, partnership, trust, association." />
          <Field label="Other names" name={n("otherNames")} hint="Trading or previous names — up to 5, separated by commas. All are screened." />
          <Field label="Registration number" name={n("registrationNumber")} />
          <CountryField label="Country of creation" name={n("countryOfCreation")} />
          {!compact && (
            <>
              <Field label="LEI" name={n("lei")} hint="Legal Entity Identifier — 20 letters and digits, if the entity has one. Look it up at search.gleif.org." />
              <Field label="Registered office" name={n("registeredOffice")} />
              <Field label="Principal place of business" name={n("principalPlaceOfBusiness")} />
              <Field label="Nature of business" name={n("natureOfBusiness")} />
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={n("bearerShares")} /> Has bearer shares
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={n("nomineeArrangements")} /> Nominee shareholders or directors
          </label>
        </div>
      )}
    </div>
  );
}
