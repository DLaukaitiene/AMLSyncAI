"use client";

import { useId, useState, type ReactNode } from "react";
import { CountryField, Field } from "./form";
import { FLAG_GROUPS, RISK_FLAGS, type FlagGroup, type RiskFlag } from "@/lib/cdd/risk-flags";
import { LawRef } from "@/components/law-ref";

/** CDD data set fields for a natural person or legal entity (spec §4.2). */
/** "What are you adding?" options on Add Client (ClearAML's wording). */
/** Common legal forms (EU / Lithuania); users can type any other. */
const LEGAL_FORMS = [
  "Private limited company (UAB / Ltd / GmbH)",
  "Public limited company (AB / plc / AG)",
  "Small partnership (MB)",
  "General partnership",
  "Limited partnership",
  "Sole proprietorship (IĮ)",
  "Public institution (VšĮ)",
  "Association",
  "Foundation / charity",
  "Cooperative",
  "Trust",
  "Branch of a foreign company",
  "State or municipal enterprise",
];

const CLIENT_TYPES = [
  { id: "individual", label: "Individual or sole trader", hint: "A person, including someone trading under their own name", kind: "NATURAL" },
  { id: "company", label: "Company or other organisation", hint: "Company, partnership, trust, association, foundation or other legal entity", kind: "LEGAL" },
] as const;

export function PartyFields({ prefix = "", allowLegal = true, compact = false, chooser = false, canOverrideRisk = false }: { prefix?: string; allowLegal?: boolean; compact?: boolean; chooser?: boolean; canOverrideRisk?: boolean }) {
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
          {!compact && <Field label="Place of birth" name={n("placeOfBirth")} />}
          <CountryField label="Country of residence" name={n("residenceCountry")} />
          {!compact && <Field label="Residential address" name={n("address")} />}
          {chooser && <Field label="National ID number" name={n("nationalId")} hint="Personal code from the ID card or passport. Stored encrypted." autoComplete="off" />}
          <CountryField label="Nationalities" name={n("nationalities")} multiple hint="Add all of them. Not listed? Type the name and press Add country." />
          {!compact && (
            <>
              <Field label="Email" name={n("email")} type="email" />
              <Field label="Phone" name={n("phone")} />
            </>
          )}
          {chooser && <Field label="Purpose and intended nature of the relationship" name="purpose" hint="For example: personal income tax returns." />}
          {!compact && <Field label="Occupation" name={n("occupation")} />}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Legal name" name={n("name")} required />
          <Field label="Other names" name={n("otherNames")} hint="Trading or previous names — up to 5, separated by commas. All are screened." />
          <Field label="Legal form" name={n("legalForm")} options={LEGAL_FORMS} hint="Pick from the list or type another legal form." />
          <Field label="Registration number" name={n("registrationNumber")} />
          {!compact && <Field label="Registered office address" name={n("registeredOffice")} hint="Official address in the business register." />}
          <CountryField label="Registered office country" name={n("countryOfCreation")} hint="Type the country name, e.g. Lithuania. Usually the country the company was set up in." />
          {!compact && (
            <>
              <Field label="Principal place of business address" name={n("principalPlaceOfBusiness")} hint="Where the company actually operates, if different from the registered office." />
              <CountryField label="Principal place of business country" name={n("principalPlaceOfBusinessCountry")} hint="Type the country name, e.g. Lithuania." />
            </>
          )}
          {chooser && <Field label="Tax ID" name="taxId" hint="Company tax or VAT number. Stored encrypted." autoComplete="off" />}
          {!compact && <Field label="LEI" name={n("lei")} hint="Legal Entity Identifier — 20 letters and digits, if the entity has one. Look it up at search.gleif.org." />}
          {!compact && <Field label="Nature of business" name={n("natureOfBusiness")} hint="What the company does, e.g. wholesale of building materials, software development, property rental." />}
          {chooser && <Field label="Nature of relationship" name="purpose" hint="Purpose and intended nature of the relationship, e.g. annual accounts and tax returns for a trading company." />}
        </div>
      )}
      <RiskFlagsSection kind={kind} n={n} groups={compact ? ["ownership"] : undefined} />
      {chooser && (
        <>
          <NotesField name={n("notes")} />
          <ManualRiskRating allowed={canOverrideRisk} />
        </>
      )}
    </div>
  );
}

function NotesField({ name }: { name: string }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">Notes</label>
      <textarea id={id} name={name} rows={3} maxLength={2000} className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm focus:outline-2 focus:outline-accent" />
    </div>
  );
}

const RISK_LEVELS = [
  { id: "", label: "Automatic", cls: "border-border bg-surface text-foreground" },
  { id: "LOW", label: "Low", cls: "border-green-600 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100" },
  { id: "MEDIUM", label: "Medium", cls: "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100" },
  { id: "HIGH", label: "High", cls: "border-red-600 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100" },
] as const;

