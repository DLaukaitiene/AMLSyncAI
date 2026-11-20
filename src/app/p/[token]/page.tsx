import { headers } from "next/headers";
import { linkLanding, portalContext } from "@/lib/server/portal";
import { ActionForm, CountryField, Field, Submit } from "@/components/form";
import { DOCUMENT_KINDS } from "@/lib/server/storage";
import { DocView } from "@/components/doc-view";
import type { GeneratedDoc } from "@/lib/docs/model";
import { noChangeAction, requestCodeAction, saveAction, startIdvAction, uploadAction, verifyCodeAction } from "./actions";
import { diditEnabled } from "@/lib/server/didit";
import { PEOPLE_ROWS, PERSON_ROLES } from "@/lib/portal/people";
import { ActionButton } from "@/components/action-button";

const sel = "w-full rounded border border-border bg-background px-3 py-2 text-sm";

function YesNo({ name, label, value }: { name: string; label: string; value?: string }) {
  return (
    <fieldset className="space-y-1 text-sm">
      <legend className="font-medium">{label}</legend>
      <div className="flex gap-6">
        <label className="flex items-center gap-2"><input type="radio" name={name} value="yes" defaultChecked={value === "yes"} /> Yes</label>
        <label className="flex items-center gap-2"><input type="radio" name={name} value="no" defaultChecked={value === "no"} /> No</label>
      </div>
    </fieldset>
  );
}

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  await headers();
  const { token } = await params;
  const landing = await linkLanding(token);
  if (!landing) {
    return (
      <div className="space-y-2 rounded-2xl border border-border bg-background p-6 shadow-[var(--shadow)]">
        <h1 className="text-xl font-semibold">This link is no longer valid</h1>
        <p className="text-sm text-muted">It may have expired or been replaced. Contact the firm that sent it for a new link.</p>
      </div>
    );
  }
  if (landing.submitted) {
    return (
      <div className="space-y-2 rounded-2xl border border-border bg-background p-6 shadow-[var(--shadow)]">
        <p aria-hidden className="text-3xl">✓</p>
        <h1 className="text-xl font-semibold">Thank you</h1>
        <p className="text-sm text-muted">{landing.firmName} has received your information and will contact you if anything else is needed.</p>
      </div>
    );
  }
  const ctx = await portalContext(token);
  if (!ctx) {
    return (
      <div className="space-y-6 rounded-2xl border border-border bg-background p-6 shadow-[var(--shadow)]">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{landing.firmName} needs your client information</h1>
          <p className="text-sm text-muted">
            EU anti-money-laundering rules require {landing.firmName} to identify its clients. To keep your data safe, we&apos;ll send a one-time
            code to {landing.maskedEmail}.
          </p>
        </div>
        <ol className="space-y-1 text-sm">
          <li><span className="font-semibold">1.</span> Get a one-time code by email</li>
          <li><span className="font-semibold">2.</span> Enter it below to open your page</li>
        </ol>
        <ActionForm action={requestCodeAction.bind(null, token)}>
          <Submit variant="secondary">Send me a code</Submit>
        </ActionForm>
        <ActionForm action={verifyCodeAction.bind(null, token)}>
          <Field label="6-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" required />
          <Submit>Continue</Submit>
        </ActionForm>
      </div>
    );
  }

  const natural = ctx.party.kind === "NATURAL";
  const prev = { ...(ctx.party.details as Record<string, unknown>), ...((ctx.link.submission as Record<string, unknown>) ?? {}) };
  const v = (k: string) => {
    const x = prev[k];
    return Array.isArray(x) ? x.join(", ") : x === undefined || x === null || typeof x === "boolean" ? "" : String(x);
  };
  const yn = (k: string) => (prev[k] === true || prev[k] === "yes" ? "yes" : prev[k] === false || prev[k] === "no" ? "no" : undefined);
  const kinds = natural
    ? ["id", "proof-of-address", "sof-evidence", ...(ctx.eddRequired ? ["sow-evidence"] : []), "other"]
    : ["company-extract", "articles", "shareholder-register", "id", "proof-of-address", "sof-evidence", "power-of-attorney", "other"];


  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl">Your information for {ctx.firmName}</h1>
        <p className="text-sm text-muted">
          It takes about 10 minutes. Fields marked * are required. You can save and come back later. Only you can see this page; it shows only your own information.
        </p>
        <ol className="flex flex-wrap gap-2 pt-2 text-xs" aria-label="Steps">
          {[...(natural && diditEnabled() ? [ctx.verified ? "✓ Identity" : "Identity"] : []), "Documents", natural ? "About you" : "The company", ...(natural ? [] : ["People"]), "Service and money", "Sign"].map((x, i) => (
            <li key={x} className="rounded-full border border-border bg-background px-2.5 py-1"><span className="font-semibold">{i + 1}.</span> {x}</li>
          ))}
        </ol>
      </div>

      {ctx.link.purpose === "refresh" && (
        <section className="space-y-3 rounded-2xl border border-accent bg-background p-5 shadow-[var(--shadow)]">
          <h2 className="font-semibold">Has anything changed?</h2>
          <p className="text-sm">If your details (name, address, nationality, ownership, the purpose of our work or where your money comes from) are the same as before, confirm it here. Otherwise update the form below.</p>
          <ActionForm action={noChangeAction.bind(null, token)} className="space-y-3">
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirm" className="mt-1" /> Nothing has changed since I last gave my information to {ctx.firmName}.</label>
            <Field label="Type your full name to confirm" name="signature" autoComplete="name" />
            <Submit>Confirm nothing has changed</Submit>
          </ActionForm>
        </section>
      )}

      {natural && diditEnabled() && (
        <section className="space-y-2 rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow)]" data-testid="idv">
          <h2 className="font-semibold">Verify your identity</h2>
          {ctx.verified ? (
            <p className="text-sm">Done. Your identity has been verified.</p>
          ) : (
            <>
              <p className="text-sm text-muted">
                About 3 minutes on your phone: use your national eID (for example Smart-ID or Mobile-ID) or your ID document with its chip, and a short
                selfie video. It&apos;s run by our verification partner Didit in the EU.
                {ctx.idv ? ` Last attempt: ${ctx.idv.status}.` : ""}
              </p>
              <ActionButton action={startIdvAction.bind(null, token)} variant="primary">{ctx.idv ? "Try again" : "Start identity check"}</ActionButton>
            </>
          )}
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow)]">
        <h2 className="font-semibold">Documents</h2>
        {ctx.eddRequired && <p className="text-sm">Please also upload evidence of the source of the funds{natural ? " and of your wealth" : ""}, e.g. a sale contract, bank statements or an inheritance deed.</p>}
        {ctx.documents.length > 0 && (
          <ul className="text-sm">
            {ctx.documents.map((d) => <li key={d.id}>{DOCUMENT_KINDS[d.kind] ?? d.kind}: {d.fileName}</li>)}
          </ul>
        )}
        <ActionForm action={uploadAction.bind(null, token)}>
          <Field label="Document" name="kind">
            <select name="kind" className={sel} aria-label="Document">{kinds.map((k) => <option key={k} value={k}>{DOCUMENT_KINDS[k]}</option>)}</select>
          </Field>
          {!natural && <Field label="Whose document? (for an ID or proof of address)" name="whose" hint="The person's full name, as you list them below." />}
          <Field label="File (PDF, JPG, PNG, HEIC or DOCX, max 15 MB)" name="file">
            <input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.docx" aria-label="File" className="text-sm" />
          </Field>
          <Submit variant="secondary">Upload</Submit>
        </ActionForm>
      </section>

      <ActionForm action={saveAction.bind(null, token)} className="space-y-6">
        {natural ? (
          <section className="space-y-4 rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow)]">
            <h2 className="font-semibold">About you</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First names (all)" name="firstNames" required defaultValue={v("firstNames")} autoComplete="given-name" />
              <Field label="Surname" name="lastName" required defaultValue={v("lastName")} autoComplete="family-name" />
              <Field label="Date of birth" name="birthDate" type="date" required defaultValue={v("birthDate")} />
              <Field label="Place of birth" name="placeOfBirth" required defaultValue={v("placeOfBirth")} />
              <CountryField label="Nationalities" name="nationalities" required multiple defaultValue={v("nationalities")} hint="Add all of them. Not listed? Type the name and press Add country." />
              <CountryField label="Country of residence" name="residenceCountry" required defaultValue={v("residenceCountry")} />
            </div>
            <Field label="Residential address" name="address" required defaultValue={v("address")} autoComplete="street-address" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Occupation" name="occupation" defaultValue={v("occupation")} />
              <CountryField label="Tax residence" name="taxResidence" multiple defaultValue={v("taxResidence")} hint="Countries where you pay tax. Not listed? Type the name and press Add country." />
            </div>
            <YesNo name="isPep" label="Do you hold, or have you held in the last 12 months, a prominent public function (e.g. minister, MP, judge, ambassador, senior officer of a state-owned company)? *" value={yn("isPep")} />
            <Field label="If yes, which function?" name="pepFunction" defaultValue={v("pepFunction")} />
            <YesNo name="isPepFamilyOrAssociate" label="Are you a family member or close associate of such a person? *" value={yn("isPepFamilyOrAssociate")} />
            <YesNo name="actingForOther" label="Are you acting on behalf of someone else? *" value={yn("actingForOther")} />
            <Field label="If yes, for whom?" name="actingForWhom" defaultValue={v("actingForWhom")} />
          </section>
        ) : (
          <>
          <section className="space-y-4 rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow)]">
            <h2 className="font-semibold">About the company</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Legal name" name="name" required defaultValue={v("name")} />
              <Field label="Registration number" name="registrationNumber" required defaultValue={v("registrationNumber")} />
              <CountryField label="Country of registration" name="countryOfCreation" required defaultValue={v("countryOfCreation")} />
              <Field label="Your role in the company" name="signatoryRole" required defaultValue={v("signatoryRole")} />
            </div>
            <Field label="Registered office" name="registeredOffice" required defaultValue={v("registeredOffice")} />
            <Field label="What the company does" name="natureOfBusiness" required defaultValue={v("natureOfBusiness")} />
            <YesNo name="sanctions" label="Is the company, or anyone listed below, subject to EU or UN sanctions, or owned or controlled by someone who is? *" value={yn("sanctions")} />
            <Field label="If yes, give details" name="sanctionsDetails" defaultValue={v("sanctionsDetails")} />
          </section>

          <section className="space-y-4 rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow)]" data-testid="company-people">
            <h2 className="font-semibold">Directors, owners and beneficial owners</h2>
            <p className="text-sm text-muted">List every director (board member or manager), every shareholder, and every person who owns or controls 25% or more, directly or through other companies. Add yourself too if you sign for the company. If a shareholder is a company, list it as a company. Leave unused rows empty. Upload each person&apos;s ID document above, with their name in &quot;Whose document&quot;.</p>
            {Array.from({ length: PEOPLE_ROWS }, (_, i) => (
              <fieldset key={i} className="space-y-3 rounded-xl border border-border p-4" data-testid={`person-${i}`}>
                <legend className="px-1 text-sm font-semibold">Person or company {i + 1}{i > 1 ? " (optional)" : ""}</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Full name" name={`p${i}_name`} defaultValue={v(`p${i}_name`)} />
                  <Field label="Type" name={`p${i}_type`}>
                    <select name={`p${i}_type`} className={sel} aria-label={`Type ${i + 1}`} defaultValue={v(`p${i}_type`) || "person"}><option value="person">Person</option><option value="company">Company</option></select>
                  </Field>
                  <Field label="% of shares held directly" name={`p${i}_pct`} inputMode="decimal" defaultValue={v(`p${i}_pct`)} />
                  <Field label="Date of birth (people)" name={`p${i}_birthDate`} type="date" defaultValue={v(`p${i}_birthDate`)} />
                  <Field label="Nationality / country of registration" name={`p${i}_nationality`} defaultValue={v(`p${i}_nationality`)} />
                  <Field label="Email (for the identity check)" name={`p${i}_email`} type="email" defaultValue={v(`p${i}_email`)} />
                  <Field label="Registration number (companies)" name={`p${i}_regNo`} defaultValue={v(`p${i}_regNo`)} />
                  <Field label="Control other than through shares, if any" name={`p${i}_control`} defaultValue={v(`p${i}_control`)} hint="e.g. right to appoint the board" />
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm" role="group" aria-label={`Roles of person ${i + 1}`}>
                  {PERSON_ROLES.map(([r, label]) => (
                    <label key={r} className="flex items-center gap-2"><input type="checkbox" name={`p${i}_role_${r}`} defaultChecked={prev[`p${i}_role_${r}`] === "on"} /> {label}</label>
                  ))}
                </div>
                <YesNo name={`p${i}_pep`} label="Does this person hold, or have they held in the last 12 months, a prominent public function, or are they a family member or close associate of someone who does?" value={yn(`p${i}_pep`)} />
                <Field label="If yes, which function?" name={`p${i}_pepFunction`} defaultValue={v(`p${i}_pepFunction`)} />
              </fieldset>
            ))}
          </section>
          </>
        )}

        <section className="space-y-4 rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow)]">
          <h2 className="font-semibold">The service and the money</h2>
          <Field label="What do you need the service for?" name="purpose" required defaultValue={v("purpose")} />
          <Field label="Where does the money for this come from?" name="sourceOfFunds" required defaultValue={v("sourceOfFunds")} hint="e.g. salary savings, sale of a flat, business income, mortgage" />
          {natural && ctx.eddRequired && <Field label="How did you build up your wealth overall?" name="sourceOfWealth" defaultValue={v("sourceOfWealth")} />}
          {!natural && <Field label="How did the owners build up the company's wealth? (if the amount is large)" name="sourceOfWealth" defaultValue={v("sourceOfWealth")} />}
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow)]">
          <h2 className="font-semibold">Declaration</h2>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirm" className="mt-1" /> I confirm that the information above and the documents I uploaded are true and complete, and I will tell {ctx.firmName} if anything changes.
          </label>
          <Field label="Type your full name to sign" name="signature" autoComplete="name" />
        </section>

        <div className="flex flex-wrap gap-3">
          <button type="submit" name="intent" value="save" className="rounded border border-border px-4 py-2 text-sm">Save for later</button>
          <button type="submit" name="intent" value="submit" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:brightness-105">Submit</button>
        </div>
      </ActionForm>
      {ctx.privacy ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">How {ctx.firmName} uses your data (privacy notice)</summary>
          <div className="mt-3"><DocView doc={ctx.privacy as unknown as GeneratedDoc} /></div>
        </details>
      ) : null}
      <p className="text-xs text-muted">
        {ctx.firmName} processes your data to meet its obligations under Regulation (EU) 2024/1624 and keeps it for 5 years after the business relationship ends.
      </p>
    </div>
  );
}
