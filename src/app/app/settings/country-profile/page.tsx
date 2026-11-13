import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { currentProfile } from "@/lib/server/country-profile";
import { setupChecklist } from "@/lib/rules/country-profile";
import { EU_CORE } from "@/lib/rules/eu-core";
import { can } from "@/lib/auth/permissions";
import { ActionForm, Field, Submit } from "@/components/form";
import { StepUpLink } from "@/components/step-up";
import { addOfficeAction, saveProfileAction } from "./actions";
import Link from "next/link";

const NAMES = new Intl.DisplayNames(["en"], { type: "region" });
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STATUS_LABEL = { filled: "Filled", default: "Default", "required-missing": "Required — missing", "not-yet-reviewed": "Not yet reviewed" };

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <fieldset className="space-y-4 rounded-md border border-border p-4">
      <legend className="px-1 font-semibold">{title}</legend>
      {note && <p className="text-sm text-muted">{note}</p>}
      {children}
    </fieldset>
  );
}

const area = "w-full rounded border border-border bg-transparent px-3 py-2 text-sm";

export default async function CountryProfilePage({ searchParams }: { searchParams: Promise<{ office?: string }> }) {
  const s = await requireUser("countryProfile.view");
  const edit = can(s.user.roles, "countryProfile.edit");
  const sp = await searchParams;
  const { cur, versions, offices, office } = await withTenant(s.firm.id, async (tx) => {
    const offices = await tx.office.findMany({ where: { isHome: false }, orderBy: { name: "asc" } });
    const office = offices.find((o) => o.id === sp.office) ?? null;
    return {
      offices,
      office,
      cur: await currentProfile(tx, s.firm.id, office?.id ?? null),
      versions: await tx.countryProfileVersion.findMany({ where: { officeId: office?.id ?? null }, orderBy: { version: "desc" }, take: 20, select: { version: true, createdAt: true, source: true } }),
    };
  });
  const p = cur.profile;
  const checklist = setupChecklist(p);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Country Profile · {NAMES.of(p.memberState)}{office ? ` · ${office.name} (host state)` : " · home state"}</h1>
        <nav className="flex flex-wrap gap-3 text-sm">
          <Link className={office ? "text-accent underline" : "font-semibold"} href="/app/settings/country-profile">Home state</Link>
          {offices.map((o) => <Link key={o.id} className={office?.id === o.id ? "font-semibold" : "text-accent underline"} href={`/app/settings/country-profile?office=${o.id}`}>{o.name} ({o.memberState})</Link>)}
        </nav>
        <p className="max-w-3xl text-sm text-muted">
          AMLSyncAI applies the general EU rules (EU Core {EU_CORE.version}). Here your firm enters its national details. Values can only fill in
          or tighten the EU rules, never relax them. Every change creates a new version, needs a Compliance Officer and is logged. Earlier
          decisions keep the version that applied at the time. Current version: <strong>{cur.version}</strong>.
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Setup checklist</h2>
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {checklist.map((c) => (
            <li key={c.parameter} className="flex justify-between gap-4 px-4 py-2">
              <span>{c.label}</span>
              <span className={c.status === "required-missing" ? "text-red-700 dark:text-red-300" : "text-muted"}>
                {STATUS_LABEL[c.status]}{c.blocks ? ` · blocks: ${c.blocks}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {!edit && <p className="text-sm text-muted">Only a Compliance Officer can change the Country Profile.</p>}

      <ActionForm action={saveProfileAction} className="max-w-3xl space-y-6">
        <input type="hidden" name="officeId" value={office?.id ?? ""} />
        <fieldset disabled={!edit} className="space-y-6">
          <Section title="Authorities" note="Required. Without them, reports can be drafted and exported but not marked as submitted.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Supervisor" name="supervisor.name" defaultValue={p.supervisors[0]?.name} hint="Your AML supervisor or self-regulatory body (e.g. bar, chamber of auditors)." />
              <Field label="Supervisor channel" name="supervisor.channel" defaultValue={p.supervisors[0]?.channel} hint="Portal, email or address for notifications." />
              <Field label="Sector supervised" name="supervisor.sector" defaultValue={p.supervisors[0]?.sector} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="FIU name" name="fiu.name" defaultValue={p.fiu?.name ?? ""} hint="Financial intelligence unit, e.g. LT: FNTT." />
              <Field label="FIU reporting channel" name="fiu.channel" defaultValue={p.fiu?.channel ?? ""} hint="Portal URL, goAML or other." />
              <Field label="Sanctions authority" name="sanctionsAuthority.name" defaultValue={p.sanctionsAuthority?.name ?? ""} hint="Where freezes are reported." />
              <Field label="Sanctions authority channel" name="sanctionsAuthority.channel" defaultValue={p.sanctionsAuthority?.channel ?? ""} />
              <Field label="Central BO register" name="boRegister.name" defaultValue={p.boRegister?.name ?? ""} hint="e.g. LT: JANGIS." />
              <Field label="BO register discrepancy channel" name="boRegister.channel" defaultValue={p.boRegister?.channel ?? ""} />
              <Field label="Business register" name="businessRegister.name" defaultValue={p.businessRegister?.name ?? ""} />
              <Field label="Business register link" name="businessRegister.channel" defaultValue={p.businessRegister?.channel ?? ""} />
              <Field label="Data protection authority" name="dataProtectionAuthority.name" defaultValue={p.dataProtectionAuthority?.name ?? ""} />
              <Field label="DPA contact" name="dataProtectionAuthority.channel" defaultValue={p.dataProtectionAuthority?.channel ?? ""} />
            </div>
            <Field label="External whistleblowing channel" name="whistleblowing" defaultValue={p.whistleblowing?.externalChannel ?? ""} hint="National authority under Directive 2019/1937." />
          </Section>

          <Section title="Cash and reports">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cash cap (EUR)" name="cashCapEUR" type="number" defaultValue={p.cashCapEUR} hint={`EU cap €${EU_CORE.cash.capEUR.toLocaleString("en")}. Enter a lower national cap if your state has one (e.g. LT €5,000).`} />
              <Field label="FIU request deadline (working days)" name="fiuRequestWorkingDays" type="number" defaultValue={p.fiuRequestWorkingDays} hint="5 under AMLR; enter a shorter one if your FIU sets it." />
              <Field label="Threshold report deadline (working days)" name="thresholdReportDeadlineWorkingDays" type="number" defaultValue={p.thresholdReportDeadlineWorkingDays ?? ""} hint="Set by your FIU for Art. 74 reports." />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="cashReport.enabled" defaultChecked={p.nationalCashReport.enabled} /> National cash-transaction reports apply
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cash report threshold (EUR)" name="cashReport.thresholdEUR" type="number" defaultValue={p.nationalCashReport.thresholdEUR ?? ""} />
              <Field label="Cash report deadline (working days)" name="cashReport.deadlineWorkingDays" type="number" defaultValue={p.nationalCashReport.deadlineWorkingDays ?? ""} />
            </div>
          </Section>

          <Section title="Reporting options">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="sro.enabled" defaultChecked={p.sroReportingRoute.enabled} /> Professionals report suspicions through a self-regulatory body (Art. 70(1))
            </label>
            <Field label="Self-regulatory body" name="sro.body" defaultValue={p.sroReportingRoute.body ?? ""} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="privilege.enabled" defaultChecked={p.privilegeNarrowing.enabled} /> Privilege exemption is narrowed for some transactions (Art. 70(3))
            </label>
            <Field label="Transaction types where privilege doesn't apply (one per line)" name="privilege.types">
              <textarea name="privilege.types" rows={2} className={area} defaultValue={p.privilegeNarrowing.transactionTypes.join("\n")} aria-label="Privilege transaction types" />
            </Field>
          </Section>

          <Section title="Risk">
            <Field label="Additional EDD cases (one per line, as id: description)" name="additionalEddCases" hint="From your national risk assessment (Art. 34(6)). Each forces at least High risk / EDD.">
              <textarea name="additionalEddCases" rows={3} className={area} defaultValue={p.additionalEddCases.map((c) => `${c.id}: ${c.description}`).join("\n")} aria-label="Additional EDD cases" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="nraReviewed" defaultChecked={p.nationalRiskAssessmentReviewed} /> We have reviewed the national risk assessment
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="raWaiver" defaultChecked={p.riskAssessmentWaiver} /> Our supervisor waived an individual documented business-wide risk assessment
            </label>
          </Section>

          <Section title="Records, calendar and identity">
            <Field label="Record retention (years)" name="retentionYears" type="number" defaultValue={p.retentionYears} hint="5 under AMLR; enter more only if national law requires it." />
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
            <Field label="Public holidays (YYYY-MM-DD, one per line)" name="holidays" hint="Used for every deadline. Without holidays, deadlines may be shorter than necessary, never longer.">
              <textarea name="holidays" rows={4} className={area} defaultValue={p.holidays.join("\n")} aria-label="Public holidays" />
            </Field>
            <Field label="Accepted ID document types (one per line)" name="idDocumentTypes">
              <textarea name="idDocumentTypes" rows={2} className={area} defaultValue={p.idDocumentTypes.join("\n")} aria-label="ID document types" />
            </Field>
            <Field label="Accepted eID schemes (one per line)" name="acceptedEidSchemes">
              <textarea name="acceptedEidSchemes" rows={2} className={area} defaultValue={p.acceptedEidSchemes.join("\n")} aria-label="eID schemes" />
            </Field>
          </Section>

          <Field label="Source of these values" name="source" hint="e.g. FNTT guidance of 1 Sept 2027; national AML law art. 15." />
        </fieldset>
        {edit && (
          <div className="space-y-2">
            <Submit>Save new version</Submit>
            <StepUpLink />
          </div>
        )}
      </ActionForm>

      {edit && !office && (
        <section className="max-w-xl space-y-2">
          <h2 className="text-lg font-semibold">Office in another member state</h2>
          <p className="text-sm text-muted">Branches or activity in another member state use that state&apos;s Country Profile for their matters (Art. 8) [verify scope with counsel].</p>
          <ActionForm action={addOfficeAction} className="grid gap-3 sm:grid-cols-3">
            <Field label="Office name" name="name" required />
            <Field label="Member state" name="memberState" required hint="2-letter code, e.g. PL" />
            <div className="flex items-end gap-2"><Submit variant="secondary">Add office</Submit><StepUpLink /></div>
          </ActionForm>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">Version history</h2>
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {versions.map((v) => (
            <li key={v.version} className="flex justify-between px-4 py-2">
              <span>Version {v.version}{v.source ? ` · ${v.source}` : ""}</span>
              <span className="text-muted">{v.createdAt.toISOString().slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
