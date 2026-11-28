import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { currentProfile } from "@/lib/server/country-profile";
import { setupChecklist, belowNationalDefaults } from "@/lib/rules/country-profile";
import { EU_CORE } from "@/lib/rules/eu-core";
import { can } from "@/lib/auth/permissions";
import { ActionForm, CountryField, Field, Submit } from "@/components/form";
import { addOfficeAction, saveProfileAction } from "./actions";
import Link from "next/link";
import { nationalSuggestions } from "@/lib/rules/national-suggestions";

const NAMES = new Intl.DisplayNames(["en"], { type: "region" });
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const area = "w-full rounded border border-border bg-transparent px-3 py-2 text-sm";

export default async function CountryProfilePage({ searchParams }: { searchParams: Promise<{ office?: string }> }) {
  const s = await requireUser("countryProfile.view");
  const edit = can(s.user.roles, "countryProfile.edit");
  const sp = await searchParams;
  const { cur, versions, offices, office, sectors } = await withTenant(s.firm.id, async (tx) => {
    const offices = await tx.office.findMany({ where: { isHome: false }, orderBy: { name: "asc" } });
    const office = offices.find((o) => o.id === sp.office) ?? null;
    return {
      offices,
      office,
      cur: await currentProfile(tx, s.firm.id, office?.id ?? null),
      sectors: (await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id }, select: { sectors: true } })).sectors as string[],
      versions: await tx.countryProfileVersion.findMany({ where: { officeId: office?.id ?? null }, orderBy: { version: "desc" }, take: 20, select: { version: true, createdAt: true, source: true } }),
    };
  });
  const p = cur.profile;
  const checklist = setupChecklist(p);
  const weaker = belowNationalDefaults(p);

  const missing = checklist.filter((c) => c.status === "required-missing");
  const country = NAMES.of(p.memberState) ?? p.memberState;
  // Suggested national details (pre-filled, marked, saved only when the person saves).
  const sug = nationalSuggestions(p.memberState, sectors);
  const v = (stored: string | undefined | null, suggested: string | undefined) => stored || suggested || "";
  const suggestedFor = { supervisor: !p.supervisors.length && !!sug.supervisor, fiu: !p.fiu && !!sug.fiu, sanctions: !p.sanctionsAuthority && !!sug.sanctionsAuthority, bo: !p.boRegister && !!sug.boRegister };
  const anySuggested = Object.values(suggestedFor).some(Boolean) || (!p.holidays.length && !!sug.holidays) || (!p.dataProtectionAuthority && !!sug.dataProtectionAuthority) || (!p.whistleblowing && !!sug.whistleblowing);
  const has = { supervisor: p.supervisors.length > 0, fiu: p.fiu !== null, sanctions: p.sanctionsAuthority !== null, bo: p.boRegister !== null };

  return (
    <div className="max-w-3xl space-y-8">
      {/* 1. What this page is, in two sentences */}
      <div className="space-y-2">
        <h1 className="text-3xl">Country Profile · {country}{office ? ` · ${office.name} (host state)` : " · home state"}</h1>
        <p className="text-muted">The anti-money-laundering rules are the same across the EU, but each country adds its own details: which authorities you report to, cash limits and local deadlines. Fill them in once for {country}; the app then uses them for your reports, deadlines and client checks.</p>
        {offices.length > 0 && (
          <nav className="flex flex-wrap gap-3 text-sm" aria-label="Offices">
            <Link className={office ? "text-accent underline" : "font-semibold"} href="/app/settings/country-profile">Home state</Link>
            {offices.map((o) => <Link key={o.id} className={office?.id === o.id ? "font-semibold" : "text-accent underline"} href={`/app/settings/country-profile?office=${o.id}`}>{o.name} ({o.memberState})</Link>)}
          </nav>
        )}
      </div>

      {/* 2. Where you stand */}
      <section className={`space-y-2 rounded-2xl border p-4 text-sm ${missing.length ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" : "border-green-300 bg-green-50 text-green-950 dark:border-green-800 dark:bg-green-950 dark:text-green-100"}`} data-testid="country-status">
        {missing.length ? (
          <>
            <p className="font-semibold">{missing.length} thing{missing.length === 1 ? "" : "s"} to fill in</p>
            <ul className="list-disc space-y-0.5 pl-5">{missing.map((c) => <li key={c.parameter}>{PLAIN[c.parameter] ?? c.label}: without it you can draft and download reports, but not record them as sent.</li>)}</ul>
            {anySuggested && <p className="font-semibold" data-testid="suggested-note">AMLSync has pre-filled them for {country}. Check each one below (marked &ldquo;Suggested&rdquo;) and press Save.</p>}
          </>
        ) : <p className="font-semibold">Everything required is filled in ✓</p>}
        {weaker.length > 0 && (
          <div data-testid="below-national">
            <p className="mt-2 font-semibold">Check these against {country}&apos;s law</p>
            <ul className="list-disc pl-5">{weaker.map((w) => <li key={w}>{w}</li>)}</ul>
          </div>
        )}
      </section>

      {!edit && <p className="text-sm text-muted">Only a Compliance Officer can change the Country Profile.</p>}

      <ActionForm key={office?.id ?? "home"} action={saveProfileAction} className="space-y-6">
        <input type="hidden" name="officeId" value={office?.id ?? ""} />
        <fieldset disabled={!edit} className="space-y-6">
          {/* 3. Required: who you report to */}
          <Step n={1} title="Who you report to" note="Required. Ask your supervisor or professional body if you're not sure; their website usually lists these.">
            <Authority title="Your AML supervisor" filled={has.supervisor} suggested={suggestedFor.supervisor} why="The authority that checks your firm follows the anti-money-laundering rules (for some professions, a professional body such as the bar or chamber of auditors). You inform them, for example, when your Compliance Officer changes.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Supervisor: name" name="supervisor.name" defaultValue={v(p.supervisors[0]?.name, sug.supervisor?.name)} />
                <Field label="Supervisor: how to contact them" name="supervisor.channel" defaultValue={v(p.supervisors[0]?.channel, sug.supervisor?.channel)} />
              </div>
              {/* Not asked any more (the app doesn't need it); kept as it was. */}
              <input type="hidden" name="supervisor.sector" value={p.supervisors[0]?.sector ?? ""} />
            </Authority>
            <Authority title="Financial intelligence unit (FIU)" filled={has.fiu} suggested={suggestedFor.fiu} why={`The authority that receives reports of suspicious clients or payments. Enter how reports are sent: usually a web portal or the goAML system.`}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="FIU name" name="fiu.name" defaultValue={v(p.fiu?.name, sug.fiu?.name)} />
                <Field label="FIU reporting channel" name="fiu.channel" defaultValue={v(p.fiu?.channel, sug.fiu?.channel)} />
              </div>
            </Authority>
            <Authority title="Sanctions authority" filled={has.sanctions} suggested={suggestedFor.sanctions} why="Where you report if you have to freeze a client's money or assets because they are on a sanctions list.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Sanctions authority: name" name="sanctionsAuthority.name" defaultValue={v(p.sanctionsAuthority?.name, sug.sanctionsAuthority?.name)} />
                <Field label="Sanctions authority: how to contact them" name="sanctionsAuthority.channel" defaultValue={v(p.sanctionsAuthority?.channel, sug.sanctionsAuthority?.channel)} />
              </div>
            </Authority>
            <Authority title="Register of company owners" filled={has.bo} suggested={suggestedFor.bo} why={`The official register of who really owns companies (beneficial owners). If what a client tells you doesn't match the register, you must report the difference there.`}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Owners register: name" name="boRegister.name" defaultValue={v(p.boRegister?.name, sug.boRegister?.name)} />
                <Field label="Owners register: where to report differences" name="boRegister.channel" defaultValue={v(p.boRegister?.channel, sug.boRegister?.channel)} />
              </div>
            </Authority>
          </Step>

          {/* 4. Cash */}
          <Step n={2} title="Cash rules" note={`The EU allows cash payments up to €${EU_CORE.cash.capEUR.toLocaleString("en")}. Many countries set a lower limit, and some require you to report large cash payments.`}>
            <Field label="Cash cap (EUR)" name="cashCapEUR" type="number" defaultValue={p.cashCapEUR} />
            <p className="-mt-2 text-xs text-muted">The largest cash payment allowed in {country}. Payments above it are flagged.</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="cashReport.enabled" defaultChecked={p.nationalCashReport.enabled} /> Large cash payments must be reported to the FIU in {country}
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Report cash payments from (EUR)" name="cashReport.thresholdEUR" type="number" defaultValue={p.nationalCashReport.thresholdEUR ?? ""} />
              <Field label="Report within (working days)" name="cashReport.deadlineWorkingDays" type="number" defaultValue={p.nationalCashReport.deadlineWorkingDays ?? ""} />
            </div>
          </Step>

          {/* 5. National risk assessment */}
          <Step n={3} title="Your country's risk assessment" note={`Each country publishes a national risk assessment: which businesses, clients and countries it sees as risky. Read the summary for ${country} once a year.`}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="nraReviewed" defaultChecked={p.nationalRiskAssessmentReviewed} className="mt-0.5" /> <span>We have read the national risk assessment <span className="block text-xs text-muted">Your Business Risk Assessment and AML Program take it into account.</span></span>
            </label>
            <Field label="Extra cases that need enhanced checks (one per line, as id: description)" name="additionalEddCases">
              <textarea name="additionalEddCases" rows={3} className={area} defaultValue={p.additionalEddCases.map((c) => `${c.id}: ${c.description}`).join("\n")} aria-label="Additional EDD cases" placeholder="e.g. shell-companies: Companies with no real business activity" />
            </Field>
            <p className="-mt-2 text-xs text-muted">If the national risk assessment names situations that are always high risk, list them here: clients in them always get enhanced checks (extra questions about where their money comes from, and management approval).</p>
            {p.riskAssessmentWaiver && <input type="hidden" name="raWaiver" value="on" />}
          </Step>

          {/* 6. Rarely changed: pre-filled with the EU defaults */}
          <details className="rounded-xl border border-border p-4" data-testid="advanced">
            <summary className="cursor-pointer font-semibold">Other national details <span className="font-normal text-muted">· pre-filled with the EU rules; change only if {country} differs</span></summary>
            <div className="mt-4 space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Other authorities</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Data protection authority: name" name="dataProtectionAuthority.name" defaultValue={v(p.dataProtectionAuthority?.name, sug.dataProtectionAuthority?.name)} />
                  <Field label="Data protection authority: contact" name="dataProtectionAuthority.channel" defaultValue={v(p.dataProtectionAuthority?.channel, sug.dataProtectionAuthority?.channel)} />
                </div>
                <Field label="Where staff can report wrongdoing outside the firm (whistleblowing authority)" name="whistleblowing" defaultValue={v(p.whistleblowing?.externalChannel, sug.whistleblowing)} />
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Deadlines and record keeping</h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Answer FIU requests within (working days)" name="fiuRequestWorkingDays" type="number" defaultValue={p.fiuRequestWorkingDays} />
                  <Field label="Large-transaction report within (working days)" name="thresholdReportDeadlineWorkingDays" type="number" defaultValue={p.thresholdReportDeadlineWorkingDays ?? ""} />
                  <Field label="Keep records for (years)" name="retentionYears" type="number" defaultValue={p.retentionYears} />
                </div>
                <p className="text-xs text-muted">EU rules: answer the FIU within 5 working days and keep records for 5 years. Enter other values only if {country}&apos;s law sets them.</p>
                <div className="space-y-1">
                  <span className="block text-sm font-medium">Working days</span>
                  <div className="flex flex-wrap gap-3 text-sm">
                    {WEEKDAYS.map((d, i) => (
                      <label key={d} className="flex items-center gap-1">
                        <input type="checkbox" name={`wd.${i + 1}`} defaultChecked={p.workingWeekdays.includes(i + 1)} /> {d}
                      </label>
                    ))}
                  </div>
                </div>
                <Field label="Public holidays (YYYY-MM-DD, one per line)" name="holidays">
                  <textarea name="holidays" rows={4} className={area} defaultValue={(p.holidays.length ? p.holidays : sug.holidays ?? []).join("\n")} aria-label="Public holidays" />
                </Field>
                <p className="-mt-2 text-xs text-muted">Deadlines skip weekends and these holidays. Without holidays, deadlines can only come out shorter, never longer.</p>
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">How suspicions are reported</h3>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="sro.enabled" defaultChecked={p.sroReportingRoute.enabled} /> In {country}, professionals like us report suspicions through our professional body, not directly to the FIU
                </label>
                <Field label="Professional body" name="sro.body" defaultValue={p.sroReportingRoute.body ?? ""} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="privilege.enabled" defaultChecked={p.privilegeNarrowing.enabled} /> Lawyers&apos; client confidentiality does not cover some transactions in {country}
                </label>
                <Field label="Those transactions (one per line)" name="privilege.types">
                  <textarea name="privilege.types" rows={2} className={area} defaultValue={p.privilegeNarrowing.transactionTypes.join("\n")} aria-label="Privilege transaction types" />
                </Field>
              </div>
              {/* Not asked any more (nothing in the app uses them yet); kept as they were. */}
              <input type="hidden" name="businessRegister.name" value={p.businessRegister?.name ?? ""} />
              <input type="hidden" name="businessRegister.channel" value={p.businessRegister?.channel ?? ""} />
              <input type="hidden" name="idDocumentTypes" value={p.idDocumentTypes.join("\n")} />
              <input type="hidden" name="acceptedEidSchemes" value={p.acceptedEidSchemes.join("\n")} />
            </div>
          </details>

          <Field label="Where these details come from (optional)" name="source" />
          <p className="-mt-4 text-xs text-muted">For your records, e.g. &ldquo;supervisor&apos;s website, checked 1 Sept 2027&rdquo;.</p>
        </fieldset>
        {edit && <Submit>Save new version</Submit>}
        <p className="text-xs text-muted">Each save creates a new version, kept with the date and who saved it. Decisions made earlier keep the version that applied at the time. Details here can only add to or tighten the EU rules, never relax them. You&apos;re on version {cur.version} from {cur.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}.</p>
      </ActionForm>

      {/* 7. Less used */}
      <details className="rounded-xl border border-border p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Version history ({versions.length})</summary>
        <ul className="mt-2 divide-y divide-border">
          {versions.map((v) => (
            <li key={v.version} className="flex justify-between py-2">
              <span>Version {v.version}{v.source ? ` · ${v.source}` : ""}</span>
              <span className="text-muted">{v.createdAt.toISOString().slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      </details>

      {edit && !office && (
        <details className="rounded-xl border border-border p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Office in another country</summary>
          <p className="mt-2 text-muted">If you have a branch or work in another country, inside or outside the EU, add it: work there follows that country&apos;s details, with its own Country Profile.</p>
          <ActionForm action={addOfficeAction} className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Office name" name="name" required />
            <CountryField label="Country of the office" name="memberState" required euFirst />
            <div className="flex items-end gap-2"><Submit variant="secondary">Add office</Submit></div>
          </ActionForm>
        </details>
      )}
    </div>
  );
}

const PLAIN: Partial<Record<string, string>> = {
  supervisors: "Your AML supervisor",
  fiu: "Financial intelligence unit (FIU)",
  sanctionsAuthority: "Sanctions authority",
  boRegister: "Register of company owners",
};

function Step({ n, title, note, children }: { n: number; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-border p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-sm text-brand-ink">{n}</span>{title}</h2>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Authority({ title, filled, suggested, why, children }: { title: string; filled: boolean; suggested?: boolean; why: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <span className={`shrink-0 text-xs font-semibold ${filled ? "text-green-700 dark:text-green-400" : suggested ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-300"}`}>{filled ? "Filled ✓" : suggested ? "Suggested: check and save" : "Missing"}</span>
      </div>
      <p className="text-xs text-muted">{why}</p>
      {children}
    </div>
  );
}
