"use client";

import { useState } from "react";
import { Field } from "./form";

/** CDD data set fields for a natural person or legal entity (spec §4.2). */
export function PartyFields({ prefix = "", allowLegal = true, compact = false }: { prefix?: string; allowLegal?: boolean; compact?: boolean }) {
  const [kind, setKind] = useState<"NATURAL" | "LEGAL">("NATURAL");
  const n = (k: string) => prefix + k;
  return (
    <div className="space-y-4">
      {allowLegal && (
        <div role="radiogroup" aria-label="Type" className="flex gap-4 text-sm">
          {(["NATURAL", "LEGAL"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2">
              <input type="radio" name={n("kind")} value={k} checked={kind === k} onChange={() => setKind(k)} />
              {k === "NATURAL" ? "Person" : "Company / legal entity"}
            </label>
          ))}
        </div>
      )}
      {!allowLegal && <input type="hidden" name={n("kind")} value="NATURAL" />}
      {kind === "NATURAL" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First names (all)" name={n("firstNames")} required />
          <Field label="Surname" name={n("lastName")} required />
          <Field label="Date of birth" name={n("birthDate")} type="date" />
          {!compact && <Field label="Place of birth" name={n("placeOfBirth")} />}
          <Field label="Nationalities" name={n("nationalities")} hint="All of them, 2-letter codes, e.g. LT, PL" />
          <Field label="Country of residence" name={n("residenceCountry")} hint="2-letter code" />
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
          <Field label="Legal form" name={n("legalForm")} />
          <Field label="Registration number" name={n("registrationNumber")} />
          <Field label="Country of creation" name={n("countryOfCreation")} hint="2-letter code" />
          {!compact && (
            <>
              <Field label="LEI" name={n("lei")} />
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