/** Optional manual risk rating on Add Client: overrides the calculated level (Compliance Officer only, with a written reason). */
function ManualRiskRating({ allowed }: { allowed: boolean }) {
  const [level, setLevel] = useState<string>("");
  return (
    <fieldset className="space-y-2" disabled={!allowed}>
      <legend className="mb-1 text-sm font-medium">Risk rating</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Risk rating">
        {RISK_LEVELS.map((l) => (
          <label key={l.id || "auto"} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm ${level === l.id ? `${l.cls} font-semibold ring-2 ring-offset-1 ring-current` : "border-border text-muted"}`}>
            <input type="radio" name="manualRiskLevel" value={l.id} checked={level === l.id} onChange={() => setLevel(l.id)} className="sr-only" />
            {l.id && <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${l.id === "LOW" ? "bg-green-600" : l.id === "MEDIUM" ? "bg-amber-500" : "bg-red-600"}`} />}
            {l.label}
          </label>
        ))}
      </div>
      {!allowed && <p className="text-xs text-muted">Calculated automatically from the data. Only a Compliance Officer can set it by hand.</p>}
      {allowed && level && (
        <Field label="Reason for the manual rating" name="manualRiskReason" required hint="Kept with the calculated level. A client with a factor that legally requires EDD can't be rated below High." />
      )}
    </fieldset>
  );
}

/** Expandable "Risk questionnaire": PEP questions (people) and grouped high-risk flags, each with a "?" explanation (lib/cdd/risk-flags). */
function RiskFlagsSection({ kind, n, groups }: { kind: "NATURAL" | "LEGAL"; n: (k: string) => string; groups?: FlagGroup[] }) {
  const [isPep, setIsPep] = useState(false);
  const applies = (f: RiskFlag) => f.appliesTo === "both" || f.appliesTo === kind;
  const shown = FLAG_GROUPS.filter((g) => !groups || groups.includes(g.id))
    .map((g) => ({ ...g, flags: RISK_FLAGS.filter((f) => f.group === g.id && applies(f)) }))
    .filter((g) => g.flags.length);
  return (
    <details className="rounded-xl border border-border p-3" data-testid="risk-flags">
      <summary className="cursor-pointer text-sm font-semibold">Risk questionnaire <span className="font-normal text-muted">(optional — tick any that apply)</span></summary>
      <div className="mt-3 space-y-4">
        {kind === "NATURAL" && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold">Politically exposed persons</legend>
            <CheckWithHelp name={n("isPep")} label="Politically exposed person (now or in the last 12 months)" badge="Requires EDD" onChange={setIsPep}>
              Someone who holds, or held in the last 12 months, a prominent public function: for example a head of state or government, minister, member of parliament, judge of a supreme or constitutional court, central bank board member, ambassador, senior military officer, or board member of a state-owned company. Senior management approval and enhanced due diligence are required. <LawRef basis="Art. 42, 46" />
            </CheckWithHelp>
            {isPep && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Prominent public function" name={n("pepFunction")} />
                <Field label="Left office on" name={n("pepLeftOfficeOn")} type="date" hint="Former PEPs stay in scope at least 12 months." />
              </div>
            )}
            <CheckWithHelp name={n("isPepFamilyOrAssociate")} label="Family member or close associate of a PEP" badge="Requires EDD">
              A PEP&apos;s spouse or partner, children and their spouses or partners, parents and, for the most senior functions, siblings; or a person known to have close business relations with a PEP, such as joint ownership of a company. <LawRef basis="Art. 2, 44" />
            </CheckWithHelp>
          </fieldset>
        )}
        {shown.map((g) => (
          <fieldset key={g.id} className="space-y-2">
            <legend className="mb-1 text-sm font-semibold">{g.label}</legend>
            {g.flags.map((f) => (
              <CheckWithHelp
                key={f.id}
                name={f.legacyKey ? n(f.legacyKey) : n("riskFlags")}
                value={f.legacyKey ? undefined : f.id}
                label={f.label}
                badge={f.block ? "Blocks acceptance" : f.forcesHigh ? "Requires EDD" : undefined}
              >
                {f.help} <LawRef basis={f.article} />
              </CheckWithHelp>
            ))}
          </fieldset>
        ))}
      </div>
    </details>
  );
}

/** Checkbox with a "(?)" button that shows a short explanation underneath. */
function CheckWithHelp({ name, value, label, badge, onChange, children }: { name: string; value?: string; label: string; badge?: string; onChange?: (checked: boolean) => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const helpId = useId();
  return (
    <div className="text-sm">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" name={name} value={value} onChange={onChange ? (e) => onChange(e.target.checked) : undefined} /> {label}
        </label>
        {badge && <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">{badge}</span>}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={helpId}
          aria-label={`What is "${label}"?`}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-xs text-muted hover:border-accent hover:text-accent"
        >
          ?
        </button>
      </div>
      {open && <p id={helpId} className="mt-1 text-xs text-muted">{children}</p>}
    </div>
  );
}
