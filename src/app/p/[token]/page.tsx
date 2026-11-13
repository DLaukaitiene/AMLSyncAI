import { headers } from "next/headers";
import { linkLanding, portalContext } from "@/lib/server/portal";
import { ActionForm, Field, Submit } from "@/components/form";
import { DOCUMENT_KINDS } from "@/lib/server/storage";
import { requestCodeAction, saveAction, uploadAction, verifyCodeAction } from "./actions";

const sel = "w-full rounded border border-border bg-background px-3 py-2 text-sm";
const area = "w-full rounded border border-border bg-transparent px-3 py-2 text-sm";

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
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">This link is no longer valid</h1>
        <p className="text-sm text-muted">It may have expired or been replaced. Contact the firm that sent it for a new link.</p>
      </div>
    );
  }
  if (landing.submitted) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Thank you</h1>
        <p className="text-sm text-muted">{landing.firmName} has received your information and will contact you if anything else is needed.</p>
      </div>
    );
  }
  const ctx = await portalContext(token);
  if (!ctx) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{landing.firmName} needs your client information</h1>
          <p className="text-sm text-muted">
            EU anti-money-laundering rules require {landing.firmName} to identify its clients. To keep your data safe, we&apos;ll send a one-time
            code to {landing.maskedEmail}.
          </p>
        </div>
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
    : ["company-extract", "sof-evidence", "power-of-attorney", "other"];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Your information for {ctx.firmName}</h1>
        <p className="text-sm text-muted">
          Fields marked * are required. You can save and come back later. Only you can see this page; it shows only your own information.
        </p>
      </div>

      <section className="space-y-3">
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
          <Field label="File (PDF, JPG, PNG, HEIC or DOCX, max 15 MB)" name="file">
            <input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.docx" aria-label="File" className="text-sm" />
          </Field>
          <Submit variant="secondary">Upload</Submit>
        </ActionForm>
      </section>

      <ActionForm action={saveAction.bind(null, token)} className="space-y-6">
        {natural ? (
          <section className="space-y-4">
            <h2 className="font-semibold">About you</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First names (all)" name="firstNames" required defaultValue={v("firstNames")} autoComplete="given-name" />
              <Field label="Surname" name="lastName" required defaultValue={v("lastName")} autoComplete="family-name" />
              <Field label="Date of birth" name="birthDate" type="date" required defaultValue={v("birthDate")} />
              <Field label="Place of birth" name="placeOfBirth" required defaultValue={v("placeOfBirth")} />
              <Field label="Nationalities" name="nationalities" required defaultValue={v("nationalities")} hint="All of them, e.g. LT, PL" />
              <Field label="Country of residence" name="residenceCountry" required defaultValue={v("residenceCountry")} hint="2-letter code, e.g. LT" />
            </div>
            <Field label="Residential address" name="address" required defaultValue={v("address")} autoComplete="street-address" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Occupation" name="occupation" defaultValue={v("occupation")} />
              <Field label="Tax residence" name="taxResidence" defaultValue={v("taxResidence")} hint="Countries where you pay tax" />
            </div>
            <YesNo name="isPep" label="Do you hold, or have you held in the last 12 months, a prominent public function (e.g. minister, MP, judge, ambassador, senior officer of a state-owned company)? *" value={yn("isPep")} />
            <Field label="If yes, which function?" name="pepFunction" defaultValue={v("pepFunction")} />
            <YesNo name="isPepFamilyOrAssociate" label="Are you a family member or close associate of such a person? *" value={yn("isPepFamilyOrAssociate")} />
            <YesNo name="actingForOther" label="Are you acting on behalf of someone else? *" value={yn("actingForOther")} />
            <Field label="If yes, for whom?" name="actingForWhom" defaultValue={v("actingForWhom")} />
          </section>
        ) : (
          <section className="space-y-4">
            <h2 className="font-semibold">About the company</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Legal name" name="name" required defaultValue={v("name")} />
              <Field label="Registration number" name="registrationNumber" required defaultValue={v("registrationNumber")} />
              <Field label="Country of registration" name="countryOfCreation" required defaultValue={v("countryOfCreation")} hint="2-letter code" />
              <Field label="Your role in the company" name="signatoryRole" required defaultValue={v("signatoryRole")} />
            </div>
            <Field label="Registered office" name="registeredOffice" required defaultValue={v("registeredOffice")} />
            <Field label="What the company does" name="natureOfBusiness" required defaultValue={v("natureOfBusiness")} />
            <Field label="Owners with 25% or more (one per line: name; date of birth; nationality; %)" name="owners" hint="e.g. Jonas Jonaitis; 1980-05-01; LT; 60">
              <textarea name="owners" rows={4} className={area} aria-label="Owners" defaultValue={v("owners")} />
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="noOwnerOver25" defaultChecked={prev.noOwnerOver25 === "on"} /> Nobody owns or controls 25% or more</label>
          </section>
        )}

        <section className="space-y-4">
          <h2 className="font-semibold">The service and the money</h2>
          <Field label="What do you need the service for?" name="purpose" required defaultValue={v("purpose")} />
          <Field label="Where does the money for this come from?" name="sourceOfFunds" required defaultValue={v("sourceOfFunds")} hint="e.g. salary savings, sale of a flat, business income, mortgage" />
          {natural && ctx.eddRequired && <Field label="How did you build up your wealth overall?" name="sourceOfWealth" defaultValue={v("sourceOfWealth")} />}
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Declaration</h2>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirm" className="mt-1" /> I confirm that the information above and the documents I uploaded are true and complete, and I will tell {ctx.firmName} if anything changes.
          </label>
          <Field label="Type your full name to sign" name="signature" autoComplete="name" />
        </section>

        <div className="flex flex-wrap gap-3">
          <button type="submit" name="intent" value="save" className="rounded border border-border px-4 py-2 text-sm">Save for later</button>
          <button type="submit" name="intent" value="submit" className="rounded bg-accent px-4 py-2 text-sm font-medium text-white dark:text-black">Submit</button>
        </div>
      </ActionForm>
      <p className="text-xs text-muted">
        {ctx.firmName} processes your data to meet its obligations under Regulation (EU) 2024/1624 and keeps it for 5 years after the business relationship ends.
      </p>
    </div>
  );
}
